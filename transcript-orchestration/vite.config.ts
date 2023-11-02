import { defineConfig, defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: [
      './tests/setup.ts'
    ],
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