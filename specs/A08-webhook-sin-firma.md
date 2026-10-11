# A08 — Webhook de pago sin firma (A08:2025 Software or Data Integrity Failures)

**Flujo:** el checkout con tarjeta rechazada deja el pedido `failed` (402). Una pasarela real avisa
después los pagos diferidos (transferencia, 3-D Secure) con un webhook: `POST /api/v2/webhooks/payment`,
cuerpo JSON `{"order_id": N, "event": "payment.approved"}`, sin sesión de usuario (lo llama la
pasarela). La única prueba de que el aviso viene de ella es la **firma**: cabecera
`X-Signature: sha256=<hex>` = HMAC-SHA256 del cuerpo crudo con el secreto compartido
(`SECRETO_PASARELA_LAB`, falso, en `vulns/a08.ts`). Se confía en datos de fuera sin comprobar su integridad.
**Defecto (`VULN_A08=on`):** el servidor no verifica la firma. Cualquiera (aun sin cuenta) marca como
pagado un pedido que nunca se cobró.
**Corrección (`off`):** firma ausente, mal formada o distinta → **401** `INVALID_SIGNATURE` y el pedido
no cambia. Comparación en tiempo constante (`timingSafeEqual`). La firma se verifica **antes** de leer el JSON.
**Semántica del webhook (ambos modos):** cuerpo inválido (JSON roto, campo de más, `event` distinto de
`payment.approved`, `order_id` no entero positivo) → 400 `BAD_REQUEST`; pedido inexistente → 404
`NOT_FOUND`; ya `paid` → 200 sin cambios (idempotente); `failed`/`pending` → en una transacción
descuenta el stock de sus líneas (falta stock → 409 `INSUFFICIENT_STOCK`, el pedido sigue igual) y lo
marca `paid` → 200 `{order_id, status:'paid'}`.
**Archivos:** `api/src/vulns/a08.ts`: `firmaAceptada(cuerpo, cabecera)`, único `if (flags.A08)` (`on` →
`true`; `off` → verifica HMAC) y `firmar(cuerpo)` (la pasarela falsa, para tests y check). La ruta va en
`api/src/webhooks.ts` (parser JSON crudo solo en ese plugin). `VULN_A08` en `flags.ts` y `exploits/run.py`.
**No-goals:** anti-replay (timestamp/nonce), rotación del secreto, cupón y carrito del pedido, auditoría (A09).

**Exploit check (`exploits/test_a08.py`, `exploited(base_url) -> bool`):**
1. Benjamín (id 3) agrega la reliquia 3 al carrito y hace 3 checkouts con la tarjeta rechazada
   `4000000000000002` (402 cada uno); `GET /orders` da 3 pedidos `failed` (si no, `raise`).
2. Control: webhook con firma **válida** (calculada con el secreto del lab) sobre el primero → 200 y
   `GET /orders/:id` → `paid` (si no, `raise`: el webhook tiene que andar o un 401 de `off` no probaría nada).
3. Ataque, sin sesión: segundo pedido con firma **falsa** (`sha256=` + 64 ceros); tercero **sin cabecera**.
   Ambos 200 y `paid` → `True`. Ambos 401 con código `INVALID_SIGNATURE` y siguen `failed` → `False`.
   Cualquier mezcla u otro código → `raise` (una corrección parcial es ❌).

**Hecho:** `on` → True (se paga sin cobrar) · `off` → False (401 y el pedido sigue `failed`).
**Ficha (`fichas/A08.md`):** integridad de datos de fuera, HMAC y cuerpo crudo, comparación en tiempo
constante, por qué «es un endpoint interno» no es un control, cómo forjar la petición en Burp.
