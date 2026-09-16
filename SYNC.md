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

> **Para Martín, de Juan / Antigravity (16/09/2026). NOTAS DE LA VERSIÓN `0.20.1B`**
>
> Martín, quedó implementado y testeado todo lo pedido para la versión `0.20.1B`:
> 1. **DMs desde lista de amigos:** Tocar a un amigo en la barra lateral abre su chat privado 1-a-1 en la vista principal con su nombre, avatar, estado y botón de llamada directa integrado en la cabecera. Tocar el botón de teléfono en la fila del amigo sigue llamando de una como siempre.
> 2. **Menú contextual en canales:** Clic derecho sobre un canal en la barra lateral permite salir del canal (o borrarlo si sos dueño) y copiar su código de invitación.
> 3. **Renombre:** La sección de amigos ahora dice "AMIGOS -" tanto en la app como en la landing web.
>
> Queda el lock liberado para cualquier tarea siguiente.

> **Para Juan, de Martín (16/09/2026). NOTAS DEL PARCHE `0.20.1A`**
>
> Juan, pasaron cosas. Esto es todo lo que cambió desde la última vez que la abriste, contado
> sin vueltas. Lo técnico de cada versión está en `CAMBIOS.md`; esto es el resumen.
>
> **ARREGLADO**
>
> - **Volvió el audio.** La llamada conectaba pero no se escuchaba nada. Se había borrado sin
>   querer el reproductor del audio remoto del final de `index.html` (el detalle está en el
>   recado de más abajo).
> - **Borrar tu cuenta ya no borra el chat de los demás.** Antes, si el dueño de un canal se
>   daba de baja, se llevaba puesto el canal entero con los mensajes de todos.
> - **El reintento de conexión reintenta de verdad.** Antes pedía reiniciar la red y acto
>   seguido armaba una conexión nueva que tiraba ese trabajo a la basura.
> - **La actualización comprueba lo que baja.** Antes daba por buena cualquier descarga de más
>   de 10 KB, sin fijarse si era lo que decía ser.
> - **El enlace del mail funciona en instalaciones nuevas.** El instalador lo registraba
>   apuntando a un archivo que no instalaba.
> - **La sesión sobrevive a reinstalar la app.**
>
> **RENDIMIENTO**
>
> - **Procesador: de 2,5% a 0,76%** (mediana, medido antes y después en la máquina de Martín).
>   Eran dos cosas nuestras: dibujábamos los medidores de nivel contra pantallas que nadie
>   estaba mirando, y analizábamos el micrófono todo el tiempo aunque estuvieras silenciado y
>   con la ventana minimizada.
> - **Memoria: 213 MB.** La aplicación pesada que queremos reemplazar, medida en la misma
>   máquina y en el mismo momento: 1.217 MB.
>
> **CAMBIOS DE JUEGO**
>
> - **Se fueron los códigos de sala.** Llamás al amigo desde la lista y la sala se abre sola. La
>   cabecera te dice con quién estás hablando en vez de mostrarte un código técnico.
> - **El logo también adentro del ejecutable** (antes solo estaba el de la ventana).
>
> **DOCUMENTACIÓN NUEVA, que es lo que más te conviene mirar**
>
> - `areas/`: seis análisis a fondo, uno por parte del proyecto, hechos **antes** de construir.
>   Arrancá por `areas/00-SINTESIS.md`, que reconcilia los seis.
> - `ROADMAP.md` ahora separa **el tallo de las ramas**: siete cimientos que, si se hacen tarde,
>   obligan a rehacer todo lo que quedó arriba, y las ramas que cuelgan de ahí.
>
> **LO QUE VIENE: el chat**
>
> Decisión de los dos: lo primero que tiene que andar bien, sin cosas raras, es el chat. Y es
> buena elección por un motivo que no es obvio: **un chat bien hecho arrastra cuatro de los
> siete cimientos.**
>
> El orden es al revés del que parece obvio. **Primero la plomería** (la forma de los datos,
> los permisos garantizados por la base, el historial guardado en tu propia PC y el borrado de
> verdad) y **después las funciones lindas** (imágenes, buscador, reacciones, responder). Si se
> hace al revés, cada función nueva multiplica una factura que todavía no sabemos leer.
>
> **DECISIONES QUE TOMÓ MARTÍN HOY.** Si querés objetar alguna, este es el momento, después
> salen caras:
>
> 1. Las tablas nacen con la idea de **espacio** (un espacio es una comunidad con canales
>    adentro), pero la pantalla muestra uno solo y no hay selector a la vista. Agregarlo después
>    sería una migración sobre datos vivos; agregarlo ahora es una columna.
> 2. **Borrado duro, no marca de borrado.** La fila se va de verdad. En los privados hay dos
>    botones distintos: "sacarlo de mi vista" (borra solo tu copia y se puede deshacer) y
>    "borrarlo para los dos" (borra del servidor, y solo alcanza los mensajes que escribiste vos).
> 3. Por defecto, **el texto se guarda para siempre y los adjuntos 90 días.** El texto es barato,
>    las imágenes son las que llenan el cupo. Configurable por canal.
> 4. **Tope de 100 MB por archivo.** La aplicación que reemplazamos está en 20.
>
> **SIGUE ROTO O SIN PROBAR**
>
> - Los códigos de invitación no vencen, no tienen tope de usos y no se pueden dar de baja.
> - El actualizador todavía no sabe volver atrás si una versión sale rota.
> - **Nunca probamos una llamada real entre tu PC y la de Martín**, con audio en los dos
>   sentidos, desde la lista de amigos. Es lo único grande sin verificar de punta a punta.
> - El instalador nuevo no se probó en una máquina limpia.
>
> **DOS COSAS EN LAS QUE TE NECESITAMOS**
>
> 1. **Esa llamada de prueba.** Aprovechamos y medimos el consumo con una llamada andando, que
>    es algo que nadie midió todavía: todos los números que tenemos son con la app abierta sin
>    hacer nada.
> 2. **Leer `areas/00-SINTESIS.md`** y decirnos si ves algo que nos estemos comiendo. Hay una
>    pelea abierta a propósito, y es la única de fondo: si la voz y el video van por la misma
>    conexión o por dos separadas.

> **Para Antigravity, de Martín (16/09/2026):**
>
> Hicimos seis análisis de área antes de empezar a construir, uno por cada parte del proyecto,
> más una síntesis que los reconcilia. Están en `areas/`, arrancá por `areas/00-SINTESIS.md`.
>
> **Pegales una leída y decinos qué te parece**, sobre todo si ves algo que nos estemos
> comiendo o alguna decisión que tomamos mal. Hay una contradicción abierta a propósito (si la
> voz y el video van por la misma conexión o por dos separadas) y cuatro cosas esperando
> decisión, están listadas al final de la síntesis.
>
> Lo que **no** hace falta: revisar redacción, discutir nombres de archivos, ni buscarle el pelo
> al huevo. Es un plan para trabajar, no un documento para auditar.

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
| `0.17.1A` | Claude | Base de datos / no perder lo de los demás | Borrar una cuenta ya no borra el canal ni los mensajes de otros (las dos claves pasan a quedar en nulo). `npm run verificar` falla si una tabla nueva no tiene activadas las políticas de seguridad. |
| `0.17.2A` | Claude | Robustez / actualizador, instalador y reintento | El updater verifica la huella de lo que baja; el instalador incluye el script del enlace del mail; el reintento de conexión renegocia sobre la misma conexión en vez de rehacer la llamada. |
| `0.18.1A` | Claude | Audio / medir solo cuando se mira | Se elimina el nodo que analizaba el micrófono 47 veces por segundo aunque estuviera todo apagado. El nivel se lee del analizador cuando hay una cabina en pantalla. A/B en la máquina de Martín: mediana de 2,5% a 0,76% de CPU. |
| `0.19.1A` | Claude | Escritorio / ícono del ejecutable | El logo va ahora adentro del .exe (antes solo estaba el de la ventana), más el instalador y el desinstalador. No llega por actualización automática: hay que reinstalar. |
| `0.20.1A` | Claude | Cuentas / la sesión sobrevive a reinstalar | Copia de la sesión en `%LOCALAPPDATA%\Llamadita\`, fuera de la carpeta de la instalación. Si el navegador interno se quedó sin sesión, la app la restaura sola. |
---

## ⚠️ Reglas para agentes
1. **Build limpio**: nunca `git push` con `npm run build` roto.
2. **Respetar locks**: no tocar archivos que el otro agente tiene bloqueados.
3. **Versión en un solo lugar**: `package.json`. Commit `[H.A.F+letra] tipo: descripción`. Nunca subir el Hito sin permiso.
4. **Rebase antes de empezar**: `git pull --rebase origin main`.
5. **Sin menciones a otras apps de chat/voz** en ningún lado.

---

## 📍 Dónde estamos (cierre 2026-09-16, versión `0.20.1A`)

**El hito arranca en 0** por decisión de Martín: el proyecto todavía no llegó a su primer hito,
y sube a 1 solo cuando él o Juan lo digan.

Lo que se hizo en esta tanda:

- **Llamadas arregladas.** La `1.15.1B` había borrado sin querer el reproductor del audio
  remoto: la llamada conectaba pero no se escuchaba nada. Volvió.
- **Fuera el sistema de códigos de sala.** Se llama al amigo desde la lista y la sala se abre
  sola. La cabecera dice con quién estás hablando en vez de mostrar un código técnico.
- **Consumo medido y bajado.** La app gastaba entre dos y tres veces más procesador del
  necesario por dos cosas nuestras: dibujar medidores contra pantallas que nadie miraba, y
  analizar el micrófono todo el tiempo aunque estuviera silenciado y minimizado. Medición A/B
  en la máquina de Martín: mediana de 2,5% a 0,76% de CPU. Memoria: 213 MB, contra 1.217 MB de
  la aplicación pesada que queremos reemplazar, medidas en la misma máquina y al mismo momento.
- **Cinco bugs verificados y arreglados**: borrar una cuenta ya no borra el contenido de los
  demás; las tablas nuevas sin políticas de seguridad ahora las caza `npm run verificar`; la
  actualización comprueba la huella de lo que baja; el enlace del mail funciona en
  instalaciones nuevas; y el reintento de conexión renegocia de verdad en vez de rehacer la
  llamada.
- **El logo también adentro del ejecutable** (antes solo estaba el de la ventana).
- **La sesión sobrevive a reinstalar**, con una copia fuera de la carpeta de la instalación.
- **El roadmap tiene ahora tres capas**: las reglas que no se negocian, el mapa de cómo está
  construida la competencia y qué nos salteamos por escala, y la separación entre el tallo del
  árbol y las ramas.
- **Seis fichas de área** en `areas/`, con lo que hay que decidir antes de escribir código.

**Lo primero que tiene que andar bien, decidido por Martín y Juan: el chat.** Y arrastra cuatro
de los siete cimientos, así que es buen punto de entrada.

## 📌 Pendientes conocidos

### Bugs verificados en el código de hoy (16/09/2026)

Salieron de la revisión por áreas y están confirmados uno por uno leyendo el repositorio y
la base. No son hipótesis.

1. ~~Se puede perder el chat de todos~~ · **resuelto en la `0.17.1A`** (migración 003).
2. ~~Mina para las tablas que vengan~~ · **resuelto en la `0.17.1A`** (control en `npm run verificar`).
3. **Las invitaciones no se pueden dar de baja.** No vencen, no tienen tope de usos, y la
   función que las canjea corre saltándose las políticas sin chequear nada más que si el código
   existe. (La entropía no es el problema: son 4.294 millones de combinaciones.)
4. ~~El actualizador no verifica lo que baja~~ · **resuelto en la `0.17.2A`** (huella en el
   manifiesto). Queda pendiente lo otro: **no sabe volver atrás si una versión sale rota**.
5. ~~El enlace del mail puede no andar en instalaciones nuevas~~ · **resuelto en la `0.17.2A`**
   (el instalador incluye el script).
6. ~~El motor de audio no descansa~~ · **resuelto en la `0.18.1A`**: el nivel se mide solo
   cuando hay una cabina en pantalla. A/B medido: mediana de 2,5% a 0,76% de CPU.
7. ~~Reinicio de red que no reinicia nada~~ · **resuelto en la `0.17.2A`**: ahora renegocia
   sobre la misma conexión, probado con dos clientes (misma conexión, misma pista de audio).

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
12. ~~Cuánto cuesta el motor de audio~~ · **medido**: era alrededor de 1,7 puntos de CPU.
13. **Si el plan gratis de la base hace copias de respaldo.** Cambia qué se puede prometer en
    la pantalla de borrado.
