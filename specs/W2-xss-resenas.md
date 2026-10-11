# W2 — XSS almacenado en reseñas (A05:2025 Injection) · M2

**Flujo:** un cliente escribe una reseña (`POST /api/v2/relics/:id/reviews`) y cualquier visitante la ve en la ficha de la reliquia.
**Defecto (`VULN_W2=on`):** el texto de la reseña se guarda tal cual y el front lo inserta como HTML
(en React, con `dangerouslySetInnerHTML`), así que el navegador del lector interpreta marcado
enviado por otro usuario.
**Corrección (`off`):** el front renderiza el cuerpo como texto (escape por defecto de React). La
API **siempre** guarda y devuelve el cuerpo literal (eso es M2, con tests congelados): neutralizar
la entrada no es la corrección de un XSS almacenado. El defecto y su arreglo son de **salida**.
**Archivos:** `api/src/vulns/w2.ts` (único lugar que lee `flags.W2`; expone `GET /api/v2/config/vulns-render`
→ `{rawReviews}`, NO sanitiza) y `front/src/Resenas.tsx`, que lee ese booleano y, con `on`, inserta el
cuerpo con `dangerouslySetInnerHTML`; con `off` o ante cualquier duda, texto escapado (fail-safe).
**Reconciliación de la deuda «W2 vs M2»:** M2 guarda literal y así queda; W2 no toca la API de reseñas.
**No-goals:** XSS reflejado, DOM-based, robo real de cookies, CSP.

**Exploit check (`exploits/test_w2.py`, `exploited(base_url) -> bool`):** necesita navegador y front,
que run.py no levanta; el check los arranca él mismo. Puente a node (`exploits/w2_browser.mjs`) que
reusa el chromium ya instalado por `@playwright/test` (sin dependencias nuevas).
1. Login como cliente del seed y POST de una reseña cuyo cuerpo es marcado inocuo
   (`<img src=x onerror="window.__w2=1">`) que, al interpretarse como HTML, fija `window.__w2 = 1`.
2. Arranca el front (vite) apuntando a la API de la corrida y abre la ficha en un contexto nuevo (sin sesión).
3. `exploited = True` si `window.__w2 === 1`. Si la reseña no llega a renderizarse → excepción (❌), no off verde.

**Hecho:** `on` → True · `off` → False, y en `off` el texto de la reseña aparece visible como texto.
**Ficha (`fichas/W2.md`):** almacenado vs reflejado, escape por contexto, la corrección.
