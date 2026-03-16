import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import path from 'path'

export default defineConfig({
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
