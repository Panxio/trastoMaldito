# A4 — `/api/v1` antigua sigue viva (API9:2023 Improper Inventory Management) · M8

**Flujo:** la tienda sirve solo `/api/v2`, con auth y privacidad. No existe ninguna versión
anterior pública: un `GET /api/v1/...` cae en el notFound handler (404).
**Defecto (`VULN_A4=on`):** una versión vieja `/api/v1` quedó montada y olvidada. Expone
`GET /api/v1/users` —un endpoint legado de antes de que existiera la auth— que devuelve la lista
de usuarios con su PII (correo, RUT, rol) **sin autenticación**. Nadie la decomisionó: el control
de acceso que sí tiene v2 no existe en v1.
**Corrección (`off`):** `/api/v1` no se monta; cualquier ruta bajo ese prefijo es 404. El
inventario de la API es una sola versión soportada.
**Archivo:** `api/src/vulns/a4.ts`: `registrarV1(app, {db})` monta el router `/api/v1` solo si
`flags.A4`; único `if (flags.A4)`. `server.ts` lo llama siempre; con `off` no monta nada.
**No-goals:** auth en v1 (la gracia es que no la tiene), deprecación con avisos, documentación de
versiones, otros endpoints v1. Solo el listado de usuarios alcanza para la lección.

**Nota:** el ID «A4» es la etiqueta del lab, no la categoría: esto es **API9:2023**. La PII es de
datos 100 % ficticios del seed; aun así el endpoint no exige sesión, que es el punto.

**Exploit check (`exploits/test_a4.py`, `exploited(base_url) -> bool`):**
1. `GET /api/v1/users` **sin** cabecera de autenticación.
2. `exploited = True` si responde 200 y el cuerpo lista usuarios con PII (incluye el correo del
   admin del seed, `admin@trastomaldito.test`).

**Hecho:** `on` → True (200, lista de usuarios sin auth) · `off` → False (404, v1 no existe).
**Ficha (`fichas/A4.md`):** inventario de APIs y versiones zombie; por qué una versión vieja viva
reintroduce fallos ya corregidos; retirar, no solo «dejar de usar».
