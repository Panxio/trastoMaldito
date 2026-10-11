# A2 — JWT firmado con secreto débil (API2:2023 Broken Authentication) · M3

**Flujo:** el login (`POST /api/v2/auth/login`) devuelve un JWT HS256 firmado con el secreto del
servidor; `requireAuth` lo verifica en cada ruta protegida.
**Defecto (`VULN_A2=on`):** el servidor firma y verifica con un secreto **público por defecto**,
embebido en el repo (`SECRETO_DEBIL`). Quien lo conoce forja un token con cualquier `sub`/`role`
—incluido `role:"admin"`— sin credenciales, y entra a rutas solo-admin.
**Corrección (`off`):** se usa el secreto fuerte de entorno (`JWT_SECRET`, ≥ 32 chars, o uno
aleatorio por arranque). Un token forjado con otro secreto falla la verificación de firma → 401.
**Archivo:** `api/src/vulns/a2.ts`: `secretoEfectivo(base)` devuelve `base` (off) o `SECRETO_DEBIL`
(on); único `if (flags.A2)`. `server.ts` pasa `secretoEfectivo(jwtSecret)` a `registerAuth`.
**No-goals:** `alg:"none"` (ya bloqueado: el header no elige el algoritmo), expiración, refresh,
rotación de claves. El algoritmo sigue fijo HS256; lo único débil es el secreto.

**Nota:** `SECRETO_DEBIL` mide ≥ 32 chars (pasa el guard de longitud) pero es **conocido**: la
lección es que la longitud no salva a un secreto público/por-defecto.

**Exploit check (`exploits/test_a2.py`, `exploited(base_url) -> bool`):**
1. Forja un JWT HS256 con `SECRETO_DEBIL` (stdlib: hmac/hashlib/base64): payload
   `{"sub":1,"role":"admin","iat":now,"exp":now+3600}`. Sin login ni credenciales.
2. `GET /api/v2/admin/relics` con `Authorization: Bearer <forjado>`.
   `exploited = True` si responde 200 (el token forjado pasó como admin).

**Hecho:** `on` → True (200) · `off` → False (401, firma inválida con el secreto real).
**Ficha (`fichas/A2.md`):** firma vs autorización, secreto fuerte desde entorno, forja de tokens.
