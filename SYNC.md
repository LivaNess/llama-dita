# Llama-dita — Registro de sincronización y estado de agentes

Tablero de control compartido entre **Antigravity** (Juan) y **Claude** (Martín).
Ambos agentes lo actualizan antes de empezar una tarea y al terminarla. El versionado está definido en `VERSIONADO.md`.

---

## 🔒 Zona de trabajo activa (locks)

| Agente | Versión objetivo | Archivos en edición | Estado |
| :--- | :--- | :--- | :--- |
| *Ninguno* | - | - | *Libre para tomar tareas* |

> Para tomar una tarea, reemplazá la fila con tu agente, la versión objetivo y los archivos que vas a intervenir. Al hacer el commit final, restaurá el estado a *Libre*.

---

## 📋 Historial de cambios y versiones

> El detalle de cada versión (qué cambió, por qué y cómo verificarlo) vive ahora en
> **`CAMBIOS.md`**. Acá queda la tabla corta de coordinación entre agentes.

Cronológico. Acá se lee qué significa cada área y foco (el número no es un mapa fijo).

| Versión | Agente | Área / foco | Resumen |
| :--- | :--- | :--- | :--- |
| `1.1.1A` | Antigravity | Base P2P | Llamada de voz P2P, señalización migrada a Supabase Realtime, WebRTC nativo con relé TURN, cliente Windows. (Versión asignada retroactivamente: reemplaza `0.0.0.A` y `1.0.1`, esquemas anteriores obsoletos.) |
| `1.2.1A` | Claude | Cuentas / amigos y canales | Login sin contraseña (código o enlace por mail), perfil, amigos con presencia, llamada directa con timbre, canales de texto (chat en vivo) y de voz con código de invitación. Esquema SQL con RLS en `supabase/migrations/`. Panel aditivo en `src/social/`. |
| `1.3.1A` | Claude | Actualizaciones / updater | Al abrir busca versión nueva (aviso opcional, casilla "actualizar sola"). Tag de versión del header abre "Buscar actualizaciones". Escritorio: updater nativo de Neutralino desde `desktop/update-manifest.json` + `resources.neu` en el repo. `scripts/build-desktop.mjs` sincroniza versión y empaqueta. |
| `1.3.1B` | Claude | Actualizaciones / updater | El aviso de versión nueva muestra también la versión instalada. Primera actualización real publicada para probar el updater en la app instalada. |
| `1.4.1A` | Claude | Onboarding de cuenta | Al abrir sin sesión se abre solo el panel "Creá tu cuenta" (mail → código o enlace). El mail queda como identidad del usuario; el perfil se crea solo. Botón del header dice "Crear cuenta" hasta que entrás. |
| `1.5.1A` | Claude | Escritorio / updater y permisos | Fix updater: el WebView cacheaba el manifiesto (cache-busting) y faltaba el permiso `filesystem.writeBinaryFile` para instalar. Puerto fijo 24024 + `webviewArgs` para que WebView2 no pida el micrófono en cada apertura. |
| `1.5.1B` | Claude | Escritorio / updater | El aviso de versión nueva muestra también la versión instalada. Primera actualización real publicada para probar el updater en la app instalada. |
| `1.5.2A` | Claude | Escritorio / fuente del updater | raw.githubusercontent tiene varios cachés y llegó a ofrecer una versión vieja. El updater ahora lee manifiesto y resources.neu desde la API de GitHub (Accept raw, sin caché) e instala con filesystem.writeBinaryFile + restartProcess. |
| `1.5.2B` | Claude | Escritorio / fuente del updater | Versión publicada para probar la actualización completa desde 1.5.2A (descarga + reinicio). |
| `1.5.2C` | Claude | Escritorio / fuente del updater | Fix: el aviso de actualización quedaba debajo de la capa del panel de cuenta (no se podía clickear). Click afuera y botón ✕ cierran el panel de login. |
| `1.5.2D` | Claude | Escritorio / fuente del updater | Versión publicada para que Martín pruebe la actualización desde 1.5.2C. |
| `1.6.1A` | Claude | Acceso / crear cuenta vs iniciar sesión | Pestañas "Crear cuenta" / "Ya tengo cuenta" (esta última no crea usuarios: avisa si el mail no existe). Copy claro: el mail trae un enlace, hay que pegarlo en la app. |
| `1.7.1A` | Claude | Escalabilidad (50-100 usuarios) | Presencia por Realtime Presence en vez de latidos en `profiles` (con 100 usuarios eran ~10.000 mensajes/min); `profiles` fuera de la publicación Realtime (migración 002). Acceso: "Ya tengo un código" para entrar aunque el mail no salga. Sesión guardada de una cuenta borrada ya no rompe el panel. |
| `1.8.1A` | Antigravity | Interfaz / inicio canales y cabinas condicionales | Rediseño según boceto: barra lateral fija con canales (texto y voz), amigos con presencia y llamada directa, pie de usuario con avatar y botón de muteo sincronizado. Área central con vistas condicionales: chat de canal con input '@ escriba aquí...', cabinas de audio al conectar sesión, y standby limpio sin sesión. |
| `1.9.1A` | Claude | Identidad visual | Capa de marca en `src/brand.css` (se carga después de `style.css`: solo colores, tipografía y detalles, no toca la estructura). Paleta del logo: azul marino #1C2B5A, azul #5B7CFA y crema #F4ECDC. Logo vectorial en `public/brand/` (variante clara y navy) + `public/favicon.svg`, usado en la barra lateral y en la vista de espera. Tipografía Outfit para títulos. |
| `1.10.1A` | Claude | Web oficial | `web/` = sitio estático en llamadita.com.ar: presentación, descarga del instalador y registro de cuenta (mismo Supabase que la app, código de 6 dígitos). `scripts/build-web.mjs` arma `site-dist/` (copia `web/`, los logos y `installer/Llama-dita-Setup.exe` a `/descargas/`, e inyecta la versión). `npm run build:web` y `npm run deploy:web` (Cloudflare Pages, proyecto `llamadita`). |
| `1.10.1D` | Claude | Web oficial | Correcciones: `dist/` y `site-dist/` fuera del repositorio (el renglón del .gitignore se había pegado al anterior) y paquete de escritorio con la identidad visual nueva. Las versiones 1.10.1B y 1.10.1C quedaron solo en mensajes de commit: la única fuente sigue siendo package.json. |
| `1.10.2A` | Claude | Mudanza al dominio propio | Todo lo que colgaba de `llamadita.pages.dev` o de GitHub pasa a `llamadita.com.ar`: el manifiesto y el paquete de actualización se publican con la web (`/update-manifest.json` y `/descargas/resources.neu`), el updater los toma de ahí (GitHub queda solo como respaldo mientras propaga el DNS), la dirección vieja redirige al dominio cuando este responde, y el instalador declara el sitio como página del editor. |
| `1.10.3A` | Antigravity | Web oficial / diseño dark studio | Rediseño completo de la web oficial (`web/index.html` y `web/css/site.css`) adoptando la estética de la app de escritorio: paleta dark studio (#0A0F22), tarjetas glassmorphism, simulación de cabinas de audio con vúmetros y badges en vivo, inputs oscuros con foco azul eléctrico y logo claro. |
| `1.11.2C` | Antigravity | Interfaz / cabeceras alineadas y pie fijo | Alineación a 64px de las cabeceras superior e izquierda para eliminar la discontinuidad en la línea horizontal divisoria, barra lateral a 100% de altura y pie de usuario `[YO] + [MIC]` fijado de forma permanente al margen inferior izquierdo. |
| `1.12.1A` | Claude | Red y voz / una sola conexión | La señalización dejó de crear su propio cliente Supabase y usa `src/supabase/client.js`. Cada usuario pasa de dos conexiones en vivo a una: con el plan gratis (200 en total) el techo pasa de ~100 a ~200 personas. |
| `1.12.2A` | Claude | Red y voz / nombre del participante | El nombre se manda cuando el canal de datos abre (no cuando la llamada pasa a "conectado", que es antes de que el otro escuche) y quien lo recibe contesta con el suyo. Al cortarse, la cabina remota vuelve a "Participante". |
| `1.13.1A` | Claude | Escritorio / íconos | La ventana y la bandeja usan el logo (PNG de 256 y 32 sacados de `public/favicon.svg`) en vez de los íconos de fábrica de Neutralino. El ícono del `.exe` viene en el binario y no cambia. |
---

## ⚠️ Reglas para agentes
1. **Build limpio**: nunca `git push` con `npm run build` roto.
2. **Respetar locks**: no tocar archivos que el otro agente tiene bloqueados.
3. **Versión en un solo lugar**: `package.json`. Commit `[H.A.F+letra] tipo: descripción`. Nunca subir el Hito sin permiso.
4. **Rebase antes de empezar**: `git pull --rebase origin main`.
5. **Sin menciones a otras apps de chat/voz** en ningún lado.

---

## 📍 Dónde estamos (cierre 2026-09-15, versión `1.13.1A`)

- **Red y voz**: la llamada dejó de abrir su propia conexión a Supabase; usa la del resto
  de la app. Cada usuario pasa de dos conexiones en vivo a una, así que el techo del plan
  gratis (200) pasa de ~100 personas a ~200. El nombre del otro ya llega siempre a su
  cabina, y al cortarse vuelve a "Participante".
- **Escritorio**: la ventana y la bandeja muestran el logo. El paquete `resources.neu` del
  repositorio ya es `1.13.1A`.
- **Sin publicar**: la versión está commiteada pero **no** deployada. Hasta correr
  `npm run deploy:web`, las apps instaladas siguen viendo la `1.11.2B`.
- **Infraestructura** (sin cambios desde la `1.11.2B`): dominio propio `llamadita.com.ar`
  con web, actualizaciones y descargas; Resend mandando los códigos desde
  `acceso@llamadita.com.ar`; Juan con accesos de Owner/Admin en Supabase, Cloudflare y
  Resend; `AGENTS.md` + `npm run verificar` corriendo solos en cada push.

---

## 📌 Pendientes conocidos

1. **Prueba real de llamada entre dos personas** (Martín y Juan, cada uno en su PC, con
   audio en los dos sentidos desde la lista de amigos). Sigue siendo lo único grande sin
   verificar de punta a punta. Lo que sí se probó de la `1.12.x`: dos pestañas en la misma
   sala llegan a "Conectado" con el cliente compartido y se pasan el nombre en los dos
   sentidos; el audio no se pudo probar así porque las dos pestañas comparten el mismo
   micrófono.
2. **Publicar la `1.13.1A`**: `npm run deploy:web` para que las apps instaladas reciban la
   actualización. Sin eso, lo de arriba no le llega a nadie.
3. **Regenerar el instalador** con `crear-instalador.bat`. Necesita Inno Setup 6, que **no
   está instalado en la PC de Martín** (se buscó: ni en Archivos de programa ni en
   `%LOCALAPPDATA%`); lo tiene Juan. El `installer.iss` ya quedó apuntando a la `1.13.1A`.
   El actual es de una versión vieja y no registra el esquema del enlace; las instalaciones
   existentes se actualizan solas igual.
