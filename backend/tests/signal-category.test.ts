import { describe, expect, test } from 'vitest';
import { categoryOf } from '../src/services/signal-category.ts';

// Umbrales del Hito 1: > -65 buena · -65 a -70 regular (ambos incluidos) · < -70 débil.
describe('categoryOf', () => {
  test.each([
    [-64, 'buena'],
    [0, 'buena'],
    [-65, 'regular'],
    [-70, 'regular'],
    [-71, 'debil'],
    [-120, 'debil'],
    [null, 'sin_senal'],
  ] as const)('%s dBm → %s', (rssi, category) => {
    expect(categoryOf(rssi)).toBe(category);
  });
});
