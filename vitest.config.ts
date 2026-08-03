import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts', 'src/main/**/*.ts'],
      exclude: [
        'src/main/index.ts',
        'src/main/ipc/**',
        'src/main/tools/**/*.ts',
        'src/main/deepseek/tokenizer.ts',
        'src/**/*.d.ts',
        'src/**/*.json'
      ]
    }
  }
})
