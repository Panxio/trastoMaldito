import { describe, expect, it } from 'vitest';
import { firmar } from '../src/vulns/a08.js';
import { BAD_REQUEST, NOT_FOUND, crearEntorno } from './helpers.js';

// Las flags quedan congeladas al arrancar y en vitest todas están en off: aquí va la versión corregida.
describe('A08 POST /webhooks/payment (versión corregida)', () => {
  const e = crearEntorno('a08');
  const URL = '/api/v2/webhooks/payment';
  const aviso = (order_id: unknown, event: unknown = 'payment.approved') => JSON.stringify({ order_id, event });
  const enviar = (cuerpo: string, cabeceras: Record<string, string> = {}) =>
    e.app.inject({ method: 'POST', url: URL, headers: { 'content-type': 'application/json', ...cabeceras }, payload: cuerpo });
  const firmado = (cuerpo: string) => enviar(cuerpo, { 'x-signature': firmar(cuerpo) });
  const estado = (id: number) => (e.db.prepare('SELECT status FROM orders WHERE id = ?').get(id) as { status: string }).status;
  const stock = (id: number) => (e.db.prepare('SELECT stock FROM relics WHERE id = ?').get(id) as { stock: number }).stock;
  // Pedido de Benjamín con 2 unidades de la reliquia 3, como lo deja un checkout rechazado.
  function pedidoFallido(qty = 2, status = 'failed'): number {
    const { lastInsertRowid } = e.db
      .prepare('INSERT INTO orders (customer_id, status, total_clp) VALUES (3, ?, 1000)')
      .run(status);
    e.db.prepare('INSERT INTO order_items (order_id, relic_id, qty, price_clp) VALUES (?, 3, ?, 500)').run(lastInsertRowid, qty);
    return Number(lastInsertRowid);
  }

  it('sin firma, con firma falsa o de otro cuerpo → 401 INVALID_SIGNATURE y el pedido no cambia', async () => {
    const id = pedidoFallido();
    const cuerpo = aviso(id);
    const cabeceras: Record<string, string>[] = [{}, { 'x-signature': 'sha256=' + '0'.repeat(64) }, { 'x-signature': 'basura' }, { 'x-signature': firmar(aviso(id + 1)) }];
    for (const cab of cabeceras) {
      const res = await enviar(cuerpo, cab);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'INVALID_SIGNATURE', message: 'Firma inválida' });
    }
    expect(estado(id)).toBe('failed');
  });

  it('firma válida: 200, pedido paid y stock descontado', async () => {
    const id = pedidoFallido(2);
    const antes = stock(3);
    const res = await firmado(aviso(id));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ order_id: id, status: 'paid' });
    expect(estado(id)).toBe('paid');
    expect(stock(3)).toBe(antes - 2);
  });

  it('idempotente: un pedido ya paid → 200 sin tocar el stock', async () => {
    const id = pedidoFallido(2);
    await firmado(aviso(id));
    const despues = stock(3);
    const res = await firmado(aviso(id));
    expect(res.statusCode).toBe(200);
    expect(stock(3)).toBe(despues);
  });

  it('firma válida pero cuerpo inválido → 400; la firma se verifica antes que el JSON', async () => {
    for (const cuerpo of ['no es json', aviso('1'), aviso(0), aviso(1.5), aviso(1, 'otro'), JSON.stringify({ order_id: 1, event: 'payment.approved', extra: 1 }), '[]', 'null']) {
      const res = await firmado(cuerpo);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(BAD_REQUEST);
    }
    const sinFirma = await enviar('no es json');
    expect(sinFirma.statusCode).toBe(401);
  });

  it('pedido inexistente → 404', async () => {
    const res = await firmado(aviso(9999));
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NOT_FOUND);
  });

  it('sin stock suficiente → 409 y el pedido sigue failed', async () => {
    const id = pedidoFallido(99);
    const antes = stock(3);
    const res = await firmado(aviso(id));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INSUFFICIENT_STOCK');
    expect(estado(id)).toBe('failed');
    expect(stock(3)).toBe(antes);
  });
});
