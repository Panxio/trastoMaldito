import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

describe('errores sin fugas', () => {
  const apps: Array<ReturnType<typeof buildServer>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  function nuevo() {
    const app = buildServer();
    apps.push(app);
    return app;
  }

  it('ruta inexistente → 404 NOT_FOUND', async () => {
    const res = await nuevo().inject({ method: 'GET', url: '/api/v2/no-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'Recurso no encontrado' });
  });

  it('error interno → 500 INTERNAL sin traza ni SQL', async () => {
    const app = nuevo();
    app.get('/api/v2/boom', async () => {
      throw new Error('SQLITE_ERROR: no such table: users — SELECT * FROM users en /home/x/api/src/db.ts:42');
    });

    const res = await app.inject({ method: 'GET', url: '/api/v2/boom' });
    const cuerpo = res.body;

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ code: 'INTERNAL', message: 'Error interno' });
    expect(cuerpo).not.toMatch(/SELECT|SQLITE|users|\.ts|stack|at /i);
  });

  it('JSON malformado → 400 BAD_REQUEST (no 500) y sin detalle del parser', async () => {
    const app = nuevo();
    app.post('/api/v2/eco', async (req) => req.body);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{"roto":',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'BAD_REQUEST', message: 'Solicitud inválida' });
  });
});
