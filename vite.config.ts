import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';

const ROOT = import.meta.dirname;
const require = createRequire(import.meta.url);
const manifest = require('./src/manifest.json') as { version: string };
const DIST = resolve(ROOT, 'dist');

const copyLicense: Plugin = {
  name: 'copy-license',
  apply: 'build',
  closeBundle() {
    copyFileSync(resolve(ROOT, 'LICENSE'), resolve(DIST, 'LICENSE'));
  },
};

// Stamp the options page with the extension version from manifest.json so the
// badge stays in sync without a runtime script (MV3 pages block inline JS).
const injectManifestVersion: Plugin = {
  name: 'inject-manifest-version',
  transformIndexHtml(html) {
    return html.replaceAll('%MANIFEST_VERSION%', manifest.version);
  },
};

export default defineConfig({
  plugins: [
    crx({ manifest: manifest as unknown as ManifestV3Export }),
    injectManifestVersion,
    copyLicense,
  ],
  css: {
    preprocessorOptions: {
      scss: { quietDeps: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
