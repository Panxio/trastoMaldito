import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { TOPE, paginar } from '../src/vulns/api4.js';

// Las flags quedan congeladas al arrancar y en vitest todas están en off: aquí va la versión corregida.
describe('API4 paginación (versión corregida)', () => {
  const items = Array.from({ length: TOPE + 20 }, (_, i) => i);

  it('sin limit rige el tope', () => {
    expect(paginar(items, {})).toHaveLength(TOPE);
  });
  it('limit hasta el tope y offset recorren el resto', () => {
    expect(paginar(items, { limit: TOPE })).toHaveLength(TOPE);
    expect(paginar(items, { limit: 5, offset: 3 })).toEqual([3, 4, 5, 6, 7]);
    expect(paginar(items, { offset: TOPE })).toEqual(items.slice(TOPE));
  });
  it('limit sobre el tope → 400', () => {
    expect(() => paginar(items, { limit: TOPE + 1 })).toThrow(ApiError);
    try {
      paginar(items, { limit: 1_000_000 });
    } catch (e) {
      expect((e as ApiError).status).toBe(400);
    }
  });
});
