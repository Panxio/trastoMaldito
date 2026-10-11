# Ficha API5 — Autorización rota a nivel de función (BFLA)

> App vulnerable a propósito — solo laboratorio (127.0.0.1). Datos 100 % ficticios.
> Categoría OWASP: **API5:2023 Broken Function Level Authorization**. Flag: `VULN_API5=on|off`.
> Módulo: `api/src/vulns/api5.ts` · Spec: `specs/API5-bfla-borrar-reliquia.md`.

## Qué es
El admin retira reliquias con `DELETE /api/v2/admin/relics/:id`. Es una función **de admin**, pero
con `VULN_API5=on` el servidor solo comprueba que haya una sesión válida, no el rol. Camila, una
clienta, puede borrar inventario con su propio token. Ocultar el botón en el front no protege nada:
quien llama a la API directo no pasa por el front.

## Por qué ocurre
Cada función de la API es una puerta y cada puerta necesita su propia cerradura. Con docenas de
rutas, nadie revisa que la nueva (`DELETE`) herede el control de rol de sus vecinas (`GET`, `POST`,
`PATCH`). Defectos típicos: comprobar solo «¿está logueado?», fiarse del prefijo `/admin` como si
fuera un control, o exponer métodos HTTP que el front nunca usa. No confundir con BOLA (A1):
BOLA es «puedo ver **el objeto** de otro»; BFLA es «puedo ejecutar **la función** de otro rol».

## La corrección (`VULN_API5=off`)
`DELETE` exige rol `admin`: sin token → 401, cliente → **403** y la reliquia sigue en el catálogo.
Igual que las demás funciones de la ruta. El único `if (flags.API5)` vive en `api/src/vulns/api5.ts`.
El borrado mismo (ambos modos): 204; inexistente 404; con pedidos 409 (la historia de ventas no se
reescribe); sin pedidos se llevan sus reseñas, líneas de carrito e imagen. Fuera de alcance: borrado
lógico, papelera, auditoría del borrado. Lo ideal es una política central (rol → funciones) y no un
chequeo suelto por ruta, para que lo olvidado falle cerrado.

## Cómo practicarlo (herramienta de práctica)
Con la API del lab corriendo en local:

1. Inicia sesión como Camila (`POST /api/v2/auth/login`) y como admin; guarda ambos tokens. Con la
   admin crea una reliquia de prueba (`POST /api/v2/admin/relics`).
2. Con `VULN_API5=on`, en **Burp Repeater** envía `DELETE /api/v2/admin/relics/<id>` con el token
   de Camila: 204, y la reliquia desaparece de `/api/v2/relics`. Cambia al token de la admin y a
   «sin token» para ver qué cambia en cada caso.
3. Reinicia con `VULN_API5=off` y repite con el token de Camila: 403 y la reliquia intacta.
   Prueba otros verbos sobre la misma ruta (`PATCH`, `POST`) con ese token: ya estaban protegidos.
4. Calibración del arnés (`exploits/test_api5.py`): la admin borra (control, ambos modos) y Camila
   borra en `on` (204 y reliquia ausente) o recibe 403 con la reliquia intacta en `off`.
