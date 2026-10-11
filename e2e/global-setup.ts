// Arranque aislado del humo E2E (mismo patrón que exploits/run.py): BD sembrada en un
// temporal, API y front en puertos libres, todas las VULN_* ausentes (= off).
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const TSX = join(RAIZ, 'node_modules', '.bin', 'tsx');
const VITE = join(RAIZ, 'node_modules', '.bin', 'vite');
const ESPERA_MS = 30_000;

function puertoLibre(): Promise<number> {
  return new Promise((ok, fallo) => {
    const srv = createServer();
    srv.once('error', fallo);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

async function esperar(url: string, valida: (r: Response) => Promise<boolean>, proc: ChildProcess, quien: string) {
  const limite = Date.now() + ESPERA_MS;
  while (Date.now() < limite) {
    if (proc.exitCode !== null || proc.pid === undefined) throw new Error(`${quien} terminó antes de responder (código ${proc.exitCode})`);
    try {
      if (await valida(await fetch(url))) return;
    } catch {
      // aún no escucha
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${quien} sin respuesta en ${ESPERA_MS / 1000} s (${url})`);
}

function detener(proc: ChildProcess) {
  if (proc.pid === undefined || proc.exitCode !== null) return;
  try {
    process.kill(-proc.pid, 'SIGTERM'); // grupo entero: tsx/npx lanzan un hijo
  } catch {
    // ya terminó
  }
}

export default async function globalSetup() {
  const tmp = mkdtempSync(join(tmpdir(), 'tm-e2e-'));
  const procs: ChildProcess[] = [];
  const limpiar = () => {
    procs.forEach(detener);
    rmSync(tmp, { recursive: true, force: true });
  };
  try {
    const db = join(tmp, 'lab.sqlite');
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VULN_')));
    const semilla = spawnSync(TSX, [join(RAIZ, 'db', 'seed.ts')], { cwd: RAIZ, env: { ...base, DB_PATH: db }, encoding: 'utf8' });
    if (semilla.status !== 0) throw new Error(`no se pudo sembrar la BD: ${(semilla.stderr || semilla.stdout).slice(-500)}`);

    const [apiPort, frontPort] = [await puertoLibre(), await puertoLibre()];
    const lanzar = (cmd: string, args: string[], cwd: string, env: Record<string, string>) => {
      const p = spawn(cmd, args, { cwd, env: { ...base, ...env }, stdio: 'ignore', detached: true });
      p.once('error', () => {}); // un fallo de spawn lo reporta esperar() por exitCode
      procs.push(p);
      return p;
    };
    const api = lanzar(TSX, [join(RAIZ, 'api', 'src', 'main.ts')], RAIZ, {
      PORT: String(apiPort),
      DB_PATH: db,
      UPLOAD_DIR: join(tmp, 'uploads'),
    });
    await esperar(`http://127.0.0.1:${apiPort}/health`, async (r) => r.ok && (await r.json()).ok === true, api, 'API');

    const front = lanzar(VITE, ['--port', String(frontPort), '--strictPort'], join(RAIZ, 'front'), { API_PORT: String(apiPort) });
    await esperar(`http://127.0.0.1:${frontPort}/`, async (r) => r.ok, front, 'front');

    process.env.E2E_BASE_URL = `http://127.0.0.1:${frontPort}`;
  } catch (err) {
    limpiar();
    throw err;
  }
  return limpiar;
}
