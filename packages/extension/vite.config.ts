import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import path from 'path'

export default defineConfig({
  // public/ is copied as-is to dist/ — icons live here so Chrome finds them
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [
    // Remove `crossorigin` attributes Vite adds to <script>/<link> tags —
    // they can cause module-load failures in Chrome extension popup pages.
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html: string) {
        // Remove crossorigin and type="module" from <script> tags.
        // Chrome extension popup pages can't load module scripts (MIME check fails).
        // The built JS is already IIFE so it works fine as a classic script.
        return html
          .replace(/ crossorigin(="[^"]*")?/g, '')
          .replace(/<script type="module"/g, '<script')
      },
    },
    webExtension({
      // The plugin reads manifest.json and handles all entry points.
      // TypeScript source paths in the manifest are compiled automatically.
    }),
  ],
  resolve: {
    alias: {
      '@wdip/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // easier to debug during development
  },
})
