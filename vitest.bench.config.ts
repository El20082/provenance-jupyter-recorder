import { defineConfig } from 'vitest/config';

// Benchmarks only (`npm run bench`), kept out of `npm test` as in the VS Code recorder.
export default defineConfig({
  test: {
    include: ['tests/perf/**/*.ts'],
    environment: 'node',
  },
});
