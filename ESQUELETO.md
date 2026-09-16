# Esqueleto de Llama-dita

Mapa de qué es cada parte, dónde vive y con qué se conecta. Sirve para dos cosas: que
cualquiera (persona o agente) entienda el proyecto sin leer todo el código, y que nadie
rompa algo por no saber quién dependía de eso.

> **Regla de oro:** si creás un área nueva, un archivo con responsabilidad propia o una
> conexión con un servicio, **se anota acá en el mismo commit**. Una tarea con área nueva
> y sin su fila en este documento está incompleta.

Documentos hermanos: `CLAUDE.md` (cómo trabajamos), `SYNC.md` (quién está tocando qué
ahora), `VERSIONADO.md` (cómo se numeran las versiones), `CAMBIOS.md` (qué se hizo en
cada versión), `ROADMAP.md` (a dónde va y en qué orden).

---

## 1. Las tres piezas

```
   ┌──────────────────────┐        ┌──────────────────────┐
   │  App de escritorio   │        │     Web oficial      │
   │  Windows (Neutralino)│        │  llamadita.com.ar    │
   │  index.html + src/   │        │  web/                │
   └───────────┬──────────┘        └──────────┬───────────┘
               │                              │
               │   cuentas, canales, mensajes, presencia
               └──────────────┬───────────────┘
                              ▼
                   ┌──────────────────────┐
                   │       Supabase       │
                   │ Auth + Postgres +    │
                   │ Realtime (RLS)       │
                   └──────────────────────┘

   La voz NO pasa por el servidor: va de una PC a la otra (WebRTC).
   Supabase solo se usa para que las dos PCs se encuentren.
```

- **App de escritorio:** lo que usa la gente. Es la misma web empaquetada con Neutralino.
- **Web oficial:** presenta el proyecto, entrega el instalador, permite crear cuenta y es
  la fuente desde donde la app se actualiza.
- **Supabase:** cuentas, amigos, canales, mensajes, presencia y señalización de llamadas.

---

## 2. Áreas

Cada área dice: qué hace, sus archivos, de quién depende, quién depende de ella, cómo se
prueba y con qué hay que tener cuidado.

### A. Arranque e interfaz
- **Archivos:** `index.html`, `src/main.js`, `src/style.css`, `src/brand.css`
- **Qué hace:** arma la pantalla (barra lateral, cabinas de audio, chat, vistas) y arranca
  todo lo demás en orden.
- **Depende de:** todas las áreas de abajo; las llama al iniciar.
- **Dependen de ella:** ninguna, es la punta.
- **Cómo se prueba:** `npm run dev` y abrir el navegador en el puerto 3000.
- **Cuidado:** `src/style.css` tiene el layout; `src/brand.css` se carga después y **solo**
  pisa colores y tipografía. Cambios de estructura van en `style.css`, no en `brand.css`.

### B. Audio
- **Archivos:** `src/audio/audioManager.js`
- **Qué hace:** toma el micrófono, mide nivel (decibeles y porcentaje), silencia, permite
  escucharte a vos mismo y elegir dispositivo.
- **Depende de:** el navegador (Web Audio API).
- **Dependen de ella:** arranque (muestra los medidores) y red (le pasa el audio a la llamada).
- **Cómo se prueba:** hablar y ver moverse el medidor.
- **Cuidado:** si el permiso de micrófono queda sin responder, el navegador no contesta
  nunca; por eso el arranque no espera al micrófono para conectarse.

### C. Visualizadores
- **Archivos:** `src/components/visualizer.js`
- **Qué hace:** dibuja el espectro y la animación de voz en canvas.
- **Depende de:** audio.
- **Dependen de ella:** arranque.
- **Cómo se prueba:** a ojo, hablando.

### D. Red y voz
- **Archivos:** `src/network/peerManager.js`
- **Qué hace:** conecta dos personas en una sala y también las desconecta (`leaveRoom()`).
  Usa Supabase Realtime para que se encuentren y WebRTC para mandar el audio directo, con
  servidores STUN y TURN.
- **Depende de:** el cliente Supabase compartido (área E, para Realtime) y audio.
- **Dependen de ella:** arranque y las llamadas directas del panel social.
- **Cómo se prueba:** dos PCs en la misma sala; el estado pasa a "Conexión activa".
- **Cuidado:** desde la `1.12.1A` usa el cliente compartido de área E. No volver a
  `createClient` acá: cada cliente nuevo abre una conexión en vivo más por usuario y el
  plan gratis permite 200 en total. Los datos que van por el canal (nombre, muteo) se
  mandan cuando el canal **abre**: antes de eso el otro lado todavía no escucha.

### E. Cliente Supabase compartido
- **Archivos:** `src/supabase/client.js`
- **Qué hace:** una sola conexión a Supabase para cuentas, datos y presencia.
- **Depende de:** nada del proyecto.
- **Dependen de ella:** cuentas, panel social, enlace del mail.
- **Cuidado:** las claves que están ahí son públicas a propósito. Lo que protege los datos
  son las políticas RLS de la base, no esconder la clave.

### F. Cuentas y panel social
- **Archivos:** `src/social/auth.js`, `src/social/api.js`, `src/social/panel.js`,
  `src/social/sesionGuardada.js`, `src/social/cacheLocal.js`, `src/social/social.css`
- **Qué hace:** entrar sin contraseña (código por mail), perfil, amigos con presencia,
  canales de texto y de voz, chats privados de a dos, mensajes y llamadas directas.
- **Depende de:** cliente Supabase, base de datos, red (para la llamada).
- **Dependen de ella:** arranque (dibuja la barra lateral).
- **Cómo se prueba:** dos cuentas, mandarse solicitud, aceptar, llamarse, escribirse.
- **Cuidado:** la presencia **no** se guarda en la base. Va por Realtime Presence, porque
  escribir cada minuto no escala.

#### F.1 El historial guardado en la PC (`src/social/cacheLocal.js`)
- **Qué hace:** guarda los mensajes en el disco de cada uno (IndexedDB) y lleva, por canal,
  una marca de "de acá tengo todo hasta tal momento". Con eso, abrir un canal no baja nada si
  no hubo novedades.
- **Depende de:** el motor de la app (IndexedDB) y nada más. No habla con la red.
- **Dependen de ella:** `panel.js`, que pinta desde acá antes de preguntarle al servidor.
- **Cómo se prueba:** abrir un canal, cerrarlo y volver a abrirlo: los mensajes aparecen al
  instante y la pestaña de red no muestra una descarga de historial.
- **Cuidado:** es caché, no es la verdad. Si se pierde, se vuelve a bajar y listo; nada de acá
  se considera definitivo. Y **si el origen cambia (otro puerto), se pierde entera**: por eso
  la app se sirve siempre desde el mismo puerto fijo.
- **La trampa que ya está resuelta:** al servidor se le pide siempre desde *la marca menos 30
  segundos*. Postgres pone la hora del mensaje cuando la transacción arranca pero la fila se ve
  cuando termina, así que pedir desde la marca exacta pierde mensajes. Los repetidos que trae
  el solape se tiran por identificador.

### G. Enlace del mail
- **Archivos:** `src/social/deeplink.js`, `web/entrar/index.html`, `web/js/entrar.js`
- **Qué hace:** que tocar el enlace del mail deje la sesión iniciada en la app.
- **Depende de:** cliente Supabase, web oficial (la página `/entrar/`), Windows (registro).
- **Cómo se prueba:** pedir código en la app, tocar el enlace, mirar si la app entra sola.
- **Cuidado:** hay dos caminos y los dos importan. El esquema `llamadita://` apunta a
  `abrir-enlace.cmd`, nunca al ejecutable. Y la página copia el enlace al portapapeles
  porque los navegadores no siempre abren apps.

### H. Actualizaciones
- **Archivos:** `src/updater.js`, `scripts/build-desktop.mjs`, `desktop/update-manifest.json`
- **Qué hace:** avisa y aplica versiones nuevas sin bajar el instalador de nuevo.
- **Depende de:** la web oficial (de ahí baja el manifiesto y el paquete).
- **Cómo se prueba:** publicar una versión y abrir una app con la anterior.
- **Cuidado:** publicar sin `npm run deploy:web` deja a todos sin la actualización.

### I. Web oficial
- **Archivos:** `web/`, `scripts/build-web.mjs`, `web/_headers`
- **Qué hace:** presenta la app, entrega el instalador, permite crear cuenta y aloja el
  manifiesto de actualización y la página `/entrar/`.
- **Depende de:** cliente Supabase (registro), marca, paquete de escritorio.
- **Cómo se prueba:** `npm run build:web` y abrir `site-dist/`.
- **Cuidado:** `web/_headers` bloquea scripts escritos dentro del HTML. Todo JavaScript va
  en archivos aparte o no se ejecuta.

### J. Base de datos
- **Archivos:** `supabase/migrations/`
- **Qué hace:** espacios, perfiles, amistades, canales, miembros, mensajes, lápidas y
  llamadas, con RLS para que cada uno vea solo lo suyo.
- **Dependen de ella:** cuentas y panel social.
- **La forma de los datos (desde la migración 004):**
  - `spaces` / `space_members`: un espacio es una comunidad con canales adentro. Hay uno solo
    y la pantalla no lo muestra, pero las tablas ya saben de él: el día que haya varios no
    hay que migrar mensajes que ya existen.
  - `channels`: los de tipo `text` y `voice` viven en un espacio. Los de tipo `dm` son los
    chats privados de a dos: no viven en ningún espacio y llevan una `dm_key` única armada
    con los dos identificadores, que es lo que garantiza una sola conversación por par.
  - `messages`: además del texto lleva `client_id` (lo pone el cliente, para que un reenvío
    no duplique), `edited_at` y `updated_at` indexado, que es lo que hace barato pedir "dame
    lo que cambió desde tal momento".
  - `message_tombstones`: el borrado es duro, la fila se va. La lápida es lo único que queda,
    y es cómo se entera el que estaba desconectado. Se limpia a los 90 días con
    `purgar_lapidas()`.
- **Funciones que usa la app:** `abrir_chat_directo(otro)` comprueba que sean amigos y
  devuelve el chat privado, creándolo la primera vez. `join_channel_by_code(code)` entra a un
  canal con su código.
- **Cuidado:** todo cambio de esquema se escribe como migración nueva, numerada, aunque se
  haya aplicado a mano.
- **Cuidado 2:** en un chat privado el "dueño" es el que lo abrió, pero **no** puede borrar
  los mensajes del otro. La política de borrado lo excluye a propósito; en un canal normal el
  dueño sí modera.

### J.1 El repartidor de archivos (`workers/adjuntos/`)
- **Archivos:** `workers/adjuntos/src/index.js`, `wrangler.toml`, `cors.json`, y del lado de la
  app `src/social/adjuntos.js`.
- **Qué hace:** reparte permisos firmados para subir un archivo al bucket y para mirarlo. Los
  bytes van de la máquina del que sube al bucket **directo**: nunca pasan por acá.
- **Depende de:** el bucket `llamadita-adjuntos` en Cloudflare R2, y de la base (a la que le
  pregunta con la sesión de la persona, nunca con una llave propia).
- **Dependen de él:** el chat, para las imágenes y los archivos.
- **Cómo se prueba:** `curl .../salud`; y de punta a punta, pegar una captura en el chat.
- **Cuidado:** la clave de R2 es la llave del candado entero (R2 no tiene políticas como la
  base). Vive como **secreto del Worker** y no va nunca al repositorio ni a la app.
- **Cuidado 2:** el plan gratis da 10 milisegundos de procesador y 100 MB de cuerpo por pedido.
  Por eso los archivos no pueden pasar por el Worker: con el tope de 100 MB, no entrarían.
- **Cuidado 3:** el bucket tiene su propia lista de orígenes permitidos (CORS). Si la app se
  sirviera desde otro puerto, las subidas empezarían a fallar sin mensaje claro.

### K. Empaquetado e instalador
- **Archivos:** `desktop/`, `installer.iss`, `crear-instalador.bat`
- **Qué hace:** convierte la web en app de Windows y arma el instalador.
- **Cuidado:** la app usa un puerto fijo, así que **no puede haber dos copias abiertas**.

### L. Marca
- **Archivos:** `public/brand/`, `public/favicon.svg`, `desktop/resources/icons/`
- **Qué hace:** el logo en sus dos versiones (fondo oscuro y claro) y el ícono.
- **Dependen de ella:** app, web y el escritorio (ventana y bandeja).
- **Cuidado:** los PNG de `desktop/resources/icons/` salen de `favicon.svg` (256×256 la
  ventana, 32×32 la bandeja): si cambia el logo, hay que volver a generarlos. El ícono del
  `.exe` viene incrustado en el binario de Neutralino y no se toca desde acá.

---

### M. Verificación del protocolo
- **Archivos:** `AGENTS.md`, `scripts/verificar-protocolo.mjs`, `.github/workflows/protocolo.yml`
- **Qué hace:** controla que cada versión esté registrada en `CAMBIOS.md`, que cada área de
  `src/` figure en este documento y que nadie deje un bloqueo abierto en `SYNC.md`.
- **Depende de:** los cuatro documentos.
- **Cómo se prueba:** `npm run verificar`.
- **Cuidado:** corre solo en cada push a `main`. Si queda en rojo, algo del protocolo falta.

---

## 3. Servicios de afuera

| Servicio | Para qué | Dónde se configura |
|---|---|---|
| Supabase | cuentas, base, presencia, señalización | proyecto `mwzkrahindnheuheoycv` |
| Cloudflare Pages | publica la web | proyecto `llamadita` |
| Cloudflare DNS | el dominio | zona `llamadita.com.ar` |
| Cloudflare Email Routing | recibe los mails del dominio | misma zona |
| Resend | manda los mails de ingreso | remitente `acceso@llamadita.com.ar` |
| GitHub | el código | `LivaNess/llama-dita` |

---

## 4. Cómo dar de alta un área nueva

1. Antes de escribir código, anotá el lock en `SYNC.md`.
2. Creá el área con archivos propios, no la metas dentro de otra que ya existe.
3. Agregá su ficha acá abajo del todo, copiando esta plantilla:

```
### <letra>. <Nombre>
- **Archivos:**
- **Qué hace:**
- **Depende de:**
- **Dependen de ella:**
- **Cómo se prueba:**
- **Cuidado:**
```

4. Si toca un servicio de afuera, sumalo a la tabla de servicios.
5. Anotá la versión en `CAMBIOS.md` con qué hiciste y cómo se verifica.
