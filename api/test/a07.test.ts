import { describe, expect, it } from 'vitest';
import { BLOQUEO_MS, MAX_FALLOS, crearConLimite } from '../src/vulns/a07.js';

describe('A07 limitador de login (versión corregida)', () => {
  const nuevo = () => {
    let t = 1_000;
    const l = crearConLimite(() => t);
    return { l, avanzar: (ms: number) => (t += ms) };
  };
  const fallar = (l: ReturnType<typeof crearConLimite>, email: string, n: number) => {
    for (let i = 0; i < n; i++) l.fallo(email);
  };

  it('bloquea al llegar al tope y no antes', () => {
    const { l } = nuevo();
    fallar(l, 'a@x.test', MAX_FALLOS - 1);
    expect(l.bloqueado('a@x.test')).toBe(false);
    l.fallo('a@x.test');
    expect(l.bloqueado('a@x.test')).toBe(true);
  });

  it('es por cuenta', () => {
    const { l } = nuevo();
    fallar(l, 'a@x.test', MAX_FALLOS);
    expect(l.bloqueado('b@x.test')).toBe(false);
  });

  it('un éxito antes del tope pone el contador a cero', () => {
    const { l } = nuevo();
    fallar(l, 'a@x.test', MAX_FALLOS - 1);
    l.exito('a@x.test');
    fallar(l, 'a@x.test', MAX_FALLOS - 1);
    expect(l.bloqueado('a@x.test')).toBe(false);
  });

  it('el bloqueo vence y la cuenta vuelve a empezar de cero', () => {
    const { l, avanzar } = nuevo();
    fallar(l, 'a@x.test', MAX_FALLOS);
    avanzar(BLOQUEO_MS - 1);
    expect(l.bloqueado('a@x.test')).toBe(true);
    avanzar(1);
    expect(l.bloqueado('a@x.test')).toBe(false);
    fallar(l, 'a@x.test', MAX_FALLOS - 1);
    expect(l.bloqueado('a@x.test')).toBe(false);
  });

  it('fallos viejos (fuera de la ventana) no se acumulan', () => {
    const { l, avanzar } = nuevo();
    fallar(l, 'a@x.test', MAX_FALLOS - 1);
    avanzar(BLOQUEO_MS);
    l.fallo('a@x.test');
    expect(l.bloqueado('a@x.test')).toBe(false);
  });
});
