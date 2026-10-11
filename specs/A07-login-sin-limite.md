# A07 — Login sin límite de intentos (A07:2025 Authentication Failures)

**Flujo:** el cliente inicia sesión con `POST /api/v2/auth/login`. Una tienda que protege las
cuentas frena a quien prueba contraseñas sin parar: tras unos pocos fallos seguidos, deja de
aceptar intentos para esa cuenta durante un rato.
**Defecto (`VULN_A07=on`):** no hay tope. Quien conoce el email de una clienta puede probar
contraseñas indefinidamente (fuerza bruta o diccionario) y el servidor contesta 401 cada vez, hasta
que una acierta. Con A09 `off` se vería en `audit_log`; con `on` ni eso.
**Corrección (`off`):** tras **5 fallos consecutivos** para un mismo email, los intentos siguientes
reciben **429** (`TOO_MANY_ATTEMPTS`) durante 15 min, **incluso con la contraseña correcta** (si no,
el atacante sigue adivinando). Un login correcto antes del tope pone el contador a cero. Cuenta por
email aunque no exista (un 429 no revela qué correos tienen cuenta). Es por cuenta: otros emails no
se ven afectados.
**Archivos:** `api/src/vulns/a07.ts` exporta `limiteLogin = flags.A07 ? sinLimite : conLimite` con
`{ bloqueado(email), fallo(email), exito(email) }` (único `if (flags.A07)`; estado en memoria,
tabla acotada). `auth.ts` solo llama a esos tres métodos. `VULN_A07` en `flags.ts` y `run.py`.
**No-goals:** bloqueo por IP, CAPTCHA, MFA, `Retry-After`, persistencia entre reinicios, evento
`login_blocked` en `audit_log` (extendería A09), desbloqueo manual. El bloqueo por cuenta permite
que un tercero deje fuera a la clienta (DoS de cuenta): se discute en la ficha, no se corrige aquí.

**Exploit check (`exploits/test_a07.py`, `exploited(base_url) -> bool`):**
1. Control: login correcto de Camila → 200 (si no, `raise`; prueba que las credenciales valen).
2. Cinco logins con contraseña errónea distinta cada uno → todos 401 (otro código → `raise`).
3. Sexto login con la contraseña **correcta**: 200 → `exploited = True`; 429 → bloqueado (`False`);
   otro código → `raise`.
4. Solo si fue 429: login correcto de Benjamín → 200 (si no, `raise`: el bloqueo no puede ser global).

**Hecho:** `on` → True (el sexto intento entra) · `off` → False (429 y Benjamín sigue entrando).
**Ficha (`fichas/A07.md`):** por qué el límite protege contra fuerza bruta, bloqueo por cuenta vs
por IP, la paradoja del DoS de cuenta, y cómo practicarlo con la herramienta de práctica.
