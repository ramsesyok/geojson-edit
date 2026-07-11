import { defineConfig } from 'vite';
import { resolve } from 'path';

// Bundle the webview into a single self-contained IIFE (no CDN / dynamic import),
// suitable for a CSP-restricted VSCode webview in an air-gapped environment.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  // vite lib mode does not auto-replace process.env.NODE_ENV; React needs it,
  // and the webview has no `process` global. Replace it at build time so the
  // dev-only branches are eliminated and no `process` reference remains.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'out/webview',
    emptyOutDir: true,
    minify: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/webview/editor/index.tsx'),
      formats: ['iife'],
      name: 'GeojsonEditWebview',
      fileName: () => 'webview.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'webview.[ext]',
        inlineDynamicImports: true,
      },
    },
  },
});
