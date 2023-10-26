import { defineConfig, defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        ...defaultExclude,
        '**/*.test.ts',
        '*/mock-utils/**'
      ]
    },
    testTimeout: Number(process.env.TEST_TIMEOUT ?? 5000)
  },
})