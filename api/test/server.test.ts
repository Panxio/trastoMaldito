import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../db/seed.js';
import { buildServer, startServer } from '../src/server.js';

describe('GET /health', () => {
  it('responde 200 con {ok: true}', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('startServer', () => {
  let app: Awaited<ReturnType<typeof startServer>> | undefined;
  const previousHost = process.env.HOST;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (previousHost === undefined) delete process.env.HOST;
    else process.env.HOST = previousHost;
  });

  it('escucha solo en 127.0.0.1 aunque HOST pida 0.0.0.0', async () => {
    process.env.HOST = '0.0.0.0';
    app = await startServer({ port: 0 });

    expect(app.server.address()).toMatchObject({ address: '127.0.0.1' });
  });

  it('sirve /health por el puerto recibido', async () => {
    app = await startServer({ port: 0 });
    const { port } = app.server.address() as { port: number };

    const res = await fetch(`http://127.0.0.1:${port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('startServer con base de datos', () => {
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'trastomaldito-server-'));
    dbPath = join(dir, 'lab.sqlite');
    seedDatabase(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('abre DB_PATH con foreign_keys activo, expone app.db y /health sigue ok', async () => {
    const app = await startServer({ port: 0, dbPath });
    try {
      const { port } = app.server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/health`);

      expect(await res.json()).toEqual({ ok: true });
      expect(app.db?.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 3 });
      expect(app.db?.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    } finally {
      await app.close();
    }
  });

  it('al cerrar el servidor también cierra la BD', async () => {
    const app = await startServer({ port: 0, dbPath });
    const db = app.db!;

    await app.close();

    expect(db.isOpen).toBe(false);
  });

  it('se niega a arrancar con una BD inexistente y no crea un archivo vacío', async () => {
    const ruta = join(dir, 'no-existe.sqlite');

    await expect(startServer({ port: 0, dbPath: ruta })).rejects.toThrow(/no existe/);
    expect(existsSync(ruta)).toBe(false);
  });
});
