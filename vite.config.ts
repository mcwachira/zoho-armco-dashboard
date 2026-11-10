import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(root, './src') } },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|victory-vendor|d3-)/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              minSize: 50_000,
              maxSize: 300_000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
