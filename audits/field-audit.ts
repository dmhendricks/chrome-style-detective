/*!
 * Field audit — hunt color/contrast anomalies on real pages.
 *
 * Reads audits/urls.txt, opens each URL in Chromium, samples visible elements,
 * and compares Style Detective's display/contrast pipeline to Chrome's raw
 * getComputedStyle (the "second opinion"). Writes audits/report/index.html
 * for you to skim — this is not a pass/fail CI gate.
 *
 * Noise controls:
 *   - Skip images and wrappers with no direct text
 *   - Flag own-bg vs effective only when the WCAG tier changes
 *   - Cluster identical note patterns per URL (one row + count)
 *
 * Usage: npm run audit:field
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import {
    formatBackgroundImage,
    formatCssColorDisplay,
    parseCssColor,
    textContrast,
    truncateCssDataUrls,
} from '../src/content/lib/format';
import {
    effectiveBackgroundFromSnapshots,
    type BackgroundSnapshot,
} from '../src/content/lib/properties';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URLS_FILE = path.join(ROOT, 'audits', 'urls.txt');
const REPORT_DIR = path.join(ROOT, 'audits', 'report');
const MAX_SAMPLES_PER_PAGE = 35;

type SampleWire = {
    tag: string;
    id: string;
    className: string;
    textPreview: string;
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    chain: BackgroundSnapshot[];
};

type Finding = {
    url: string;
    tag: string;
    label: string;
    chromeColor: string;
    chromeBg: string;
    chromeBgImage: string;
    weShowColor: string;
    weShowBg: string;
    weShowBgImage: string;
    contrast: string;
    notes: string[];
    /** Highest severity among notes (for report ordering). */
    severity: 'investigate' | 'spot-check';
};

type ClusteredFinding = Finding & { count: number; examples: string[] };

/** Resolve http(s)/file URLs as-is; treat other lines as paths under the repo root. */
function resolveTarget(entry: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(entry)) {
        return entry;
    }

    const absolute = path.resolve(ROOT, entry);
    return pathToFileURL(absolute).href;
}

async function loadUrls(): Promise<string[]> {
    const raw = await readFile(URLS_FILE, 'utf8');
    return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map(resolveTarget);
}

/** Pull raw computed styles from the page (Chrome's answers). */
async function samplePage(page: Page): Promise<SampleWire[]> {
    // Keep this callback free of nested function *declarations* — tsx/esbuild
    // injects a `__name` helper that is not defined in the page context.
    return page.evaluate((maxSamples) => {
        const pick = Array.from(
            document.querySelectorAll(
                // No `img` — contrast/color on images is almost always noise.
                'a, button, h1, h2, h3, h4, p, span, li, td, th, label, input',
            ),
        );

        const samples = [];
        const seen = new Set();

        for (const el of pick) {
            if (!(el instanceof HTMLElement)) continue;
            if (seen.has(el)) continue;
            seen.add(el);

            // Prefer elements that paint their own text (skip wrapper-only LIs).
            let hasDirectText = false;
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim()) {
                    hasDirectText = true;
                    break;
                }
            }
            if (
                !hasDirectText &&
                (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
            ) {
                hasDirectText = Boolean(el.value || el.placeholder);
            }
            if (!hasDirectText) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

            const style = getComputedStyle(el);
            const chain = [];
            let node: Element | null = el;
            while (node) {
                const s = getComputedStyle(node);
                chain.push({
                    backgroundColor: s.backgroundColor,
                    backgroundImage: s.backgroundImage,
                });
                node = node.parentElement;
            }

            samples.push({
                tag: el.tagName,
                id: el.id,
                className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
                textPreview: (el.textContent || '').trim().slice(0, 60),
                color: style.color,
                backgroundColor: style.backgroundColor,
                backgroundImage: style.backgroundImage,
                chain,
            });

            if (samples.length >= maxSamples) break;
        }

        return samples;
    }, MAX_SAMPLES_PER_PAGE);
}

function noteSeverity(note: string): Finding['severity'] {
    if (
        note.startsWith('Could not parse color') ||
        note.startsWith('Background paint is a solid color')
    ) {
        return 'investigate';
    }
    return 'spot-check';
}

function worstSeverity(
    a: Finding['severity'],
    b: Finding['severity'],
): Finding['severity'] {
    if (a === 'investigate' || b === 'investigate') return 'investigate';
    return 'spot-check';
}

function analyzeSample(url: string, sample: SampleWire): Finding {
    const notes: string[] = [];

    const weShowColor = formatCssColorDisplay(sample.color) || '(unparsed)';
    const weShowBg = formatCssColorDisplay(sample.backgroundColor) || '(unparsed)';
    const weShowBgImage = formatBackgroundImage(sample.backgroundImage);

    if (!parseCssColor(sample.color)) {
        notes.push('Could not parse color — panel may show a fallback.');
    }

    const effective = effectiveBackgroundFromSnapshots(sample.chain);
    const contrastResult = effective ? textContrast(sample.color, effective) : null;
    const contrast = contrastResult
        ? `${contrastResult.ratio.toFixed(2)}:1 ${contrastResult.label}`
        : 'n/a';

    // Naive contrast: element's own background only (old behavior) vs effective.
    // Only flag when the WCAG tier changes — ratio noise within the same tier
    // (e.g. 21:1 AAA vs 18:1 AAA) drowned prior reports.
    const ownBg = parseCssColor(sample.backgroundColor);
    if (ownBg && contrastResult) {
        const naiveBg = ownBg.a <= 0 ? { r: 255, g: 255, b: 255, a: 1 } : ownBg;
        const naiveOwn = textContrast(sample.color, naiveBg);
        if (naiveOwn && naiveOwn.label !== contrastResult.label) {
            notes.push(
                `WCAG tier changed: own-bg ${naiveOwn.ratio.toFixed(2)}:1 ${naiveOwn.label} → ` +
                    `effective ${contrastResult.ratio.toFixed(2)}:1 ${contrastResult.label}.`,
            );
        }
    }

    if (
        sample.backgroundImage !== 'none' &&
        parseCssColor(sample.backgroundImage) &&
        (sample.backgroundColor === 'rgba(0, 0, 0, 0)' ||
            sample.backgroundColor === 'transparent')
    ) {
        notes.push(
            'Background paint is a solid color(...) image with transparent background-color — a common gotcha.',
        );
    }

    if (!effective && parseCssColor(sample.color)) {
        notes.push(
            'Contrast is n/a (gradient/url background or no opaque ancestor). Check visually if that feels right.',
        );
    }

    const label = [
        sample.tag,
        sample.id ? `#${sample.id}` : '',
        sample.textPreview ? `"${sample.textPreview}"` : sample.className.slice(0, 40),
    ]
        .filter(Boolean)
        .join(' ');

    let severity: Finding['severity'] = 'spot-check';
    for (const note of notes) {
        severity = worstSeverity(severity, noteSeverity(note));
    }

    return {
        url,
        tag: sample.tag,
        label,
        chromeColor: sample.color,
        chromeBg: sample.backgroundColor,
        chromeBgImage: truncateCssDataUrls(sample.backgroundImage).slice(0, 120),
        weShowColor,
        weShowBg,
        weShowBgImage: truncateCssDataUrls(weShowBgImage).slice(0, 120),
        contrast,
        notes,
        severity,
    };
}

/**
 * Collapse identical flag patterns per URL into one row with a count.
 * Key = url + note text(s) + contrast tier string.
 */
export function clusterFindings(findings: Finding[]): ClusteredFinding[] {
    const flagged = findings.filter((f) => f.notes.length > 0);
    const map = new Map<string, ClusteredFinding>();

    for (const f of flagged) {
        const key = `${f.url}\0${f.notes.join('\n')}\0${f.contrast}`;
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            if (existing.examples.length < 3) {
                existing.examples.push(f.label);
            }
            existing.severity = worstSeverity(existing.severity, f.severity);
            continue;
        }
        map.set(key, {
            ...f,
            count: 1,
            examples: [f.label],
        });
    }

    return [...map.values()].sort((a, b) => {
        if (a.severity !== b.severity) {
            return a.severity === 'investigate' ? -1 : 1;
        }
        return a.url.localeCompare(b.url) || b.count - a.count;
    });
}

function renderReport(
    findings: Finding[],
    clusters: ClusteredFinding[],
    urls: string[],
    errors: string[],
): string {
    const flagged = findings.filter((f) => f.notes.length > 0);
    const rows = clusters.length > 0 ? clusters : findings.slice(0, 20).map((f) => ({
        ...f,
        count: 1,
        examples: [f.label],
    }));

    const tableRows = rows
        .map((f) => {
            const notes = f.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
            const extras =
                f.count > 1
                    ? `<div class="count">${f.count} similar · e.g. ${f.examples
                          .map((e) => escapeHtml(e))
                          .join('; ')}</div>`
                    : '';
            const sev = f.notes.length
                ? `<span class="sev sev--${f.severity}">${f.severity}</span>`
                : '';
            return `<tr>
  <td>${sev}<code>${escapeHtml(f.url)}</code><br/><small>${escapeHtml(f.label)}</small>${extras}</td>
  <td><div>Chrome: <code>${escapeHtml(f.chromeColor)}</code></div>
      <div>We show: <code>${escapeHtml(f.weShowColor)}</code></div></td>
  <td><div>Chrome: <code>${escapeHtml(f.chromeBg)}</code></div>
      <div>We show: <code>${escapeHtml(f.weShowBg)}</code></div>
      <div>Image: <code>${escapeHtml(f.chromeBgImage)}</code></div></td>
  <td><code>${escapeHtml(f.contrast)}</code></td>
  <td>${notes ? `<ul>${notes}</ul>` : '<em>No flags — included as sample</em>'}</td>
</tr>`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Style Detective field audit</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 1200px; line-height: 1.45; }
    code { font-size: 0.85em; word-break: break-all; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; }
    th { background: #f4f4f4; text-align: left; }
    .meta { color: #444; margin-bottom: 1.5rem; }
    .err { color: #a00; }
    ul { margin: 0; padding-left: 1.2rem; }
    .count { color: #666; font-size: 0.85em; margin-top: 0.35rem; }
    .sev {
      display: inline-block;
      margin: 0 0.4rem 0.35rem 0;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .sev--investigate { background: #f5d4d4; color: #7a1f1f; }
    .sev--spot-check { background: #f5e6b8; color: #6a4b00; }
  </style>
</head>
<body>
  <h1>Style Detective field audit</h1>
  <div class="meta">
    <p>This is a <strong>hunting report</strong>, not a pass/fail test.
    Chrome column = raw <code>getComputedStyle</code>.
    “We show” = what Style Detective’s formatters/contrast logic derive from that.</p>
    <p>URLs: ${urls.map((u) => `<code>${escapeHtml(u)}</code>`).join(', ')}</p>
    <p>Samples analyzed: ${findings.length}. Flagged samples: ${flagged.length}.
    Unique patterns shown: ${clusters.length || (flagged.length ? 0 : Math.min(20, findings.length))}
    (identical notes per URL are clustered).</p>
    <p>Sampling skips images and elements with no direct text.
    Own-bg vs effective is only flagged when the WCAG tier changes.</p>
    ${errors.length ? `<p class="err">Load errors:<br/>${errors.map(escapeHtml).join('<br/>')}</p>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Where</th>
        <th>Color</th>
        <th>Background</th>
        <th>Contrast</th>
        <th>Notes (look here)</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

async function main(): Promise<void> {
    const urls = await loadUrls();
    if (urls.length === 0) {
        console.error(`No URLs in ${URLS_FILE}`);
        process.exit(1);
    }

    console.log(`Field audit — ${urls.length} URL(s) from audits/urls.txt`);

    const browser = await chromium.launch({ headless: true });
    const findings: Finding[] = [];
    const errors: string[] = [];

    try {
        for (const url of urls) {
            const page = await browser.newPage();
            try {
                console.log(`  Visiting ${url}`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
                await new Promise((r) => setTimeout(r, 1500));
                const samples = await samplePage(page);
                console.log(`    ${samples.length} samples`);
                for (const sample of samples) {
                    findings.push(analyzeSample(url, sample));
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${url}: ${message}`);
                console.warn(`    FAILED: ${message}`);
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    const clusters = clusterFindings(findings);

    await mkdir(REPORT_DIR, { recursive: true });
    const html = renderReport(findings, clusters, urls, errors);
    const out = path.join(REPORT_DIR, 'index.html');
    await writeFile(out, html, 'utf8');
    await writeFile(
        path.join(REPORT_DIR, 'findings.json'),
        JSON.stringify({ urls, errors, findings, clusters }, null, 2),
        'utf8',
    );

    const flagged = findings.filter((f) => f.notes.length > 0).length;
    console.log(
        `\nDone. ${findings.length} samples, ${flagged} flagged, ${clusters.length} unique patterns.`,
    );
    console.log(`Open: ${out}`);
}

const isDirectRun =
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}