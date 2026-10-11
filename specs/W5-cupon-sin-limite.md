# W5 — Cupón reutilizable sin límite (A06:2025 Insecure Design) · M4

**Flujo:** un cliente aplica el cupón `EXORCISMO` (−50 %) al carrito (`POST /api/v2/cart/coupon`)
y paga (`POST /checkout`). El canje queda en `coupon_redemptions` (PK `coupon_id`+`user_id`): un
canje por cliente.
**Defecto (`VULN_W5=on`):** no se aplica el límite por cliente; el mismo cupón se vuelve a aplicar
y a descontar en pedidos sucesivos, sin tope (−50 % infinito).
**Corrección (`off`):** antes de aplicar (carrito) y antes de cobrar (checkout) se consulta
`coupon_redemptions`; si el cliente ya canjeó ese cupón → `409 COUPON_ALREADY_USED`. El canje se
registra al pagar.
**Archivo:** `api/src/vulns/w5.ts`: `canjeBloqueado(db,couponId,userId)` y `registrarCanje(...)`;
único `if (flags.W5)`. Con `on`, el primero siempre devuelve `false` y el segundo no fija el
límite (INSERT OR IGNORE). Carrito y checkout solo llaman a esos wrappers.
**No-goals:** cupones por monto o caducidad, apilar cupones, límite global del cupón (es por cliente).

**Datos del seed:** cupón `EXORCISMO` 50 %; `coupon_redemptions` vacío → cliente sin canjes
(Benjamín, id 3) y reliquias publicadas con stock. Credenciales falsas del lab.

**Exploit check (`exploits/test_w5.py`, `exploited(base_url) -> bool`):**
1. Login cliente sin canjes → token. `PUT /cart/items/<relic>` con una reliquia publicada.
2. `POST /cart/coupon {code:"EXORCISMO"}` → 200. `POST /checkout` con tarjeta válida → 201 (on y off).
3. `POST /cart/coupon {code:"EXORCISMO"}` otra vez. `exploited = True` si responde 200.

**Hecho:** `on` → True (segundo canje 200) · `off` → False (409) y el paso 2 pasa en ambos.
**Ficha (`fichas/W5.md`):** diseño inseguro vs bug puntual; el límite de negocio es un invariante
del servidor, no un control de la UI.
