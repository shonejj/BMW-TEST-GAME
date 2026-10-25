import { defineConfig, type Plugin } from 'vite';
import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Inlines the JS bundle and CSS into index.html so the game is a single
 * self-contained file: it runs from GitHub Pages, from any static server,
 * or straight from disk (file://). Also emits a cache-first service worker
 * so the hosted version works offline after the first visit.
 */
function singleFileWithServiceWorker(): Plugin {
  return {
    name: 'single-file-sw',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = bundle['index.html'];
      if (!htmlAsset || htmlAsset.type !== 'asset') return;
      let html = String(htmlAsset.source);
      for (const [fileName, item] of Object.entries(bundle)) {
        const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (item.type === 'chunk' && item.isEntry) {
          const code = item.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(new RegExp(`<script[^>]*src="[./]*${escaped}"[^>]*></script>`), '');
          html = html.replace('</body>', () => `<script>${code}</script>\n</body>`);
          delete bundle[fileName];
        } else if (item.type === 'asset' && fileName.endsWith('.css')) {
          html = html.replace(new RegExp(`<link[^>]*href="[./]*${escaped}"[^>]*>`), '');
          html = html.replace('</head>', () => `<style>${String(item.source)}</style>\n</head>`);
          delete bundle[fileName];
        }
      }
      htmlAsset.source = html;

      const publicFiles = readdirSync('public').filter((f) => f !== 'sw.js');
      const files = ['./', './index.html', ...Object.keys(bundle).filter((f) => f !== 'index.html').map((f) => './' + f), ...publicFiles.map((f) => './' + f)];
      const version = createHash('sha1').update(html).digest('hex').slice(0, 10);
      const sw = `const CACHE = 'mk-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  plugins: [singleFileWithServiceWorker()],
});
