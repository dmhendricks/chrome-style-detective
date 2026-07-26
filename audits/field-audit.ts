/*!
 * Field audit — hunt color/contrast anomalies on real pages.
 *
 * Reads audits/urls.txt, opens each URL in Chromium, samples visible elements,
 * and compares Style Detective's display/contrast pipeline to Chrome's raw
 * getComputedStyle (the "second opinion"). Writes audits/report/index.html
 * for you to skim — this is not a pass/fail CI gate.
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
};

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
    return page.evaluate((maxSamples) => {
        const pick = Array.from(
            document.querySelectorAll(
                'a, button, h1, h2, h3, h4, p, span, li, td, th, label, input, img',
            ),
        );

        const samples = [];
        const seen = new Set();

        for (const el of pick) {
            if (!(el instanceof HTMLElement)) continue;
            if (seen.has(el)) continue;
            seen.add(el);

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
    const ownBg = parseCssColor(sample.backgroundColor);
    if (ownBg && contrastResult) {
        const naiveBg =
            ownBg.a <= 0 ? { r: 255, g: 255, b: 255, a: 1 } : ownBg;
        const naiveOwn = textContrast(sample.color, naiveBg);
        if (naiveOwn && Math.abs(naiveOwn.ratio - contrastResult.ratio) >= 2) {
            notes.push(
                `Interesting: own-bg contrast would be ${naiveOwn.ratio.toFixed(2)}:1 ${naiveOwn.label}, ` +
                    `effective (ancestors/images) is ${contrastResult.ratio.toFixed(2)}:1 ${contrastResult.label}.`,
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

    if (weShowColor === '#000000' || weShowColor === '#FFFFFF') {
        // Extreme colors are fine; no note.
    }

    const label = [
        sample.tag,
        sample.id ? `#${sample.id}` : '',
        sample.textPreview ? `"${sample.textPreview}"` : sample.className.slice(0, 40),
    ]
        .filter(Boolean)
        .join(' ');

    return {
        url,
        tag: sample.tag,
        label,
        chromeColor: sample.color,
        chromeBg: sample.backgroundColor,
        chromeBgImage: sample.backgroundImage.slice(0, 120),
        weShowColor,
        weShowBg,
        weShowBgImage: weShowBgImage.slice(0, 120),
        contrast,
        notes,
    };
}

function renderReport(findings: Finding[], urls: string[], errors: string[]): string {
    const interesting = findings.filter((f) => f.notes.length > 0);
    const rows = interesting.length > 0 ? interesting : findings.slice(0, 40);

    const tableRows = rows
        .map((f) => {
            const notes = f.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
            return `<tr>
  <td><code>${escapeHtml(f.url)}</code><br/><small>${escapeHtml(f.label)}</small></td>
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
    code { font-size: 0.85em; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; }
    th { background: #f4f4f4; text-align: left; }
    .meta { color: #444; margin-bottom: 1.5rem; }
    .err { color: #a00; }
    ul { margin: 0; padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>Style Detective field audit</h1>
  <div class="meta">
    <p>This is a <strong>hunting report</strong>, not a pass/fail test.
    Chrome column = raw <code>getComputedStyle</code>.
    “We show” = what Style Detective’s formatters/contrast logic derive from that.</p>
    <p>URLs: ${urls.map((u) => `<code>${escapeHtml(u)}</code>`).join(', ')}</p>
    <p>Samples analyzed: ${findings.length}. Flagged rows: ${interesting.length}.
    Showing ${interesting.length > 0 ? 'flagged findings' : 'a sample of rows (nothing flagged)'}.</p>
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

    await mkdir(REPORT_DIR, { recursive: true });
    const html = renderReport(findings, urls, errors);
    const out = path.join(REPORT_DIR, 'index.html');
    await writeFile(out, html, 'utf8');
    await writeFile(
        path.join(REPORT_DIR, 'findings.json'),
        JSON.stringify({ urls, errors, findings }, null, 2),
        'utf8',
    );

    const flagged = findings.filter((f) => f.notes.length > 0).length;
    console.log(`\nDone. ${findings.length} samples, ${flagged} flagged.`);
    console.log(`Open: ${out}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
