import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  // oxc: false,  // cannot disable - rolldown can't parse TypeScript
});
