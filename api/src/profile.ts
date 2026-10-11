import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.js';
import { cuerpoEdicion, camposAsignables } from './vulns/a3.js';

// Perfil propio. `password_hash` nunca sale de la API.
export interface Perfil {
  id: number;
  email: string;
  name: string;
  rut: string;
  commune: string;
  phone: string | null;
  role: string;
  store_credit: number;
}

const COLUMNAS = 'id, email, name, rut, commune, phone, role, store_credit';

function leerPerfil(db: DatabaseSync, id: number): Perfil {
  const fila = db.prepare(`SELECT ${COLUMNAS} FROM users WHERE id = ?`).get(id) as unknown as Perfil | undefined;
  if (!fila) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
  return fila;
}

export function registerProfile(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  app.register(
    async (api) => {
      api.get(
        '/me',
        { preHandler: app.requireAuth() },
        async (req) => leerPerfil(db, req.user!.id),
      );

      api.patch<{ Body: Record<string, unknown> }>(
        '/me',
        { preHandler: app.requireAuth(), schema: { body: cuerpoEdicion } },
        async (req) => {
          const id = req.user!.id;
          const campos = camposAsignables(req.body);
          const asignaciones = campos.map((c) => `${c} = ?`).join(', ');
          const valores = campos.map((c) => req.body[c] as string);
          db.prepare(`UPDATE users SET ${asignaciones} WHERE id = ?`).run(...valores, id);
          return leerPerfil(db, id);
        },
      );
    },
    { prefix: '/api/v2' },
  );
}
