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
---

## ⚠️ Reglas para agentes
1. **Build limpio**: nunca `git push` con `npm run build` roto.
2. **Respetar locks**: no tocar archivos que el otro agente tiene bloqueados.
3. **Versión en un solo lugar**: `package.json`. Commit `[H.A.F+letra] tipo: descripción`. Nunca subir el Hito sin permiso.
4. **Rebase antes de empezar**: `git pull --rebase origin main`.
5. **Sin menciones a otras apps de chat/voz** en ningún lado.

---

## 📌 Pendientes conocidos
- **Acceso/Credenciales de Cloudflare Pages para despliegue de web (`llamadita`)**: En la máquina de Juan (`juandiegooliva03@gmail.com`), el comando `npm run deploy:web` falla indicando que el proyecto `llamadita` no existe en su cuenta de Cloudflare (está registrado en la cuenta de Martín). Para que Juan/Antigravity puedan desplegar directamente se necesita: (a) invitar la cuenta de Juan como miembro en Cloudflare al proyecto `llamadita`, o (b) configurar las variables de entorno `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. Mientras tanto, no se hace `git push` de despliegue directo hasta coordinar con Claude/Martín.
- **Una conexión en vivo por usuario (pendiente de prueba real)**: `src/network/peerManager.js` crea su propio cliente Supabase, así que cada usuario abre 2 conexiones Realtime (tope del plan gratis: 200 simultáneas → ~100 usuarios). El cambio es usar `import { supabase } from '../supabase/client.js'`. Probado que la señalización se suscribe con el cliente compartido; falta una llamada completa entre dos personas antes de subirlo. Área de red: coordinar con Antigravity.
- **SMTP propio en Supabase (bloqueante para uso real)**: sin SMTP, Supabase manda como máximo 2 mails por hora para todo el proyecto. liczeta usa Resend con dominio propio (150/hora). Límite de conexiones Realtime del plan gratis: 200 simultáneas (1 por usuario desde 1.7.1A).
- Regenerar `installer/Llama-dita-Setup.exe` con `crear-instalador.bat` (Inno Setup) para instalaciones nuevas en `1.3.1A`.
- Al conectar por llamada directa, la cabina remota a veces muestra "Participante" en vez del nombre (el mensaje `profile` por DataChannel puede llegar antes de que el otro esté listo).
