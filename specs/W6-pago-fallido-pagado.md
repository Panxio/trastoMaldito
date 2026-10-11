# W6 — Un fallo del pago deja el pedido pagado (A10:2025 Mishandling of Exceptional Conditions) · M5

**Flujo:** en `POST /api/v2/checkout` se crea el pedido `pending`, se cobra con la pasarela falsa
(`cobrar`), y solo si el cobro aprueba se descuenta stock y el pedido pasa a `paid`. La tarjeta
`4000000000000002` siempre es rechazada (lanza).
**Defecto (`VULN_W6=on`):** la excepción del cobro se **traga**; el flujo sigue como si hubiera
aprobado y el pedido queda `paid` sin cobro exitoso. Se compra gratis con una tarjeta rechazada.
**Corrección (`off`):** un cobro que lanza se trata como no aprobado: el pedido se marca `failed`
y la ruta responde `402 PAYMENT_FAILED`; no se toca stock, canje ni carrito.
**Archivo:** `api/src/vulns/w6.ts`: `pagoAprobado(card,total)` envuelve a `cobrar`; único
`if (flags.W6)`. `off` devuelve `false` si `cobrar` lanza; `on` devuelve `true` igualmente. El
checkout solo llama al wrapper y, si `!aprobado`, marca `failed` y lanza 402.
**No-goals:** reintentos, idempotencia del cobro, webhooks de la pasarela, otros códigos de rechazo.

**Datos del seed:** cliente del lab y una reliquia publicada con stock. Credenciales falsas.

**Exploit check (`exploits/test_w6.py`, `exploited(base_url) -> bool`):**
1. Login cliente → token. `PUT /cart/items/<relic>` con una reliquia publicada (sin cupón).
2. `POST /checkout {card_number:"4000000000000002"}` (tarjeta rechazada).
   `exploited = True` si responde 201 y el pedido devuelto tiene `status == "paid"`.

**Hecho:** `on` → True (201, `paid`) · `off` → False (402, pedido `failed`).
**Ficha (`fichas/W6.md`):** fallar en cerrado (deny by default) ante excepciones; nunca confirmar
un efecto sobre un paso que lanzó.
