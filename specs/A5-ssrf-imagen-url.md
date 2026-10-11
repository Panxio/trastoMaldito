# A5 — SSRF al publicar reliquia con imagen por URL (API7:2023 SSRF · A01:2025) · M7

**Flujo:** el admin publica una reliquia con imagen desde una URL (UC10): además del subido
base64, `POST /api/v2/admin/relics` acepta `image_url` y el servidor **trae** esa imagen para
validarla y guardarla. Solo admin (requireAuth('admin')).
**Defecto (`VULN_A5=on`):** el servidor hace `fetch` a la URL **sin validarla**. Un admin (o
quien tome su sesión) apunta `image_url` a una dirección interna (loopback/privada) y el servidor
la consulta por él: SSRF contra servicios internos que solo escuchan en loopback.
**Corrección (`off`):** antes de traer nada se valida la URL: solo `http(s)` y se **rechaza** todo
host que resuelva a loopback/privado/link-local (`127.0.0.0/8`, `::1`, `10/8`, `172.16/12`,
`192.168/16`, `169.254/16`) → `400 BAD_REQUEST`. Nunca se hace la petición a un destino interno.
**Archivo:** `api/src/vulns/a5.ts`: `traerImagenDesdeUrl(urlStr): Promise<Buffer>`; único
`if (flags.A5)` que decide si se aplica el guard anti-SSRF antes del `fetch`. La ruta de admin
solo llama a este wrapper cuando viene `image_url`.
**No-goals:** redirecciones (3xx), DNS rebinding, allowlist de dominios, límites de tamaño/tiempo
del `fetch` (más allá de lo que ya hay), subir imagen por base64 (intacto).

**Exploit check (`exploits/test_a5.py`, `exploited(base_url) -> bool`):**
1. Levanta un **servicio interno** de mentira en `127.0.0.1:<puerto libre>` (HTTP en un hilo) que
   anota si lo contactan y responde un PNG mínimo válido.
2. Login admin del seed (`admin@trastomaldito.test`) → token.
3. `POST /api/v2/admin/relics` con `image_url = http://127.0.0.1:<puerto>/interno` y los campos
   obligatorios de la reliquia.
4. `exploited = True` si el servicio interno **recibió** la petición (el servidor hizo la SSRF).

**Hecho:** `on` → True (el loopback fue contactado) · `off` → False (400, no se hizo el `fetch`).
**Ficha (`fichas/A5.md`):** SSRF y por qué el servidor no debe traer URLs arbitrarias; validar
destino (no solo esquema), negar lo interno por defecto.
