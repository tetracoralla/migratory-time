import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/node_modules/@js-temporal/polyfill/') ||
            id.includes('/node_modules/jsbi/')
          ) {
            return 'temporal-polyfill'
          }
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
      'addons/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/setup.ts'],
  },
})
