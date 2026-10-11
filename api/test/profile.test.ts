import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, crearEntorno } from './helpers.js';

const CLAVES = ['id', 'email', 'name', 'rut', 'commune', 'phone', 'role', 'store_credit'];

describe('perfil (M6 limpio)', () => {
  const e = crearEntorno('profile');
  const fila = (id: number) => e.db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  describe('autenticación', () => {
    it.each([['GET'], ['PATCH']] as const)('%s /me sin token → 401', async (metodo) => {
      const res = await e.pedir(metodo, '/api/v2/me', undefined, metodo === 'PATCH' ? { commune: 'Ñuñoa' } : undefined);

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
    });
  });

  describe('GET /me', () => {
    it('devuelve el perfil de la sesión, sin hash de clave', async () => {
      const res = await e.pedir('GET', '/api/v2/me', await e.token('camila'));
      const me = res.json();

      expect(res.statusCode).toBe(200);
      expect(Object.keys(me).sort()).toEqual([...CLAVES].sort());
      expect(me).toEqual({
        id: 2,
        email: 'camila@trastomaldito.test',
        name: 'Camila Soto Ibáñez',
        rut: '17.234.567-0',
        commune: 'Ñuñoa',
        phone: '+56 9 0000 0002',
        role: 'customer',
        store_credit: 0,
      });
      expect(res.body).not.toMatch(/password|scrypt/);
    });

    it('cada token ve su propio perfil', async () => {
      const admin = (await e.pedir('GET', '/api/v2/me', await e.token('admin'))).json();

      expect(admin).toMatchObject({ id: 1, role: 'admin' });
    });
  });

  describe('PATCH /me', () => {
    it('cambia la comuna y el cambio queda guardado', async () => {
      const token = await e.token('camila');

      const res = await e.pedir('PATCH', '/api/v2/me', token, { commune: 'Valparaíso' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: 2, commune: 'Valparaíso', role: 'customer' });
      expect((await e.pedir('GET', '/api/v2/me', token)).json().commune).toBe('Valparaíso');
      expect(fila(2)).toMatchObject({ commune: 'Valparaíso', name: 'Camila Soto Ibáñez' });
    });

    it('cambia varios campos a la vez, con Unicode', async () => {
      const res = await e.pedir('PATCH', '/api/v2/me', await e.token('camila'), {
        name: 'Ñandú Pérez 👻',
        commune: 'Viña del Mar',
        phone: '+56 9 1111 2222',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'Ñandú Pérez 👻', commune: 'Viña del Mar', phone: '+56 9 1111 2222' });
    });

    it('no toca a otros usuarios', async () => {
      const antes = fila(3);

      await e.pedir('PATCH', '/api/v2/me', await e.token('camila'), { name: 'Otra' });

      expect(fila(3)).toEqual(antes);
    });

    it.each([
      ['role', { role: 'admin' }],
      ['store_credit', { store_credit: 999999 }],
      ['email', { email: 'otro@trastomaldito.test' }],
      ['rut', { rut: '1-9' }],
      ['id', { id: 1 }],
      ['password_hash', { password_hash: 'x' }],
      ['campo válido junto a uno privilegiado', { commune: 'Ñuñoa', role: 'admin' }],
    ])('campo no editable (%s) → 400 y nada cambia', async (_caso, cuerpo) => {
      const antes = fila(2);

      const res = await e.pedir('PATCH', '/api/v2/me', await e.token('camila'), cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(fila(2)).toEqual(antes);
    });

    it.each([
      ['cuerpo vacío', {}],
      ['nombre vacío', { name: '' }],
      ['nombre de 101 caracteres', { name: 'a'.repeat(101) }],
      ['comuna vacía', { commune: '' }],
      ['comuna de 61 caracteres', { commune: 'a'.repeat(61) }],
      ['teléfono de 21 caracteres', { phone: '1'.repeat(21) }],
      ['nombre numérico', { name: 5 }],
      ['teléfono nulo', { phone: null }],
    ])('%s → 400', async (_caso, cuerpo) => {
      const antes = fila(2);

      const res = await e.pedir('PATCH', '/api/v2/me', await e.token('camila'), cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(fila(2)).toEqual(antes);
    });
  });
});
