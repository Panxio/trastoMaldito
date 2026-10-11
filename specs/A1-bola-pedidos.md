# A1 — BOLA en pedidos (API1:2023 Broken Object Level Authorization) · M5

**Flujo:** un cliente consulta el detalle de sus pedidos (`GET /api/v2/orders/:id`).
**Defecto (`VULN_A1=on`):** la ruta valida que haya sesión pero no que el pedido pertenezca a quien
lo pide; con un `id` ajeno devuelve el pedido de otro cliente.
**Corrección (`off`):** la consulta filtra por `id` **y** `customer_id` de la sesión; si no coincide,
`404` (no `403`, para no confirmar que el id existe).
**Archivo:** `api/src/vulns/a1.ts` (devuelve el predicado de propiedad; solo con `on` lo omite).
**No-goals:** ids no secuenciales (UUID), rate limiting, listado de pedidos (`GET /orders` ya filtra por sesión).

**Datos del seed:** cliente A con ≥ 1 pedido, cliente B con ≥ 1 pedido; ids conocidos por el check.
Credenciales falsas del lab, definidas en M0 (`db/seed.ts`).

**Exploit check (`exploits/test_a1.py`, `exploited(base_url) -> bool`):**
1. Login como cliente B → token B.
2. Control: `GET /orders/<id de B>` con token B → 200 (en `on` y `off`).
3. `GET /orders/<id de A>` con token B. `exploited = True` si responde 200 con el pedido de A
   (campo `customer_id` de A).

**Hecho:** `on` → True · `off` → False (404) y el control del paso 2 pasa en ambos.
**Ficha (`fichas/A1.md`):** autorización por objeto vs por función, el predicado de propiedad.
