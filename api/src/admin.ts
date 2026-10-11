import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from './errors.js';
import { traerImagenDesdeUrl } from './vulns/a5.js';
import { rolParaBorrar } from './vulns/api5.js';

// Admin de inventario (versión limpia). Solo admin; el catálogo público lo lee catalog.ts.

const MAX_IMAGEN = 1024 * 1024;
const LIMITE_CUERPO = 2 * 1024 * 1024;

const TIPOS = ['image/png', 'image/jpeg', 'image/webp'] as const;
type TipoImagen = (typeof TIPOS)[number];
const EXTENSION: Record<TipoImagen, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MIME_POR_EXTENSION: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const NOMBRE_SUBIDA = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

// Campo `published` en la BD es 0/1; en la API es booleano.
interface FilaAdmin {
  id: number;
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  image_url: string | null;
  published: number;
}

export interface AdminRelic extends Omit<FilaAdmin, 'published'> {
  published: boolean;
}

interface Imagen {
  content_type: TipoImagen;
  data_base64: string;
}

interface CuerpoCrear {
  name: string;
  description: string;
  price_clp: number;
  stock: number;
  published?: boolean;
  image?: Imagen;
  // Imagen traída desde una URL (además del subido base64). Vehículo de A5 (SSRF).
  image_url?: string;
}

type CuerpoEditar = Partial<Pick<CuerpoCrear, 'name' | 'description' | 'price_clp' | 'stock' | 'published'>>;

const propiedadesComunes = {
  name: { type: 'string', minLength: 1, maxLength: 100 },
  description: { type: 'string', minLength: 1, maxLength: 1000 },
  price_clp: { type: 'integer', minimum: 0 },
  stock: { type: 'integer', minimum: 0 },
  published: { type: 'boolean' },
} as const;

const cuerpoCrear = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'price_clp', 'stock'],
  properties: {
    ...propiedadesComunes,
    image: {
      type: 'object',
      additionalProperties: false,
      required: ['content_type', 'data_base64'],
      properties: {
        content_type: { type: 'string', enum: [...TIPOS] },
        data_base64: { type: 'string' },
      },
    },
    image_url: { type: 'string', minLength: 1, maxLength: 2048 },
  },
} as const;

const cuerpoEditar = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: propiedadesComunes,
} as const;

const parametrosId = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', pattern: '^[1-9]\\d{0,9}$' },
  },
} as const;

const COLUMNAS = 'id, name, description, price_clp, stock, image_url, published';

function aAdmin(fila: FilaAdmin): AdminRelic {
  return { ...fila, published: fila.published === 1 };
}

function leer(db: DatabaseSync, id: number): AdminRelic | undefined {
  const fila = db.prepare(`SELECT ${COLUMNAS} FROM relics WHERE id = ?`).get(id) as unknown as FilaAdmin | undefined;
  return fila ? aAdmin(fila) : undefined;
}

// Decodifica base64 estricto (Buffer.from ignora basura en silencio) y aplica el límite de 1 MiB.
function decodificar(b64: string): Buffer {
  const invalido = () => new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
  if (b64.length === 0 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw invalido();
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGEN) throw invalido();
  return bytes;
}

// Tipo real según la firma del archivo, no según lo que declara el cliente.
function detectarTipo(bytes: Buffer): TipoImagen | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
}

export function registerAdmin(app: FastifyInstance, { db, uploadDir }: { db: DatabaseSync; uploadDir: string }): void {
  app.register(
    async (api) => {
      api.get(
        '/admin/relics',
        { preValidation: app.requireAuth('admin') },
        async () => ({
          items: (db.prepare(`SELECT ${COLUMNAS} FROM relics ORDER BY id`).all() as unknown as FilaAdmin[]).map(aAdmin),
        }),
      );

      api.post<{ Body: CuerpoCrear }>(
        '/admin/relics',
        { preValidation: app.requireAuth('admin'), schema: { body: cuerpoCrear }, bodyLimit: LIMITE_CUERPO },
        async (req, reply) => {
          const { name, description, price_clp, stock, image, image_url } = req.body;
          const publicada = req.body.published ?? true;

          // Todo lo que puede fallar se valida antes de tocar disco.
          let bytes: Buffer | undefined;
          let nombreArchivo: string | undefined;
          if (image) {
            bytes = decodificar(image.data_base64);
            if (detectarTipo(bytes) !== image.content_type) throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
            nombreArchivo = `${randomBytes(16).toString('hex')}.${EXTENSION[image.content_type]}`;
          } else if (image_url) {
            // A5: el wrapper decide si valida el destino antes del fetch. El tipo se detecta por
            // la firma de los bytes traídos, no por lo que declare nadie.
            bytes = await traerImagenDesdeUrl(image_url);
            const tipo = detectarTipo(bytes);
            if (!tipo) throw new ApiError(400, 'BAD_REQUEST', 'Solicitud inválida');
            nombreArchivo = `${randomBytes(16).toString('hex')}.${EXTENSION[tipo]}`;
          }

          const ruta = nombreArchivo ? join(uploadDir, nombreArchivo) : undefined;
          if (ruta && bytes) await writeFile(ruta, bytes, { flag: 'wx' });

          try {
            const { lastInsertRowid } = db
              .prepare('INSERT INTO relics (name, description, price_clp, stock, image_url, published) VALUES (?, ?, ?, ?, ?, ?)')
              .run(
                name,
                description,
                price_clp,
                stock,
                nombreArchivo ? `/uploads/${nombreArchivo}` : null,
                publicada ? 1 : 0,
              );
            return reply.code(201).send(leer(db, Number(lastInsertRowid)));
          } catch (err) {
            // Sin reliquia no debe quedar archivo huérfano.
            if (ruta) await unlink(ruta).catch(() => undefined);
            throw err;
          }
        },
      );

      api.patch<{ Params: { id: string }; Body: CuerpoEditar }>(
        '/admin/relics/:id',
        {
          preValidation: app.requireAuth('admin'),
          schema: { params: parametrosId, body: cuerpoEditar },
        },
        async (req) => {
          const id = Number(req.params.id);
          if (!leer(db, id)) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');

          // Los nombres de columna salen de esta lista fija; los valores siempre van parametrizados.
          const campos = ['name', 'description', 'price_clp', 'stock', 'published'] as const;
          const presentes = campos.filter((c) => req.body[c] !== undefined);
          const asignaciones = presentes.map((c) => `${c} = ?`).join(', ');
          const valores = presentes.map((c) => {
            const v = req.body[c];
            return c === 'published' ? (v ? 1 : 0) : (v as string | number);
          });

          db.prepare(`UPDATE relics SET ${asignaciones} WHERE id = ?`).run(...valores, id);
          return leer(db, id);
        },
      );

      // API5: el wrapper decide si la función exige rol admin o solo sesión.
      api.delete<{ Params: { id: string } }>(
        '/admin/relics/:id',
        { preValidation: rolParaBorrar(app), schema: { params: parametrosId } },
        async (req, reply) => {
          const id = Number(req.params.id);
          const relic = leer(db, id);
          if (!relic) throw new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
          const vendida = db.prepare('SELECT 1 AS x FROM order_items WHERE relic_id = ?').get(id);
          if (vendida) throw new ApiError(409, 'CONFLICT', 'La reliquia tiene pedidos y no se puede borrar');

          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('DELETE FROM reviews WHERE relic_id = ?').run(id);
            db.prepare('DELETE FROM cart_items WHERE relic_id = ?').run(id);
            db.prepare('DELETE FROM relics WHERE id = ?').run(id);
            db.exec('COMMIT');
          } catch (err) {
            db.exec('ROLLBACK');
            throw err;
          }
          // Solo archivos que subió el servidor (nombre generado); best-effort, la fila ya no existe.
          const archivo = relic.image_url?.startsWith('/uploads/') ? relic.image_url.slice('/uploads/'.length) : undefined;
          if (archivo && NOMBRE_SUBIDA.test(archivo)) await unlink(join(uploadDir, archivo)).catch(() => undefined);
          return reply.code(204).send();
        },
      );
    },
    { prefix: '/api/v2' },
  );

  // Imágenes públicas. Solo nombres generados por el servidor; cualquier otra cosa es 404.
  app.get<{ Params: { file: string } }>('/uploads/:file', async (req, reply) => {
    const nombre = req.params.file;
    const noEncontrado = () => new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado');
    if (!NOMBRE_SUBIDA.test(nombre)) throw noEncontrado();

    let bytes: Buffer;
    try {
      bytes = await readFile(join(uploadDir, nombre));
    } catch {
      throw noEncontrado();
    }
    const extension = nombre.slice(nombre.lastIndexOf('.') + 1);
    reply.header('x-content-type-options', 'nosniff');
    return reply.type(MIME_POR_EXTENSION[extension] ?? 'application/octet-stream').send(bytes);
  });
}
