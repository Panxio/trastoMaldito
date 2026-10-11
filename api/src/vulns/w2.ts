import type { FastifyInstance } from 'fastify';
import { flags } from '../flags.js';

// W2 — XSS almacenado en reseñas (A05:2025 Injection).
// Único lugar del proyecto que lee `flags.W2`.
//
// La API SIEMPRE guarda y devuelve el cuerpo de la reseña literal (eso es M2, parametrizado y
// con tests congelados): neutralizar la entrada no es la corrección de un XSS almacenado. El
// defecto vive en cómo el FRONT renderiza ese texto, y la corrección es la codificación de
// salida (escape por contexto). Este endpoint solo le dice al front qué camino tomar:
//   on  → rawReviews=true  → el front inserta la reseña como HTML crudo (dangerouslySetInnerHTML).
//   off → rawReviews=false → el front la muestra como texto (escape por defecto de React).
export function registerW2Config(app: FastifyInstance): void {
  app.register(
    async (api) => {
      api.get('/config/vulns-render', async () => ({ rawReviews: flags.W2 }));
    },
    { prefix: '/api/v2' },
  );
}
