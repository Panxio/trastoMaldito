import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAD_REQUEST, NOT_FOUND, crearEntorno } from './helpers.js';

const CLAVES = ['id', 'name', 'description', 'price_clp', 'stock', 'image_url', 'published'];
const NUEVA = { name: 'Daga de Hueso', description: 'Daga tallada en hueso. Fría al tacto.', price_clp: 45000, stock: 4 };
// PNG válido de 1×1 píxel.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24, 2)]);

describe('admin de inventario (M7 limpio)', () => {
  const e = crearEntorno('admin');
  const admin = () => e.token('admin');
  const crear = async (cuerpo: unknown, quien: 'admin' | 'camila' = 'admin') =>
    e.pedir('POST', '/api/v2/admin/relics', await e.token(quien), cuerpo);
  const archivos = () => readdirSync(e.uploadDir);
  const cantidad = () => (e.db.prepare('SELECT COUNT(*) AS n FROM relics').get() as { n: number }).n;
  const publicas = async () =>
    ((await e.pedir('GET', '/api/v2/relics')).json().items as Array<{ id: number }>).map((r) => r.id);

  describe('control de acceso', () => {
    const rutas = [
      ['GET', '/api/v2/admin/relics', undefined],
      ['POST', '/api/v2/admin/relics', NUEVA],
      ['PATCH', '/api/v2/admin/relics/3', { stock: 1 }],
    ] as const;

    it.each(rutas)('%s %s sin token → 401', async (metodo, url, cuerpo) => {
      const res = await e.pedir(metodo, url, undefined, cuerpo);

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'Autenticación requerida' });
    });

    it.each(rutas)('%s %s como cliente → 403 y nada cambia', async (metodo, url, cuerpo) => {
      const antes = e.db.prepare('SELECT * FROM relics ORDER BY id').all();

      const res = await e.pedir(metodo, url, await e.token('camila'), cuerpo);

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ code: 'FORBIDDEN', message: 'Permisos insuficientes' });
      expect(e.db.prepare('SELECT * FROM relics ORDER BY id').all()).toEqual(antes);
      expect(archivos()).toEqual([]);
    });
  });

  describe('GET /admin/relics', () => {
    it('lista todas, también la no publicada, con published booleano', async () => {
      const res = await e.pedir('GET', '/api/v2/admin/relics', await admin());
      const { items } = res.json();

      expect(res.statusCode).toBe(200);
      expect(items.map((r: { id: number }) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      for (const r of items) expect(Object.keys(r).sort()).toEqual([...CLAVES].sort());
      expect(items[0].published).toBe(true);
      expect(items[6]).toMatchObject({ id: 7, published: false, stock: 0 });
    });
  });

  describe('POST /admin/relics', () => {
    it('crea la reliquia sin imagen: 201, publicada por defecto y visible en el catálogo público', async () => {
      const res = await crear(NUEVA);

      expect(res.statusCode).toBe(201);
      expect(Object.keys(res.json()).sort()).toEqual([...CLAVES].sort());
      expect(res.json()).toMatchObject({ ...NUEVA, image_url: null, published: true });
      expect(await publicas()).toContain(res.json().id);
      expect(e.db.prepare('SELECT name, stock FROM relics WHERE id = ?').get(res.json().id)).toEqual({
        name: NUEVA.name,
        stock: 4,
      });
    });

    it('published:false la crea oculta', async () => {
      const res = await crear({ ...NUEVA, published: false });

      expect(res.statusCode).toBe(201);
      expect(res.json().published).toBe(false);
      expect(await publicas()).not.toContain(res.json().id);
    });

    it('acepta Unicode y emoji en nombre y descripción', async () => {
      const res = await crear({ ...NUEVA, name: 'Ñandú de Ceniza 👻', description: 'Pequeño ñandú 🕯️' });

      expect(res.json()).toMatchObject({ name: 'Ñandú de Ceniza 👻', description: 'Pequeño ñandú 🕯️' });
    });

    it.each([
      ['sin nombre', { ...NUEVA, name: undefined }],
      ['nombre vacío', { ...NUEVA, name: '' }],
      ['nombre de 101 caracteres', { ...NUEVA, name: 'a'.repeat(101) }],
      ['descripción de 1001', { ...NUEVA, description: 'a'.repeat(1001) }],
      ['precio negativo', { ...NUEVA, price_clp: -1 }],
      ['precio decimal', { ...NUEVA, price_clp: 10.5 }],
      ['precio en texto', { ...NUEVA, price_clp: '45000' }],
      ['stock negativo', { ...NUEVA, stock: -1 }],
      ['published numérico', { ...NUEVA, published: 1 }],
      ['campo de más (id)', { ...NUEVA, id: 99 }],
      ['campo de más (image_url)', { ...NUEVA, image_url: 'http://127.0.0.1:9/x.png' }],
    ])('%s → 400, sin reliquia ni archivo', async (_caso, cuerpo) => {
      const res = await crear(cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(cantidad()).toBe(7);
      expect(archivos()).toEqual([]);
    });

    describe('con imagen subida', () => {
      it('PNG: guarda el archivo con nombre aleatorio y lo sirve igual en /uploads', async () => {
        const res = await crear({ ...NUEVA, image: { content_type: 'image/png', data_base64: PNG_B64 } });
        const url = res.json().image_url as string;

        expect(res.statusCode).toBe(201);
        expect(url).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
        expect(archivos()).toEqual([url.replace('/uploads/', '')]);
        expect(readFileSync(join(e.uploadDir, archivos()[0]))).toEqual(Buffer.from(PNG_B64, 'base64'));

        const get = await e.pedir('GET', url);
        expect(get.statusCode).toBe(200);
        expect(get.headers['content-type']).toBe('image/png');
        expect(get.rawPayload).toEqual(Buffer.from(PNG_B64, 'base64'));
      });

      it.each([
        ['image/jpeg', JPEG, 'jpg'],
        ['image/webp', WEBP, 'webp'],
      ])('%s se acepta y la extensión sale del tipo, no del cliente', async (tipo, bytes, ext) => {
        const res = await crear({ ...NUEVA, image: { content_type: tipo, data_base64: bytes.toString('base64') } });

        expect(res.statusCode).toBe(201);
        expect(res.json().image_url).toMatch(new RegExp(`^/uploads/[0-9a-f]{32}\\.${ext}$`));
      });

      it('dos subidas iguales no pisan el mismo archivo', async () => {
        const cuerpo = { ...NUEVA, image: { content_type: 'image/png', data_base64: PNG_B64 } };

        await crear(cuerpo);
        await crear(cuerpo);

        expect(archivos()).toHaveLength(2);
      });

      it.each([
        ['SVG', { content_type: 'image/svg+xml', data_base64: Buffer.from('<svg onload=alert(1)/>').toString('base64') }],
        ['HTML', { content_type: 'text/html', data_base64: Buffer.from('<script>1</script>').toString('base64') }],
        ['GIF (tipo no permitido)', { content_type: 'image/gif', data_base64: Buffer.from('GIF89a....').toString('base64') }],
        ['texto declarado como PNG', { content_type: 'image/png', data_base64: Buffer.from('no soy una imagen').toString('base64') }],
        ['JPEG declarado como PNG', { content_type: 'image/png', data_base64: JPEG.toString('base64') }],
        ['base64 inválido', { content_type: 'image/png', data_base64: '@@@@no-es-base64@@@@' }],
        ['archivo vacío', { content_type: 'image/png', data_base64: '' }],
        ['campo de más (filename)', { content_type: 'image/png', data_base64: PNG_B64, filename: '../../x.png' }],
        [
          'más de 1 MiB',
          { content_type: 'image/png', data_base64: Buffer.concat([Buffer.from(PNG_B64, 'base64'), Buffer.alloc(1024 * 1024)]).toString('base64') },
        ],
      ])('imagen inválida (%s) → 400, sin reliquia ni archivo', async (_caso, image) => {
        const res = await crear({ ...NUEVA, image });

        expect(res.statusCode).toBe(400);
        expect(cantidad()).toBe(7);
        expect(archivos()).toEqual([]);
      });

      it('acepta una imagen de casi 1 MiB (el límite de cuerpo no la corta)', async () => {
        const bytes = Buffer.concat([Buffer.from(PNG_B64, 'base64'), Buffer.alloc(1024 * 1024 - 200)]);

        const res = await crear({ ...NUEVA, image: { content_type: 'image/png', data_base64: bytes.toString('base64') } });

        expect(res.statusCode).toBe(201);
      });
    });
  });

  describe('GET /uploads/:file', () => {
    it.each([
      ['inexistente con forma válida', `${'a'.repeat(32)}.png`],
      ['recorrido de directorios', '..%2F..%2Fpackage.json'],
      ['recorrido con barra invertida', '..%5C..%5Cpackage.json'],
      ['extensión no permitida', `${'a'.repeat(32)}.html`],
      ['nombre corto', 'logo.png'],
      ['mayúsculas', `${'A'.repeat(32)}.png`],
    ])('%s → 404 NOT_FOUND', async (_caso, nombre) => {
      const res = await e.pedir('GET', `/uploads/${nombre}`);

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_FOUND);
    });

    it('un archivo ajeno puesto en la carpeta con nombre no válido no se sirve', async () => {
      writeFileSync(join(e.uploadDir, 'secreto.txt'), 'x');

      expect((await e.pedir('GET', '/uploads/secreto.txt')).statusCode).toBe(404);
      expect(existsSync(join(e.uploadDir, 'secreto.txt'))).toBe(true);
    });
  });

  describe('PATCH /admin/relics/:id', () => {
    const editar = async (id: number | string, cuerpo: unknown) =>
      e.pedir('PATCH', `/api/v2/admin/relics/${id}`, await admin(), cuerpo);

    it('cambia stock y precio, y la tienda pública lo refleja', async () => {
      const res = await editar(3, { stock: 10, price_clp: 49990 });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: 3, stock: 10, price_clp: 49990, name: 'Péndulo de Cerro Alegre', published: true });
      const publica = (await e.pedir('GET', '/api/v2/relics/3')).json();
      expect(publica).toMatchObject({ stock: 10, price_clp: 49990 });
    });

    it('despublicar saca la reliquia del catálogo público; publicar la devuelve', async () => {
      await editar(3, { published: false });
      expect(await publicas()).not.toContain(3);
      expect((await e.pedir('GET', '/api/v2/relics/3')).statusCode).toBe(404);

      const res = await editar(7, { published: true, stock: 5 });
      expect(res.json()).toMatchObject({ id: 7, published: true, stock: 5 });
      expect(await publicas()).toContain(7);
    });

    it('stock 0 es válido', async () => {
      expect((await editar(3, { stock: 0 })).json().stock).toBe(0);
    });

    it('solo cambia los campos recibidos y la fila indicada', async () => {
      const otras = e.db.prepare('SELECT * FROM relics WHERE id != 3 ORDER BY id').all();

      await editar(3, { name: 'Péndulo renovado' });

      expect(e.db.prepare('SELECT name, price_clp, stock FROM relics WHERE id = 3').get()).toEqual({
        name: 'Péndulo renovado',
        price_clp: 52990,
        stock: 8,
      });
      expect(e.db.prepare('SELECT * FROM relics WHERE id != 3 ORDER BY id').all()).toEqual(otras);
    });

    it.each([
      ['cuerpo vacío', {}],
      ['stock negativo', { stock: -1 }],
      ['precio decimal', { price_clp: 1.5 }],
      ['stock en texto', { stock: '5' }],
      ['published en texto', { published: 'false' }],
      ['campo de más (image_url)', { image_url: '/x.png' }],
      ['campo de más (id)', { id: 99 }],
    ])('%s → 400 y no cambia nada', async (_caso, cuerpo) => {
      const antes = e.db.prepare('SELECT * FROM relics ORDER BY id').all();

      const res = await editar(3, cuerpo);

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
      expect(e.db.prepare('SELECT * FROM relics ORDER BY id').all()).toEqual(antes);
    });

    it('reliquia inexistente → 404', async () => {
      const res = await editar(999, { stock: 1 });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_FOUND);
    });

    it.each(['abc', '0', '01', '-1'])('id %s → 400', async (id) => {
      expect((await editar(id, { stock: 1 })).statusCode).toBe(400);
    });
  });
});
