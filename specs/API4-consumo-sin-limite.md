# API4 — Consumo sin límite en el catálogo (API4:2023 Unrestricted Resource Consumption)

**Flujo:** el catálogo público (`GET /api/v2/relics`) se pagina con `?limit=` y `?offset=`. Una API
que se puede operar pone un tope al tamaño de lo que entrega: cada petición cuesta CPU, memoria
y ancho de banda, y quien la llama no debería poder fijar ese costo a voluntad.
**Defecto (`VULN_API4=on`):** `limit` no tiene máximo y, sin `limit`, se devuelve todo el catálogo.
Con un catálogo grande, una sola petición de `?limit=1000000` hace trabajar al servidor y a la red
sin freno; unas pocas en paralelo lo saturan (denegación de servicio con un cliente cualquiera).
**Corrección (`off`):** `limit` va de 1 a 100 (sin `limit` rige 100). Un valor mayor → **400**
`BAD_REQUEST`. `offset` (≥ 0) permite recorrer el resto. La respuesta es `{items}` en ambos modos.
**Archivos:** `api/src/vulns/api4.ts`: `paginar(items, {limit?, offset?})`, único
`if (flags.API4)` (`on` no impone tope; `off` lo impone). `catalog.ts` solo declara `limit`
(entero ≥ 1) y `offset` (entero ≥ 0) en el esquema (texto con patrón, como `:id`: la API no coacciona tipos) y llama al wrapper. `VULN_API4` en `flags.ts` y
`exploits/run.py`.
**No-goals:** límite de tasa por IP, cuotas por cliente, timeouts, total/enlaces de paginación,
tope en `/admin/relics` (privado).

**Exploit check (`exploits/test_api4.py`, `exploited(base_url) -> bool`):**
1. Login de la admin (credencial falsa del lab) y creación de 105 reliquias publicadas
   (`POST /admin/relics`, cada una → 201, si no `raise`): el catálogo supera el tope de 100.
2. Control: `?limit=100` → 200 con exactamente 100 ítems (si no, `raise`: paginar tiene que andar).
3. `?limit=1000000`: 200 con más de 100 ítems → `exploited = True`; 400 → bloqueado (`False`);
   200 con ≤ 100 ítems u otro código → `raise`.

**Hecho:** `on` → True (todo el catálogo en una respuesta) · `off` → False (400 y el control sigue
dando 100). Ficha `fichas/API4.md`: por qué cada endpoint de lista necesita tope, qué otros
recursos consume una API (CPU, memoria, SMS, terceros) y cómo practicarlo.
