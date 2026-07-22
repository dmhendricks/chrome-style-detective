import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json' with { type: 'json' };

const DIST = resolve(__dirname, 'dist');
const CONTENT_OUT_DIR = resolve(DIST, 'src/content');
const CONTENT_ENTRY = resolve(__dirname, 'src/content/cssviewer.ts');
const CONTENT_CSS = resolve(__dirname, 'src/content/cssviewer.css');

const copyLicense: Plugin = {
  name: 'copy-license',
  apply: 'build',
  closeBundle() {
    copyFileSync(resolve(__dirname, 'LICENSE'), resolve(DIST, 'LICENSE'));
  },
};

// The content script is injected at runtime via chrome.scripting.executeScript
// ({ files: [...] }), which only accepts a plain classic .js file. crxjs can't
// produce that (it matches web_accessible_resource entries to on-disk source
// paths and won't transpile .ts -> .js for them), so we build cssviewer.ts on
// its own — as an IIFE, unhashed — copy its standalone CSS next to it, and add
// both to the emitted manifest's web_accessible_resources.
const contentScript: Plugin = {
  name: 'build-content-script',
  apply: 'build',
  // The content script is built by a nested build() below, so its sources are
  // not in the main build's module graph and `vite build --watch` wouldn't
  // rebuild on edits. Register them with the watcher so a change re-triggers the
  // build (and thus the closeBundle hook that rebuilds the content script).
  buildStart() {
    this.addWatchFile(CONTENT_ENTRY);
    this.addWatchFile(CONTENT_CSS);
  },
  async closeBundle() {
    await build({
      configFile: false,
      // Don't copy public/ again — the main crxjs build already emits it to
      // dist/, and this nested build would duplicate it under dist/src/content/.
      publicDir: false,
      build: {
        outDir: CONTENT_OUT_DIR,
        emptyOutDir: false,
        lib: {
          entry: CONTENT_ENTRY,
          formats: ['iife'],
          name: 'CSSViewerClassic',
          fileName: () => 'cssviewer.js',
        },
      },
    });

    mkdirSync(CONTENT_OUT_DIR, { recursive: true });
    copyFileSync(CONTENT_CSS, resolve(CONTENT_OUT_DIR, 'cssviewer.css'));

    // Register the separately-built content files as web-accessible so the
    // service worker can inject them. crxjs drops an empty web_accessible_resources
    // array, so recreate the entry if it isn't present.
    const manifestPath = resolve(DIST, 'manifest.json');
    const emitted = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const files = ['src/content/cssviewer.js', 'src/content/cssviewer.css'];
    if (!Array.isArray(emitted.web_accessible_resources)) {
      emitted.web_accessible_resources = [];
    }
    const war = emitted.web_accessible_resources;
    const entry = war.find((r: { matches?: string[] }) => r.matches?.includes('<all_urls>'));
    if (entry) {
      entry.resources = [...(entry.resources ?? []), ...files];
    } else {
      war.push({ resources: files, matches: ['<all_urls>'] });
    }
    writeFileSync(manifestPath, JSON.stringify(emitted, null, 2) + '\n');
  },
};

export default defineConfig({
  plugins: [crx({ manifest: manifest as unknown as ManifestV3Export }), contentScript, copyLicense],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
