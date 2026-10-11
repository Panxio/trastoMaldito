# A09 — Sin registro de auditoría (A09:2025 Security Logging & Alerting Failures)

**Flujo:** el cliente inicia sesión (`POST /auth/login`), se registra (`/auth/register`) y paga
(`POST /checkout`). Un sistema que se puede operar deja rastro de estos eventos: quién, qué y
cuándo, para detectar fuerza bruta, cuentas tomadas o fraude con tarjetas.
**Defecto (`VULN_A09=on`):** el servidor no deja **ningún** rastro de seguridad. Un login fallido,
mil intentos seguidos o un pago rechazado no quedan en ninguna parte (y hoy `logger:false`
tampoco escribe nada). La API responde igual en ambos modos; solo cambia lo que el operador puede ver.
**Corrección (`off`):** cada evento de auth y checkout se anota en la tabla `audit_log` (la
auditoría del lab; `sqlite3` basta para leerla). Nunca se registran secretos: ni contraseña, ni
token, ni número de tarjeta.
**Eventos:** `login_ok`, `login_failed` (con el email intentado), `register`, `checkout_paid`,
`payment_failed`. Columnas: `id, ts, event, user_id (NULL si no hay cuenta), email, ip`.
**Archivos:** `api/src/vulns/a09.ts`: `auditar(db, req, evento, {userId?, email?})`, único
`if (flags.A09)` (`on` no hace nada; `off` inserta la fila). `auth.ts` y `orders.ts` solo llaman al
wrapper. Tabla en `db/schema.sql`. `VULN_A09` se añade a `flags.ts` y a `exploits/run.py`.
**No-goals:** alertas/umbrales, rotación o integridad del log, endpoint para consultarlo, SIEM.

**Exploit check (`exploits/test_a09.py`, `exploited(base_url, db_path=None) -> bool`):**
1. Login de Camila con contraseña errónea y única → 401 (si no, `raise`).
2. Login correcto + `PUT /cart/items/3` + `POST /checkout` con la tarjeta `4000000000000002` →
   402 (si no, `raise`). Los dos disparan eventos que un operador debe poder ver.
3. Lee `audit_log` en solo lectura vía `db_path` (tabla ausente o sin `db_path` → `raise`).
   `exploited = True` si no hay ni `login_failed` (email de Camila) ni `payment_failed` (su id).
   Un solo evento de los dos → `raise` (auditoría a medias). Con ambos, si algún valor de
   cualquier fila contiene la contraseña errónea o la tarjeta → `raise` (el log filtra secretos).

**Hecho:** `on` → True (tabla vacía) · `off` → False (ambas filas, sin secretos). En ambos modos
las respuestas HTTP son 401 y 402: la corrección no cambia la API, solo deja evidencia.
**Ficha (`fichas/A09.md`):** qué registrar y qué nunca (secretos), por qué la detección empieza
en el log, y cómo se ve un ataque de fuerza bruta en `audit_log`.
