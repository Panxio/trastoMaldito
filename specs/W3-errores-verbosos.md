# W3 — Errores verbosos de la API (A02:2025 Security Misconfiguration) · M8

**Flujo:** el manejador de errores de Fastify (`api/src/errors.ts`) responde a todo error. Un
`ApiError` esperado sale con su código y mensaje fijos; un error **inesperado** (validación de
esquema 4xx o una excepción 500) se aplana a un cuerpo genérico, sin traza ni detalle interno.
**Defecto (`VULN_W3=on`):** ante un error inesperado, la respuesta **filtra el detalle interno**:
`err.message` (texto del framework/validación) y `err.stack` (con rutas de archivos del servidor,
versiones, estructura). Un atacante provoca un error y lee las tripas del backend.
**Corrección (`off`):** el cuerpo inesperado es genérico y estable (`{code, message}` fijos); la
traza queda solo en el log del servidor, nunca en la respuesta. Es el `errors.ts` actual.
**Archivo:** `api/src/vulns/w3.ts`: `cuerpoError(err, codeLimpio, msgLimpio)` devuelve el cuerpo
limpio (off) o uno que añade `detail: err.message` y `stack: err.stack` (on); único `if (flags.W3)`.
`errors.ts` llama a este wrapper en sus ramas de error no-`ApiError` (4xx genérico y 500).
**No-goals:** cambiar los `ApiError` (sus mensajes ya son públicos y fijos), páginas de error del
front, cabeceras de servidor, logging estructurado.

**Nota:** no se fuerza un 500 artificial. El vehículo del check es un error de **validación de
esquema** (siempre disponible y determinista); el `stack` que filtra es el mismo que saldría en un
500. La lección es que el handler nunca debe serializar el objeto de error al cliente.

**Exploit check (`exploits/test_w3.py`, `exploited(base_url) -> bool`):**
1. `POST /api/v2/auth/login` con un cuerpo inválido de esquema (p. ej. sin `password`) → 400.
   Es un error de validación (no `ApiError`), así que pasa por la rama que W3 controla.
2. `exploited = True` si la respuesta trae un campo `stack` no vacío (la traza interna).

**Hecho:** `on` → True (cuerpo con `stack`) · `off` → False (cuerpo genérico, sin `stack`).
**Ficha (`fichas/W3.md`):** por qué el detalle de error es para el log, no para el cliente;
mensajes estables vs. serializar excepciones; qué revela un stack trace.
