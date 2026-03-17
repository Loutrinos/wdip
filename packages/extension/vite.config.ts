import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import path from 'path'

export default defineConfig({
  // public/ is copied as-is to dist/ — icons live here so Chrome finds them
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [
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
