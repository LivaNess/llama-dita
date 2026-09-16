# Cambios de Llama-dita

Un renglón por versión publicada: qué se hizo, por qué, y cómo comprobar que quedó bien.
Lo más nuevo arriba.

> **Cómo se completa.** Cada vez que subís la versión en `package.json`, agregás acá su
> ficha **antes** del push. Si la versión no está acá, no existió.
>
> **Plantilla:**
> ```
> ### 1.2.3A · 2026-01-31 · Claude
> **Qué cambió.** En criollo, lo que nota quien usa la app.
> **Por qué.** El problema que había.
> **Dónde.** Archivos o áreas tocadas (ver `ESQUELETO.md`).
> **Cómo se verifica.** Los pasos exactos para confirmarlo.
> ```

Las versiones se numeran con el esquema de `VERSIONADO.md`.

---

### 1.15.1A · 2026-09-15 · Claude
**Qué cambió.** La app dejó de gastar procesador cuando no hay nada que mirar. Medido en la
máquina de Martín, con la ventana abierta y sin llamada: **pasó de 6,49% a 0,45% de CPU**.
De referencia, la app que queremos reemplazar marcaba 0,20% en el mismo momento, así que
pasamos de gastar 20 veces más que ella a estar en el mismo orden.
**Por qué.** El bucle que dibuja los medidores y el espectro corría a 60 cuadros por segundo
siempre, incluso con las cabinas fuera de pantalla (o sea, dibujando en canvas que nadie
veía). Se confirmó minimizando la ventana: ahí el gasto caía solo a 0,55%, lo que demostraba
que todo el consumo era dibujo y no el motor de la aplicación.
**Dónde.** `src/main.js`, el bucle `renderAudioMetrics` (área A).
**Cómo se verifica.** Con la app abierta y sin llamada, mirar el uso de CPU del árbol de
procesos de Llama-dita en el Administrador de tareas: tiene que estar por debajo del 1%.
**De paso quedó medida la app entera** (versión 1.15.1A, sin llamada, ventana a la vista):
422 MB de memoria de trabajo y 220 MB de memoria privada, contra 1.077 MB y 1.217 MB de la
otra. O sea **5,5 veces más liviana en memoria propia**, con el mismo gasto de procesador.

### 1.14.2A · 2026-09-15 · Claude
**Qué cambió.** Hay un botón **Salir de la llamada** en la barra de arriba. Aparece solo
cuando hay alguien del otro lado y corta sin cerrar la app: quedás en standby, en una sala
tuya vacía, listo para llamar o para que te llamen. Al otro le figura que te fuiste.
**Por qué.** Hasta ahora la única forma de salir de una llamada era cerrar la aplicación.
**Dónde.** `index.html` y `src/style.css` (el botón), `src/network/peerManager.js`
(`leaveRoom()`) y `src/main.js` (limpia la cabina remota y vuelve a standby). Áreas A y D.
**Cómo se verifica.** Dos personas (o dos pestañas) en la misma sala hasta que diga
"Conectado". Tocar "Salir de la llamada": el que corta vuelve a standby con un código de
sala nuevo, y el otro pasa a "Esperando conexión remota" con la cabina limpia. Después, el
que quedó puede volver a entrar con el código nuevo y la llamada se arma de nuevo.
**Ojo.** No alcanzaba con cerrar la conexión: quedándose en la misma sala, la presencia del
otro los volvía a juntar en cuanto sincronizaba. Por eso el que corta se va a una sala nueva.

### 1.14.1A · 2026-09-15 · Claude
**Qué cambió.** El botón de llamar a un amigo ahora se ve verde de verdad, en la barra
lateral y en el panel de amigos. Lo mismo el telefonito que suena en el aviso de llamada.
**Por qué.** El botón ya era verde, pero el dibujito era el emoji del teléfono, que en
Windows se pinta rosa: de un vistazo parecía el botón de cortar, no el de llamar.
**Dónde.** `src/social/panel.js` (un solo ícono vectorial reutilizado en los tres lugares),
`src/social/social.css`, `src/style.css` (áreas F y A).
**Cómo se verifica.** Abrir la app con un amigo en la lista: el teléfono del botón se ve
verde, del mismo color que el borde del botón.

### 1.13.1A · 2026-09-15 · Claude
**Qué cambió.** La ventana de la app de escritorio (y su lugar en la barra de tareas) deja
de mostrar el ícono de fábrica de Neutralino y muestra el logo: la llama con auriculares
sobre el cuadrado azul marino. Lo mismo el ícono de bandeja, para cuando se use.
**Por qué.** Era lo último que seguía diciendo "app genérica" en el escritorio.
**Dónde.** `desktop/resources/icons/appIcon.png` (256×256) y `trayIcon.png` (32×32),
generados a partir de `public/favicon.svg` (área L, marca).
**Cómo se verifica.** `npm run build:desktop`, abrir la app y mirar la esquina de la
ventana y la barra de tareas. Para regenerarlos: abrir la app en el navegador, dibujar
`/favicon.svg` en un canvas del tamaño que haga falta y guardar el PNG.
**Ojo.** El ícono del ejecutable en sí (el `.exe` en el Explorador) viene incrustado en el
binario de Neutralino y no cambia con esto.
**Además.** Se regeneró `installer/Llama-dita-Setup.exe` con esta versión (Inno Setup 6.7.3,
instalado en la PC de Martín en `%LOCALAPPDATA%\Programs\Inno Setup 6`). El Setup que había
era de una versión vieja y no registraba el esquema `llamadita://`, así que en una
instalación nueva el enlace del mail no abría la app. Se verifica instalando en una máquina
limpia y tocando el enlace del mail.

### 1.12.2A · 2026-09-15 · Claude
**Qué cambió.** La cabina del otro lado muestra su nombre y no "Participante". Si la
persona se renombra o entra con su cuenta después, el cambio le llega igual; cuando se
corta la llamada, el nombre vuelve a "Participante" en vez de quedar el del anterior.
**Por qué.** El nombre se mandaba una sola vez, en el momento en que la llamada pasaba a
"conectado". Ese aviso suele llegar antes de que el canal de datos esté abierto del otro
lado, así que el dato se perdía y nadie lo volvía a pedir.
**Dónde.** `src/network/peerManager.js` y `src/main.js` (áreas D y A).
**Cómo se verifica.** `npm run dev`, dos pestañas en la misma sala. Cambiar el nombre en
una: aparece en la cabina remota de la otra. Recargar una de las dos: la que vuelve tiene
que mostrar el nombre de la otra sin que nadie toque nada (antes quedaba en
"Participante").

### 1.12.1A · 2026-09-15 · Claude
**Qué cambió.** La llamada usa la misma conexión a Supabase que el resto de la app, en vez
de abrir una segunda por su cuenta. Para quien usa la app no cambia nada; lo que cambia es
cuánta gente entra sin que el servicio diga basta.
**Por qué.** Cada usuario abría dos conexiones en vivo y el plan gratis permite 200 en
total: con 100 personas nos quedábamos sin lugar. La regla ya estaba escrita («no crear un
segundo cliente»), la señalización era la única que la incumplía.
**Dónde.** `src/network/peerManager.js` (área D), que ahora importa `src/supabase/client.js`
(área E).
**Cómo se verifica.** `npm run dev`, abrir dos pestañas con la misma sala
(`?room=llamadita-prueba`) y esperar a que las dos digan «Conectado». En la consola de
cualquiera de las dos:
`(await import('/src/supabase/client.js')).supabase.getChannels().map(c => c.topic)`
tiene que incluir el canal `realtime:room_llamadita-prueba`: la señalización viaja por el
cliente compartido, no por uno propio.

### 1.11.2C · 2026-09-15 · Antigravity
**Qué cambió.** Se fijó el bloque de usuario con el micrófono (`[YO] + [MIC]`) de forma permanente en el margen inferior izquierdo de la barra lateral (`margin-top: auto; flex-shrink: 0;`), se garantizó altura total `100%` en la barra lateral, y se alineó la altura de las cabeceras superior e izquierda a exactamente 64px (`box-sizing: border-box`) para que la línea divisoria horizontal sea continua y no se entrecorte en la unión central. Cero cambios en la lógica de la aplicación.
**Por qué.** En la app de escritorio la barra lateral colapsaba su altura dejando al usuario flotando en el medio con espacio vacío debajo, y la diferencia de alturas entre cabeceras producía un salto visual en la línea horizontal divisoria.
**Dónde.** `src/style.css`, `src/brand.css`.
**Cómo se verifica.** Abrir la app de escritorio y confirmar que la línea horizontal superior es perfectamente continua y uniforme y que el bloque de usuario con el micrófono está pegado al fondo a la izquierda.

### 1.11.2B · 2026-09-15 · Claude
**Qué cambió.** El protocolo dejó de depender de la buena voluntad: `AGENTS.md` es la
puerta de entrada para cualquier agente y `npm run verificar` controla que la versión esté
registrada, que las áreas estén mapeadas y que no queden bloqueos abiertos. Lo mismo corre
solo en cada push a `main`.
**Por qué.** Los documentos solo sirven si alguien los mira; ahora el repositorio avisa.
**Dónde.** `AGENTS.md`, `scripts/verificar-protocolo.mjs`, `.github/workflows/protocolo.yml`.
**Cómo se verifica.** Correr `npm run verificar`: pasa. Borrar la ficha de la versión en
`CAMBIOS.md` y volver a correrlo: falla.

### 1.11.2A · 2026-09-15 · Claude
**Qué cambió.** El proyecto tiene dos documentos nuevos: `ESQUELETO.md` (mapa de áreas y
conexiones) y `CAMBIOS.md` (este registro).
**Por qué.** Para que cualquiera entienda dónde está cada cosa sin leer todo el código, y
para que cada versión deje asentado qué hizo.
**Dónde.** `ESQUELETO.md`, `CAMBIOS.md`, `CLAUDE.md`, `SYNC.md`.
**Cómo se verifica.** Abrir `ESQUELETO.md` y encontrar cualquier archivo del repo en su área.

### 1.11.1F · 2026-09-15 · Claude
**Qué cambió.** El enlace del mail deja la sesión iniciada en la app, sin abrir una segunda
ventana ni mostrar errores.
**Por qué.** El enlace llevaba un `&` que cortaba el comando de Windows y llegaba la mitad
de la dirección. Además, abrir una segunda copia de la app falla siempre porque usa un
puerto fijo, y Chrome no abre apps desde una página ni apuntando al ejecutable.
**Dónde.** `src/social/deeplink.js`, `web/entrar/`, `web/js/entrar.js`, `installer.iss`.
**Cómo se verifica.** Cerrar sesión, pedir código, tocar el enlace: la app entra sola y
queda una sola ventana abierta.

### 1.11.1A · 2026-09-15 · Claude
**Qué cambió.** Primera versión del enlace que abre la app, con el esquema `llamadita://`.
**Por qué.** El enlace del mail abría una página y no servía para la app instalada.
**Dónde.** `src/social/deeplink.js`, `src/social/auth.js`, `desktop/neutralino.config.json`.
**Cómo se verifica.** El registro de Windows queda apuntando a la app y el mail vuelve a ella.

### 1.10.3A · 2026-09-15 · Antigravity
**Qué cambió.** Rediseño completo de la web oficial con estilo oscuro, acorde a la app.
**Dónde.** `web/index.html`, `web/css/site.css`.
**Cómo se verifica.** Abrir llamadita.com.ar.

### 1.10.2A · 2026-09-15 · Claude
**Qué cambió.** Las actualizaciones y las descargas salen del dominio propio; la dirección
vieja de Cloudflare Pages redirige.
**Por qué.** Quedaban cosas colgando de direcciones que no eran las oficiales.
**Dónde.** `src/updater.js`, `scripts/build-desktop.mjs`, `scripts/build-web.mjs`, `web/js/dominio.js`.
**Cómo se verifica.** `curl https://llamadita.com.ar/update-manifest.json` responde la versión.

### 1.10.1A · 2026-09-15 · Claude
**Qué cambió.** Nació la web oficial: presentación, descarga del instalador y registro de
cuenta con el mismo Supabase que la app.
**Dónde.** `web/`, `scripts/build-web.mjs`.
**Cómo se verifica.** `npm run build:web` y abrir `site-dist/index.html` servido.

### 1.9.1A · 2026-09-15 · Claude
**Qué cambió.** La app tomó la identidad del logo: paleta azul marino y crema, tipografía
propia y el llama en la barra lateral.
**Dónde.** `src/brand.css`, `public/brand/`, `index.html`.
**Cómo se verifica.** Abrir la app: logo arriba a la izquierda y colores de marca.

### 1.8.1A · 2026-09-15 · Antigravity
**Qué cambió.** Rediseño de la interfaz con barra lateral fija y vistas que cambian según
si estás en un canal, en una llamada o sin nada.
**Dónde.** `index.html`, `src/main.js`, `src/style.css`, `src/social/panel.js`.

### 1.7.1A · 2026-09-15 · Claude
**Qué cambió.** Preparado para 50 a 100 personas: la presencia dejó de escribirse en la base.
**Por qué.** Cada usuario escribía cada minuto y eso se reenviaba a todos: con 100 personas
eran unos 10.000 mensajes por minuto, muy por encima del plan gratis.
**Dónde.** `src/social/panel.js`, `supabase/migrations/20260915_002_presencia_sin_escrituras.sql`.
**Cómo se verifica.** Dos cuentas abiertas: el punto verde aparece sin que haya escrituras.

### 1.6.1A · 2026-09-15 · Claude
**Qué cambió.** El acceso distingue "Crear cuenta" de "Ya tengo cuenta", y avisa si el mail
no existe.
**Dónde.** `src/social/panel.js`, `src/social/auth.js`.

### 1.5.2A · 2026-09-15 · Claude
**Qué cambió.** Las actualizaciones se consultan en una fuente sin caché.
**Por qué.** El servicio anterior servía versiones viejas según el servidor que te tocaba,
con riesgo de ofrecer una actualización hacia atrás.
**Dónde.** `src/updater.js`.

### 1.5.1A · 2026-09-15 · Claude
**Qué cambió.** El micrófono dejó de pedir permiso en cada apertura y se arregló la
instalación de actualizaciones.
**Por qué.** La app abría en un puerto distinto cada vez, así que el navegador interno la
veía como otro sitio y volvía a preguntar.
**Dónde.** `desktop/neutralino.config.json`, `src/updater.js`.

### 1.4.1A · 2026-09-15 · Claude
**Qué cambió.** Al abrir sin sesión se muestra solo el panel para crear la cuenta.
**Dónde.** `src/social/panel.js`.

### 1.3.1A · 2026-09-15 · Claude
**Qué cambió.** La app se actualiza sola: avisa cuando hay versión nueva, con opción de
hacerlo automáticamente, y botón para buscar actualizaciones.
**Dónde.** `src/updater.js`, `scripts/build-desktop.mjs`.
**Cómo se verifica.** Publicar una versión y abrir una app con la anterior.

### 1.2.1A · 2026-09-15 · Claude
**Qué cambió.** Cuentas, amigos, canales de texto y de voz, mensajes y llamadas directas.
**Dónde.** `src/social/`, `supabase/migrations/20260915_001_cuentas_amigos_canales.sql`.
**Cómo se verifica.** Dos cuentas: agregarse, llamarse y chatear.

### 1.1.1A · 2026-09-15 · Antigravity
**Qué cambió.** Base del proyecto: llamada de voz entre dos personas, señalización por
Supabase Realtime, WebRTC con servidores de relevo y cliente de Windows.
**Dónde.** `src/network/peerManager.js`, `src/audio/`, `desktop/`.

---

## Versiones intermedias

Además de las de arriba hubo publicaciones de corrección seguidas (letras B, C, D…) sobre
el mismo punto: mensajes del aviso de actualización, orden de las capas en pantalla, el
`.gitignore` de las carpetas de compilación y pruebas de actualización. Están todas en el
historial de commits con su número adelante, que es la trazabilidad fina; acá quedan las
que cambian algo que se nota.
