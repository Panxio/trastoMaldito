# DEUDAS — huecos conocidos (una línea cada uno; no son unidades de trabajo)

- **Stock agotado tras el cobro (M5):** si el stock se agota entre la validación y la transacción, el pedido queda `failed` con 409 pero el cobro aprobado no se reversa (la pasarela falsa no tiene reembolso). La spec no lo define.
- **401 vs 400 (M2, M4, M5, M6):** con cuerpo inválido y sin token responden 400, porque el esquema se valida antes que `requireAuth` (`preHandler`). M7 usa `preValidation` y da 401. Unificar.
- **`ROLLBACK` sin protección (M5, `orders.ts`):** si falla el propio `BEGIN IMMEDIATE`, el `ROLLBACK` lanza. Muy improbable.
- **Test de stock frágil:** `getByText(/\b3\b/)` en el front del catálogo.
- ~~**W2 vs M2:**~~ RESUELTO (S10): la API guarda literal (M2 intacto); el XSS almacenado se corrige en el front (codificación de salida). W2 no toca la API de reseñas.
- **H2b redirect:'manual' no aislable en lab hermético (S16):** el `off` de A5 corta las 3xx, pero como el lab solo escucha en loopback, `validarDestino` ya niega cualquier redirector antes del fetch; la sonda 302 de `test_a5.py` confirma que `on` sigue la redirección hasta el servicio interno y `off` no lo alcanza, pero no calibra `redirect:'manual'` por separado. Aislarlo exige un redirector en IP no interna, fuera del lab.
- **A3 `on` → 500 con props válidas-de-esquema fuera de ASIGNABLES_ON (S16):** un cuerpo con `additionalProperties:true` y claves que no son role/store_credit deja `UPDATE users SET  WHERE` → 500. Camino `on` frágil; el check usa `{role:admin}`, que sí asigna. `profile.ts`+`vulns/a3.ts`.
- **run.py hereda JWT_SECRET (S16):** `_entorno` limpia `VULN_*` pero no `JWT_SECRET`; si la shell exporta uno débil que coincida, A2 `off` podría dar falso verde. En la práctica el runner no exporta JWT_SECRET y la API genera uno aleatorio por arranque. Limpiarlo en `_entorno` por higiene.
- **W5/A3 «un solo if» impreciso (S16, H7):** W5 tiene dos `if (flags.W5)` (un wrapper cada uno) y A3 dos expresiones; son «un solo módulo», no «un solo if». Inocuo.
- **W2 interruptor artificial (S16, H6):** `/api/v2/config/vulns-render` no existe en apps reales y es un oráculo público del flag; es andamiaje de lab para que el front sepa el modo. Aclarado en la ficha W2.
