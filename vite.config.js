import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages project site: https://krud35.github.io/ultimate-manager/
  base: '/ultimate-manager/',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: {
      ignored: ['**/.claude/**'],
    },
  },
})
