# A3 — BOPLA en el perfil (API3:2023 Broken Object Property Level Authorization) · M6

**Flujo:** un cliente edita su perfil (`PATCH /api/v2/me`: nombre, comuna, teléfono).
**Defecto (`VULN_A3=on`):** la ruta acepta y copia al registro cualquier campo del cuerpo, incluidos
los privilegiados (`role`, `store_credit`), en vez de una lista cerrada de campos editables.
**Corrección (`off`):** el esquema de Fastify es estricto (`additionalProperties: false`) y solo
permite `name`, `commune`, `phone`; un campo extra devuelve `400`.
**Archivo:** `api/src/vulns/a3.ts`. Con `on` aflojan el esquema y el mapeo **solo ahí** (invariante 5).
**No-goals:** cambio de contraseña/correo, mass assignment en otras rutas, UI de administración.

**Exploit check (`exploits/test_a3.py`, `exploited(base_url) -> bool`):**
1. Login como cliente del seed → token. Lee `GET /me`: `role = "customer"`.
2. Control: `PATCH /me` con `{"commune": "Ñuñoa"}` → 200 y la comuna cambia (en `on` y `off`).
3. `PATCH /me` con un campo privilegiado (`role: "admin"`), luego `GET /me`.
   `exploited = True` si el `role` quedó en `admin`.

**Hecho:** `on` → True · `off` → False (400, `role` sigue `customer`) y el control del paso 2 pasa en ambos.
**Ficha (`fichas/A3.md`):** lista cerrada vs lista abierta de campos, validación de esquema.
