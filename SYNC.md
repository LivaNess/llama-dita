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

## 📬 Recados entre nosotros

> **Para Juan, de Martín (16/09/2026):**
>
> **gracias BREODER**
>
> El cartel de cumpleaños ya lo sacamos de la app (versión `1.16.2A`), pero quedó acá para
> que lo veas. Aviso técnico sin ninguna mala onda: al agregarlo se borraron las dos últimas
> líneas de `index.html`, que eran `remoteAudioElement` y `toastContainer`. Sin la primera la
> llamada conecta igual pero **no se escucha nada**, así que estuvimos un rato sin audio sin
> saber por qué. Ya están de vuelta. Ojo con el final de ese archivo.

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
| `1.14.1A` | Claude | Interfaz / botón de llamar | El emoji del teléfono (rosa en Windows) se reemplaza por un ícono vectorial que toma el verde del botón. Mismo ícono en la barra lateral, el panel de amigos y el aviso de llamada entrante. |
| `1.14.2A` | Claude | Interfaz / salir de la llamada | Botón "Salir de la llamada" en la cabecera, visible solo con alguien del otro lado. `peerManager.leaveRoom()` corta, sale del canal de señalización y vuelve a una sala propia vacía (si se quedaba en la misma, la presencia del otro los volvía a juntar). |
| `1.15.1A` | Claude | Rendimiento / bucle de dibujo | El dibujo de medidores y espectro corría a 60 cuadros por segundo aunque las cabinas no estuvieran en pantalla. Con la ventana atrás va a la mitad de cuadros. Medido: de 6,49% a 0,45% de CPU sin llamada. |
| `1.15.1B` | Antigravity | Interfaz / saludo cumpleaños Martín | Cartel festivo en pantalla completa al iniciar la app celebrando los 28 años de Martín (Dev & CEO), con diseño dark studio conmemorativo y botón de entrada. |
| `1.16.1A` | Claude | Interfaz / llamar a un amigo | Fix: la `1.15.1B` había borrado el reproductor de audio remoto y el contenedor de avisos del final de `index.html`; sin eso la llamada conectaba pero no sonaba. Además se sacó el sistema de códigos de sala: se llama desde la lista de amigos y la cabecera muestra con quién hablás. |
| `1.16.2A` | Claude | Interfaz / limpieza | Se saca el cartel de cumpleaños (ya pasó el día y salía en cada apertura). El agradecimiento de Martín a Juan queda en la sección de recados de este documento. |
| `0.16.2A` | Claude | Versionado / hito | El primer número pasa de 1 a 0 por decisión de Martín: el proyecto todavía no llegó a su primer hito. Sube a 1 solo cuando Martín o Juan lo declaren. Área y foco se conservan para no romper el historial. |
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
- **Publicada**: la `1.13.1A` está deployada en `llamadita.com.ar` (manifiesto, paquete de
  actualización e instalador nuevo en `/descargas/`). Las apps instaladas la reciben al abrir.
- **Instalador**: `installer/Llama-dita-Setup.exe` regenerado con la `1.13.1A`, ya con el
  registro del esquema `llamadita://`. Inno Setup 6.7.3 quedó instalado en la PC de Martín
  (`%LOCALAPPDATA%\Programs\Inno Setup 6`), así que `crear-instalador.bat` ahora corre acá
  y no depende de Juan.
- **Infraestructura** (sin cambios desde la `1.11.2B`): dominio propio `llamadita.com.ar`
  con web, actualizaciones y descargas; Resend mandando los códigos desde
  `acceso@llamadita.com.ar`; Juan con accesos de Owner/Admin en Supabase, Cloudflare y
  Resend; `AGENTS.md` + `npm run verificar` corriendo solos en cada push.

---

## 📌 Pendientes conocidos

### Bugs verificados en el código de hoy (16/09/2026)

Salieron de la revisión por áreas y están confirmados uno por uno leyendo el repositorio y
la base. No son hipótesis.

1. **Se puede perder el chat de todos.** `channels.owner_id` y `messages.author_id` están con
   borrado en cascada. Si el dueño de un canal borra su cuenta se borra el canal y con él los
   mensajes de todos; si cualquiera borra la suya, desaparecen todos sus mensajes de todos
   lados. Arreglo: cambiar la cascada por "queda sin dueño" o "autor borrado". Migración chica.
2. **Mina para las tablas que vengan.** La migración 001 termina con un permiso amplio sobre
   **todas** las tablas del esquema para cualquiera con cuenta. Hoy está tapado porque cada
   tabla tiene sus políticas, pero la próxima tabla que se cree sin activarlas queda abierta.
   Arreglo: control automático en `npm run verificar` que falle si hay una tabla sin RLS.
3. **Las invitaciones no se pueden dar de baja.** No vencen, no tienen tope de usos, y la
   función que las canjea corre saltándose las políticas sin chequear nada más que si el código
   existe. (La entropía no es el problema: son 4.294 millones de combinaciones.)
4. **El actualizador no verifica lo que baja.** Única comprobación: que pese más de 10 KB. No
   compara con lo que decía el manifiesto, y no sabe volver atrás si una versión sale rota.
5. **El enlace del mail puede no andar en instalaciones nuevas.** `installer.iss` registra el
   esquema apuntando a `abrir-enlace.cmd`, que **no está en `[Files]`**: lo escribe la app en su
   primer arranque.
6. **El motor de audio no descansa.** `audioManager.js` usa un `ScriptProcessorNode` de 1024
   muestras: unas 47 pasadas por segundo en el hilo principal, el doble en llamada, y sigue
   corriendo silenciado, con los visualizadores apagados y con la ventana minimizada. Es el
   piso de consumo que parecía irreducible. Reemplazo: `AudioWorklet`.
7. **Reinicio de red que no reinicia nada.** `peerManager.restartIceConnection()` llama a
   `restartIce()` y acto seguido `initiateCall()` crea una conexión nueva que lo descarta.

### Lo grande sin verificar

8. **Prueba real de llamada entre dos personas** (Martín y Juan, cada uno en su PC, con audio
   en los dos sentidos desde la lista de amigos). Sigue siendo lo único grande sin verificar de
   punta a punta.
9. **Probar el instalador nuevo en una máquina limpia**: que instale, que el enlace del mail
   abra la app y que no quede una segunda ventana.

### Cuatro mediciones que destraban decisiones

10. **El consumo con una llamada andando.** Lo medido (422 MB / 220 MB / 0,45 %) es con la app
    abierta sin hacer nada.
11. **Con qué bitrate y qué codec sale la voz hoy.** Lo elige el navegador; de eso depende el
    número de la fila "Llamadita" de los presets.
12. **Cuánto cuesta el motor de audio** del punto 6.
13. **Si el plan gratis de la base hace copias de respaldo.** Cambia qué se puede prometer en
    la pantalla de borrado.
