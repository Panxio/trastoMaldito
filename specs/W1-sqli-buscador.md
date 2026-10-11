# W1 — Inyección SQL en el buscador (A05:2025 Injection) · M1

**Flujo:** un visitante escribe en el buscador del catálogo de reliquias (`GET /api/v2/relics?q=`).
**Defecto (`VULN_W1=on`):** el término se concatena dentro de la consulta SQL en vez de pasarse como
parámetro, así que una entrada con comillas altera el filtro y la respuesta trae filas que no
coinciden con la búsqueda (incluidas reliquias no publicadas del seed).
**Corrección (`off`):** consulta parametrizada; el término es siempre un dato, nunca SQL.
**Archivo:** `api/src/vulns/w1.ts` (único lugar con `if (flags.W1)`). La ruta limpia lo llama.
**No-goals:** WAF, filtros de palabras, otras tablas más allá de `relics`.

**Datos del seed que el check usa:** ≥ 3 reliquias publicadas y ≥ 1 no publicada (`published=0`).

**Exploit check (`exploits/test_w1.py`, `exploited(base_url) -> bool`):**
1. Búsqueda legítima de un nombre del seed → devuelve solo coincidencias (control; debe cumplirse en `on` y `off`).
2. Búsqueda con una entrada que cierra la comilla del filtro y lo vuelve siempre verdadero.
3. `exploited = True` si el paso 2 devuelve más filas que el paso 1 **o** incluye una no publicada.

**Hecho:** `on` → exploited=True · `off` → exploited=False, y el control del paso 1 pasa en ambos.
**Ficha (`fichas/W1.md`):** qué es, por qué ocurre, la línea corregida, cómo practicarlo con la herramienta de práctica.
