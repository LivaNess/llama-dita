# Esqueleto de Llama-dita

Mapa de qué es cada parte, dónde vive y con qué se conecta. Sirve para dos cosas: que
cualquiera (persona o agente) entienda el proyecto sin leer todo el código, y que nadie
rompa algo por no saber quién dependía de eso.

> **Regla de oro:** si creás un área nueva, un archivo con responsabilidad propia o una
> conexión con un servicio, **se anota acá en el mismo commit**. Una tarea con área nueva
> y sin su fila en este documento está incompleta.

Documentos hermanos: `CLAUDE.md` (cómo trabajamos), `SYNC.md` (quién está tocando qué
ahora), `VERSIONADO.md` (cómo se numeran las versiones), `CAMBIOS.md` (qué se hizo en
cada versión).

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
- **Qué hace:** conecta dos personas en una sala. Usa Supabase Realtime para que se
  encuentren y WebRTC para mandar el audio directo, con servidores STUN y TURN.
- **Depende de:** Supabase (Realtime) y audio.
- **Dependen de ella:** arranque y las llamadas directas del panel social.
- **Cómo se prueba:** dos PCs en la misma sala; el estado pasa a "Conexión activa".
- **Cuidado:** hoy crea su **propio** cliente Supabase. Cada cliente abre una conexión en
  vivo más por usuario y el plan gratis permite 200 en total. Pasarlo al cliente compartido
  está pendiente (ver `SYNC.md`).

### E. Cliente Supabase compartido
- **Archivos:** `src/supabase/client.js`
- **Qué hace:** una sola conexión a Supabase para cuentas, datos y presencia.
- **Depende de:** nada del proyecto.
- **Dependen de ella:** cuentas, panel social, enlace del mail.
- **Cuidado:** las claves que están ahí son públicas a propósito. Lo que protege los datos
  son las políticas RLS de la base, no esconder la clave.

### F. Cuentas y panel social
- **Archivos:** `src/social/auth.js`, `src/social/api.js`, `src/social/panel.js`,
  `src/social/social.css`
- **Qué hace:** entrar sin contraseña (código por mail), perfil, amigos con presencia,
  canales de texto y de voz, mensajes y llamadas directas.
- **Depende de:** cliente Supabase, base de datos, red (para la llamada).
- **Dependen de ella:** arranque (dibuja la barra lateral).
- **Cómo se prueba:** dos cuentas, mandarse solicitud, aceptar, llamarse.
- **Cuidado:** la presencia **no** se guarda en la base. Va por Realtime Presence, porque
  escribir cada minuto no escala.

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
- **Qué hace:** perfiles, amistades, canales, miembros, mensajes y llamadas, con RLS para
  que cada uno vea solo lo suyo.
- **Dependen de ella:** cuentas y panel social.
- **Cuidado:** todo cambio de esquema se escribe como migración nueva, numerada, aunque se
  haya aplicado a mano.

### K. Empaquetado e instalador
- **Archivos:** `desktop/`, `installer.iss`, `crear-instalador.bat`
- **Qué hace:** convierte la web en app de Windows y arma el instalador.
- **Cuidado:** la app usa un puerto fijo, así que **no puede haber dos copias abiertas**.

### L. Marca
- **Archivos:** `public/brand/`, `public/favicon.svg`
- **Qué hace:** el logo en sus dos versiones (fondo oscuro y claro) y el ícono.
- **Dependen de ella:** app y web.

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
