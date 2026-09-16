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
**Qué cambió.** Se agregó un cartel festivo en pantalla completa al iniciar la aplicación con saludo y felicitación por los 28 años de Martín (Dev & CEO de Llama-dita), con diseño dark studio conmemorativo, animación y botón para ingresar a la app.
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
