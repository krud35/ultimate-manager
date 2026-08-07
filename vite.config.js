import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages project site: https://krud35.github.io/ultimate-manager/
  base: '/ultimate-manager/',
  plugins: [react(), tailwindcss()],
})
