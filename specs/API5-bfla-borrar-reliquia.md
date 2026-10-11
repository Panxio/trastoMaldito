# API5 — Autorización rota a nivel de función, BFLA (API5:2023 Broken Function Level Authorization)

**Flujo:** el admin gestiona el inventario en `/api/v2/admin/relics*`. Se añade la función
`DELETE /api/v2/admin/relics/:id` (retirar una reliquia del catálogo). Es una función de **admin**:
un cliente puede comprar y reseñar, pero no borrar inventario. Que el endpoint exista no basta:
el servidor tiene que comprobar, en cada función, que el rol de quien llama puede ejecutarla.
**Defecto (`VULN_API5=on`):** el `DELETE` solo exige sesión válida, no el rol. Cualquier cliente
autenticado (Camila) borra reliquias del catálogo; no la protege que el front no le muestre el botón.
**Corrección (`off`):** el `DELETE` exige rol `admin`: sin token → 401, cliente → **403**
`FORBIDDEN`, y la reliquia sigue ahí. Mismo control que ya tienen `GET/POST/PATCH` de la ruta.
**Semántica del borrado (ambos modos):** admin → **204** sin cuerpo; id inexistente → 404
`NOT_FOUND`; id con formato inválido → 400; reliquia con líneas de pedido (`order_items`) → **409**
`CONFLICT` (no se reescribe la historia de ventas). Si no tiene pedidos, se borran en una
transacción sus reseñas y sus líneas de carrito, luego la reliquia, y se elimina su imagen subida.
**Archivos:** `api/src/vulns/api5.ts`: `rolParaBorrar(app)` devuelve el `preValidation`; único
`if (flags.API5)` (`on` → `requireAuth()`; `off` → `requireAuth('admin')`). La ruta va en
`admin.ts` y solo llama al wrapper. `VULN_API5` en `flags.ts` y `exploits/run.py`.
**No-goals:** borrado lógico, papelera/deshacer, auditoría del borrado, otras funciones de admin.

**Exploit check (`exploits/test_api5.py`, `exploited(base_url) -> bool`):**
1. Logins de la admin y de Camila (200 cada uno, si no `raise`). La admin crea dos reliquias de
   prueba sin pedidos (`POST /admin/relics`, 201 cada una).
2. Control de función: la admin borra la primera → 204 y `GET /relics/:id` → 404 (si no, `raise`:
   la función tiene que andar, o un 403 de `off` no probaría nada).
3. Camila borra la segunda: **204** y luego `GET /relics/:id` → 404 → `exploited = True`;
   **403** y la reliquia sigue en 200 → bloqueado (`False`); otro código, o un 204 con la reliquia
   aún visible → `raise`.

**Hecho:** `on` → True (un cliente borra inventario) · `off` → False (403 y la reliquia sigue).
**Ficha (`fichas/API5.md`):** BFLA vs BOLA (función vs objeto), por qué ocultar el botón no es un
control, autorización centralizada por rol/función, cómo probarlo cambiando el token del cliente.
