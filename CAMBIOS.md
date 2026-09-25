# Cambios de Llamadita

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

### 0.24.7B · 2026-09-25 · Antigravity
**Qué cambió.** Calibración de Transmisión de Video 1080p30, Layout de Cabina Perfeccionado, Modo Spotlight y Barra de Llamada Anclada Abajo:
- **Calibración 1080p 30fps y Bitrate Moderado WebRTC:**
  - `getUserMedia` ajustado para solicitar captura nítida Full HD 1080p (1920x1080) a 30 fotogramas por segundo (`ideal: 1920x1080`, `frameRate: 30`).
  - Bitrate WebRTC configurado a un nivel moderado y estable de 2.5 Mbps (2500 kbps) mediante `RTCRtpSender.setParameters()`, previniendo saturación de red o pixelado en conexiones residenciales.
- **Diseño Ergonómico de Cabina con Video (según captura de referencia):**
  - Al encender la cámara, el reproductor de video ocupa la parte superior de la tarjeta con esquinas redondeadas (`16px`), quedando el control elástico de ganancia/sensibilidad justo debajo.
  - Insignia flotante semitransparente en la esquina inferior izquierda del video con indicador verde de estado en vivo y nombre en mayúsculas (`• MALDITO TOKICHI`).
- **Expansión Automática de Tarjetas con Cámara Activa:**
  - Cuando cualquier participante enciende su cámara, el contenedor de llamada (`.studio-container`) se expande de 1060px a 1440px (96% del ancho de pantalla), otorgando protagonismo visual a la persona y eliminando márgenes innecesarios.
- **Modo Spotlight / Pantalla Completa:**
  - Al hacer clic en la foto/avatar o en el video de cualquiera de los participantes (o en el botón flotante de pantalla completa), esa persona se expande para ocupar todo el contenedor de la llamada.
  - La otra tarjeta se repliega en una ventana flotante Picture-in-Picture (PiP) en la esquina superior derecha, permitiendo seguir viéndose o cambiar el foco con un simple toque.
- **Barra de Llamada Anclada en la Base (Alineada con el Menú de Perfil):**
  - La barra flotante de llamada (`#studioCallBar`) permanece anclada en la parte inferior de la ventana, manteniendo exactamente la misma altura horizontal que el pie de perfil de usuario (`#sidebarUserFooter`), tanto en llamadas de voz como de video, sin saltos ni desajustes verticales.
**Por qué.** El usuario solicitó limitar la calidad a 1080p 30fps con bitrate moderado, adaptar el diseño de la cabina de video a la captura adjunta, hacer que las tarjetas crezcan al activar la cámara, permitir ampliar a pantalla completa tocando la foto de una persona y fijar la barra de corte a la misma altura que el menú de perfil inferior.
**Dónde.** `src/network/peerManager.js`, `index.html`, `src/style.css`, `src/main.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Iniciar una llamada y encender la cámara: verificar que las tarjetas crecen ocupando el 96% de la pantalla (hasta 1440px) y que la transmisión se captura a 1080p30 con bitrate de 2.5 Mbps.
2. Comprobar que la tarjeta de video tiene esquinas redondeadas, la insignia con el nombre en mayúsculas en la esquina inferior izquierda y el slider elástico debajo.
3. Tocar la foto o el video de un participante: verificar que pasa a modo Spotlight ocupando todo el contenedor de llamadas, mientras el otro participante queda en una miniatura PiP en la esquina superior derecha. Volver a tocar para restaurar la vista dividida 50/50.
4. Constatar que la barra de llamada flotante inferior se ubica siempre en la base, horizontalmente alineada a la misma altura que el menú de perfil (`#sidebarUserFooter`), sin importar si es llamada de voz o de video.

### 0.24.7A · 2026-09-25 · Antigravity
**Qué cambió.** Soporte de Video P2P Mesh-Ready y conmutación de cámara en tiempo real durante llamadas:
- **Transmisión de Video WebRTC P2P:**
  - Capacidad bidireccional de video entre participantes de la llamada utilizando la infraestructura P2P directa existente.
  - Arquitectura preparada para malla (mesh-ready): se amplió el límite de participantes de presencia a 5 personas concurrentes sin errores de capacidad.
  - Pre-negociación inteligente de video transceiver (`addTransceiver('video', { direction: 'sendrecv' })`): permite alternar y reemplazar la pista de video (`replaceTrack`) con cero latencia y sin congelamiento ni carreras de renegociación SDP.
- **Botón de Cámara en la Barra de Llamada:**
  - En la barra de llamada flotante central (`#studioCallBar`), se incorporó el botón `#btnToggleVideo` con icono vectorial y estados activo/inactivo (`.active`).
  - Al hacer clic, solicita acceso al dispositivo de video (`getUserMedia` 720p/1280x720) y conmuta la cámara al instante.
- **Visualización y Reproductores en Cabina:**
  - Si la cámara está activa, la tarjeta de cabina oculta suavemente el avatar estático y muestra el reproductor de video (`.booth-video-wrapper`).
  - Cabina local (Host): Video con efecto espejo natural (`transform: scaleX(-1)`) para máxima comodidad del usuario al verse a sí mismo.
  - Cabina remota (Guest): Reproduce el stream de video de la persona con la que se habla sin distorsión.
  - Insignia flotante con efecto cristal (`.booth-video-overlay-badge`) que muestra el punto verde en vivo y el nombre de cada persona.
- **Privacidad y Limpieza de Hardware:**
  - Al apagar la cámara o al finalizar la llamada (`leaveCall`), todas las pistas del stream se detienen físicamente (`track.stop()`), apagando de inmediato la luz LED de hardware de la webcam y liberando los recursos de la máquina.
**Por qué.** El usuario solicitó poder prender la cámara para verse con su amigo en las llamadas WebRTC existentes mediante P2P, manteniendo una arquitectura mesheable para hasta 5 personas en el futuro, con código limpio y sin clichés de IA.
**Dónde.** `src/network/peerManager.js`, `index.html`, `src/style.css`, `src/main.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Iniciar o unirse a una llamada entre dos clientes.
2. Hacer clic en el nuevo botón de cámara en la barra de llamada flotante: comprobar que el navegador solicita permiso de cámara, la cámara se enciende y el recuadro de video local aparece en la cabina con efecto espejo y badge con el nombre.
3. Comprobar que en el cliente remoto el video se recibe fluidamente en la cabina del amigo.
4. Apagar la cámara o cortar la llamada: comprobar que el LED de la cámara se apaga de inmediato y la interfaz vuelve a los avatares correspondientes.

### 0.24.6B · 2026-09-24 · Antigravity
**Qué cambió.** Overhaul Visual Fase 3B — Mini dock de llamada en barra lateral, depuración de pantalla de llamada y desencajonado de avatares/logos:
- **Mini Dock de llamada animado en la barra lateral (Posición 2 del croquis):**
  - Al minimizar la llamada activa o al navegar hacia un canal de texto o chat privado, el estado de la llamada se repliega elegantemente hacia la parte inferior de la barra lateral, ubicándose justo encima de la cápsula de usuario (`.sidebar-user-footer`).
  - Arriba: Texto descriptivo `En llamada con (Usuario)` / `En llamada`.
  - Abajo: Pastilla con temporizador en vivo en verde `[🟢 mm:ss]` a la izquierda y botón de corte rápido en rojo `[Cortar]` a la derecha.
  - Al hacer clic en el mini dock (fuera del botón de cortar), se restaura la vista de pantalla completa de la llamada con animación fluida.
- **Depuración visual de la pantalla de llamada:**
  - Eliminados los indicadores redundantes de texto ("Hablando", "En silencio", "Silenciado") y las etiquetas superiores ("Tu cabina", "Con [Amigo]"): el aura vocal acústica y el disco concéntrico que se iluminan al hablar son el indicador natural y suficiente.
  - En la barra de llamada flotante central (Posición 1 del croquis), se eliminó el texto redundante "En llamada con..." dejando una cápsula compacta y limpia con el cronómetro en vivo `00:00`, el botón "Cortar llamada" y un botón para minimizar la llamada.
  - Se optimizó el espaciado y la altura de las tarjetas de llamada para un balance visual superior sin marcos rígidos.
- **Standby Screen — Accesos rápidos y eliminación de clichés de IA:**
  - Vinculación correcta de los botones "Crear un canal" y "Añadir un amigo" con los modales centrados (`btnToggleCreateChannel` y `btnToggleAddFriend`), abriendo el wizard paso a paso y la búsqueda respectivamente.
  - Eliminada por completo la píldora informativa "Audio estéreo · Conexión directa P2P" identificada como cliché innecesario.
  - Desencajonado del logotipo: se eliminó el contenedor cuadrado/squircle con borde y fondo oscuro que encerraba a la llama; ahora el imagotipo flota de forma libre, limpia y transparente con una sombra de gota sutil (`drop-shadow`).
- **Avatares de chats circulares sin marco cuadrado:**
  - En la cabecera del chat privado (`.chat-channel-icon.is-avatar`), se eliminó el contenedor cuadrado de 10px que asomaba por detrás de la foto circular, dejando un avatar 100% redondo, limpio y calibrado.
**Por qué.** Había redundancia de texto en la pantalla de llamada, la barra flotante no permitía navegar la app cómodamente durante una llamada como indicaba el croquis del usuario, los botones de acción rápida en Standby no abrían sus modales correspondientes, y tanto los logos como las fotos de perfil estaban encerrados en cajas cuadradas con esquinas asomadas.
**Dónde.** `index.html`, `src/style.css`, `src/brand.css`, `src/main.js`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. En pantalla de Standby, constatar que el imagotipo de Llamadita no tiene caja cuadrada de fondo y que la píldora de "Audio estéreo" ya no aparece.
2. Hacer clic en "Crear un canal" o "Añadir un amigo" en la pantalla de Standby: verificar que se abren los respectivos modales en el centro de la pantalla.
3. Abrir un chat privado con un amigo con avatar: verificar que la foto en la cabecera es totalmente circular y no tiene un cuadrado asomando por detrás.
4. En una llamada activa, verificar la limpieza de la pantalla (solo avatar, nombre y slider elástico).
5. Minimizar la llamada o hacer clic en un chat: constatar que el mini dock aparece en la barra lateral encima del perfil del usuario con el tiempo en vivo y el botón de cortar. Al cliquear el dock, se restaura la llamada.

### 0.24.6A · 2026-09-24 · Antigravity
**Qué cambió.** Overhaul Visual Fase 3: Rediseño completo de la Pantalla de Standby (Home / Reposo) y Cabinas de Estudio de Llamada:
- **Pantalla de Standby (Hub de Bienvenida):**
  - **Saludo personalizado y dinámico:** Reemplazado el antiguo texto "Sin sesión activa" (que aparecía incluso con sesión iniciada) por un saludo cálido con el nombre del usuario (`¡Hola de nuevo, [Nombre]!`) y subtítulo ergonómico.
  - **Accesos Rápidos (Quick Actions):** Integradas dos tarjetas de acción directa para "Crear un canal" (dispara el wizard modal centrado) y "Añadir un amigo" (abre el modal centrado para buscar por `@usuario`), reutilizando 100% de los flujos ya validados.
  - **Píldora de estado de red:** Indicador visual "Audio estéreo · Conexión directa P2P" con punto verde pulsante.
  - **Imagotipo oficial con micro-elevación:** Squircle translúcido en cristal oscuro con borde de luz cenital `inset 0 1px 0 rgba(255,255,255,0.14)`.
- **Cabinas de Llamada (Studio Booths View):**
  - **Erradicación de clichés de IA:** Eliminadas las líneas sólidas superiores de 3px (`border-top`) y el resplandor difuso de 25px (`box-shadow: 0 0 25px`). Tarjetas monolíticas con `backdrop-filter: blur(20px)`, bordes calibrados a `rgba(143,166,255,0.12)`, oclusión ambiental y rim light superior.
  - **Chips de cabecera e indicadores en vivo:**
    - Host: Chip vectorial "Tu cabina" con icono de micrófono + indicador de habla en tiempo real ("En silencio", "Hablando" con halo verde, o "Silenciado" en rojo).
    - Guest: Chip vectorial "Con [Amigo]" con icono de usuario + indicador de habla en vivo de la otra persona.
  - **Aros acústicos y avatares:** Disco de avatar ampliado a 108px con aro físico concéntrico nítido de alta fidelidad (`box-shadow: 0 0 0 3.5px rgba(91,124,250,0.32)`) y ondas radiales acústicas fluidas (`.vocal-aura`).
  - **Paleta oficial en sliders y auras:** Erradicado el cian discordante (`#06b6d4`); reemplazado por azul eléctrico oficial (`--brand-blue`) para el host y azul suave (`--brand-blue-soft`) para el amigo.
- **Barra de Llamada Flotante (`#studioCallBar`):**
  - Cápsula aerodinámica monolítica en pastilla completa (`border-radius: 9999px`) con `backdrop-filter: blur(20px)`.
  - **Cronómetro de llamada en tiempo real (`#callDurationTimer`):** Temporizador activo (`00:00`, `01:23`) sincronizado con la conexión WebRTC.
  - Botón "Cortar llamada" en degradado rojo carmesí sutil con micro-física táctil.
**Por qué.** La pantalla de inicio mostraba "Sin sesión activa" para usuarios autenticados, y las cabinas de llamada mantenían patrones visuales heredados (bordes de color superiores, resplandor desenfocado de IA y falta de temporizador en llamada).
**Dónde.** `index.html`, `src/style.css`, `src/main.js`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Al abrir la app sin conversación activa, observar la pantalla de bienvenida con el imagotipo oficial, tu nombre, las acciones rápidas ("Crear un canal", "Añadir un amigo") y la píldora de audio estéreo.
2. Iniciar una llamada directa con un amigo o entrar a voz: verificar que las tarjetas de cabina exhiben los chips de cabecera ("Tu cabina", "Con [Nombre]"), los indicadores en vivo de voz ("Hablando", "En silencio", "Silenciado") y el cronómetro activo en la barra flotante inferior.

### 0.24.5E · 2026-09-24 · Antigravity
**Qué cambió.** Persistencia en disco de avatares en Base64 y precarga instantánea en fotograma 0 de la lista de amigos y perfil:
- **Caché de avatares persistente en disco (`%LOCALAPPDATA%/Llamadita/avatar_cache.json`):**
  - Se extendió el sistema de caché de avatares para guardarse no solo en memoria y `localStorage` sino también directamente en el disco duro del usuario mediante `nl.filesystem`.
  - Al abrir la aplicación, el mapa de avatares en Base64 se sincroniza inmediatamente desde el disco, permitiendo que cada imagen de perfil se renderice de forma síncrona en el fotograma 0 (`src="data:image/webp;base64,..."`) sin esperar resoluciones asíncronas de red ni parpadear círculos con iniciales.
- **Caché social fuera del navegador (`%LOCALAPPDATA%/Llamadita/social_cache.json`):**
  - Se persiste en disco el último estado de la cuenta (`me`), amigos (`friendships`) y canales (`channels`).
  - Al abrir la app, `initSocial` carga de inmediato este estado antes de esperar el viaje de red a Supabase. Si hay sesión y datos en disco, renderiza la barra lateral con tu nombre, tu foto, tus canales y tus amigos completos desde el primer milisegundo, erradicando el flash de la vista de login y el cartel "Cargando amigos...".
  - En segundo plano, se conecta a Supabase, valida la sesión y reconcilia silenciosamente cualquier actualización o cambio de presencia.
**Por qué.** Al reiniciar la aplicación de escritorio, las fotos de perfil cargaban desde cero (mostrando primero iniciales y luego apareciendo una por una) y la lista de amigos no se pintaba hasta que el pedido de red a Supabase finalizaba.
**Dónde.** `src/social/sesionGuardada.js`, `src/social/adjuntos.js`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Abrir la aplicación y verificar que tu avatar y los de tus amigos cargan con su imagen.
2. Cerrar la aplicación por completo (clic derecho en la bandeja -> "Salir de Llamadita") y volverla a abrir: constatar que en el fotograma 0 tanto tu perfil como la lista de amigos y sus fotos aparecen instantáneamente sin parpadear en blanco ni mostrar iniciales transitorias.

### 0.24.5D · 2026-09-24 · Antigravity
**Qué cambió.** Habilitación de CORS para puertos locales dinámicos en el servidor de archivos/adjuntos y bucket R2:
- **CORS dinámico en Cloudflare Worker (`workers/adjuntos/src/index.js`):**
  - Se actualizó la función `origenPermitido` del repartidor de archivos para aceptar peticiones provenientes de cualquier puerto local (`localhost` y `127.0.0.1`).
  - Al migrar en `0.24.5C` a puertos dinámicos de Neutralino (`port: 0`), las peticiones a `/ver?key=...` enviaban `Origin: http://localhost:<puerto>` distinto de 24024, lo que provocaba un rechazo `403 Origen no permitido` y hacía que las fotos de perfil y adjuntos en el chat fallaran mostrando "No se pudo cargar".
- **Regla CORS en Cloudflare R2 (`workers/adjuntos/cors.json`):**
  - Se configuró la política de CORS en el bucket `llamadita-adjuntos` para permitir orígenes comodín (`*`) junto a los dominios autorizados, garantizando que tanto la descarga como la lectura de imágenes desde cualquier puerto de escritorio o web se complete exitosamente.
- **Worker desplegado en producción:**
  - Se compiló y desplegó inmediatamente la nueva versión del Worker `llamadita-adjuntos` en Cloudflare Workers y se actualizó la regla de CORS en el bucket R2.
**Por qué.** Tras actualizar a `0.24.5C`, las fotos de perfil no cargaban y las imágenes en los chats mostraban "No se pudo cargar" debido a que el servidor de archivos en la nube sólo autorizaba el puerto fijo 24024.
**Dónde.** `workers/adjuntos/src/index.js`, `workers/adjuntos/cors.json`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `curl -i -H "Origin: http://localhost:54321" "https://llamadita-adjuntos.llamadita-adjuntos.workers.dev/salud"` y comprobar que responde `200 OK` con `access-control-allow-origin`.
2. En la app de escritorio, cambiar de canal o recargar: verificar que las fotos de perfil y las imágenes adjuntas en los mensajes cargan nítidamente sin el mensaje "No se pudo cargar".

### 0.24.5C · 2026-09-24 · Antigravity
**Qué cambió.** Solución definitiva de colisión de puertos de Neutralino (`NE_CL_IVCTOKN`), control de instancia única (Single Instance) y restauración suave de ventana:
- **Puerto dinámico del servidor local (`"port": 0`):**
  - Se configuró `"port": 0` en `desktop/neutralino.config.json`. Neutralino ahora solicita dinámicamente puertos efímeros libres al sistema operativo al iniciar, erradicando para siempre el bloqueo o choque por el puerto estático 24024.
- **Control de instancia única (Single Instance Guard):**
  - Se implementó `ensureSingleInstance(nl)` al iniciar la aplicación de escritorio (`DOMContentLoaded`).
  - Al abrirse una nueva copia de `Llamadita.exe` mientras la app ya se encuentra activa en segundo plano (minimizada en el System Tray):
    - La nueva copia detecta la existencia del proceso primario mediante registro rápido de PID (`.tmp/active_instance.pid` y `%TEMP%\llamadita_active_instance.pid`) o escaneo de procesos del SO (`tasklist` / PowerShell `StartTime`).
    - Envía la señal `llamadita://focus` (o el deep link/canal que haya recibido por parámetros) mediante `.tmp/enlace.txt` y `%TEMP%\llamadita_enlace.txt`.
    - La instancia primaria lee el enlace, desminimiza, restaura tamaño maximizado si correspondía, trae su ventana al frente de Windows de inmediato y la enfoca.
    - La segunda copia oculta su ventana y se cierra limpiamente de inmediato (`nl.app.exit()`), sin ventanas residuales, sin procesos huérfanos y sin errores de token.
- **Enfoque garantizado al frente en Windows:**
  - En `restoreDesktopWindow` y `enfocarVentana` se agregó activación forzada al frente con micro-alternancia de `setAlwaysOnTop`, asegurando que el administrador de ventanas de Windows sitúe a Llamadita al frente por encima de navegadores u otras aplicaciones al restaurarse.
**Por qué.** Al intentar abrir la aplicación cuando ya estaba minimizada en segundo plano en la bandeja del sistema, el puerto fijo 24024 provocaba que la nueva instancia intentara conectarse al WebSocket de la instancia previa con un token distinto, disparando el error fatal `NE_CL_IVCTOKN` en pantalla.
**Dónde.** `desktop/neutralino.config.json`, `src/main.js`, `src/social/deeplink.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `npm run build` y corroborar compilación exitosa.
2. Ejecutar `npm run build:desktop` y corroborar empaquetado de `resources.neu` sin errores.
3. Ejecutar `npm run verificar` y validar cumplimiento de protocolo.
4. Con una instancia de Llamadita ejecutándose en la bandeja del sistema, ejecutar nuevamente el acceso directo de Llamadita: verificar que la ventana en bandeja se restaura y pasa al frente de la pantalla inmediatamente sin generar error `NE_CL_IVCTOKN` ni duplicar procesos.

### 0.24.5B · 2026-09-24 · Antigravity
**Qué cambió.** Pulido milimétrico de alineaciones, radios y layout visual, restauración de la flecha de actualización, precarga instantánea de fotos de perfil y pantalla splash de inicio:
- **Burbujas de conversación ergonómicas (`.sc-msg`):**
  - **Eliminación del encabezado redundante en mensajes propios:** En los mensajes enviados por el usuario (`.sc-msg.mine`), se eliminó la inclusión repetitiva de su propio avatar y nombre dentro de la burbuja que deformaba y saturaba el globo (especialmente en respuestas breves). Ahora el contenido fluye de manera limpia con el timestamp sutilmente alineado en el pie derecho de la burbuja (`.sc-msg-meta`).
  - **Estructura y alineación balanceada:** Mensajes de terceros alineados a la izquierda con avatar externo y autor destacado; mensajes propios a la derecha con degradado azul eléctrico suave y radios coherentes (`18px 18px 4px 18px` para propios, `18px 18px 18px 4px` para ajenos).
- **Alineación horizontal de cabeceras (`.sidebar-header` y `.chat-header`):**
  - Unificación de alturas a `64px` exactos en ambas cabeceras y sincronización del borde inferior (`1px solid var(--border-subtle)`), eliminando el escalón vertical de 2 píxeles que quebraba la línea horizontal divisoria entre la barra lateral y el área de chat.
  - El avatar de chat privado en `.chat-header` ahora es perfectamente circular (`border-radius: 50%`) con contorno sutil, armonizando con los avatares de la lista de amigos y el pie.
- **Geometría y alineación del pie inferior (`.sidebar-user-footer` y `.chat-input-bar`):**
  - Alineación de línea base: la cápsula de usuario de la barra lateral y el dock de entrada flotante del chat ahora comparten la misma altura de `52px`, el mismo radio de borde de `14px` y el mismo offset inferior (`0.85rem`), alineándose en una cuadrícula continua a lo largo de toda la ventana.
  - Limpieza de botones de micrófono y ensordecer (`#btnDeafen`, `#btnSidebarMic`): se removieron los bordes verdes rígidos y estridentes; ahora son botones vectoriales neutros perfectamente integrados en la cápsula, con retroalimentación sutil y alerta roja monocromática al estar silenciado o ensordecido.
- **Restauración y rediseño del indicador de actualización (`#btnUpdateAvailable`):**
  - Se restituyeron los estilos y se diseñó un botón premium con icono vectorial SVG de descarga, acabado en azul eléctrico (`var(--brand-blue)`), halo de pulso sutil animado (`@keyframes updateRingPulse`) y animación de giro continuo durante la descarga (`.is-updating`). Cero estilos genéricos de navegador o IA.
- **Caché persistente y precarga instantánea de fotos de perfil:**
  - Sistema de almacenamiento en `localStorage` (bajo `llamadita.avatar_cache.v1`) que sincroniza las fotos de perfil en Base64 en memoria al arrancar la app.
  - `fotoDe()` y los contenedores de avatar ahora renderizan el `src` inmediatamente en el fotograma 0 si la imagen está en caché, eliminando por completo el parpadeo de círculos vacíos al abrir la app o cambiar de vista.
  - Descarga y actualización asincrónica en segundo plano cuando se reciben nuevas imágenes o claves.
- **Pantalla Splash de inicio (`#appLoadingSplash`) y eliminación del parpadeo de login:**
  - Se incorporó un cargador inicial elegante con el imagotipo oficial de Llamadita, resplandor ambiental amortiguado y barra de progreso fluida en azul eléctrico.
  - La verificación de sesión inicial se ejecuta de forma asíncrona tras la pantalla splash; si el usuario tiene sesión activa, el splash se desvanece suavemente directo a la interfaz del usuario autenticado, evitando cualquier parpadeo de la vista de login. Si no hay sesión, se transiciona limpiamente a la pantalla de acceso.
**Por qué.** Atender observaciones de diseño y pulido de alta precisión (nivel frontend senior): eliminar saltos y desalineaciones de cuadrícula, corregir proporciones y anclajes en burbujas de chat, devolver la identidad visual al indicador de actualización y ofrecer una carga sin destellos ni saltos visuales en avatares y sesión.
**Dónde.** `src/brand.css`, `src/style.css`, `src/social/panel.js`, `src/social/adjuntos.js`, `src/main.js`, `index.html`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `npm run build` y corroborar que compila correctamente.
2. Ejecutar `npm run verificar` y constatar cumplimiento del protocolo.
3. Abrir la app:
   - Constatar que la pantalla de inicio muestra la splash con logo y barra de carga sin parpadear la pantalla de inicio de sesión.
   - Observar que las fotos de perfil cargan al instante sin recuadros vacíos.
   - Verificar la alineación milimétrica continua entre la cabecera lateral y la cabecera de chat (ambas a 64px, misma línea divisoria).
   - Verificar que los mensajes propios en el chat no repiten el nombre ni el avatar del usuario dentro de la burbuja, mostrando el texto limpio y la hora alineada a la derecha.
   - Constatar la alineación de altura y línea base inferior entre la cápsula de usuario y la barra de input del chat (ambas a 52px de altura y radio 14px).

### 0.24.5A · 2026-09-24 · Antigravity
**Qué cambió.** Overhaul visual Fase 2 — Rediseño integral de la cabecera de chat, burbujas de mensajes ergonómicas y barra de entrada en cápsula dock flotante:
- **Cabecera de conversación (`.chat-header`):**
  - Superficie translúcida con desenfoque de fondo (`backdrop-filter: blur(16px)`), borde inferior con rim light e iluminación sutil.
  - Distinción visual inmediata entre tipos de conversación:
    - Canal de texto: icono `#` vectorial en cápsula squircle azul eléctrico suave (`rgba(91, 124, 250, 0.12)`).
    - Canal de voz: icono vectorial de altavoz/onda acústica (eliminación del emoji `🔊`).
    - Chat privado (DM): avatar del amigo o iniciales tipográficas, display name, arroba `@usuario` y punto de estado en tiempo real (en línea, ausente, no molestar, desconectado).
  - Botones de acción unificados y vectoriales:
    - "Copiar código": botón ghost con icono SVG y feedback instantáneo interactivo "¡Copiado!".
    - "Entrar a voz": botón azul eléctrico con icono de voz para canales de audio.
    - "Llamar": botón verde esmeralda con estado activo que conmuta a "Colgar" en rojo al estar en llamada.
    - "Salir": botón cerrar minimalista con icono SVG.
    - Menú de opciones: desplegable flotante para búsqueda en el chat y duración de mensajes con vectoriales monocromáticos.
- **Buscador de historial integrado en cabecera (`.chat-buscador`):**
  - Despliegue animado desde la cabecera con icono SVG, campo de texto enfocado, contador de resultados y botón de cierre.
- **Burbujas de conversación ergonómicas (`.sc-msg`):**
  - **Erradicación de paleta violeta/AI-slop:** Reemplazados todos los degradados púrpuras heredados (`#7c3aed`, `#a855f7`, `#c084fc`, `#c4b5fd`) por la paleta oficial de Llamadita (Navy Profundo `#070b18`, Navy Superficie `#131b35`, Azul Eléctrico `#5b7cfa`, Azul Suave `#8fa6ff` y Crema Cálido `#f4ecdc`).
  - **Identidad en cada mensaje:** Incorporación del avatar del emisor (`.sc-msg-avatar`) y encabezado con nombre visible en Google Sans Flex (`font-weight: 680`) y hora legible (`hh:mm`).
  - **Diferenciación direccional:** Los mensajes propios (`.mine`) se alinean a la derecha con degradado azul eléctrico profundo y radio asimétrico (`16px 16px 4px 16px`), mientras que los ajenos se alinean a la izquierda con fondo navy superficie y radio (`16px 16px 16px 4px`).
  - **Sello de fijado vectorial:** Banner ámbar sutil con icono de chincheta SVG (sin emoji `📌`).
  - **Citas y respuestas (`.sc-cita`):** Tarjetas con borde izquierdo en azul eléctrico y enlace directo al mensaje referenciado.
  - **Cápsula flotante de acciones (`.sc-msg-acciones`):** Barra en píldora con desenfoque de fondo y botones vectoriales SVG para reaccionar (sonrisa SVG), responder (flecha curva SVG), fijar/desfijar (chincheta SVG), editar (lápiz SVG) y borrar (papelera SVG). Cero emojis en controles de interfaz.
  - **Reacciones interactivas (`.sc-reaccion`):** Píldoras con contador y realce en azul eléctrico cuando el usuario local reaccionó.
  - **Adjuntos:** Previsualizaciones de fotos con radio moderno y botón de descarga para archivos con icono vectorial SVG.
- **Cápsula dock flotante de entrada (`.chat-dock-container`, `.chat-input-bar`):**
  - La barra de entrada ya no es una franja plana rígida pegada al fondo; ahora es una cápsula monolítica flotante con desenfoque cristal (`backdrop-filter: blur(20px)`), elevación física y contorno luminoso interactivo al enfocar (`:focus-within`).
  - Botón de adjuntar (`#btnChatAdjuntar`) circular con icono de clip SVG.
  - Campo de texto limpio sin bordes invasivos.
  - Botón de envío (`#btnSendMessage`) ergonómico en azul eléctrico con icono de avión de papel SVG y micro-física de pulsación.
  - Bandeja flotante de respuesta (`#chatRespondiendo`) y archivos pendientes (`#chatAdjuntos`) integrados directamente sobre la cápsula.
  - Cartel de arrastrar y soltar (`#chatSoltar`) rediseñado con borde punteado azul eléctrico y desenfoque.
**Por qué.** Ejecutar la Fase 2 del overhaul visual del cliente, transformando la experiencia central de chat y comunicación en una interfaz de escritorio moderna, fluida y ergonómica, respetando las leyes de diseño y eliminando por completo cualquier vestigio de estética genérica o clichés de IA.
**Dónde.** `index.html`, `src/brand.css`, `src/social/social.css`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `npm run build` y corroborar compilación exitosa sin advertencias.
2. Ejecutar `npm run verificar` y validar salida 0.
3. Abrir la aplicación y verificar la vista de chat:
   - En canales de texto, constatar el squircle `#` azul en la cabecera, título y badge de tipo.
   - En canales de voz, constatar el icono vectorial de altavoz en el título y el botón "Entrar a voz".
   - En chats privados (DM), constatar el avatar del amigo, nombre, arroba y el punto de estado en vivo con etiqueta (En línea, etc.).
   - Probar el botón "Copiar código" y verificar que conmuta a "¡Copiado!" con icono check durante 1,5 segundos.
   - Verificar las burbujas de chat: avatar del autor a la izquierda en ajenos y a la derecha en propios, tipografía Google Sans Flex, hora, citas y reacciones.
   - Pasar el cursor sobre un mensaje y verificar la cápsula flotante de acciones: iconos SVG nítidos para reaccionar, responder, fijar, editar y borrar (sin emojis).
   - Verificar la barra de entrada al pie: cápsula flotante con botón clip, campo de texto, botón Enviar con avión de papel SVG y efecto `:focus-within`.

### 0.24.4B · 2026-09-24 · Antigravity
**Qué cambió.** Corrección de incongruencias visuales en la barra lateral, modales de pantalla centrados con wizard de creación de canal y menús contextuales vectoriales sin emojis:
- **Modales centrados con backdrop blur:**
  - Reemplazo de los popovers compactos de la barra lateral por modales centrados (`.app-modal-overlay` con `backdrop-filter: blur(10px)`) para "Crear o unirse a canal" (`#modalChannelOverlay`) y "Agregar amigo" (`#modalFriendOverlay`), resolviendo el corte y desbordamiento de botones en anchos estrechos.
  - Cierre intuitivo mediante botón cerrar `✕`, clic en el fondo difuminado o tecla `Escape`.
- **Wizard paso a paso para creación de canales:**
  - **Paso 1:** Selección clara entre dos tarjetas interactivas: "Canal de Texto" (`#`) con iconografía vectorial y descripción de chat y multimedia, o "Canal de Voz" (micrófono vectorial) con descripción de llamadas en vivo y baja latencia.
  - **Paso 2:** Configuración del canal con nombre, prefijo dinámico según el tipo seleccionado y límite visible de 30 caracteres.
  - **Flujo de unión por código:** Acceso directo con enlace "Unirse con un código de invitación" y regreso simple al paso anterior.
- **Erradicación total de emojis en menús contextuales:**
  - Reemplazo de emojis de colores (👤, 💬, 📞, 🔕, 🗑️, 🚪, ⏱️, 📅) por iconos vectoriales SVG monocromáticos (`ICONO_USUARIO`, `ICONO_CHAT`, `ICONO_TELEFONO`, `ICONO_CAMPANA_ACTIVA`, `ICONO_BASURA`, `ICONO_SALIR`, `ICONO_RELOJ`, `ICONO_CALENDARIO`) en los menús de click derecho de canales y amigos.
  - Estilización flotante premium (`.channel-context-menu`) con animación de entrada, desenfoque de fondo y microinteracciones de selección.
- **Corrección de líneas superpuestas y radio de bordes:**
  - Eliminación del artefacto rectangular `::before` en `.sidebar-channel-item.active` que cortaba la curvatura del borde redondeado; ahora utiliza realce suave de superficie y resplandor sutil.
  - Rediseño de la cápsula de usuario (`.sidebar-user-footer`) unificando radios de borde (12px exterior, 8px interior) y eliminando los bordes verdes duros en botones de audio en favor de divisores sutiles y estados activos integrados.
**Por qué.** Atender las correcciones estéticas observadas en las capturas de usuario (líneas montadas sobre curvas, botones con bordes disonantes, popovers estrechos que cortaban texto y necesidad de un flujo guiado paso a paso para crear canales sin sobrecargar la interfaz).
**Dónde.** `index.html`, `src/brand.css`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `npm run build` y constatar compilación limpia sin advertencias.
2. Ejecutar `npm run verificar` y validar salida 0.
3. Abrir la app:
   - Al hacer clic en el botón `+` de Canales, se despliega el modal en el centro de la pantalla mostrando el Paso 1 (selección entre tarjeta Texto o Voz). Al elegir una, avanza al Paso 2 para ingresar el nombre. Probar también el enlace "Unirse con un código de invitación".
   - Al hacer clic en el botón `+` de Amigos, se abre el modal centrado con buscador amplio y resultados con avatar y botón "Agregar".
   - Cerrar ambos modales con `Escape`, clic afuera o botón `✕`.
   - Hacer clic derecho en un canal o amigo y verificar que todas las opciones exhiben iconos SVG monocromáticos sin emojis.
   - Observar los canales activos y comprobar que no hay líneas rectangulares cortando los bordes redondeados.
   - Verificar la cápsula de usuario y los botones de micrófono y ensordecer sin bordes verdes ruidosos.

### 0.24.4A · 2026-09-24 · Antigravity
**Qué cambió.** Overhaul visual Fase 1 — Sistema de tokens de diseño, nueva Barra Lateral premium y cápsula ergonómica de usuario:
- **Erradicación de estética de IA y slop visual:**
  - Eliminación total de emojis en componentes de control y navegación (sustituidos por iconos vectoriales SVG limpios y nítidos: más, altavoz, numeral, teléfono, campana silenciada).
  - Eliminación de gradientes violeta-cian SaaS genéricos (`#7c3aed`, `#a855f7`) en toda la aplicación, reemplazados por la paleta oficial de Llamadita: Navy Profundo (`#070B18`), Navy Base (`#0A0F22`), Navy Sidebar (`#0D1326`), Navy Superficie (`#131B35`), Azul Eléctrico (`#5B7CFA`), Azul Suave (`#8FA6FF`) y Crema Cálido (`#F4ECDC`).
  - Eliminación de sombras y resplandores difusos descontrolados, reemplazados por elevación física calibrada (sombras de oclusión ambiental y rim light superior `inset 0 1px 0 rgba(255,255,255, 0.12)`).
- **Nueva Barra Lateral y Popovers flotantes:**
  - Reemplazo de formularios expansivos rígidos que deformaban la lista vertical por Popovers flotantes (`.sidebar-popover`) con `backdrop-filter: blur(14px)`, elevación multicapa y cierre con botón `✕`, clic exterior o tecla `Escape`.
  - Pestañas ergonómicas para alternar entre "Crear nuevo" y "Unirse con código" en canales.
  - Buscador de amigos flotante con autofocus automático y resultados estilizados.
  - Títulos de sección limpios ("Canales" y "Amigos" con tipografía variable Google Sans Flex).
- **Cápsula de usuario y controles de audio unificados:**
  - El pie de usuario ahora es una cápsula monolítica integrada (`#sidebarUserFooter`) con hover coordinado, estado activo y separación física clara entre identidad y controles de voz.
  - Botones de ensordecer (`#btnDeafen`) y silenciar micrófono (`#btnSidebarMic`) rediseñados con vectoriales SVG, micro-física de pulsación `:active` y respuesta de estado limpia.
- **Sistema de diseño modular unificado en `src/brand.css`:**
  - Consolidación de variables CSS de elevación, transiciones con curvas Bézier naturales, tipografía responsiva y componentes reutilizables sin fugas de especificidad.
**Por qué.** Iniciar el overhaul integral de Llamadita alejándose de la estética de proyecto básico y de patrones cliché de IA, ofreciendo una experiencia de escritorio de nivel de producción, con principios sólidos de ergonomía visual (Hick, Fitts, Gestalt) y máximo rendimiento.
**Dónde.** `src/brand.css`, `src/style.css`, `index.html`, `src/social/social.css`, `src/social/panel.js`, `src/components/visualizer.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar` y constatar código de salida 0.
2. Compilar con `npm run build` verificando que no existan errores ni advertencias de empaquetado.
3. Abrir la app y comprobar la barra lateral:
   - Los títulos dicen "Canales" y "Amigos" con iconos "+" limpios en SVG.
   - Al pulsar "+" en canales o amigos, se abre el popover flotante sin empujar hacia abajo la lista.
   - Probar alternar pestañas en creación/unión de canal y cerrar con `✕`, clic afuera o `Escape`.
   - Verificar la cápsula de usuario al pie y la interacción de los botones de audio.
   - Comprobar la ausencia total de gradientes morados en controles e inputs.

### 0.24.3E · 2026-09-23 · Antigravity
**Qué cambió.** Rediseño estético y funcional completo de `ProfileCard` (ReactBits) con avatar en fondo cover, holográfico arcoíris, grano satinado, destellos y tipografía variable:
- **Foto de perfil como fondo de la tarjeta:** La imagen del usuario se expande a pantalla completa dentro de la tarjeta (`background-size: cover`), con una viñeta oscura multicapa que garantiza legibilidad y contraste absoluto para todos los textos. Si el usuario no tiene avatar cargado, se muestra un fondo geométrico oscuro elegante con sus iniciales en marca de agua translúcida.
- **Efecto holográfico ReactBits (Foil iridiscente, ruido y destellos):**
  - **Foil arcoíris reflectivo:** Capa translúcida iridiscente reactiva con `mix-blend-mode: color-dodge` cuya posición e intensidad se modulan en tiempo real según el ángulo de inclinación 3D del cursor.
  - **Textura de grano analógico:** Capa de ruido satinado mediante filtro SVG `feTurbulence` que brinda la sensación táctil de una tarjeta coleccionable física.
  - **Destellos animados (sparkles):** Pequeños destellos vectoriales de 4 puntas en ubicaciones estratégicas con animación de respiración y flotación suave.
- **Distinciones e insignias en esquina superior izquierda (Cero emojis):**
  - Se eliminaron todos los emojis genéricos (sin ✨, 👑, 💬, 📞). En su lugar se emplean iconos vectoriales SVG limpios, minimalistas y nítidos.
  - **Aura y resplandor especial CEO:** Para `liva`, `devliva` y `dantey24`, la tarjeta adquiere un contorno dorado luminoso y un Behind Glow ámbar cálido (`rgba(251, 191, 36, 0.45)`), acompañado de la insignia con corona vectorial.
  - **Lógica Alfa Tester:** Para los usuarios fundadores (`<= 0.24.2Z`), el badge en la esquina superior izquierda muestra `Alfa Tester · v0.24.2Z` y se omite la etiqueta redundante "En Llamadita desde". Para usuarios nuevos que no cuenten con la distinción, se muestra "En Llamadita desde: v...".
- **Identidad centrada y tipografía Google Sans Flex:**
  - El nombre y `@usuario` se ubican en el centro de la tarjeta aprovechando los ejes variables de la fuente (`'wght' 780, 'wdth' 104, 'opsz' 36, 'ROND' 30`).
- **Pie de tarjeta limpio:**
  - Se removieron los botones redundantes de "Llamar" y "Enviar mensaje".
  - Se visualizan de forma limpia y condensada la fecha de membresía ("Miembro desde...") y de amistad ("Amigos desde...").
**Por qué.** Elevar el estándar estético de la aplicación eliminando elementos informales o con apariencia de IA, convirtiendo la tarjeta de perfil en un coleccionable holográfico reactivo de alta fidelidad que destaca la foto de los amigos y sus distinciones de forma elegante.
**Dónde.** `src/components/profileCard.js`, `src/components/profileCard.css`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Abrir la app en `http://localhost:3000/`, hacer clic sobre la foto de perfil de cualquier amigo en la barra lateral. Constatar que: (1) la foto del amigo aparece como fondo completo de la tarjeta con viñeta oscura; (2) al mover el cursor se percibe el foil iridiscente arcoíris, el grano satinado y los destellos flotantes; (3) en la esquina superior izquierda aparecen las distinciones con iconos SVG nítidos (sin emojis) y para `devliva`/`liva`/`dantey24` se despliega el aura dorada de CEO; (4) para los Alfa Testers no aparece "En Llamadita desde" en el pie sino solo su fecha de unión; (5) los botones de llamar/enviar mensaje ya no están presentes en la tarjeta.

### 0.24.3D · 2026-09-23 · Antigravity
**Qué cambió.** Integración del componente interactivo `ProfileCard` (ReactBits) con efecto 3D Tilt, Behind Glow, versión de origen y badges exclusivos:
- **Componente ProfileCard en JavaScript Vanilla y CSS puro (`src/components/profileCard.js` y `profileCard.css`):**
  - **Física 3D Tilt con perspectiva:** Inclinación suave y reactiva al mover el cursor por la tarjeta (`rotateX`, `rotateY`, `scale3d`) con aceleración por hardware a 60 FPS y retorno elástico al salir del foco.
  - **Behind Glow atmosférico:** Aura lumínica radial difusa detrás de la tarjeta (`behindGlowEnabled`) que acompaña la posición del cursor enriqueciendo la profundidad visual.
  - **Reflejo especular Glare:** Brillo reactivo que simula la incidencia de la luz en la superficie de la tarjeta al inclinarla.
  - **Gradiente interior personalizable:** Combinación de tonos profundos de Llamadita y gradiente translúcido (`linear-gradient(145deg, #60496e8c 0%, #71C4FF44 100%)`).
- **Versión de ingreso y badges especiales de membresía:**
  - **Versión de ingreso:** En lugar de la versión actual del cliente, se exhibe la versión desde la que el usuario está en Llamadita (`v0.24.2Z` para todos los usuarios fundadores).
  - **Badge "Alfa Tester":** Insignia cósmica destacada con borde violeta/cian y resplandor sutil para todos los usuarios con versión `<= 0.24.2Z`.
  - **Badge "CEO":** Insignia dorada exclusiva con corona (`👑 CEO`) para los usuarios `liva`, `devliva` y `dantey24`.
  - **Badge de presencia:** Indicador de estado en tiempo real (Conectado, Ausente, No molestar, Desconectado) con aro sincronizado sobre el avatar grande.
- **Acciones y datos de usuario:**
  - Botón de contacto directo ("💬 Enviar mensaje") para abrir el chat privado.
  - Botón de llamada ("📞 Llamar") activo si el usuario está conectado.
  - Fechas de ingreso y de amistad formateadas prolijamente en español.
  - Cierre intuitivo mediante botón `✕`, clic fuera de la tarjeta o tecla `Escape`.
**Por qué.** Reemplazar la ventana básica provisional por una tarjeta de presentación premium inspirada en el componente ProfileCard de ReactBits, destacando a los Alfa Testers y miembros del equipo fundador (CEO) con impacto visual de vanguardia y cero impacto de rendimiento.
**Dónde.** `src/components/profileCard.js`, `src/components/profileCard.css`, `src/social/panel.js`, `src/social/social.css`, `ESQUELETO.md`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Abrir la app (o `http://localhost:3000/`) y hacer clic en el avatar de un amigo (por ejemplo @devliva o cualquier usuario): se despliega la tarjeta 3D ProfileCard. Al mover el mouse sobre ella, la tarjeta se inclina tridimensionalmente con su reflejo glare y el glow posterior. Verificar la presencia del badge "Alfa Tester" y para devliva / liva / dantey24 el badge "CEO". Verificar que el botón "Enviar mensaje" abre el chat y "✕" o `Escape` cierran la tarjeta.

### 0.24.3C · 2026-09-23 · Antigravity
**Qué cambió.** Borde de estado dinámico en avatar de amigos, unión de foto con nombre y modal interactivo de perfil:
- **Borde de estado en avatar de amigos:** Se transformó el indicador de presencia (punto verde/amarillo/rojo/gris) en un contorno circular limpio y nítido directamente alrededor de la foto o iniciales del usuario (`border: 2px solid <color>` según estado: `#10b981` conectado, `#f59e0b` ausente, `#ef4444` no molestar, `#475569` desconectado).
- **Eliminación del punto intermedio:** Se removió el punto `.sc-dot` que quedaba entre la foto y el nombre en la barra lateral, unificando visualmente la foto y los textos de nombre y `@usuario` con espaciado natural.
- **Sectores interactivos separados:**
  - *Sector de foto (Avatar):* Al hacer clic en la foto del amigo se despliega una ventana modal con el perfil de la persona.
  - *Sector de nombre / usuario:* Al hacer clic en el nombre se abre o cierra la conversación privada de chat como habitualmente.
  - *Sector de llamada:* El botón del teléfono queda claramente separado en su propio espacio en la parte derecha para iniciar o colgar llamadas sin interferir con el chat ni el perfil.
- **Ventana de Perfil de Usuario básica y funcional:**
  - Muestra foto de perfil ampliada con su aro de estado, nombre completo, `@usuario` y badge de presencia.
  - Datos del perfil: fecha en la que se unió a Llamadita (`created_at` del perfil formateado en español), fecha de amistad y versión de la aplicación.
  - Acciones rápidas: "💬 Enviar mensaje" (abre el chat privado) y "📞 Llamar" (inicia llamada si el usuario está conectado).
  - Cierre intuitivo mediante botón "✕", clic fuera del modal o presionando la tecla Escape.
  - También disponible desde el menú contextual (clic derecho sobre el amigo -> "👤 Ver perfil").
**Por qué.** Solicitud de Juan para modernizar la lista de amigos eliminando el punto intermedio redundante, destacando el estado sobre el avatar y permitiendo consultar la tarjeta/perfil del amigo antes de integrar una plantilla de tarjeta enriquecida.
**Dónde.** `src/social/panel.js`, `src/social/api.js`, `src/social/social.css`, `src/style.css`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Abrir la aplicación y observar la lista de amigos en la barra lateral: la foto tiene el borde del color de su estado y el nombre se ubica junto a ella sin ningún punto en el medio. Hacer clic en la foto de un amigo: se abre la ventana emergente con su perfil, fecha de unión, arroba, versión y botones de acción. Hacer clic en el nombre: abre el chat privado. Hacer clic en el teléfono: llama. Presionar Escape o hacer clic fuera: cierra el perfil.

### 0.24.3B · 2026-09-23 · Antigravity
**Qué cambió.** Modernización de las cabinas de llamada e integración del componente interactivo `ElasticSlider` (ReactBits):
- **Liberación de la caja rígida:** Se eliminó el contenedor rectangular encerrado `.booth-controls-section`, integrando los controles de manera orgánica, limpia y aireada en la parte inferior de las tarjetas de los participantes.
- **Componente ElasticSlider en JavaScript vanilla y CSS puro:**
  - Adaptación 100% libre de dependencias pesadas basada en el componente de ReactBits, con física elástica (`decay` sigmoidal) y animación de resorte amortiguado (spring bounce) al soltar.
  - Expansión de altura suave (de 7px a 11px) al pasar el cursor o arrastrar (`pointerdown` con `setPointerCapture`).
  - Animación elástica lateral de estiramiento horizontal (`scaleX`, `scaleY`, `transformOrigin`) y desplazamiento/escala reactiva de los iconos laterales.
- **Control de Ganancia / Sensibilidad Local (Tú):** Rango de 50% a 350% con iconos de micrófono mínimo/máximo interactivos y porcentaje dinámico en tiempo real.
- **Control de Volumen Remoto (Amigo):** Rango de 0% a 100% con icono izquierdo interactivo que actúa como botón de mute/desmuteo rápido (con cambio dinámico de icono y estado tachado en rojo) e icono derecho para volumen máximo.
**Por qué.** La caja rígida anterior y el input tipo range por defecto resultaban toscos y visualmente pesados. El nuevo deslizador elástico aporta un acabado prémium y fluido acorde al resto de la aplicación.
**Dónde.** `src/components/elasticSlider.js`, `index.html`, `src/style.css`, `src/main.js`, `ESQUELETO.md`, `package.json`.
**Cómo se verifica.** Entrar a una llamada (o emular vista de llamada): observar las tarjetas de audio sin marcos rígidos al pie. Deslizar la ganancia propia o el volumen del amigo observando la animación elástica que se estira y rebota al sobrepasar los bordes. Tocar el altavoz izquierdo del amigo para silenciarlo instantáneamente.

### 0.24.3A · 2026-09-23 · Antigravity
**Qué cambió.** Minimizado y ocultamiento al System Tray (bandeja del sistema / menú oculto de la barra de tareas) al hacer clic en la "X":
- **Comportamiento de la "X" (Cerrar):** Al hacer clic en el botón cerrar ("X") de la ventana, la aplicación ya no finaliza su proceso bruscamente. En su lugar, intercepta el evento `windowClose` y oculta la ventana (`nl.window.hide()`).
- **Oculto y limpio en la barra de tareas:** La ventana desaparece por completo de la pantalla y de la barra de tareas de Windows (`exitProcessOnClose: false`), manteniéndose en ejecución en segundo plano para seguir recibiendo llamadas, mensajes y notificaciones sin estorbar.
- **Bandeja del sistema (System Tray):** Se configuró el icono de bandeja con menú contextual nativo conteniendo:
  - *Abrir Llamadita* (restaura y enfoca la ventana en primer plano preservando si estaba maximizada).
  - *Separador*.
  - *Salir de Llamadita* (cierra efectivamente el proceso de la aplicación).
**Por qué.** Permitir que el usuario cierre la ventana principal para no tenerla ocupando espacio visual en la barra de tareas mientras juega o trabaja, manteniéndose conectado en segundo plano.
**Dónde.** `desktop/neutralino.config.json`, `src/main.js`, `desktop/resources/js/main.js`, `package.json`.
**Cómo se verifica.** Iniciar la app de escritorio, hacer clic en la "X" superior derecha: la ventana desaparece de la pantalla y de la barra de tareas, quedando en el menú oculto de la bandeja del sistema. Al hacer clic derecho en el ícono de la llamita y elegir "Abrir Llamadita", la ventana se restaura enfocada. Al elegir "Salir de Llamadita", el proceso termina.

### 0.24.2Z · 2026-09-23 · Antigravity
**Qué cambió.** Eliminación de efectos de resplandor (glow/blur) en botones y marca para máxima nitidez y legibilidad:
- **Botones de audio de escritorio (auriculares y micrófono):** Se retiró el `box-shadow` difuso verdoso de `.sidebar-mic-btn` activo y silenciado, dejándolos con bordes finos, sólidos y limpios alineados a la paleta de marca.
- **Tipografía de marca Llamadita (web):** Se eliminó el `text-shadow` que generaba un halo borroso en el logotipo tanto de la cabecera superior como del pie de página, logrando que Google Sans Flex se lea con nitidez impecable.
- **Marca de escritorio:** Se aseguró `text-shadow: none` en `.logo-title` para evitar cualquier artefacto de difuminado.
**Por qué.** El resplandor difuminaba los bordes de los glifos de la marca y de los iconos de los controles de audio, perjudicando el contraste y la legibilidad sobre fondos oscuros.
**Dónde.** `src/style.css`, `src/brand.css`, `web/css/site.css`.
**Cómo se verifica.** Inspeccionar visualmente el botón de auriculares/micrófono en la app de escritorio y el nombre "Llamadita" en el encabezado y pie de página web; ambos se muestran nítidos sin halos difusos.

### 0.24.2Y · 2026-09-22 · Antigravity
**Qué cambió.** Página dedicada de Licencias y Código Abierto y modernización tipográfica integral con Google Sans Flex modulando sus 6 variables:
- **Página de Licencias de Código Abierto (`/licencias/`):** Catálogo exhaustivo de atribución y reconocimiento a la comunidad open-source para todas las dependencias: Neutralinojs (MIT), PeerJS (MIT), Supabase Client (MIT), Vite (MIT), rcedit (MIT), Google Sans Flex (SIL OFL 1.1), JetBrains Mono (SIL OFL 1.1), Inter (SIL OFL 1.1), Outfit (SIL OFL 1.1), Lucide / Feather Icons (ISC/MIT) y estándares abiertos W3C/IETF (WebRTC, Web Audio API, Web Cryptography). Textos legales completos integrados.
- **Enlace de Licencias en todos los footers:** Incorporación de *Licencias de Código Abierto* en la columna *Legal y Privacidad* de todas las páginas web (`/`, `/privacidad/`, `/terminos/`, `/cookies/`, `/reembolsos/`, `/entrar/`).
- **Tipografía Variable Google Sans Flex (6 Ejes):** Adopción de Google Sans Flex como tipografía principal tanto en la web como en la app de escritorio para Windows, modulando sus 6 variables:
  - `wght` (grosor 1..1000): jerarquía balanceada desde 420 en texto corrido hasta 840 en titulares.
  - `wdth` (ancho 25..151): 104% en marca para presencia sólida; 96..98% en pantallas pequeñas para prevenir saltos de línea indeseados o cortes.
  - `opsz` (tamaño óptico 6..144): ajuste óptico automático acorde al tamaño de renderizado (14px en badges, 64px en hero).
  - `slnt` (inclinación -10..0): -7 grados en acentos y citas dinámicas.
  - `GRAD` (grado 0..100): compensación de contraste de trazo en fondos oscuros Dark Studio sin alterar el flujo del texto.
  - `ROND` (redondez 0..100): terminales amables y cálidos (65..85%) afines al avatar de la llamita.
- **Autosuficiencia Offline en la App:** Archivos `.woff2` locales empaquetados en `src/fonts/` y `web/fonts/` con `@font-face` nativo y cache inmutable en Cloudflare (`_headers`), asegurando carga instantánea incluso sin conexión a internet.
- **Blindaje antidesbordes y adaptabilidad:** Reglas con `overflow-wrap: break-word`, `text-wrap: balance` y presets móviles dedicados.
**Por qué.** Reconocer formalmente los derechos de autor y licencias de las tecnologías libres utilizadas e impregnar de personalidad visual la aplicación y el sitio con una tipografía variable expresiva y fluida.
**Dónde.** `web/licencias/index.html`, `web/css/site.css`, `src/brand.css`, `src/style.css`, `web/_headers`, `vite.config.js`, páginas HTML y package.json.
**Cómo se verifica.** Navegar a `/licencias/` y observar la tabla de dependencias y textos de licencia; verificar en el inspector que la tipografía computada es Google Sans Flex con `font-variation-settings`.

### 0.24.2X · 2026-09-22 · Antigravity
**Qué cambió.** Corrección y blindaje del pie de página (footer) y banner de cookies en la web oficial:
- **Reseteo y estilos estrictos del footer:** Se eliminaron las viñetas por defecto (`list-style: none !important; margin: 0 !important; padding: 0 !important;`) y se agregaron estilos inline defensivos en todas las listas del footer para evitar visualización rota en caso de demoras en carga de estilos.
- **Limpieza de reglas CSS duplicadas:** Se removió la regla heredada antigua `.footer` y se consolidó el nuevo diseño de 3 columnas (`.footer-grid`) con separación clara, tipografía jerárquica y márgenes inferiores de seguridad para que el banner flotante de cookies nunca tape los datos legales.
- **Cache-busting riguroso (`?v={{VERSION}}`):** Se versionaron todas las referencias a `/css/site.css` y scripts en todas las páginas HTML (`index.html`, `/privacidad/`, `/terminos/`, `/cookies/`, `/reembolsos/`, `/entrar/`), garantizando que navegadores y proxies sirvan la última versión al instante sin retener CSS viejo de 4 horas en caché de disco.
- **Encabezados Cloudflare (`_headers`):** Se configuró `Cache-Control: public, max-age=0, must-revalidate` para `/css/*` y `/js/*`, asegurando revalidación inmediata en cada despliegue.
- **Soporte de assets web en Vite local:** Se incorporó middleware de desarrollo en `vite.config.js` para servir `/css/`, `/js/`, `/brand/` y `/web/` correctamente sin caer en fallback SPA.
- **Inspección visual automatizada:** Se verificó la renderización real con navegador headless previo al despliegue, confirmando columnas horizontales sin viñetas y banner flotante con desenfoque y márgenes adecuados.
**Por qué.** En navegadores con el CSS antiguo en caché o en rutas directas sin bundle, el footer se mostraba como una lista vertical sin estilos con viñetas por defecto y el banner de cookies estirado horizontalmente.
**Dónde.** `web/css/site.css`, `web/_headers`, `vite.config.js`, `web/index.html`, `web/privacidad/index.html`, `web/terminos/index.html`, `web/cookies/index.html`, `web/reembolsos/index.html`, `web/entrar/index.html`, `package.json`.
**Cómo se verifica.** Abrir la web y navegar al pie de página: se observan las 3 columnas organizadas horizontalmente sin viñetas, pie de copyright visible y banner de cookies flotante estilizado.

### 0.24.2W · 2026-09-22 · Antigravity
**Qué cambió.** Blindaje legal integral, privacidad, accesibilidad WCAG 2.1 AA, transparencia y consentimiento informado:
- **Páginas legales dedicadas:**
  - **Política de Privacidad (`/privacidad/`):** Redactada en estricto cumplimiento con la **Ley N° 25.326 de Protección de Datos Personales (Argentina)**, leyenda legal reglamentaria de la **Agencia de Acceso a la Información Pública (AAIP)**, ejercicio de derechos ARCO gratuitos y alineación con GDPR. Especificación de que las llamadas de voz son P2P y **no se graban ni almacenan**, y de que la autenticación es sin contraseñas (OTP).
  - **Términos y Condiciones de Uso (`/terminos/`):** Normas de conducta, propiedad intelectual, limitación de responsabilidad y jurisdicción exclusiva en los Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires (República Argentina).
  - **Política de Cookies y Almacenamiento Local (`/cookies/`):** Transparencia total sobre el uso de almacenamiento local técnico (token de sesión de Supabase Auth y preferencias de audio). Certificación de **cero cookies publicitarias y cero rastreadores de terceros** (sin Google Analytics ni Meta Pixel).
  - **Política de Reembolsos, Cancelaciones y Baja (`/reembolsos/`):** Declaración de gratuidad del servicio, derecho de revocación / arrepentimiento legal de 10 días (conforme a la **Ley N° 24.240 de Defensa del Consumidor** y Res. 424/2020) y procedimiento directo para solicitar la baja definitiva de cuenta y supresión de datos.
- **Consentimiento informado en formularios:**
  - Casilla de verificación obligatoria en el formulario de registro web y en la app de escritorio: *"He leído y acepto los Términos y Condiciones y la Política de Privacidad"*.
  - Validación antes del envío con mensajes accesibles para lectores de pantalla (`role="alert"` y `aria-live="polite"`).
- **Banner de cookies y almacenamiento local:**
  - Componente accesible e informativo (`cookies.js`) con persistencia en `localStorage` y botón de aceptación.
- **Accesibilidad (WCAG 2.1 Nivel AA) y navegación por teclado:**
  - Enlace de salto accesible (`.skip-link`) al contenido principal en todas las páginas.
  - Textos alternativos descriptivos en todas las imágenes y logos (`alt="Logotipo oficial de Llamadita"`).
  - Ajuste de contraste en tipografías secundarias (`--text-muted` elevado a `#9AA7D7`, superando el ratio de 5.4:1 contra el fondo oscuro).
  - Foco visible destacado (`:focus-visible`) en todos los controles interactivos.
  - Textos claros y específicos en botones: *"Bajar Llamadita para Windows (64-bit)"*, *"Crear cuenta gratuita"*, *"Verificar código y entrar"*.
- **Auditoría de afirmaciones comerciales:**
  - Corrección de promesas absolutas no demostrables: reemplazo de *"0% packet loss"* en la maqueta por *"Audio estéreo · Conexión directa P2P"*.
- **Pie de página ampliado y accesible:**
  - Estructura semántica con enlaces a las 4 políticas legales, canales de contacto (`contacto@llamadita.com.ar`, `privacidad@llamadita.com.ar`) y referencias legales de Argentina.
- **Acceso legal en la App de escritorio:**
  - Enlace a los Términos, Privacidad, Cookies y Reembolsos incorporado en la pestaña "Ajustes" de la aplicación.
**Por qué.** Evitar riesgos legales y regulatorios, garantizar la transparencia y la privacidad por diseño, cumplir con las leyes de defensa del consumidor y protección de datos personales de Argentina, y asegurar una accesibilidad universal óptima.
**Dónde.** `web/privacidad/index.html`, `web/terminos/index.html`, `web/cookies/index.html`, `web/reembolsos/index.html`, `web/index.html`, `web/entrar/index.html`, `web/css/site.css`, `web/js/cookies.js`, `web/js/registro.js`, `src/social/panel.js`, `scripts/build-web.mjs`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Todas las páginas legales cargan en `/privacidad/`, `/terminos/`, `/cookies/` y `/reembolsos/`. El formulario de registro no permite continuar sin aceptar los términos. El banner de almacenamiento se muestra al ingresar por primera vez. Las imágenes tienen texto alternativo y se puede navegar toda la web únicamente con el teclado.

---

### 0.24.2V · 2026-09-21 · Antigravity
**Qué cambió.** Experiencia 100% nativa de aplicación de escritorio y actualización del ícono de Windows:
- **Apariencia nativa de aplicación de escritorio:**
  - Se eliminó el menú contextual genérico del navegador (Edge/WebView2: "Atrás", "Recargar", "Inspeccionar", "Imprimir").
  - Se conserva el menú nativo únicamente en campos editables (`<input>`, `<textarea>`) para permitir Copiar/Cortar/Pegar con normalidad, y se respetan los menús propios de la aplicación (canales y amigos).
  - Se deshabilitó la selección accidental de texto (`user-select: none`) en toda la interfaz (botones, barras de navegación, cabeceras, tarjetas), permitiendo seleccionar texto únicamente dentro del cuerpo de los mensajes del chat (`.sc-msg-body`) y campos de entrada.
  - Se bloqueó el arrastre fantasma de imágenes y enlaces (`-webkit-user-drag: none`).
  - Se interceptaron atajos de teclado propios de navegadores web (`F5`, `Ctrl+R`, `Ctrl+P`, `F7`, `Ctrl+U`) para evitar recargas accidentales durante llamadas o chats.
  - Se estilizaron las barras de desplazamiento (scrollbars) globales con un diseño oscuro, estilizado y minimalista.
- **Actualización del ícono de escritorio y de sistema:**
  - Se generó el nuevo archivo multi-resolución `app.ico` (256, 128, 64, 48, 32, 16) con el logo oficial de la marca (la llama con auriculares sobre fondo squircle navy).
  - Se incrustó el nuevo ícono en el binario ejecutable (`Llamadita-win_x64.exe` y en las instalaciones de AppData) mediante `rcedit`.
  - Se actualizaron los accesos directos de Escritorio y Menú Inicio apuntando al nuevo ícono y ejecutable.
**Por qué.** La aplicación dejaba seleccionar elementos gráficos o abrir menús de navegador web (como Inspeccionar o Recargar), dando la sensación de ser una página web dentro de una ventana en lugar de un software de escritorio nativo. Además, el acceso directo y el ejecutable aún tenían el ícono de perfil viejo en vez del nuevo isotipo de marca.
**Dónde.** `src/style.css`, `src/social/social.css`, `src/main.js`, `desktop/resources/icons/app.ico`, `desktop/resources/icons/appIcon.png`, `desktop/resources/icons/trayIcon.png`, `scripts/generar-icono.ps1`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Al hacer clic derecho o arrastrar en la interfaz no aparece menú de navegador ni se resalta texto en azul, pero sí se puede seleccionar y copiar el texto de los mensajes. El acceso directo del escritorio y el ejecutable muestran el nuevo ícono oficial.

---

### 0.24.2U · 2026-09-20 · Antigravity
**Qué cambió.** Eliminación de ventana CMD y preservación de ventana maximizada al hacer clic en notificación:
- **Ejecución 100% silenciosa con VBScript (`abrir-enlace.vbs`):** Se reemplazó la invocación via `cmd /c` por `wscript.exe //B //Nologo "abrir-enlace.vbs" "%1"`. Esto erradica por completo la ventana de consola negra parpadeante y previene el cuadro de diálogo de error de Windows *"No se puede encontrar el archivo... Llamadita.exe"*.
- **Preservación de ventana maximizada:** Al hacer clic en una notificación nativa, la app ya no fuerza una restauración que achique la ventana a su tamaño predeterminado (`SW_RESTORE`). Se detecta si la app estaba maximizada (`isMaximized()` y `localStorage`) y se conserva su estado en pantalla completa sin deformar la ventana.
**Por qué.** El script `.cmd` viejo registrado en el sistema operativo intentaba buscar un binario con nombre desactualizado en AppData y abría una consola CMD negra, mientras que `nl.window.unminimize()` desmaximizaba la ventana a tamaño 1240x820.
**Dónde.** `src/social/deeplink.js`, `scripts/build-desktop.mjs`, `installer.iss`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Al hacer clic en el toast de Windows con la ventana maximizada, la app pasa al frente sin abrir ninguna ventana de consola negra, sin mensajes de error y manteniéndose maximizada.

---

### 0.24.2T · 2026-09-20 · Antigravity
**Qué cambió.** Solución completa y robusta de notificaciones nativas en Windows (Toast WinRT con avatar y nombre de app):
- **Caché y soporte de avatar en Toast WinRT:** Las aplicaciones Win32 clásicas no descargan imágenes remotas en notificaciones Toast; requieren archivos locales en disco. El notificador ahora descarga automáticamente el avatar a `%TEMP%\llamadita_cache\` y lo vincula como `appLogoOverride` circular en el Toast, mostrando la foto del remitente.
- **Payload JSON libre de errores de escape:** Se desacopló la lógica de invocación escribiendo un archivo JSON temporal con los datos del mensaje. Esto elimina cualquier problema con caracteres especiales, comillas, ampersands de URLs firmadas o emojis en el XML de WinRT.
- **Detección precisa de ventana en segundo plano:** Se implementó `isAppInForeground()` combinando `document.hasFocus()`, eventos `window.onfocus/onblur`, `visibilitychange` y `nl.window.isMinimized()`, corrigiendo el falso foco permanente que suprimía notificaciones cuando la app estaba minimizada o en segundo plano.
- **Deep link instantáneo:** `abrir-enlace.cmd` escribe tanto en la carpeta local como en `%TEMP%\llamadita_enlace.txt` y soporta tanto `Llamadita-win_x64.exe` como `Llamadita.exe`, con polling a 500ms para traer la app al frente y abrir el chat de inmediato al hacer clic en el cartel.
**Por qué.** Las notificaciones en versiones anteriores fallaban por error de parsing XML con los `&` de las URLs de avatar en R2, la falta de soporte de imágenes remotas en Win32 toasts y una detección de foco defectuosa.
**Dónde.** `desktop/resources/scripts/send-notification.ps1`, `src/main.js`, `src/social/panel.js`, `src/social/deeplink.js`, `scripts/build-desktop.mjs`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Minimizando la app o estando en otra ventana y enviando un mensaje desde otra cuenta: el cartel de Windows aparece en la esquina con el nombre "Llamadita", el nombre del autor, su foto circular y el texto del mensaje, y al hacer clic abre la ventana y navega al chat.

---

### 0.24.2S · 2026-09-19 · Antigravity
**Qué cambió.** Toast nativo de Windows con nombre "Llamadita" usando archivo temporal en lugar de EncodedCommand:
- **Toast WinRT vía archivo temporal:** Se reescribió `showNativeDesktopNotification` en `src/main.js` para que en Neutralino escriba el script de PowerShell a un archivo `.ps1` en `%TEMP%` con `nl.filesystem.writeFile` y lo ejecute con `powershell -File`, en lugar de intentar pasar el XML por `-EncodedCommand`. Esto elimina por completo los problemas de quoting y codificación que hacían fallar la construcción del comando, garantizando que el cartel muestre **Llamadita** como nombre de app y no *"A Neutralinojs application"*.
**Por qué.** Pasar XML con comillas dobles y atributos a través de `-EncodedCommand` con variables interpoladas de JavaScript producía errores de sintaxis en PowerShell; un archivo `.ps1` no tiene ese problema.
**Dónde.** `src/main.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Minimizar la app y enviar un mensaje: el cartel de Windows dice "Llamadita" (y no "A Neutralinojs application").

---

### 0.24.2R · 2026-09-19 · Antigravity
**Qué cambió.** Corrección definitiva de notificaciones en Windows y solicitud de permisos en navegador:
- **Restauración de notificaciones nativas en Windows:** Se volvió a la API nativa `nl.os.showNotification` de Neutralino, eliminando el script experimental de PowerShell que fallaba silenciosamente por sintaxis y restricciones de AUMID. Las notificaciones ahora se emiten de manera 100% fiable e instantánea en Windows, mostrando "Llamadita" como nombre de la aplicación gracias a los metadatos PE integrados en el ejecutable.
- **Notificación al estar en otros canales o vistas:** Se eliminó la supresión general en `src/main.js` cuando la ventana tenía el foco, dejando que `src/social/panel.js` gestione con precisión la condición: solo se omite si el usuario está enfocado y leyendo exactamente ese mismo canal; si está en otro canal, en Ajustes, en bienvenida, o con la ventana minimizada/en segundo plano, la notificación se emite correctamente.
- **Permisos de notificación en web:** Se añadió la solicitud de permisos (`Notification.requestPermission()`) ante la primera interacción del usuario y al activar el interruptor de notificaciones en Ajustes, asegurando que los navegadores web permitan los avisos nativos.
**Por qué.** En la versión anterior las notificaciones a Windows dejaron de llegar por completo debido al script de PowerShell y a chequeos de foco duplicados.
**Dónde.** `src/main.js`, `src/social/panel.js`, `package.json`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Recibir un mensaje con la app minimizada o en segundo plano (o estando en otro canal con la app en foco): la notificación nativa de Windows aparece en la esquina inferior derecha con sonido y título "Llamadita". En navegador web, al hacer clic en cualquier parte se solicita permiso y luego se emiten las notificaciones web.

---

### 0.24.2Q · 2026-09-19 · Antigravity
**Qué cambió.** Notificaciones nativas con avatar y foco a chat, aviso en segundo plano, control manual de actualización y botón de reacción en esquina:
- **Notificaciones con nombre de app, avatar circular y foco al chat:** El encabezado del toast en Windows ahora muestra "Llamadita" (mediante `rcedit` en los metadatos del ejecutable PE y WinRT ToastNotifier), incorpora la foto de perfil circular del remitente y, al hacer clic en la notificación, restaura la ventana desde segundo plano/minimizado y navega directamente al canal o chat correspondiente.
- **Notificaciones en segundo plano aun con el chat abierto:** Si el usuario tiene seleccionado el chat pero la aplicación se encuentra en segundo plano, minimizada o detrás de otra ventana, el aviso sonoro y la notificación de escritorio se disparan correctamente.
- **Control manual de actualizaciones (flecha verde):** Se eliminó la instalación silenciosa automática al inicio. Ahora únicamente se enciende la flecha verde de descarga (`#btnUpdateAvailable`) en la cabecera cuando existe una versión disponible, dejando la decisión de actualizar exclusivamente en manos del usuario cuando decide tocarla.
- **Botón de reacción en esquina del mensaje sin trampas de hover:** Se reestructuraron las acciones del mensaje (`.sc-msg-acciones`) para ubicarse en la esquina superior derecha del mensaje (`[ 😊 ] [ ↩ ]`), contenidas dentro del área del mensaje para evitar pérdidas bruscas del cursor. Al pulsar `😊` (o `+` en las reacciones existentes) se abre el selector con los 6 emojis rápidos arriba y la cuadrícula completa abajo.
**Por qué.** La notificación de Windows decía "A Neutralinojs application" sin avatar y no abría el chat al tocarla; si el chat estaba en segundo plano no avisaba; la app se auto-actualizaba sin permiso del usuario; y la barra de reacciones anterior quedaba fuera del borde del mensaje en textos cortos, provocando que se cerrara abruptamente al mover el cursor hacia los emojis.
**Dónde.** `package.json`, `scripts/build-desktop.mjs`, `src/main.js`, `src/updater.js`, `src/social/deeplink.js`, `src/social/panel.js`, `src/social/social.css`, `CAMBIOS.md`, `SYNC.md`.
**Cómo se verifica.** Enviar un mensaje con la app minimizada o detrás de otra ventana: verificar que el toast dice "Llamadita", muestra el avatar y al tocarlo trae al frente la app abriendo ese chat. Comprobar que la flecha verde de actualización solo actualiza al hacerle clic. Pasar el mouse sobre un mensaje corto y hacer clic en `😊`: verificar que abre el popover con emojis rápidos y cuadrícula completa sin cerrarse al mover el mouse.

---

### 0.24.2P · 2026-09-19 · Antigravity
**Qué cambió.** Rediseño del menú de chat, barra flotante de reacciones con selector de emojis y barra de vista previa de respuestas:
- **Rediseño del menú de opciones del chat:** Se amplió el ancho del menú desplegable (`min-width: 220px; width: max-content; white-space: nowrap`), evitando que "Borrar lo mío para los dos" se parta en dos renglones. Se añadieron textos en alto contraste (`#e2e8f0`), íconos suaves en azul (#8fa6ff), acciones destructivas en rojo (#fca5a5) y una línea divisoria limpia entre opciones normales y de borrado.
- **Barra flotante de reacciones sin solapamiento:** La barra de acciones del mensaje (`.sc-msg-acciones`) ahora flota en la esquina inferior derecha (`bottom: -15px; right: 8px`) como pastilla independiente sobre fondo `#0d1326` con borde sutil y sombra. Nunca más tapa el nombre del autor ni el texto del mensaje.
- **Selector completo de emojis (+):** Se agregó el botón `+` en la botonera rápida de reacciones que despliega una paleta popover con más de 80 emojis clasificados. Solo admite reacciones con emojis válidos (sin textos arbitrarios) y permite sumar o retirar reacciones fácilmente con un solo clic.
- **Barra de respuesta con cancelación:** Al pulsar "Responder" (↩), se renderiza de inmediato sobre el campo de escritura la barra con el autor, el extracto del mensaje citado y un botón visible `✕ Cancelar` que restablece el modo de mensaje regular si se decide no responder.
**Por qué.** El menú de chat se veía apretado y con saltos de línea incómodos, la botonera de reacciones tapaba el nombre del usuario emisor impidiendo leerlo, no se podía elegir un emoji fuera de los 6 por defecto, y responder a un mensaje no ofrecía confirmación visual antes de enviarlo ni forma de cancelar.
**Dónde.** `index.html`, `src/style.css`, `src/social/social.css`, `src/social/panel.js`, `package.json`.
**Cómo se verifica.** Abrir un chat y desplegar el menú de tres líneas: comprobar tamaño amplio, legibilidad y divisor. Pasar el cursor sobre un mensaje: notar que la barra de reacciones flota abajo a la derecha sin tapar el remitente. Tocar el botón `+` y elegir cualquier emoji: comprobar que se suma a las reacciones del mensaje. Tocar responder (↩): verificar que arriba del input aparece la barra azul con el autor y extracto, y hacer clic en `✕ Cancelar` para verificar que se cancela la respuesta.

---

### 0.24.2O · 2026-09-19 · Antigravity
**Qué cambió.** Notificaciones nativas de Windows/escritorio y correcciones visuales en menú de chat y selector de estado:
- **Notificaciones nativas de Windows/escritorio:** Cuando llega un mensaje o una llamada entrante y la aplicación está en segundo plano o minimizada, se emite una notificación toast nativa en la esquina inferior derecha de la pantalla con el remitente y un extracto del texto (vía `NL.os.showNotification` en Windows Neutralino y Web Notification API en navegadores). Al hacer clic en la notificación, se enfoca la app y se abre el chat.
- **Corrección de selector de estado:** Se corrigió el problema de texto blanco sobre fondo blanco en las opciones del selector de estado de usuario (`.sc-status option` y `select option`), asegurando fondo oscuro (`#0f1420`) y texto nítido en Windows y navegadores.
- **Corrección de menú de opciones de chat:** Se solucionó el error de apilamiento donde los mensajes del chat y archivos adjuntos se dibujaban por encima del menú desplegable de opciones. Se aplicó `position: relative; z-index: 50` a `.chat-header` y fondo opaco sólido con elevación `z-index: 100` a `.chat-dropdown-menu`.
**Por qué.** El usuario no recibía avisos del sistema al estar en el escritorio u otra app, el menú del chat quedaba tapado por los mensajes y las opciones del estado de usuario resultaban ilegibles.
**Dónde.** `src/main.js`, `src/social/panel.js`, `src/social/social.css`, `src/style.css`, `package.json`.
**Cómo se verifica.** Minimizar o perder foco en la app y enviar un mensaje: comprobar que Windows muestra la notificación toast nativa. Desplegar el selector de estado en el cajón de perfil y verificar opciones legibles. Abrir el menú de tres rayitas en un chat con mensajes y verificar que el menú queda 100% por encima de todos los mensajes.

---

### 0.24.2N · 2026-09-19 · Antigravity
**Qué cambió.** Aviso permanente de silenciado en todas las pantallas y actualizador con flecha verde reactiva:
- **Aviso de silenciado universal:** La detección de habla mientras estás silenciado en una llamada activa ahora se ejecuta sin importar la vista abierta (canales de texto, chats privados, standby o cabina). Se desacopló del renderizado exclusivo de las tarjetas de cabina y se añadió un intervalo de respaldo a 60ms para no interrumpirse si la ventana queda en segundo plano.
- **Actualizador con flecha verde (sin tocar el número de versión):** Al haber una actualización disponible (comprobada al abrir o notificada en vivo), aparece un botón verde con ícono de flecha de descarga en la cabecera junto al logo y la versión. Al hacer clic en la flecha, se inicia la descarga e instalación directamente sin obligar al usuario a abrir popovers ni tocar el texto de la versión.
- **Avisos de actualización en vivo (Supabase Realtime Broadcast):** Se integró un canal de broadcast en tiempo real (`llamadita-actualizaciones`). Cuando se publica una versión, se emite un broadcast automático y todos los programas abiertos reciben la notificación al instante encendiendo la flecha verde, eliminando búsquedas pesadas y constantes en segundo plano.
**Por qué.** El cartel de "Estás silenciado" dejaba de aparecer si el usuario salía de la vista de cabina durante una llamada, y actualizar requería tocar el número de versión manualmente sin enterarse en tiempo real cuando había una nueva entrega lista.
**Dónde.** `src/main.js`, `src/updater.js`, `index.html`, `src/brand.css`, `scripts/anunciar-actualizacion.mjs`, `package.json`.
**Cómo se verifica.** Estar en llamada con micrófono silenciado, cambiar a un chat de texto o standby y hablar: el aviso y la vibración en el botón de micrófono aparecen de inmediato. Ejecutar `node scripts/anunciar-actualizacion.mjs` o simular actualización para comprobar que la flecha verde se activa en la cabecera y reacciona al clic.

---

### 0.24.2M · 2026-09-19 · Antigravity
**Qué cambió.** Notificaciones globales fuera del chat, control de volumen y silenciado de chats con clic derecho:
- **Notificaciones globales:** Se agregó suscripción global a `messages` en Realtime, permitiendo que suenen las notificaciones de mensajes entrantes aunque el usuario se encuentre fuera del canal o chat directo (ej. en otro canal, en la vista inicial de bienvenida o en Ajustes).
- **Silenciado de chats y amigos con clic derecho:** Menú contextual al hacer clic derecho en canales o amigos de la barra lateral con opciones de silenciado por **1 hora**, **1 día**, **1 semana** o **Siempre**, con persistencia en `localStorage`, expiración automática, opción para reactivar y distintivo visual (🔕).
- **Controles de sonido en Ajustes:** Deslizador de volumen para timbre de llamadas (0%–100%), interruptor para activar/desactivar notificaciones sonoras, y deslizador de volumen para sonidos de mensajes (0%–100%), respetando la norma de cero textos redundantes.
**Por qué.** Permitir que el usuario se entere de nuevos mensajes sin estar obligado a mirar el chat específico, silenciar chats molestos por el tiempo deseado y calibrar el volumen del timbre y notificaciones.
**Dónde.** `src/audio/audioManager.js`, `src/main.js`, `src/social/panel.js`, `src/social/social.css`, `src/style.css`.
**Cómo se verifica.** Abrir Ajustes (avatar -> Ajustes) y probar regular los volúmenes y el switch de notificaciones. Hacer clic derecho sobre un canal o amigo y silenciar por 1 hora (comprobar que aparece el ícono 🔕 y no suena al recibir mensajes). Desactivar el silencio y comprobar que vuelve a sonar.

---

### 0.24.2L · 2026-09-19 · Antigravity
**Qué cambió.** Limpieza de textos en interfaz y establecimiento de norma de diseño de textos en el proyecto:
- Se eliminaron las explicaciones redundantes en la pestaña de Ajustes (textos obvios debajo de controles como el selector de micrófono, tono de llamada entrante y tono de mensajes).
- Se redactó la explicación del umbral de activación de voz de forma concisa, directa y user-friendly, eliminando jerga técnica innecesaria ("la compuerta").
- Se formalizó como regla en `CLAUDE.md`, `AGENTS.md` y `SYNC.md` la norma de diseño: cero textos redundantes en la interfaz y explicaciones claras sin tecnicismos.
**Por qué.** Mantener la interfaz limpia, compacta y profesional sin sobrecargar al usuario con textos obvios ni conceptos de ingeniería de audio innecesarios.
**Dónde.** `src/social/panel.js`, `CLAUDE.md`, `AGENTS.md`, `SYNC.md`.
**Cómo se verifica.** Abrir Ajustes (avatar -> Ajustes) y comprobar que las tarjetas de audio y tonos no tienen leyendas redundantes y que la explicación del umbral es concisa y clara.

---

### 0.24.2K · 2026-09-19 · Antigravity
**Qué cambió.** Incorporación del sistema de audio y ringtones oficiales de Llamadita:
- Se añadió como ringtone de llamada entrante oficial el audio descargado `llamadita-marimba-ringtone.wav` en `public/sounds/ringtone.wav`, el cual suena en bucle al recibir una llamada directa y se detiene al contestar, rechazar o vencer el tiempo de timbrado.
- Se implementó una paleta de tonos cortos, limpios y ligeros generados proceduralmente con Web Audio API (cero bloat, cero sonidos de IA, latencia instantánea) para notificaciones de mensajes entrantes de chat: Burbuja, Mini ADN (Do#-Re#), Toque de madera / Marimba, Gota de agua, Campana de cristal, Moneda 8-bit, o Silencio.
- En la pestaña "Ajustes" del cajón social se incorporaron los controles para probar el ringtone en tiempo real y seleccionar/probar el tono de mensaje preferido, guardándolo en `localStorage`.
**Por qué.** Personalizar la experiencia auditiva de Llamadita con identidad propia, ringtone melódico y avisos de chat breves sin sobrecargar la aplicación con dependencias pesadas ni audios genéricos de IA.
**Dónde.** `src/audio/audioManager.js`, `src/main.js`, `src/social/panel.js`, `src/social/social.css`, `public/sounds/ringtone.wav`, `scripts/build-web.mjs`.
**Cómo se verifica.** Abrir Ajustes (click en avatar -> Ajustes), probar el botón "Probar ringtone" (reproduce en bucle y se detiene con "Detener"), cambiar el selector de sonido de mensaje (emite la preescucha instantánea), y al recibir un mensaje o llamada entrante se reproduce el tono correspondiente.

---

### 0.24.2J · 2026-09-19 · Antigravity
**Qué cambió.** Corrección en la burbuja/tooltip de "Estás silenciado":
- Se habilitó el salto de línea balanceado (`white-space: normal`, `text-wrap: balance`, `word-break: break-word`) con un ancho máximo de 220px y texto centrado, evitando que frases largas se extiendan horizontalmente y se pierdan fuera de la ventana.
- La flecha indicadora se ajustó a la posición exacta del centro del botón del micrófono.
- Se implementó ajuste dinámico (`keepTooltipInViewport`) para asegurar que la burbuja siempre respete los bordes de la pantalla sin importar la resolución ni el tamaño de la ventana.
**Por qué.** En frases largas como "Hablá con confianza, pero desmuteate primero.", el texto se extendía horizontalmente más allá del ancho de la barra lateral y se recortaba fuera de la pantalla.
**Dónde.** `src/style.css`, `src/main.js`, `package.json`.

---

### 0.24.2I · 2026-09-19 · Antigravity
**Qué cambió.** Nueva pestaña de "Ajustes" en el menú de usuario (al tocar tu foto/perfil):
- Selector de dispositivo de entrada (micrófonos detectados en el sistema) con persistencia local y recuperación automática si se desconecta un periférico.
- Deslizador de umbral de detección de voz y compuerta de ruido (rango de -50 dB a -18 dB).
- Calibrador visual en tiempo real: muestra la intensidad del micrófono en dB, una barra de nivel en vivo, la línea roja indicadora del umbral de corte y una etiqueta de estado instantáneo ("Silencio" vs "Hablando").
- Cero consumo de CPU en segundo plano: el medidor visual se detiene inmediatamente al salir de la pestaña o cerrar el panel.
**Por qué.** Permitir que cada usuario calibre fácilmente su micrófono (especialmente micrófonos de condensador o con diferentes pisos de ruido ambiental) sin falsos positivos ni cortes de voz.
**Dónde.** `src/social/panel.js`, `src/social/social.css`, `src/audio/audioManager.js`, `src/main.js`, `package.json`.

---

### 0.24.2H · 2026-09-19 · Antigravity
**Qué cambió.** Optimización de audio para micrófonos de condensador y reducción de ruido:
- Activadas directivas nativas del hardware WebRTC: `noiseSuppression: true`, `echoCancellation: true` y `autoGainControl: false` (elimina siseo eléctrico y evita que Windows suba la ganancia en silencio inflando el ruido). 0% CPU adicional en JavaScript.
- Compuerta de ruido inteligente (Noise Gate) con tiempo de sostenido (Hold Time de 450ms): mantiene la pista abierta mientras se habla y medio segundo después para nunca cortar finales de palabras ni respiraciones, cerrándola en silencio total para no transmitir estática.
- Calibración del aviso de "Estás silenciado": umbral ajustado a nivel de voz real (`> -34 dB` y 2 cuadros consecutivos), evitando disparos falsos por el piso de ruido ambiental de micrófonos sensibles.
**Por qué.** Pedido de Juan: los micrófonos de condensador disparaban el aviso constantemente con el ruido ambiente y la otra persona escuchaba estática de fondo continuo.
**Dónde.** `src/audio/audioManager.js`, `src/main.js`, `package.json`.

---

### 0.24.2G · 2026-09-19 · Antigravity
**Qué cambió.** Detección y advertencia de voz al hablar estando silenciado (Speaking while Muted):
- Si el usuario habla mientras el micrófono está en silencio por encima de un umbral de decibeles (`rawLocalMetrics`), aparece un tooltip flotante directamente sobre el botón rojo del micrófono.
- El mensaje rota de manera cíclica entre las frases personalizadas pedidas ("Te escuchamos cuando toques acá", "Sonido: 0%. Ganas de hablar: 100%.", "Psst... estás en silencio", "Estás silenciado", etc.).
- Animación: entrada elástica con `scale-up` suave (`cubic-bezier`), flecha indicadora y rebote/vibración sutil del icono de micrófono rojo.
- Duración: permanece activo mientras la persona hable y desaparece suavemente 1.5 segundos después de que deje de hablar.
- Preparado internamente con gancho para reproducir un aviso sonoro opcional en el futuro.
**Por qué.** Pedido de Juan: advertir con frases divertidas y diseño cuidado si el usuario habla teniendo el micrófono silenciado.
**Dónde.** `index.html`, `src/style.css`, `src/audio/audioManager.js`, `src/main.js`, `package.json`.

---

### 0.24.2F · 2026-09-18 · Antigravity
**Qué cambió.** Al estar ensordecido, hacer clic en el botón de micrófono para desmutearse ahora también des-ensordece automáticamente al usuario (reactiva el audio entrante para escuchar nuevamente a los demás y restablece el estado visual del botón de auriculares a activo).
**Por qué.** Pedido de Juan: si estás ensordecido y decidís hablar desmuteándote, tiene sentido que también vuelvas a escuchar al resto inmediatamente.
**Dónde.** `src/main.js`, `package.json`.

---

### 0.24.2E · 2026-09-18 · Antigravity
**Qué cambió.** Conversión del botón de auriculares en el pie de usuario de la barra lateral: reemplazó la función de "monitoreo local" por **Ensordecer (Deafen)**.
- Al presionarlo para ensordecerse: silencia la salida de audio entrante (`remoteAudioElement.muted = true`) para dejar de escuchar al resto, y a la vez silencia el micrófono propio siempre (`audioManager.setMute(true)`).
- Al des-ensordecerse: vuelve a activar el audio de los demás. Si el usuario ya estaba muteado antes de ensordecerse, el micrófono permanece muteado; si no estaba muteado antes de ensordecerse, el micrófono se vuelve a desmutear automáticamente.
- Estado visual: botón con clase `active` cuando no está ensordecido y `muted` (rojo) cuando está ensordecido.
**Por qué.** Pedido de Juan: poder ensordecerse para no escuchar a los demás, silenciando el micrófono y recordando el estado previo del micro al volver.
**Dónde.** `index.html`, `src/audio/audioManager.js`, `src/main.js`, `package.json`.

---

### 0.24.2D · 2026-09-18 · Antigravity
**Qué cambió.** Ajuste de dimensiones y proporciones de la vista de espera (standby): se amplió el contenedor cuadrado redondeado de `.standby-icon` a 104x104px (border-radius 24px) y se dimensionó la imagen de la llamita en 72x72px con `object-fit: contain` y `overflow: hidden`, logrando que la llamita quede completamente centrada y contenida dentro del cuadro oscuro sin desbordar sus límites.
**Por qué.** Pedido de Juan: la llamita sobrepasaba los márgenes del cuadro que tiene detrás en la pantalla de standby.
**Dónde.** `src/brand.css`, `package.json`.

---

### 0.24.2C · 2026-09-18 · Antigravity
**Qué cambió.** Se integró la versión final modificada manualmente del logo (`logo-dita.svg` desde Descargas). Se reemplazaron los assets oficiales (`public/brand/logo-mark-light.svg`, `public/favicon.svg` y copias de escritorio) para reflejar la llamita con sus rellenos blancos y detalles vectoriales manuales.
**Por qué.** Pedido de Juan: reemplazar el logo por la versión final retocada a mano (`logo-dita.svg`).
**Dónde.** `public/brand/logo-mark-light.svg`, `public/favicon.svg`, `package.json`.

---

### 0.24.2B · 2026-09-18 · Antigravity
**Qué cambió.** Se integró el nuevo logo oficial del proyecto a partir del SVG `Dita.svg`. Se le quitó el fondo blanco del lienzo (`#fefefe`), dejando únicamente la figura de la llamita a color con transparencia. Se actualizaron los assets de marca oficiales del proyecto (`public/brand/logo-mark-light.svg`, `public/favicon.svg` y `Dita-sin-fondo.svg`), utilizándose en la cabecera de la app, pantalla de espera (standby), favicon y sitio web.
**Por qué.** Pedido de Juan: integrar el nuevo SVG oficial de la llamita sin fondo en la iconografía de Llamadita.
**Dónde.** `C:\Users\juand\Downloads\Dita-sin-fondo.svg`, `public/brand/logo-mark-light.svg`, `public/favicon.svg`, `package.json`.

---

### 0.24.2A · 2026-09-18 · Antigravity
**Qué cambió.** Renombrado del proyecto: el nombre oficial pasa a ser **Llamadita** (sin guión). Todos los archivos de código, documentación, configuración y web actualizados. Además, el dominio de referencia pasa a ser `www.llamadita.com.ar`; el dominio de Cloudflare Pages (`llamadita.pages.dev`) queda como origen CORS técnico pero ya no se menciona en la UI ni en los docs.
**Por qué.** Pedido de Juan: quitar el guión del nombre y unificar las referencias al dominio oficial.
**Dónde.** 31 archivos actualizados en bulk (`index.html`, `web/`, `src/`, `areas/`, docs, configs). `workers/adjuntos/cors.json` y `wrangler.toml` con `llamadita.com.ar` agregado. `package.json` bumpeado.

---

### 0.24.1E · 2026-09-16 · Antigravity
**Qué cambió.** Reorganización visual del panel derecho de la cabina del invitado: el botón de silenciar audio del amigo se mueve inline, a la derecha del slider de volumen. Ya no aparece como fila separada abajo del slider. Además el botón es ahora solo un ícono (sin texto): muestra un altavoz con ondas cuando el audio está activo, y un altavoz con ✕ cuando está silenciado. Con esto ambas cabinas quedan a la misma altura.
**Por qué.** Pedido de Juan: quería las alturas de ambos cuadros alineadas y el ícono a la derecha.
**Dónde.** `index.html`, `src/style.css`, `src/main.js`, `package.json`.

---

### 0.24.1D · 2026-09-16 · Antigravity
**Qué cambió.** Eliminados dos toasts redundantes durante la llamada: (1) el toast "Llamando a …" que aparecía abajo a la derecha al hacer una llamada (ya existe el banner superior con esa información); (2) el toast "Participante conectado a la sala" que aparecía (a veces varias veces) al conectarse el interlocutor (el usuario ya lo ve porque entran a la pantalla de cabinas).
**Por qué.** Pedido de Juan: la información ya estaba visible en pantalla de otra forma, duplicarla en toasts era ruido innecesario.
**Dónde.** `src/social/panel.js`, `src/main.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al llamar a un amigo, solo aparece el banner superior con "Llamando a …"; ningún toast en la esquina inferior derecha.
3. Al conectarse el amigo, se entra directamente a las cabinas sin toast de "Participante conectado".

---

### 0.24.1C · 2026-09-16 · Antigravity
**Qué cambió.** Eliminación del espacio vacío en la parte superior del panel de chat: la barra de cabecera vacía (`.app-header`) que quedaba arriba del nombre del amigo ("MALDITO TOKICHI") fue ocultada, haciendo que la barra del chat suba a la parte superior de la ventana y quede perfectamente alineada a la misma altura que la cabecera de la barra lateral.
**Por qué.** Pedido de Juan para quitar el espacio ocioso superior y subir la cabecera del chat y los mensajes hacia arriba.
**Dónde.** `index.html`, `src/style.css`, `src/brand.css`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al abrir cualquier chat directo o de canal, la barra con el nombre del amigo y los botones ("Llamar", "Salir del chat", menú) se ubica en el tope de la ventana sin ningún renglón oscuro ocioso por encima.

---

### 0.24.1B · 2026-09-16 · Antigravity
**Qué cambió.** Cuatro correcciones críticas sobre la llamada y la vista de cabinas:
1. **Fotos en las cabinas ("DEBE MOSTRAR FOTOS"):** Ahora se cargan y muestran las fotos de perfil reales en los discos de avatar del usuario local y del amigo conectado (resolviendo las direcciones firmadas de `avatar_key` mediante `urlParaVer`).
2. **Actualización al cortar llamada ("Si mi amigo corta, se debe actualizar"):** Al cortar el amigo o desconectarse, se envía señal de `hangup`, se detecta el corte en WebRTC y presencia, se sale automáticamente de la llamada volviendo a standby y se actualiza de inmediato la barra lateral (el botón del amigo pasa de rojo "Colgar" a verde "Llamar").
3. **Monitoreo reubicado al pie de usuario ("VA AHÍ"):** El botón de monitoreo local (`btnLoopback`) se movió al pie de la barra lateral izquierda junto al botón de silenciar micrófono, manteniendo ambas herramientas de entrada juntas.
4. **Simplificación estética de controles:** Se eliminó el selector de dispositivo de la cabina y se acortó el texto del botón de silenciar audio del amigo a "Silenciar".
**Por qué.** Pedido puntual de Juan sobre captura anotada.
**Dónde.** `index.html`, `src/network/peerManager.js`, `src/main.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al estar en llamada, las fotos de ambos participantes se ven en los discos circulares.
3. Si el otro participante corta, la app sale de la llamada, vuelve a standby y el botón del amigo se actualiza a verde.
4. El botón de monitoreo vive en el pie de usuario de la barra lateral al lado del micrófono.

### 0.24.1A · 2026-09-16 · Claude
**Qué cambió.** Cierra el tronco del chat: los pasos 4, 5, 6 y 7 de `areas/chat-e-historial.md`.
Lo que se ve:

- **Responder a un mensaje.** Queda la cita arriba de tu respuesta y se puede tocar para saltar
  al original. Si borraron el original, la respuesta dice *"el mensaje al que respondía ya no
  está"* en vez de esconderlo: borrar un mensaje **no** borra las respuestas, porque eso sería
  borrar conversación ajena.
- **Reacciones.** Se pasa el mouse por un mensaje y aparecen seis emojis. Tocar la tuya de
  nuevo la saca. Cada uno saca solo la suya, ni el dueño del canal puede sacar la de otro.
- **Editar en el lugar.** Se acabó el cartelito del navegador: el globo se convierte en un
  campo, Enter guarda y Esc cancela.
- **Fijar un mensaje.** En un canal lo hace el dueño; en un privado, cualquiera de los dos.
- **Formato.** `**negrita**`, `*cursiva*`, `~~tachado~~`, \`código\` y bloques con tres comillas
  invertidas. Las direcciones quedan clickeables.
- **Buscador.** Busca primero en lo que ya está en esta PC (instantáneo y sin tocar la red) y
  al servidor le pregunta solo por lo que nunca bajaste.
- **"Está escribiendo".**
- **Cuánto se guarda.** Por canal, para los mensajes y para los archivos por separado.

**Por qué la retención es la que importa.** Es lo único que hace que el costo del chat deje de
crecer solo. Ahora lo vencido se borra de verdad, y el repartidor lo hace cada media hora sin
que nadie tenga que acordarse. El texto y los archivos vencen por separado a propósito: el
texto es barato y lo querés tener, las imágenes son el volumen.

**"Está escribiendo" es la función más cara del chat y por eso lleva tres frenos.** Un aviso
por tecla serían 240 avisos para anunciar un mensaje de 40 caracteres con 6 personas mirando.
Con los tres frenos baja a un 4,5% del cupo del mes: cuentagotas de 5 segundos, **no** se manda
"dejé de escribir" (se apaga solo del otro lado, y nadie lo nota), y no se manda nada si no hay
nadie del otro lado conectado.

**Dónde.** `supabase/migrations/20260916_007_...` (aplicada), `src/social/panel.js`,
`src/social/api.js`, `src/social/social.css`, `index.html`, `workers/adjuntos/`.

**Sobre el diseño: es de Juan.** Esta versión se montó sobre el rediseño de la `0.23.1A` sin
tocarlo. Los controles nuevos (buscar, cuánto se guarda, borrar para los dos) **entraron al
menú que él hizo**, con su mismo molde de items, en vez de sumar botones a su cabecera. Lo
único que cambió de su menú es que ahora también aparece en los canales de texto, porque
adentro hay cosas que no son solo de los privados.

**Lo único que se restauró.** El borrado del servidor en los privados (*"borrar lo mío para los
dos"*) no había quedado en el rediseño. Volvió, pero adentro del menú de Juan. Su *"Eliminar
chat"* ya cubría la otra mitad (la copia de esta PC) y se dejó tal cual.

**Probado acá, solo.**
- **Inyección de html en un mensaje: siete intentos, ninguno pasó.** Se probó haciendo que el
  navegador parseara la salida de verdad: no se creó ningún elemento, ningún atributo de
  evento y ningún enlace `javascript:`. El texto se escapa **antes** de darle formato; al revés
  cualquiera ejecutaría código en la máquina del otro.
- El buscador respeta los permisos: un usuario ajeno al canal recibe cero resultados.
- Fijar, reaccionar y cambiar la retención los rechaza la base si no te corresponde.
- La purga completa corre y borra de verdad (objeto encolado → 404 en el bucket).

**Lo que falta y por qué.** **Menciones** y **previsualización de enlaces**. Las dos son las más
caras de la lista y las de menos rinde: las menciones necesitan un canal de avisos por persona
(la palanca 2 de D4, que todavía no existe) y la previsualización necesita que un servidor
salga a leer cada enlace. Quedan anotadas para cuando se decida.

### 0.23.1B · 2026-09-16 · Antigravity
**Qué cambió.** Arreglo de la consulta de mensajes en canales y chats:
- Se desambiguó la relación de PostgREST entre `messages` y `profiles` especificando la clave foránea explícita `author:profiles!messages_author_id_fkey(...)`.
**Por qué.** Al crearse la tabla de reacciones (`reactions`), que conecta `messages` con `profiles`, PostgREST detectó más de una relación posible (many-to-one por `author_id` y many-to-many por `reactions`) y arrojaba el error `Could not embed because more than one relationship was found for 'messages' and 'profiles'`.
**Dónde.** `src/social/api.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Abrir cualquier canal o chat directo: los mensajes cargan y sincronizan inmediatamente sin error en consola.

### 0.23.1A · 2026-09-16 · Antigravity
**Qué cambió.** Rediseño visual de las cabinas de llamada según las indicaciones anotadas:
1. **Eliminación completa de medidores y visualizadores:** Se removieron los vúmetros, lecturas de dB/porcentaje y lienzos de espectro canvas en ambas cabinas, eliminando el cómputo FFT y bucles de dibujo continuos a 60 cuadros por segundo para optimizar CPU y batería.
2. **Cabeceras de cabinas simplificadas y avatares centrados:**
   - Se removieron los badges "LOCAL" / "REMOTO", inputs de texto de nombre y estados redundantes ("SILENCIADO" / "HABLANDO").
   - Cabina local (Host): Avatar circular centrado con imagen de perfil o iniciales del usuario y su nombre debajo ("Tú" / display name).
   - Cabina remota (Amigo): Avatar circular centrado con imagen o iniciales del amigo conectado y su nombre debajo.
3. **Controles estéticos inferiores:**
   - Cabina local: Slider de ganancia / sensibilidad, botón de monitoreo local y selector de micrófono. El botón de silenciar micrófono se mantiene accesible en el pie de usuario de la barra lateral.
   - Cabina remota: Slider de "Volumen de tu amigo" (0% - 100%) conectado directamente al elemento de audio WebRTC (`remoteAudioElement.volume`), y botón para silenciar audio remoto.
4. **Barra de llamada centrada abajo:**
   - La barra con el estado ("En llamada...") y el botón de colgar se ubica debajo y en el medio de las dos tarjetas de cabina, quitando el badge "CONECTADO" de la barra superior.
**Por qué.** Pedido directo del usuario a partir de captura anotada en rojo para limpiar la vista de cabinas, eliminar elementos sobrecargados innecesarios y agregar control de volumen individual del amigo.
**Dónde.** `index.html`, `src/style.css`, `src/main.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al iniciar o entrar en llamada, las dos cabinas muestran avatares circulares centrados con el nombre del usuario y del amigo.
3. Mover el slider "Volumen de tu amigo" regula el volumen de salida.
4. Debajo y centrado entre las dos tarjetas se ubica la barra de llamada con el botón de colgar.
5. No hay medidores de audio ni vúmetros consumiendo CPU.

### 0.22.1C · 2026-09-16 · Claude
**Qué cambió.** Repaso de los textos de la interfaz del chat: el cartel de arrastrar, la ayuda
del clip y el mensaje de un canal vacío. Nada funcional.
**Por qué.** Venían escritos como instrucciones de manual y no como habla.
**Dónde.** `index.html`, `src/social/panel.js`.
**Cómo se verifica.** Abrir un canal sin mensajes, arrastrar un archivo encima de la
conversación y pasar el mouse por el clip.

### 0.22.1B · 2026-09-16 · Claude
**Qué cambió.** La foto de perfil ahora se ve en **todos** lados. Antes se veía solo la grande
del editor: el circulito de arriba del cajón y el del pie de la barra lateral seguían mostrando
las iniciales aunque tuvieras foto puesta.

**Por qué pasaba, y eran dos motivos distintos:**
- La cabecera del cajón dibujaba las iniciales y punto: nunca tuvo dónde poner la foto.
- El pie de la barra lateral sí la dibujaba, pero la línea que le pide la dirección firmada
  **se perdió al mezclar con la `0.21.3D`**. La foto se dibujaba vacía y nadie la rellenaba.
  Ahora esa línea vive al final del dibujado de la barra, donde no se puede perder de vista.

**Dónde.** `src/social/panel.js`, `src/social/social.css`.

**Cómo se verifica.** Con una foto puesta, tiene que verse en cuatro lugares: el editor de
perfil, el circulito de la cabecera del cajón, el pie de la barra lateral y el renglón del
amigo. Verificado antes en la base y el bucket: la foto subía y se guardaba bien (6 KB en el
bucket), el problema era solo de dibujado.

### 0.22.1A · 2026-09-16 · Claude
**Qué cambió.** Cada uno tiene su foto de perfil y la cambia cuando quiere, desde la pestaña
Perfil. Se ve en el pie de la barra lateral, en la lista de amigos y en los miembros de un
canal. Y se puede sacar, no solo cambiar.

**Y lo que importa, que es lo que no se ve.** Nada de esto se va juntando:

- Al cambiar la foto, **la anterior se borra del servidor**. No quedan diez avatares viejos por
  persona ocupando el cupo. Lo hace un disparador de la base cuando ve que la foto cambió, así
  que vale para todos los caminos (cambiarla, sacarla, borrar la cuenta) sin que la app tenga
  que acordarse en cada uno.
- **La cola de borrado ahora se vacía sola, cada media hora.** Hasta acá, borrar un mensaje con
  imagen anotaba el archivo para borrarlo pero no había nada que lo hiciera: los bytes se
  quedaban en el bucket para siempre. Ahora el repartidor se despierta solo, borra los objetos
  y confirma.

**Por qué.** Sin la primera, cambiarse la foto diez veces deja nueve imágenes que no le sirven
a nadie. Sin la segunda, la primera no borra nada: solo anota.

**Dónde.** `supabase/migrations/20260916_006_fotos_de_perfil_y_purga.sql` (aplicada),
`workers/adjuntos/` (permiso para la foto, lectura de avatares y el despertador),
`src/social/adjuntos.js`, `src/social/panel.js`, `src/social/api.js`, `src/social/social.css`.

**Medido en el motor de la app.** Una foto de 4000×2250 de 22 MB sale **cuadrada de 256×256**,
recortada por el centro, en 177 milisegundos. Una foto de cámara real queda en el orden de los
15 a 25 KB. El tope que acepta el servidor es 1 MB, y es solo una red de seguridad: si el
achicado fallara, una foto de perfil nunca puede ocupar como un archivo del chat.

**Sobre el secreto de la purga.** La base guarda **el hash**, no el secreto. El repartidor lo
manda por HTTPS y la base compara los hashes: si alguien llegara a leer esa tabla, no se lleva
nada con lo que pueda llamar a las funciones. Y no se le dio al repartidor la llave de servicio
de Supabase, que abre toda la base sin pasar por ninguna política: tiene dos funciones que solo
hacen lo suyo. Lo peor que se puede hacer con ese secreto es borrar archivos que ya estaban
marcados para borrarse.

**Cómo se verifica.**
1. Perfil → "Poner una foto". Tiene que aparecer redonda en el pie de la barra lateral.
2. Cambiarla por otra. Al rato (o disparando la purga a mano), la anterior ya no está en el
   bucket.
3. "Sacarla": vuelve a las iniciales y la imagen se borra.
4. Probado de punta a punta: se puso un objeto en el bucket, se lo encoló, se disparó la purga
   y el objeto devolvió 404. Con un secreto inventado, la purga contesta 403.

**Se cruzó con la `0.21.3D`.** Antigravity sumó al mismo tiempo el avatar en la cabecera del
chat, pero lo leía de `avatar_url`, que es una columna que viene de la migración 001 y **nunca
se llena**: esa foto no se veía nunca. Al mezclar quedó enganchada a `avatar_key`, que es la
foto de verdad, así que ahora sí se ve. De su versión se conservó todo lo demás: el botón de
colgar en la lista de amigos, el menú con eliminar chat, la hora debajo y la alineación.

**Lo que NO tiene todavía.** La foto no sale al lado de cada mensaje del chat. El globo de
mensaje hoy muestra nombre y hora, y meterle la foto cambia bastante el dibujo; se puede sumar
cuando se defina cómo queda.

### 0.21.3D · 2026-09-16 · Antigravity
**Qué cambió.** Mejoras estéticas y de UX en chat, lista de amigos y llamadas:
1. **Avatar en cabecera de chat:** Si el amigo tiene `avatar_url`, se muestra su foto de perfil circular; en caso contrario, muestra el `@`.
2. **Menú contextual superior derecho:** Se reemplazaron los botones "Sacar de mi vista" y "Borrar lo mío para los dos" por un menú hamburguesa (`☰`) en la esquina superior derecha con la opción "Eliminar chat" (borrado local en esta PC, sin alterar el servidor).
3. **Ubicación de hora en mensajes:** La hora y estado (`hora · editado`) ahora se muestran debajo del contenido del mensaje y archivos adjuntos, manteniendo el nombre del autor arriba.
4. **Interacción con amigos y llamadas en barra lateral:**
   - Al hacer clic en un amigo cuyo chat ya está abierto, se cierra la conversación (`closeChannel`).
   - Si se está en llamada activa con ese amigo, el botón telefónico se muestra en rojo con icono y texto de colgar (`.in-call`), y al presionarlo cuelga la llamada (`hooks.hangup()`).
   - El botón de llamada dentro de la cabecera del chat privado también conmuta dinámicamente a "Colgar" en rojo cuando hay llamada activa con esa persona.
5. **Alineación horizontal y diseño responsive:**
   - La barra inferior de escritura del chat (`.chat-input-bar`) y el pie de usuario de la barra lateral (`.sidebar-user-footer`) comparten altura (64px) y línea superior continua sin desfasajes.
   - La cabecera del chat se sincroniza con el ritmo visual de 64px de las cabeceras del sistema.
**Por qué.** Pedido puntual de Juan para pulir la experiencia visual, la jerarquía de los mensajes y el control de llamadas directas.
**Dónde.** `index.html`, `src/social/panel.js`, `src/social/social.css`, `src/style.css`, `src/main.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al abrir un chat privado con un amigo: se visualiza su avatar si lo tiene o `@`. En la esquina superior derecha aparece el botón hamburguesa con "Eliminar chat".
3. Enviar mensajes: el nombre del autor aparece arriba y la hora abajo a la derecha del globo.
4. Tocar el amigo activo en la barra lateral cierra el chat.
5. Al llamar al amigo o recibir llamada de él, el botón de llamada en la barra lateral y en el chat pasa a rojo "Colgar" y permite finalizar la llamada.
6. La barra inferior de texto y el pie de usuario lateral quedan perfectamente alineados.

### 0.21.3C · 2026-09-16 · Claude
**Qué cambió.** Dos cosas que Martín encontró probando los adjuntos:

1. **Editar un mensaje ya no le borra la imagen.** Antes, si un mensaje tenía una captura y le
   cambiabas el texto, la imagen desaparecía de la pantalla.
2. **Un mensaje de texto CON imagen ya no se manda pelado.** Antes podía aparecer solo el texto.

Además: el lápiz de editar solo sale en los mensajes que **tienen** texto. Un mensaje que es
solo una imagen no tiene nada que editar, y ofrecerlo era invitar al problema.

**Por qué pasaba, que es el mismo motivo para los dos.** El aviso en vivo de Supabase trae la
fila **pelada**: el mensaje, sin los archivos que le cuelgan de otra tabla. Yo usaba esa fila
para reemplazar la que ya estaba en pantalla, así que al editar, la versión sin imagen pisaba a
la que sí la tenía. Y cuando mandabas texto con imagen, si el aviso del archivo llegaba un
instante **antes** que el del mensaje, no encontraba a quién pegarse y se descartaba.

**Cómo quedó arreglado**, en tres capas, porque una sola no alcanzaba:
- Lo que llega en vivo manda **solo sobre lo que efectivamente trae**: nunca puede borrar algo
  que ya sabíamos. Probado contra la función real, no contra una copia.
- Un archivo que llega antes que su mensaje **espera** hasta 30 segundos en vez de tirarse.
- Y después de mandar un archivo, el que lo mandó le pide al servidor lo que cambió, en vez de
  confiar en que los avisos lleguen completos y en orden. Es una consulta chica y solo corre al
  mandar un archivo.

**Dónde.** `src/social/panel.js`.

**La base nunca estuvo mal**, y se verificó: editar un mensaje con adjunto lo deja intacto del
lado del servidor. Era todo de la pantalla.

**Y de paso: se vació la cola de borrado.** Los archivos de los mensajes que Martín borró
probando seguían en el bucket, porque la cola se llenaba pero todavía no había nada que la
vaciara. Se vaciaron los 8 y se comprobó que el objeto ya no existe (404) y que el bucket quedó
en cero. **Vaciarla automáticamente sigue pendiente** (es el paso 4 de la ficha del chat): por
ahora, cuando se borra un mensaje con archivo, el archivo queda encolado hasta que alguien
dispare la purga.

**Cómo se verifica.** Mandar un mensaje con texto **y** una captura: tienen que verse los dos.
Editarle el texto: la imagen tiene que quedar. Y en un mensaje que es solo imagen, el lápiz no
tiene que aparecer.

### 0.21.3B · 2026-09-16 · Antigravity
**Qué cambió.** Ocultamiento total de la barra lateral izquierda y la cabecera cuando no hay sesión activa:
1. **Pantalla limpia y tarjeta centrada:** Al estar deslogueado, la barra lateral izquierda desaparece por completo (evitando la franja vacía a la izquierda) y la cabecera superior se oculta, permitiendo que la tarjeta de bienvenida y login quede perfectamente centrada en toda la ventana.
2. **Reaparición fluida tras login:** Una vez completado el inicio de sesión o verificado el código de 6 dígitos, la barra lateral izquierda (con sus canales, amigos y perfil) y la cabecera reaparecen de forma instantánea.
**Por qué.** El lateral izquierdo vacío desbalanceaba el encuadre estético antes de iniciar sesión.
**Dónde.** `src/style.css`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al abrir la app sin sesión: solo se ve la tarjeta de login perfectamente centrada en la ventana sobre el fondo del programa, sin barras laterales ni cabecera visible.
3. Al ingresar el código y autenticarse: la barra lateral izquierda y la cabecera reaparecen completas con canales, amigos y salas.

### 0.21.3A · 2026-09-16 · Claude
**Qué cambió.** Ahora se pueden mandar imágenes y archivos por el chat, de tres maneras: con
el clip al lado de Enviar, **pegando una captura con Ctrl+V** (que es como se usa de verdad), o
arrastrando el archivo encima de la conversación. Antes de mandarlos aparecen abajo con su
miniatura, su nombre y su peso, y se pueden sacar de a uno. Mientras suben, cada uno tiene su
barrita.

Las imágenes se ven **adentro** de la conversación, y al tocarlas se abren en grande sin salir
de la app. Cualquier otra cosa aparece como un renglón con su nombre y su peso, y se baja de un
click. Un mensaje puede ser **solo** una imagen, sin texto.

**Por qué.** Es el "listo cuando" del hito 5 del roadmap: pegar una captura, verla, y borrarla
de verdad. Y es lo que más se usa de un chat después del texto.

**Dónde.** `index.html` (el clip, la bandeja, el cartel de soltar y el visor), `src/social/
panel.js`, `src/social/social.css`, `src/social/api.js`. Se apoya en lo que ya había dejado la
`0.21.2A`: la tabla de fichas, el repartidor de permisos y el achicado.

**Lo que ahorra, medido en el motor de la app.** Una captura de 2560×1440 pesa 1,5 MB y sale
en **35 KB**: 45 veces más chica, y tarda 143 milisegundos en la máquina del que sube. Una foto
de 15 MB queda en 133 KB. A ese promedio, en los 10 GB gratis entran unas **35.000 imágenes**.

**Una trampa que quedó cerrada.** Al medir formatos descubrimos que cuando el motor no sabe
escribir el que le pedís, `toBlob` **no avisa**: te devuelve un PNG haciéndose pasar por lo que
pediste. Pidiéndole AVIF, los 63 KB se convertían en 850 KB. Ahora el formato se lee del
resultado en vez de darse por sentado. (AVIF igual no conviene: el que lo sufre es el que mira,
y una placa GTX 1060 no lo descomprime por hardware.)

**La credencial de R2 ya está cargada** (16/09/2026), así que esto anda de punta a punta.
Verificado contra el bucket: subir con permiso firmado da 200, leer sin permiso queda
bloqueado, y un permiso vencido devuelve 403, o sea que el vencimiento se respeta de verdad.

**Nota vieja, ya resuelta.** Mientras faltó la credencial, la subida fallaba con "el servidor
de archivos dijo que no".

**Cómo se verifica.** Sacar una captura con Impr Pant, pegarla en el chat con Ctrl+V, mandarla,
verla del otro lado, tocarla para abrirla en grande, y después borrar el mensaje y comprobar
que desaparece en las dos pantallas.

### 0.21.2B · 2026-09-16 · Antigravity
**Qué cambió.** Rediseño visual de la pantalla de bienvenida y login para usuarios sin sesión:
1. **Login centrado en la tarjeta:** El formulario de login y registro se reubicó directamente debajo de la ilustración de la llama en la tarjeta central (`#standbyCard`), en lugar de la barra lateral.
2. **Mensaje personalizado:** El título de la tarjeta pasó a decir *"¿Otra vez chateando solo, en serio?"* y la descripción se ajustó a *"Iniciá sesión o creá tu cuenta para acceder al programa, canales y llamadas."*
3. **Elevación visual de la tarjeta:** La tarjeta sube ligeramente (`padding-bottom` compensado) para centrar armoniosamente el contenido con el formulario integrado.
4. **Limpieza de estados en la cabecera:** Se retiraron de la vista los indicadores redundantes ("Sin sesión", "ESPERANDO"), dejando la cabecera limpia.
**Por qué.** Mejora de apariencia solicitada por el usuario para mayor calidez y orden visual, sin alterar ninguna de las lógicas de autenticación ni WebRTC existentes.
**Dónde.** `index.html`, `src/style.css`, `src/social/panel.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar`.
2. Al abrir la app sin sesión: la barra lateral izquierda queda limpia y oscura; en el centro, la tarjeta principal muestra la llama, el título *"¿Otra vez chateando solo, en serio?"* y justo debajo el formulario de login/registro (Crear cuenta / Ya tengo cuenta, mail, código); en la cabecera superior ya no figuran badges ni estados innecesarios.
3. Al loguearse con código de 6 dígitos, la app abre normalmente la sesión restaurando canales, amigos y salas.

### 0.21.2A · 2026-09-16 · Claude
**Qué cambió.** Todavía nada que se vea: es la mitad de abajo de los adjuntos, la que hay que
tener antes de poner el clip en la pantalla. Queda armado el lugar donde van a vivir las
imágenes y el servicio que reparte los permisos para subirlas y mirarlas.

**Por qué.** Las imágenes no pueden ir a la base: el plan gratis da 1 GB y **cobra la salida**,
o sea que una foto que se mira veinte veces se paga veinte veces. Van a un bucket de objetos
(Cloudflare R2), que da 10 GB y la salida **nunca** se paga. Pero para escribir en R2 hace falta
una clave secreta, y una clave secreta adentro de la app es una clave publicada: cualquiera abre
el ejecutable, la saca, y te llena el bucket o te lo vacía.

**Dónde.**
- `supabase/migrations/20260916_005_adjuntos.sql` (aplicada): la ficha de cada archivo, el
  permiso de que un mensaje sea **solo** una imagen (pero nunca vacío del todo), el cupo por
  persona, la función que manda mensaje y archivo de una sola vez, y la **cola de objetos a
  borrar** que se llena sola cuando se borra un mensaje, una conversación o un canal entero.
- `workers/adjuntos/` (nuevo): el repartidor de permisos. La clave de R2 vive ahí como secreto
  y no sale nunca. Los bytes van de tu máquina al bucket **directo**, sin pasar por él.
- `src/social/adjuntos.js` (nuevo): achica las imágenes antes de subir, sube con barra de
  progreso, y pide permisos de lectura de una hora que se guardan en memoria.

**La decisión que más plata ahorra, ya implementada.** Una captura de pantalla pesa entre 2 y
5 MB. Antes de subir se lleva a 1600 píxeles de lado mayor y a un formato moderno, y queda
entre 200 y 400 KB. En una ventana de chat no se nota. Eso convierte "el cupo se llena en 3
meses" en "se llena en dos años", y se hace en la máquina del que sube, sin costo. Si alguien
quiere mandar el original tal cual, puede marcarlo.

**Cómo sabe quién sos el repartidor, sin tener ninguna llave de la base.** La app le manda su
sesión. La firma se comprueba contra la clave **pública** del proyecto. Y para saber si podés
subir a un canal o mirar un archivo, el repartidor le pregunta a la base **con tu propia
sesión**: si las políticas te devuelven la fila, es que podés. Nunca decide él.

**Por qué los bytes no pasan por el repartidor.** El plan gratis de Workers da **10
milisegundos de procesador** y **100 MB de cuerpo** por pedido. Con un tope de 100 MB por
archivo, pasarlos por arriba no sería solo caro: no entraría. Verificado en la documentación,
no de memoria.

**Lo que falta para que ande.** La credencial de R2, que se crea en el panel de Cloudflare y
solo la puede hacer Martín. Hasta que esté, el repartidor responde pero no puede firmar nada.
Después va la mitad de arriba: el clip, pegar con Ctrl+V, arrastrar, y dibujar la imagen en la
conversación.

**Cómo se verifica (cuando esté la credencial).** Pegar una captura en el chat, verla del otro
lado, borrarla, y comprobar que el objeto desapareció del bucket.

### 0.21.1B · 2026-09-16 · Antigravity
**Qué cambió.** Bloqueo completo del programa para usuarios sin sesión activa y pantalla de login/registro integrada permanentemente en la barra lateral izquierda:
1. **Acceso bloqueado sin sesión:** Si no estás logueado o verificado, el programa no permite interactuar con cabinas, canales de chat ni realizar llamadas. En el centro se muestra la tarjeta de "Acceso restringido" y en la cabecera el estado queda en "Sin sesión" con indicador "BLOQUEADO".
2. **Login/Registro completo en la barra lateral:** La barra lateral izquierda muestra directamente el formulario completo de inicio de sesión / creación de cuenta sin botón de cerrar `✕`, ocultando las listas de canales, amigos y perfil hasta que el usuario se autentique exitosamente.
3. **El drawer flotante ya no se abre sin sesión:** Se eliminó el cajón flotante que permitía cerrarse o evadir el inicio de sesión.
**Por qué.** El programa no debe permitir el acceso ni interacción a personas que no estén autenticadas o registradas con una cuenta existente o verificada.
**Dónde.** `index.html`, `src/style.css`, `src/main.js`, `src/social/panel.js`, `package.json`.
**Cómo se verifica.**
1. Ejecutar `npm run verificar` para asegurar compatibilidad de protocolo.
2. Abrir la app sin sesión (o cerrar sesión): la barra lateral izquierda muestra el formulario de login/registro sin botón `✕`, los canales y amigos están ocultos, el centro indica "Acceso restringido", no se puede llamar ni chatear y el header indica "Sin sesión" / "BLOQUEADO".
3. Al ingresar el mail y código de 6 dígitos (o iniciar sesión con una cuenta válida), la barra lateral se desbloquea de inmediato mostrando los canales, amigos y pie de perfil, y la vista principal vuelve a standby o cabina.

### 0.21.1A · 2026-09-16 · Claude
**Qué cambió.** Tres cosas que se ven:

1. **Chat privado con cada amigo.** Tocando a un amigo en la barra lateral (o en el cajón) se
   abre la conversación de a dos. El botón del teléfono sigue llamando como antes. Desde
   adentro del chat privado también se puede llamar.
2. **El historial deja de bajarse entero cada vez.** Ahora vive en tu PC: abrir un canal es
   instantáneo y al servidor solo se le pide lo que cambió desde la última vez. Y se terminó
   el techo de 60 mensajes.
3. **Borrar de verdad.** Cada mensaje propio se puede editar y borrar; el borrado se va de la
   base y desaparece de la pantalla del otro, incluso si estaba desconectado cuando pasó. En
   los chats privados hay dos botones distintos: *Sacar de mi vista* (borra la copia de esta
   computadora, es reversible) y *Borrar lo mío para los dos* (borra del servidor, y solo
   alcanza lo que escribiste vos).

**Por qué.** Es el cimiento del chat, hecho antes que las funciones lindas. Hasta acá, cada
vez que abrías un canal la app pedía los últimos 60 mensajes al servidor, siempre, aunque ya
los hubieras visto mil veces. El plan gratis da 5 GB de bajada por mes: con 200 personas
bajando 1 MB de historial por día son 6 GB y nos pasamos sin haber hecho una sola llamada. Y
sin borrado de verdad, cada función nueva multiplicaba una factura que todavía no sabíamos
leer. Sale del camino de `areas/chat-e-historial.md` y de las cuatro decisiones que tomó
Martín, anotadas en `SYNC.md`.

**Dónde.**
- `supabase/migrations/20260916_004_esqueleto_del_chat.sql` (nueva, ya aplicada): espacios,
  chats privados, identificador de mensaje puesto por el cliente, edición, lápidas y
  retención.
- `src/social/cacheLocal.js` (nuevo): el historial guardado en la PC de cada uno.
- `src/social/api.js`: sincronización por diferencia, abrir chat privado, editar y borrar.
- `src/social/panel.js`, `src/social/social.css`, `index.html`: la pantalla.

**Decisiones que quedaron congeladas acá.** Las tablas nacen con la idea de *espacio* aunque
la pantalla muestre uno solo; el borrado es duro (la fila se va, no se marca); por defecto el
texto se guarda para siempre y los adjuntos 90 días; el tope por archivo va a ser de 100 MB.

**Cómo se verifica.**
1. Tocar un amigo en la barra lateral: tiene que abrirse el chat privado con su nombre arriba.
2. Escribir un mensaje y que le llegue al otro al toque.
3. Cerrar el chat y volver a abrirlo: los mensajes aparecen **al instante**, sin esperar.
4. Pasar el mouse por encima de un mensaje propio: aparecen el lápiz y la cruz. Borrarlo y
   mirar que desaparezca también de la pantalla del otro.
5. Cerrar la app del otro, borrar un mensaje, y volver a abrirla: el mensaje no tiene que
   estar. Eso es la lápida funcionando.
6. En un canal normal, el dueño puede borrar mensajes ajenos. En un privado, **no**: probado
   contra la base, el intento devuelve cero filas.

**Se cruzó con la `0.20.1B`.** Antigravity hizo los chats privados al mismo tiempo, con otro
modelo: un canal de texto normal con el código de sala `dm-<id>-<id>`, creado desde la app.
Quedó el modelo de esta versión (canal de tipo `dm` creado por el servidor) por tres motivos
concretos, anotados en el recado de `SYNC.md`. De su versión se conservaron las mejoras de
pantalla, que eran buenas y no dependían del modelo: el botón de llamar propio en la cabecera
con su estado de "no está conectado", el subtítulo con el arroba, el renglón del amigo
resaltado cuando su chat está abierto, el menú contextual de los canales con clic derecho y el
nombre corregido de la sección de amigos.

**Sin verificar todavía.** El almacenamiento duradero del historial devuelve *false* en un
navegador común. Falta probarlo en la app empaquetada (WebView2), que es donde importa: si
ahí también diera *false*, el motor podría tirar la caché cuando el disco se llena y habría
que volver a bajar el historial. No rompe nada, cuesta un rato de bajada.

### 0.20.1B · 2026-09-16 · Antigravity
**Qué cambió.** Al hacer clic en un amigo de la barra lateral se abre su chat privado (DM) en la vista principal con su nombre, estado y botón de llamada directa integrado en la cabecera. El botón de teléfono en la fila del amigo sigue llamando de inmediato. En los canales de la barra lateral, un clic derecho despliega un menú contextual con opciones para copiar código de invitación y salir del canal (o eliminarlo si sos el dueño). La sección "Y LOS AMIGOS?" se renombró a "AMIGOS -".
**Por qué.** No había forma de chatear de a dos por privado (los mensajes solo existían dentro de canales colectivos) ni de llamar a un amigo desde su conversación. Tampoco había forma directa y cómoda de abandonar canales desde la barra lateral.
**Dónde.** `index.html`, `desktop/resources/index.html`, `web/index.html`, `src/style.css`, `src/social/api.js`, `src/social/panel.js`.
**Cómo se verifica.** 1) Tocar el nombre de un amigo en la barra lateral: se abre la vista de chat con su nombre en el encabezado, placeholder personalizado y botón "Llamar". 2) Tocar el botón de teléfono en la lista de amigos: inicia la llamada directamente como antes. 3) Clic derecho sobre cualquier canal en la barra lateral: aparece el menú contextual con opción de salir/eliminar. 4) La cabecera de la sección de amigos dice "AMIGOS -".

### 0.20.1A · 2026-09-16 · Claude
**Qué cambió.** La sesión ya no se pierde al reinstalar la app. Si el navegador interno se
quedó sin sesión pero la copia de respaldo existe, la app entra sola en vez de pedirte el
código de nuevo.
**Por qué.** La sesión vivía solo en el almacenamiento del navegador interno, que está atado a
dos cosas frágiles: el puerto con el que se sirve la app (fijo en 24024 desde la `1.5.1A`, así
que eso ya estaba resuelto) y la carpeta de datos del navegador, que **se borra al
desinstalar**. Por eso al reinstalar había que volver a pedir el código.
**Dónde.** `src/social/sesionGuardada.js` (nuevo) y `src/social/panel.js` (área F). La copia se
guarda en `%LOCALAPPDATA%\Llamadita\sesion.json`, **fuera de la carpeta de la instalación**,
que es lo que hace que sobreviva.
**Cómo se verifica.** Entrar con el mail, cerrar la app, borrar la carpeta de la instalación y
reinstalar: tiene que abrir con la sesión puesta. El archivo tiene que existir después de
entrar.
**Sobre el archivo.** Guarda el mismo dato que ya guardaba el navegador en disco: quien tenga
acceso a tu usuario de Windows llega a los dos por igual. Si el token venció o se revocó, se
borra solo y se pide el código.

### 0.19.1A · 2026-09-16 · Claude
**Qué cambió.** El ícono que se ve en el escritorio, en la barra de tareas y en el Explorador
ahora es el logo. El instalador y el desinstalador también.
**Por qué.** En la `1.13.1A` se cambió el ícono de la **ventana**, que sale de un PNG en
`desktop/resources/icons/`. Pero el que se ve en el escritorio va incrustado **adentro del
archivo .exe**, y ese seguía siendo el de fábrica del empaquetador.
**Dónde.** `desktop/resources/icons/app.ico` (nuevo, con los siete tamaños que pide Windows,
armado desde `public/favicon.svg`), `scripts/build-desktop.mjs` (le reemplaza el ícono al
ejecutable después de empaquetar, con `rcedit`), `installer.iss` (`SetupIconFile`).
**Cómo se verifica.** Extraer el ícono del `.exe` y mirarlo: tiene que ser la llama.
**Ojo, esto no llega por actualización automática.** El updater reemplaza el contenido de la
app, **no el programa**: un `.exe` no se puede pisar a sí mismo mientras corre. Para ver el
ícono nuevo hay que instalar con el instalador nuevo. Y Windows guarda en caché los íconos, así
que puede tardar en refrescarse.

### 0.18.1A · 2026-09-16 · Claude
**Qué cambió.** La app dejó de medir el micrófono todo el tiempo. Ahora el nivel se calcula
**solo cuando hay una cabina en pantalla mostrándolo**. Las barritas se mueven igual, con un
poquito menos de precisión que nadie puede notar.
**Por qué.** Había un nodo de audio que analizaba el sonido del micrófono unas 47 veces por
segundo, en el mismo hilo que dibuja la interfaz, y **seguía corriendo con el micrófono
silenciado, con los visualizadores apagados y con la ventana minimizada**. O sea que la app
medía un micrófono que nadie estaba mirando, siempre. Para mover unas barritas de nivel no
hace falta esa precisión: decisión de Martín.
**Dónde.** `src/audio/audioManager.js`. El nodo que medía se reemplaza por una lectura del
analizador que ya existía, hecha en el momento en que alguien pregunta. En su lugar queda un
"tapón" con el volumen en cero, que es lo que evita que el micrófono salga por los parlantes.
**Cómo se verifica.** Medido en la máquina de Martín, prueba A/B con las dos versiones
compiladas y medidas en minutos consecutivos, cuatro muestras cada una, app abierta sin llamada:

| | Muestras de CPU | Mediana |
|---|---|---|
| Antes | 3,28 · 1,73 · 1,76 · 3,46 | **2,5 %** |
| Después | 1,18 · 0,88 · 0,64 · 0,47 | **0,76 %** |

La memoria no se movió (213 MB). **Aviso honesto:** los números absolutos se mueven bastante
según qué más esté haciendo la máquina; lo que vale es la comparación lado a lado.

### 0.17.2A · 2026-09-16 · Claude
**Qué cambió.** Tres arreglos que no se ven pero evitan problemas feos.
1. **La actualización ahora se verifica.** El manifiesto publica la huella del paquete y la app
   comprueba que bajó exactamente eso. Si no coincide, no instala nada y avisa.
2. **El enlace del mail funciona en instalaciones nuevas.** El instalador ahora incluye
   `abrir-enlace.cmd`.
3. **El reintento de conexión reintenta de verdad.** Si la llamada se degrada, se renegocian
   los caminos de red sobre la misma conexión, sin cortar el audio.
**Por qué.** (1) La única verificación era que el archivo pesara más de 10 KB: cualquier cosa
más grande se instalaba encima de la app. (2) El instalador registraba el esquema del enlace
apuntando a un archivo que no instalaba (lo escribe la app en su primer arranque), así que en
una máquina nueva, tocar el enlace del mail antes de abrir la app no hacía nada. (3) El código
pedía un reinicio de red y acto seguido creaba una conexión nueva que lo tiraba a la basura:
decía "reiniciar" y en realidad rehacía la llamada entera, cortando el audio.
**Dónde.** `scripts/build-desktop.mjs`, `src/updater.js`, `installer.iss`,
`src/network/peerManager.js`.
**Cómo se verifica.** El manifiesto tiene que traer `sha256`. Probado el reinicio con dos
clientes conectados: después de pedirlo, **es la misma conexión** (no se creó otra), el estado
vuelve a "estable" y **la pista de audio remota sigue siendo la misma**, o sea que no se cortó.

### 0.17.1A · 2026-09-16 · Claude
**Qué cambió.** Borrar una cuenta ya no se lleva puesto el contenido de los demás. Antes, si
el dueño de un canal borraba su cuenta **se borraba el canal con los mensajes de todos**, y si
cualquiera borraba la suya desaparecían todos sus mensajes de todas las conversaciones. Ahora
el canal sobrevive sin dueño y los mensajes sobreviven sin autor: la app los muestra como
"cuenta borrada".
**Por qué.** Las dos columnas tenían borrado en cascada contra el perfil. Nadie lo decidió:
salió así al escribir la migración 001. Se revisaron las nueve claves foráneas del esquema:
las otras siete están bien (amistades, membresías e invitaciones de llamada **sí** tienen que
irse con la cuenta).
**Además.** `npm run verificar` ahora falla si alguna tabla de las migraciones no tiene
activadas las políticas de seguridad. Hace falta porque la migración 001 termina dando permiso
de lectura y escritura sobre todas las tablas del esquema a cualquiera con cuenta: lo único que
protege los datos es que cada tabla tenga RLS. La próxima tabla sin esa línea quedaba abierta.
**Dónde.** `supabase/migrations/20260916_003_*.sql` (ya aplicada a la base),
`src/social/panel.js`, `scripts/verificar-protocolo.mjs`.
**Cómo se verifica.** En la base: las claves de `channels.owner_id` y `messages.author_id`
tienen que decir `SET NULL`. En el protocolo: agregar una tabla sin RLS a una migración y
correr `npm run verificar`, tiene que fallar.
**Pendiente que abre esto.** Mientras un canal esté sin dueño, nadie puede renombrarlo ni
borrarlo. El traspaso de dueño va con el trabajo de roles.

### 0.16.2A · 2026-09-16 · Claude
**Qué cambió.** El primer número de la versión pasa de 1 a 0. La app va a mostrar `V0.16.2A`.
**Por qué.** Nadie había decidido que estuviéramos en el hito 1: venía arrastrado de un
versionado anterior. Decisión de Martín: el proyecto está en el hito 0 y ahí se queda hasta
que él o Juan declaren que llegó al 1.
**Dónde.** `package.json` (la versión vive solo ahí) y `VERSIONADO.md`.
**Ojo.** Se conservaron área y foco a propósito, para que el historial de este archivo se siga
leyendo derecho. El reseteo a `1.1.1A` va a pasar el día que se declare el hito 1.

### 1.16.2A · 2026-09-16 · Claude
**Qué cambió.** Se sacó el cartel de cumpleaños que aparecía al abrir la app. El
agradecimiento de Martín a Juan quedó escrito en `SYNC.md`, en la sección de recados.
**Por qué.** Ya pasó el día, y salía en cada apertura.
**Dónde.** `index.html`, `src/brand.css`, `src/main.js`.
**Cómo se verifica.** Abrir la app: entra derecho, sin ningún cartel en el medio.

### 1.16.1A · 2026-09-16 · Claude
**Qué cambió.** Dos cosas. **Volvieron a funcionar las llamadas**: no se escuchaba al otro
lado. Y **se fue el sistema de códigos de sala**: ya no hay que copiar ni pegar nada. Llamás
a un amigo desde la lista y la sala se abre sola. La cabecera dejó de mostrar un código y
ahora dice con quién estás hablando.
**Por qué.** En la `1.15.1B`, al agregar el cartel de cumpleaños, se borraron sin querer dos
líneas del final de `index.html`: el reproductor del audio remoto y el contenedor de avisos.
Sin el reproductor la llamada se conectaba igual pero no sonaba nada, y cualquier aviso en
pantalla tiraba error. Lo de los códigos era una segunda puerta para entrar a una sala que ya
se abre sola al llamar a un amigo: solo agregaba confusión.
**Dónde.** `index.html`, `src/main.js`, `src/style.css`, `src/social/panel.js` (áreas A y F).
**Cómo se verifica.** Dos personas: una llama a la otra desde la lista de amigos, la otra
atiende, y se escuchan. La cabecera de las dos dice "En llamada con …". No hay ningún lugar
donde pegar un código.
**Para la próxima.** Los elementos del final de `index.html` (`remoteAudioElement` y
`toastContainer`) no son decorativos: si se tocan, la llamada deja de sonar.

### 1.15.1B · 2026-09-16 · Antigravity
**Qué cambió.** Se agregó un cartel festivo en pantalla completa al iniciar la aplicación con saludo y felicitación por los 28 años de Martín (Dev & CEO de Llamadita), con diseño dark studio conmemorativo, animación y botón para ingresar a la app.
**Por qué.** Pedido especial de Juan para celebrar el cumpleaños número 28 de Martín.
**Dónde.** `index.html`, `src/brand.css`, `src/main.js`.
**Cómo se verifica.** Abrir la aplicación: aparece el cartel de felicitación en pantalla completa con el mensaje para Martín y se cierra limpiamente al tocar el botón o presionar Escape.

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
procesos de Llamadita en el Administrador de tareas: tiene que estar por debajo del 1%.
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
**Además.** Se regeneró `installer/Llamadita-Setup.exe` con esta versión (Inno Setup 6.7.3,
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
