import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Antes de los tests se resiembra signalmap_test: siempre parten del mismo estado.
    globalSetup: ['tests/global-setup.ts'],
  },
});
