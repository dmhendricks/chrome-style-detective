import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json' with { type: 'json' };

const DIST = resolve(__dirname, 'dist');
const CONTENT_OUT_DIR = resolve(DIST, 'src/content');

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
  async closeBundle() {
    await build({
      configFile: false,
      build: {
        outDir: CONTENT_OUT_DIR,
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, 'src/content/cssviewer.ts'),
          formats: ['iife'],
          name: 'CSSViewerClassic',
          fileName: () => 'cssviewer.js',
        },
      },
    });

    mkdirSync(CONTENT_OUT_DIR, { recursive: true });
    copyFileSync(
      resolve(__dirname, 'src/content/cssviewer.css'),
      resolve(CONTENT_OUT_DIR, 'cssviewer.css'),
    );

    const manifestPath = resolve(DIST, 'manifest.json');
    const emitted = JSON.parse(readFileSync(manifestPath, 'utf8'));
    emitted.web_accessible_resources[0].resources.push(
      'src/content/cssviewer.js',
      'src/content/cssviewer.css',
    );
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
