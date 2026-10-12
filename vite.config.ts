import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// `base: './'` hace que el build funcione en cualquier subruta de GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
})
