import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../db/seed.js';
import { signToken } from '../src/jwt.js';
import { buildServer } from '../src/server.js';

const SECRETO = 'secreto-de-prueba-largo-0123456789abcdef';
const OTRO_SECRETO = 'otro-secreto-de-prueba-0123456789abcdef!!';

const NUEVO = {
  email: 'Nueva.Clienta@Trastomaldito.test',
  password: 'clave-falsa-lab-nueva',
  name: 'Nuria Vega Toro',
  rut: '1000005K',
  commune: 'Maipú',
};

describe('auth', () => {
  let dir: string;
  let plantilla: string;
  let db: DatabaseSync;
  let app: ReturnType<typeof buildServer>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'trastomaldito-auth-'));
    plantilla = join(dir, 'plantilla.sqlite');
    seedDatabase(plantilla);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    const copia = join(dir, `t-${Math.random().toString(36).slice(2)}.sqlite`);
    copyFileSync(plantilla, copia);
    db = new DatabaseSync(copia);
    db.exec('PRAGMA foreign_keys = ON');
    app = buildServer({ db, jwtSecret: SECRETO });
    app.get('/api/v2/_yo', { preHandler: app.requireAuth() }, async (req) => req.user);
    app.get('/api/v2/_admin', { preHandler: app.requireAuth('admin') }, async (req) => req.user);
  });
  afterEach(async () => {
    await app.close();
    db.close();
  });

  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url, payload: payload as object });
  const login = async (email: string, password: string) =>
    (await post('/api/v2/auth/login', { email, password })).json();
  const conToken = (url: string, token: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  describe('POST /api/v2/auth/register', () => {
    it('crea una clienta, normaliza email y RUT, y no devuelve el hash', async () => {
      const res = await post('/api/v2/auth/register', NUEVO);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        user: {
          id: expect.any(Number),
          email: 'nueva.clienta@trastomaldito.test',
          name: 'Nuria Vega Toro',
          role: 'customer',
        },
      });
      expect(res.body).not.toMatch(/scrypt|password/i);
      const fila = db.prepare('SELECT rut, role, password_hash FROM users WHERE email = ?').get(
        'nueva.clienta@trastomaldito.test',
      ) as { rut: string; role: string; password_hash: string };
      expect(fila.rut).toBe('1.000.005-K');
      expect(fila.role).toBe('customer');
      expect(fila.password_hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    });

    it('rechaza campos de más (no se puede elegir el rol) con 400 y no crea nada', async () => {
      const res = await post('/api/v2/auth/register', { ...NUEVO, role: 'admin' });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BAD_REQUEST');
      expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 3 });
    });

    it.each([
      ['RUT con DV incorrecto', { rut: '1000005-1' }],
      ['correo inválido', { email: 'no-es-correo' }],
      ['clave corta', { password: 'corta' }],
      ['clave gigante', { password: 'x'.repeat(200) }],
      ['falta el nombre', { name: undefined }],
      ['nombre no es texto', { name: { $ne: 1 } }],
      ['nombre numérico (sin coerción de tipos)', { name: 12345 }],
    ])('400 si %s', async (_caso, cambio) => {
      const res = await post('/api/v2/auth/register', { ...NUEVO, ...cambio });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BAD_REQUEST');
    });

    it('409 si el correo ya existe (aunque cambie la capitalización)', async () => {
      const res = await post('/api/v2/auth/register', { ...NUEVO, email: 'CAMILA@trastomaldito.test' });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('CONFLICT');
    });

    it('409 si el RUT ya existe aunque venga sin puntos', async () => {
      const res = await post('/api/v2/auth/register', { ...NUEVO, rut: '17234567-0' });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v2/auth/login', () => {
    it('devuelve token y usuario; el token abre una ruta protegida', async () => {
      const res = await post('/api/v2/auth/login', {
        email: 'Camila@trastomaldito.test',
        password: 'clave-falsa-lab-1',
      });

      expect(res.statusCode).toBe(200);
      const { token, user } = res.json();
      expect(user).toEqual({ id: 2, email: 'camila@trastomaldito.test', name: 'Camila Soto Ibáñez', role: 'customer' });
      expect(res.body).not.toMatch(/scrypt|password_hash/);

      const yo = await conToken('/api/v2/_yo', token);
      expect(yo.statusCode).toBe(200);
      expect(yo.json()).toEqual({ id: 2, role: 'customer' });
    });

    it('registrarse y luego iniciar sesión funciona', async () => {
      await post('/api/v2/auth/register', NUEVO);
      const res = await post('/api/v2/auth/login', { email: NUEVO.email, password: NUEVO.password });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.role).toBe('customer');
    });

    it('clave incorrecta y correo inexistente dan la misma respuesta 401', async () => {
      const mala = await post('/api/v2/auth/login', { email: 'camila@trastomaldito.test', password: 'clave-equivocada-1' });
      const noExiste = await post('/api/v2/auth/login', { email: 'nadie@trastomaldito.test', password: 'clave-equivocada-1' });

      expect(mala.statusCode).toBe(401);
      expect(noExiste.statusCode).toBe(401);
      expect(mala.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' });
      expect(noExiste.json()).toEqual(mala.json());
    });

    it.each([
      ['sin cuerpo', undefined],
      ['sin clave', { email: 'camila@trastomaldito.test' }],
      ['campos de más', { email: 'camila@trastomaldito.test', password: 'clave-falsa-lab-1', role: 'admin' }],
      ['operador en vez de texto', { email: { $ne: '' }, password: { $ne: '' } }],
    ])('400 %s', async (_caso, cuerpo) => {
      const res = await post('/api/v2/auth/login', cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BAD_REQUEST');
    });
  });

  describe('requireAuth', () => {
    it('sin token → 401 UNAUTHENTICATED', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v2/_yo' });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
    });

    it.each([
      ['esquema distinto de Bearer', (t: string) => `Basic ${t}`],
      ['token basura', () => 'Bearer no.es.un-jwt'],
      ['firma alterada', (t: string) => `Bearer ${t.slice(0, -2)}xx`],
    ])('401 con %s', async (_caso, cabecera) => {
      const { token } = await login('camila@trastomaldito.test', 'clave-falsa-lab-1');
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/_yo',
        headers: { authorization: cabecera(token) },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHENTICATED');
    });

    it('401 con token firmado con otro secreto', async () => {
      const falso = signToken({ sub: 1, role: 'admin' }, OTRO_SECRETO);

      expect((await conToken('/api/v2/_admin', falso)).statusCode).toBe(401);
    });

    it('401 con token expirado', async () => {
      const vencido = signToken({ sub: 2, role: 'customer' }, SECRETO, { ttlSegundos: -10 });

      expect((await conToken('/api/v2/_yo', vencido)).statusCode).toBe(401);
    });

    it('401 con alg "none" (sin firma)', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const ahora = Math.floor(Date.now() / 1000);
      const sinFirma = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1, role: 'admin', iat: ahora, exp: ahora + 600 })}.`;

      expect((await conToken('/api/v2/_admin', sinFirma)).statusCode).toBe(401);
    });

    it('403 FORBIDDEN si el rol no alcanza; el admin pasa', async () => {
      const cliente = await login('camila@trastomaldito.test', 'clave-falsa-lab-1');
      const admin = await login('admin@trastomaldito.test', 'clave-falsa-lab-0');

      const denegado = await conToken('/api/v2/_admin', cliente.token);
      expect(denegado.statusCode).toBe(403);
      expect(denegado.json()).toEqual({ code: 'FORBIDDEN', message: 'Permisos insuficientes' });
      const permitido = await conToken('/api/v2/_admin', admin.token);
      expect(permitido.statusCode).toBe(200);
      expect(permitido.json()).toEqual({ id: 1, role: 'admin' });
    });
  });

  it('se niega a crearse con un secreto de menos de 32 caracteres', () => {
    expect(() => buildServer({ db, jwtSecret: 'corto' })).toThrow(/32/);
  });
});
