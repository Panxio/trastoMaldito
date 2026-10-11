import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password.js';

describe('hashPassword / verifyPassword', () => {
  it('ida y vuelta: la clave original verifica contra su hash', () => {
    const hash = hashPassword('clave-falsa-lab-1');

    expect(verifyPassword('clave-falsa-lab-1', hash)).toBe(true);
  });

  it('una clave distinta no verifica', () => {
    const hash = hashPassword('clave-falsa-lab-1');

    expect(verifyPassword('clave-falsa-lab-2', hash)).toBe(false);
  });

  it('dos hashes de la misma clave son distintos (sal aleatoria) y ambos verifican', () => {
    const a = hashPassword('misma-clave');
    const b = hashPassword('misma-clave');

    expect(a).not.toBe(b);
    expect(verifyPassword('misma-clave', a)).toBe(true);
    expect(verifyPassword('misma-clave', b)).toBe(true);
  });

  it('el formato es scrypt$<saltHex>$<hashHex>', () => {
    expect(hashPassword('x')).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it.each([
    '',
    'scrypt',
    'scrypt$',
    'scrypt$$',
    'md5$00ff$00ff',
    'scrypt$zz$zz',
    'scrypt$abc$00ff',
    'scrypt$00ff$00ff$00ff',
  ])('una cadena almacenada malformada (%j) devuelve false sin lanzar', (stored) => {
    expect(() => verifyPassword('cualquiera', stored)).not.toThrow();
    expect(verifyPassword('cualquiera', stored)).toBe(false);
  });
});
