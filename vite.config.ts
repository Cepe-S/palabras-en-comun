import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// `base: './'` hace que el build funcione en cualquier subruta de GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022' },
  // `npm run dev`: siempre en el mismo puerto y abre el navegador con el DevHUD.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, open: true },
  test: { include: ['src/**/*.test.ts'] },
})
