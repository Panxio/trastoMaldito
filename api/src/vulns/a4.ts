import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { flags } from '../flags.js';

// A4 — Una versión vieja /api/v1 sigue viva (API9:2023 Improper Inventory Management).
// Único lugar del proyecto con `if (flags.A4)`; server.ts llama SIEMPRE a registrarV1 y es esta
// función la que decide si monta algo. El ID «A4» es la etiqueta del lab, no la categoría.
//
// off (corrección): no se monta nada bajo /api/v1; cualquier ruta cae en el notFound handler
//   (404). El inventario de la API es una sola versión soportada (v2, con auth y privacidad).
// on (defecto a propósito): queda montado un endpoint legado de antes de que existiera la auth.
//   GET /api/v1/users devuelve la lista de usuarios con su PII (correo, RUT, rol) SIN exigir
//   sesión. El control de acceso que sí tiene v2 nunca existió en v1, y nadie la decomisionó.
interface FilaUsuarioV1 {
  id: number;
  email: string;
  name: string;
  rut: string;
  role: string;
}

export function registrarV1(app: FastifyInstance, { db }: { db: DatabaseSync }): void {
  if (!flags.A4) return;
  app.register(
    async (api) => {
      // Sin preValidation: la gracia (y el fallo) es que v1 no pide autenticación.
      api.get('/users', async () => ({
        users: db
          .prepare('SELECT id, email, name, rut, role FROM users ORDER BY id')
          .all() as unknown as FilaUsuarioV1[],
      }));
    },
    { prefix: '/api/v1' },
  );
}
