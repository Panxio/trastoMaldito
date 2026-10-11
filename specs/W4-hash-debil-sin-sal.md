# W4 — Hash de contraseñas débil y sin sal (A04:2025 Cryptographic Failures) · M3

**Flujo:** al registrarse (`POST /api/v2/auth/register`) la contraseña se hashea y se guarda en
`users.password_hash`; el login la verifica. El hash nunca sale por la API.
**Defecto (`VULN_W4=on`):** se guarda un hash rápido y SIN SAL (`sha256$<hex>`). Sin sal, dos
cuentas con la misma clave comparten hash y una tabla rainbow las revienta; al ser rápido, la
fuerza bruta masiva es barata. Almacenamiento criptográfico débil de libro.
**Corrección (`off`):** `scrypt` con sal aleatoria por clave (`scrypt$<sal>$<hash>`), lento y único
por usuario. Es el `api/src/password.ts` actual.
**Archivo:** `api/src/vulns/w4.ts`: envuelve hash/verify; único `if (flags.W4)`. `on` produce el
formato sin sal; `verify` acepta ambos formatos. `password.ts`/`auth.ts` solo llaman al wrapper.
**No-goals:** pepper, migrar hashes antiguos, política de contraseñas (ya hay `minLength` 10).

**Contrato del check (nuevo, acordado):** `run.py` pasa además la ruta de la SQLite del cell a
`exploited(base_url, db_path=None)` **solo cuando la firma lo acepta** (vía `inspect.signature`);
los checks previos (solo `base_url`) no cambian. El hash no es visible por HTTP, así que W4 lo
observa en la BD en **solo lectura**, simulando que el atacante consiguió un volcado.

**Exploit check (`exploits/test_w4.py`, `exploited(base_url, db_path) -> bool`):**
1. `POST /auth/register` un usuario nuevo con clave conocida → 201.
2. Abre `db_path` en solo lectura, lee el `password_hash` de ese correo.
3. `exploited = True` si el hash NO tiene sal (prefijo `sha256$`, 2 segmentos), no `scrypt$…`.

**Hecho:** `on` → True (sin sal) · `off` → False (`scrypt$sal$hash`).
**Ficha (`fichas/W4.md`):** sal + función lenta (scrypt/argon2) frente a hash rápido; por qué la
longitud de la clave no basta si el almacenamiento es débil.
