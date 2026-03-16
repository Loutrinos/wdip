import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  // Replace with your actual GitHub Pages base path, e.g. '/wdip/'
  // Run `vite build --base=/wdip/` from CI, or set it here:
  base: '/wdip/',
  resolve: {
    alias: {
      '@wdip/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
