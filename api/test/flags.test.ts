import { describe, expect, it } from 'vitest';
import { VULN_IDS, loadFlags } from '../src/flags.js';

describe('loadFlags', () => {
  it('sin variables de entorno, las 15 vulnerabilidades quedan en false', () => {
    const flags = loadFlags({});

    expect(flags).toEqual(Object.fromEntries(VULN_IDS.map((id) => [id, false])));
    expect(VULN_IDS).toHaveLength(15);
  });

  it('VULN_W1=on activa solo W1', () => {
    const flags = loadFlags({ VULN_W1: 'on' });

    const activas = Object.entries(flags)
      .filter(([, activa]) => activa)
      .map(([id]) => id);
    expect(activas).toEqual(['W1']);
  });

  it('VULN_W1=off deja W1 en false', () => {
    const flags = loadFlags({ VULN_W1: 'off' });

    expect(flags.W1).toBe(false);
    expect(Object.values(flags).some(Boolean)).toBe(false);
  });

  it.each(['ON', '1'])('rechaza el valor %s y nombra la variable y el valor recibido', (valor) => {
    expect(() => loadFlags({ VULN_W1: valor })).toThrow(
      `VULN_W1 debe ser 'on' u 'off', recibió '${valor}'`,
    );
  });

  it('el objeto devuelto está congelado: no se puede asignar ni cambiar', () => {
    const flags = loadFlags({ VULN_W1: 'on' });

    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => {
      (flags as { W1: boolean }).W1 = false;
    }).toThrow(TypeError);
    expect(flags.W1).toBe(true);
  });
});
