# Área: Compartir pantalla y cámara web

**Qué es esto:** la ficha de diseño del área de video de Llamadita. No es código ni
autorización para escribirlo: es el mapa de qué entra, en qué orden se construye, qué hay
que decidir antes de tocar nada y con qué se prueba.

**Fecha:** 16 de septiembre de 2026. **Versión de la app al escribirlo:** `1.16.2A`.
**Hitos que cubre:** el 3 entero y la mitad de video del 4.

**Estado de lo que hay hoy:** cero. `peerManager.js` solo agrega pistas de audio
(`activeStream.getAudioTracks()`), la oferta se crea con `offerToReceiveAudio: true` y
`updateLocalStream()` solo reemplaza audio. No hay una sola línea de video en el proyecto.
Esto es bueno: se arranca limpio y sin deuda.

---

## 1. FRONTERAS

### Qué entra en esta área

| Cosa | Detalle |
|---|---|
| Capturar la pantalla | elegir monitor o ventana, resolución, cuadros por segundo |
| Capturar la cámara | elegir dispositivo, resolución, cuadros por segundo |
| El audio del sistema | el sonido de la máquina que viaja **junto con** la pantalla |
| Comprimir el video | qué codec, a cuánto bitrate, con o sin ayuda de la placa de video |
| Las capas de calidad | publicar la cámara en dos o tres tamaños a la vez |
| A quién se le manda qué | pedirle al repartidor la capa del tamaño en que se está viendo |
| Cómo se degrada | si cuando falta banda se bajan cuadros o se baja resolución |
| Los elementos de video en pantalla | el `<video>`, cuándo se prende, cuándo se apaga, el aviso de "estás compartiendo" |
| El contrato con el ayudante nativo | **qué** le pedimos, no cómo lo hace |

### Qué NO entra

**El límite con el área de voz.** Voz y video comparten el repartidor y eso es todo lo que
comparten. Del otro lado de la línea quedan: el micrófono, el codec de audio y su bitrate,
el corte de envío en silencio, la cancelación de eco, la supresión de ruido, los
visualizadores de espectro y la señalización (el "apretón de manos" para armar la llamada).

El contrato entre las dos áreas es corto y conviene que quede escrito así:

- Yo **publico** pistas de video y, cuando hay pantalla, una pista de audio del sistema.
  Las declaro con un nombre y sus capas.
- Yo **pido** suscripciones: "de esta persona quiero la pantalla, capa grande" o "de estas
  ocho quiero la cámara, capa chica".
- El área de voz publica y pide lo suyo.
- **Ninguna de las dos toca los objetos de la otra.** Si el video se cae, la voz sigue.
  Esa regla es la que ordena la decisión D5 más abajo.

**El límite con el ayudante nativo.** Esa pieza la piensa el área de escritorio. Acá
solamente se define **el pedido**: qué le pasamos, qué nos tiene que devolver y con qué
números. Cómo saca la imagen de la memoria de la placa de video y cómo la mete en el chip
de compresión es problema de esa área, no de esta. El contrato está en la decisión D2.

**El límite con la interfaz.** La interfaz decide el layout: dónde va la grilla, cuántas
caritas por fila, si el que comparte se agranda. Esta área no opina de estética. Pero hay
**una sola cosa que vuelve para acá**: el tamaño real en píxeles en que se está dibujando
cada video. La interfaz me lo tiene que avisar, porque de ese número sale qué capa le pido
al repartidor, y de ahí sale la mitad del ahorro del proyecto. Si la interfaz achica una
carita y no me avisa, seguimos bajando 1280 píxeles para dibujar 200.

Lo mismo al revés: si un video **no se está viendo** (la app está minimizada, la pestaña
de chat está adelante, la grilla está scrolleada), la interfaz me avisa y yo me desuscribo.
Esto ya nos pasó una vez: la primera medición de consumo dio 6,49 % de procesador porque
los canvas dibujaban a 60 cuadros por segundo contra pantallas que nadie estaba mirando. Con
video es el mismo error, pero cuesta veinte veces más.

---

## 2. EL CAMINO

Seis pasos. La regla que los ordena es la misma del roadmap: **primero se mide, después se
optimiza**. Nadie construye el ayudante nativo "por las dudas": se construye cuando el paso 4
demuestre con un número que hace falta.

### Paso 0 (no es mío, pero me bloquea)

Nada de esto arranca hasta que existan **la capa de presets** y **el medidor de consumo**
(hito 2, puntos 1 y 3). Sin presets no hay dónde guardar "1080p60"; sin medidor no podemos
afirmar que algo mejoró. Si se empieza por el video, se termina con dos lugares donde vive
la configuración y ningún número.

### Paso 1: cámara, de a dos

Lo más chico que se puede hacer: una pista de video más en la conexión que ya existe. Sin
repartidor, sin capas, sin selección de fuente compleja. Elegir dispositivo y resolución,
prenderla y apagarla en caliente sin cortar la llamada.

**Queda andando:** dos personas se ven la cara. Y queda probado lo más frágil de todo, que
es agregar y sacar una pista sobre una conexión ya establecida sin que se corte el audio.

### Paso 2: pantalla, de a dos, capturada por el navegador

El selector de monitor o ventana, los 15/30/60 cuadros, la marca de contenido (juego o
texto), la política de degradación y el tope de bitrate por preset. Todo con lo que ya trae
el motor del sistema, sin ayudante nativo.

**Queda andando:** la promesa grande del hito 3. Dos personas mirando una pantalla a 1080p60
y el mes sigue costando cero, porque de a dos va directo de una PC a la otra.

### Paso 3: el audio del sistema

Va después y no antes, porque es el punto con más incógnitas de Windows y no queremos que
frene lo que ya funciona. Acá se corre la matriz de verificación de la sección 4.

**Queda andando:** se puede mostrar un video o un juego **con sonido**.

### Paso 4: el aviso honesto y la medición

Dos cosas que se hacen juntas porque son la misma:

1. Al elegir 60 cuadros, la app dice cuánta subida necesita y cuánto le va a costar a la
   máquina. Con números reales medidos en el paso 2, no de manual.
2. Se mide **cuántos cuadros por segundo pierde un juego** mientras transmitís. El
   procedimiento está en la sección 6.

**Queda andando:** el número que respalda la promesa principal del proyecto. Y la decisión
del paso 5 deja de ser una opinión.

### Paso 5: el ayudante nativo, solo si el paso 4 dolió

Si medimos que transmitir cuesta menos del 5 % de los cuadros del juego, **este paso no se
hace** y nos ahorramos la pieza más cara del proyecto. Si cuesta 15 o 25 %, se hace, y ya
sabemos exactamente cuánto tiene que mejorar para valer la pena.

**Queda andando:** lo mismo que en el paso 2, pero sin robarle cuadros al juego.

### Paso 6: grupo, con repartidor

Acá entran las capas de calidad de la cámara, la suscripción selectiva, la regla de "te
llega una sola pantalla" y la de "cada cámara viaja del tamaño en que se muestra". Va último
porque es lo único que **cuesta plata** si se hace mal, y porque necesita que el repartidor
esté montado (eso es de otra área).

**Queda andando:** cinco personas en un canal, una comparte pantalla, y el mes sigue en cero.

---

## 3. DECISIONES QUE HAY QUE TOMAR ANTES DE ESCRIBIR CÓDIGO

### D1. Qué codec y cuándo

**El problema en criollo.** Comprimir video es achicarlo para que entre por internet. Se
puede hacer de dos maneras: con un chip dedicado que ya viene adentro de la placa de video
(rápido, casi gratis en procesador, pero comprime peor) o con el procesador haciendo cuentas
(comprime mucho mejor, ocupa menos internet, pero se come la máquina).

Y hay una trampa: **también hay que descomprimir**, y eso lo hace el que mira. Un codec
moderno que tu placa no conoce se descomprime por procesador, y ahí el que se funde es el
espectador, que ni eligió nada.

Lo que hay en la máquina de Martín (GTX 1060 de 3 GB, generación Pascal):

| | Comprimir por hardware | Descomprimir por hardware |
|---|---|---|
| H.264 | **sí** | **sí** |
| HEVC | sí | sí |
| VP9 | no | sí |
| AV1 | **no** | **no** |

*Hay que verificar en la máquina, pero es lo esperable para esa generación: el chip de
compresión de esa placa no sabe AV1 y el de descompresión tampoco.*

**Las opciones:**

- **A. H.264 siempre.** Aceleración por hardware en prácticamente todas las máquinas, de
  las dos puntas. Gasta más internet para la misma calidad y el texto chico se ve peor.
- **B. AV1 o VP9 siempre.** Se ve mejor y ocupa hasta cinco veces menos, pero en la máquina
  de Martín las dos puntas del proceso caen al procesador. Justo la máquina que queremos
  proteger.
- **C. H.264 por defecto, y AV1/VP9 solo cuando las dos puntas lo bancan por hardware,
  negociado al armar la llamada.**

**Recomendación: C.** Con tres reglas que la hacen concreta:

1. **El codec lo decide el que MIRA, no el que transmite.** Es al revés de lo que parece.
   El que transmite puede estar orgulloso de su placa nueva; el que se funde es el otro.
2. **En grupo, H.264 y punto.** Con repartidor, si una sola persona de la sala no soporta
   AV1 por hardware, hay dos salidas y las dos son malas: transcodificar en el servidor
   (carísimo, y **hay que verificar si el repartidor de Cloudflare siquiera lo hace**, yo
   asumo que no) o publicar en dos codecs (el doble de compresión en la máquina del que
   transmite). Así que en grupo no se discute.
3. **AV1/VP9 solo de a dos**, y con un aviso claro si le está costando al otro lado.

El preset "Soy cheto" dice "AV1 o VP9". Queda bien, con la letra chica de que eso aplica a
llamadas de dos personas donde ambas placas lo soportan. **Con una GTX 1060 en la sala, ese
preset se cae solo a H.264.** Conviene que la app lo diga en vez de dejarlo pasar en
silencio.

### D1b. El conflicto escondido: capas de calidad contra compresión por hardware

Esto no está en el roadmap y hay que resolverlo antes de escribir código.

Las **capas de calidad** (publicar el video en dos o tres tamaños a la vez) son la condición
2 del repartidor y es lo que hace que ocho caritas en miniatura no fundan nada. Pero las
capas funcionan mucho mejor con los codecs que corren por procesador que con H.264 por
hardware, donde el soporte es más flojo. *Hay que verificar cómo se comporta exactamente en
el motor del sistema.*

O sea: el codec que salva el procesador es el que peor hace las capas, y las capas son lo
que salva el mes. Parece un callejón. No lo es, si se separa por tipo de contenido:

| | Codec | Capas | Por qué |
|---|---|---|---|
| **Cámara** | VP8 o VP9, por procesador | **sí, dos o tres** | una cámara a 360p o 720p es chica: comprimirla por procesador cuesta poco, y acá las capas son imprescindibles porque hay ocho a la vez |
| **Pantalla** | **H.264 por hardware** | **no, una sola** | la pantalla es lo caro de comprimir, así que va al chip. Y no necesita capas: la regla ya decidida dice que te llega una sola pantalla, la que estás mirando |

**Esa es la recomendación.** La regla de "una sola pantalla" no es solo un ahorro de red:
es lo que nos permite usar el codec barato para lo caro.

### D2. Captura por el navegador o por el ayudante nativo

**El problema en criollo.** El motor del sistema saca la imagen de la pantalla, la manda a
la memoria común, la procesa, la vuelve a mandar a la placa para comprimir, y la trae de
vuelta. Ese viaje de ida y vuelta es lo que le roba cuadros al juego, porque el juego está
usando esa misma placa y esa misma ruta. El camino corto es no sacarla nunca de la placa:
de la memoria de video directo al chip de compresión. Desde un navegador eso no se controla.

| | Captura por el navegador | Captura por ayudante nativo |
|---|---|---|
| Trabajo | ya está hecho | hay que construirlo y mantenerlo |
| Costo en cuadros del juego | **el que hay que medir** | mucho menor |
| Selector de fuente | el del sistema, feo y ajeno | propio, con miniaturas y nombre del juego |
| Juego en pantalla completa exclusiva | probablemente negro | se resuelve |
| Saber qué monitor y a qué refresco | limitado | completo |
| Riesgo | cero | es la pieza más cara del proyecto |

**Recomendación: empezar por el navegador, medir, y recién ahí decidir.** Es exactamente la
regla 2d del roadmap. Lo que **sí** hay que decidir ahora es **el contrato**, para que el
código del paso 2 no haya que tirarlo cuando llegue el paso 5.

**Lo que esta área le pide al ayudante nativo (el qué, no el cómo):**

1. **Listar fuentes.** Monitores (con resolución, refresco y cuál es el principal) y ventanas
   (con nombre de proceso, título y una miniatura). Necesito el nombre del proceso para poder
   decir "detectamos que es un juego".
2. **Capturar una fuente y devolverme video ya comprimido**, en H.264, a la resolución y los
   cuadros que le pido, comprimido por el chip de la placa. Que me avise si no pudo y cayó
   al procesador, en vez de hacerlo en silencio.
3. **Dejarme cambiar resolución, cuadros y bitrate en caliente**, sin cortar.
4. **Decirme si la fuente está tapada**: ventana minimizada, juego en pantalla completa
   exclusiva, contenido protegido que sale negro.
5. **Avisarme si la fuente cambió de tamaño** (pasa siempre: entrás a un juego y el monitor
   cambia de resolución).
6. **Números, cada 2 o 3 segundos, no cada cuadro:** cuadros capturados, cuadros
   efectivamente comprimidos, milisegundos por cuadro, si está usando el chip o el
   procesador, y cuántas sesiones de compresión por hardware quedan libres.

**Y lo que hay que decidir junto con el área de escritorio, porque no es obvio:** si el
ayudante me devuelve video comprimido, ¿cómo entra eso a la llamada? Hay dos caminos
(meterlo en la conexión que ya existe, o que el ayudante mantenga su propia conexión de
video y la app solo señalice) y los dos tienen costo. **Esto es una pregunta abierta y
conviene contestarla antes del paso 2**, porque cambia dónde vive la lógica de bitrate.

### D3. Cómo se elige la calidad que se manda a cada persona

Tres cosas distintas que se suelen confundir:

**a. Qué publico.** Lo decide mi preset y mi conexión de subida. Nada más.

**b. Qué recibe cada uno.** Lo decide el repartidor combinando tres datos: el tamaño en
píxeles en que esa persona está dibujando el video (me lo pasa la interfaz), su preset, y su
banda real de bajada. **El más chico de los tres manda.** Si tenés fibra y modo tostadora,
recibís la capa chica: el preset no es una sugerencia.

**c. Qué pasa cuando falta banda.** Acá hay una elección que importa y que casi nadie hace
bien: cuando no entra todo, se puede **bajar la resolución para mantener los cuadros** (se
ve borroso pero fluido) o **bajar los cuadros para mantener la resolución** (se ve nítido
pero a los saltos).

| Contenido | Qué priorizar | Cómo se marca |
|---|---|---|
| Un juego, un video | los cuadros | contenido de movimiento |
| Código, un documento, una planilla | la resolución | contenido de detalle |
| Cámara | los cuadros | contenido de movimiento |

**Recomendación:** un interruptor de dos posiciones al empezar a compartir, "esto es un
juego o un video" contra "esto es texto", con el primero por defecto. Es una sola pregunta y
resuelve el 90 % de las quejas de "se ve borroso" y "va a los tirones". Si detectamos nombre
de proceso de juego (con el ayudante nativo), se elige solo.

**Y lo que se olvida siempre:** la conexión de subida argentina es asimétrica. Mucha gente
baja 300 megas y sube 5. Pantalla a 1080p60 necesita unos 4 Mbps de subida sostenidos, más
la voz, más lo que esté haciendo el resto de la casa. **Antes de dejar elegir 60 cuadros hay
que medir la subida real** (se puede, con una prueba corta al empezar la llamada) y avisar:
"tu subida da 3 Mbps, a 60 cuadros vas a ir a los saltos, ¿ponemos 30?".

### D4. Qué pasa con una placa vieja o sin chip de compresión

Cuatro escalones, en este orden:

1. **Detectar, no suponer.** La llamada misma reporta qué está usando para comprimir y para
   descomprimir. Se lee y listo (ver sección 6). Nada de listas de placas.
2. **Si no hay chip, no se prohíbe: se limita.** Comprimir 1080p60 por procesador es
   posible, pero se come varios núcleos y el juego lo siente. Tope automático a 1080p30 o
   720p30 y un cartel honesto: "tu placa no puede comprimir video, lo está haciendo el
   procesador; bajamos a 30 cuadros. Podés subirlo igual".
3. **Del lado del que mira, es más grave.** Si alguien manda AV1 y la placa del que mira no
   lo sabe descomprimir, 1080p60 por procesador es brutal. Por eso la regla: **el codec lo
   decide el que mira** (D1).
4. **El caso que nadie ve venir: quedarse sin sesiones de compresión.** El chip de la placa
   aguanta un número limitado de compresiones simultáneas (en placas de consumo históricamente
   2, subido a 3 y después a 5 según el controlador; **hay que verificar cuántas da la 1060
   con el controlador que tenga instalado**). Martín usa OBS, que también usa ese chip. Si
   está grabando o transmitiendo **y** comparte pantalla, puede quedarse sin sesión y caer al
   procesador sin enterarse. El ayudante nativo tiene que reportar esto y la app tiene que
   decirlo con todas las letras.

### D5. Una conexión o dos (video aparte de la voz)

No estaba en la lista pero hay que decidirlo antes, porque después es carísimo cambiarlo.

- **A. Todo por la misma conexión.** Menos negociación, menos puertos, menos consumo de
  mensajes de señalización (que es uno de los dos cuellos de botella reales del proyecto).
- **B. Voz por una conexión, video por otra.** Si el video se rompe, se atora o hay que
  reiniciarlo, la voz no se entera.

**Recomendación: B, dos conexiones separadas.** El motivo es de producto, no técnico: **la
voz es sagrada y el video es sacrificable.** Si compartir pantalla te corta la conversación,
la app perdió. Con dos conexiones podemos tirar abajo el video entero y reconstruirlo sin
que nadie deje de escucharse. El costo son unos mensajes más de señalización al armar la
llamada, y eso se compensa de sobra con el arreglo ya pendiente de usar un canal por par de
personas en vez de gritarle a toda la sala.

---

## 4. LO QUE SE NOS ESTÁ OLVIDANDO

### El audio del sistema en Windows

La limitación conocida es esta: compartiendo **pantalla completa** se puede capturar el
sonido del sistema; compartiendo **una ventana suelta**, generalmente no. Pero hay tres
cosas más que nadie recuerda hasta que explotan:

**a. El eco.** Si capturás el audio del sistema, estás capturando **también la voz de los
demás saliendo de tus parlantes**. El otro se escucha a sí mismo con medio segundo de
retraso, que es la forma más rápida conocida de arruinar una llamada. *Hay que verificar si
el capturador del sistema excluye el audio de nuestro propio proceso.* Si no lo excluye, hay
dos salidas: exigir auriculares (con cartel) o restarle la señal de la llamada a la mezcla.

**b. El volumen relativo.** El juego a todo trapo tapa la voz. Hace falta un control de
volumen del audio del sistema independiente del de las voces, y conviene que baje solo
cuando alguien habla.

**c. Qué pasa si el usuario elige ventana.** No se puede quedar sin audio y sin explicación.
La app tiene que ofrecer: "para que se escuche el sonido, compartí la pantalla entera".

**Matriz que hay que verificar, una fila por prueba real:**

| Qué comparto | ¿Llega audio del sistema? | ¿Se cuela mi propia llamada? | ¿Cuántos cuadros llega a dar? |
|---|---|---|---|
| Monitor completo | verificar | verificar | verificar |
| Segundo monitor | verificar | verificar | verificar |
| Ventana de un juego | verificar | verificar | verificar |
| Ventana de un navegador | verificar | verificar | verificar |
| Ventana minimizada | verificar | verificar | verificar |

### Monitores de distinta resolución y refresco

Martín tiene 144 Hz. Capturar una pantalla de 144 Hz a 60 cuadros por segundo **no es un
número redondo**: 144 dividido 60 da 2,4. El resultado es un tironeo raro, donde cada tanto
un cuadro dura más que el anterior. Los divisores exactos de 144 son 72, 48, 36 y 24.

**Propuesta:** en vez de ofrecer siempre "15 / 30 / 60", ofrecer los cuadros **ajustados al
refresco del monitor elegido**. En un monitor de 144 Hz las opciones serían 48 y 72 (y el
techo duro de 60 se lee como "hasta 60", así que 48). En uno de 60 Hz serían 15, 30 y 60.
*Hay que verificar si el capturador respeta un pedido de cuadros exacto o redondea solo.*

Y lo demás del mismo cajón:

- **Escalado de Windows.** Un monitor 4K al 150 % se captura a resolución física. Hay que
  decidir dónde se achica a 1080p, y que el texto no quede ilegible.
- **Dos monitores distintos.** El selector tiene que decir cuál es cuál con algo mejor que
  "Pantalla 1" y "Pantalla 2": tamaño, refresco y una miniatura.
- **La resolución cambia en vivo.** Entrás a un juego y el monitor cambia de resolución o
  de refresco. La transmisión no se puede cortar por eso. *Hay que verificar qué hace el
  capturador y si hay que renegociar la conexión.*

### Juegos en pantalla completa exclusiva

Cuando un juego toma la pantalla en modo exclusivo, le saca el control al sistema de
ventanas. Resultado habitual: el que mira ve **negro o el último cuadro congelado**.

- Detectar el caso y avisar **al que transmite** ("no se está viendo nada, poné el juego en
  ventana sin bordes"), no dejar que se entere el que mira.
- La detección confiable necesita el ayudante nativo.
- La recomendación de "ventana sin bordes" cuesta un poquito de rendimiento en el juego,
  así que el aviso tiene que decirlo.
- **Hay que verificar** si esto pasa con la captura del navegador, con la del ayudante, o
  con las dos.

### Varias pantallas compartidas a la vez

La regla ya decidida resuelve la recepción: te llega una sola, la que estás mirando. Falta
decidir del lado del que publica y del cambio:

- **¿Una persona puede publicar dos pantallas?** Recomendación: **no**, ni en el hito 3 ni
  en el 4. Duplica el trabajo de compresión y no lo pide nadie.
- **Varias personas compartiendo al mismo tiempo: sí.** La interfaz muestra la lista y vos
  elegís cuál mirar.
- **Cambiar de pantalla tiene un costo.** Al suscribirte a una nueva hay que esperar un
  cuadro completo, que puede tardar hasta un segundo. Sin aviso parece que se colgó. Dos
  cosas: pedir el cuadro completo apenas te suscribís, y mostrar un indicador de carga corto.
- **No precargar "por las dudas".** Suscribirse a las tres pantallas para que el cambio sea
  instantáneo es exactamente lo que la regla vino a evitar.

### Qué ve el que tiene la ventana minimizada

Son dos casos distintos y los dos se olvidan:

**El que PUBLICA minimiza la ventana que está compartiendo.** Una ventana minimizada no se
dibuja, así que se congela o se pone negra. *Hay que verificar el comportamiento exacto.*
Lo importante: el que mira tiene que leer "la ventana está minimizada", no quedarse mirando
un cuadro congelado pensando que se colgó la app.

**El que MIRA minimiza Llamadita.** Acá está el ahorro que más se pasa por alto: si la app
está minimizada o el video no se está viendo, **hay que desuscribirse**. Si no, seguimos
bajando y descomprimiendo 4 Mbps para nadie. Es el mismo error que ya cometimos con los
canvas, pero veinte veces más caro. Cuando volvés a mirar, te resuscribís.

Y el caso intermedio: la app está abierta pero estás en el chat, no en la vista de video.
Misma regla.

### El costo de DESCOMPRIMIR (el que se funde es el que mira)

Es el punto más contraintuitivo de toda el área. El que transmite comprime **una sola vez**
gracias al repartidor. El que mira descomprime **todo lo que le llega**: una pantalla a
1080p60 más siete caritas.

- **Si todo se descomprime por hardware, es barato.** Una pantalla a 1080p60 en H.264 no le
  hace nada a una placa moderna ni a una vieja.
- **Si se cae al procesador, es una masacre.** Sobre todo con codecs modernos.
- Por eso la regla de D1 (el codec lo decide el que mira) y la de "te llega una sola
  pantalla" no son ahorros de red: son **protección del espectador**.
- **Las caritas también cuestan.** Ocho videos chiquitos son ocho descompresiones. Algunas
  placas tienen límite de flujos simultáneos. La capa chica ayuda, pero si hay más de
  ocho caras conviene **congelar las que no están hablando**: mostrar la foto de perfil en
  vez del video de quien no habló en los últimos treinta segundos, con un botón para fijar
  a alguien.

### Trampas sueltas que valen su párrafo

- **El relé gratuito.** Cuando la conexión directa no se puede armar, la llamada pasa por un
  relé público y gratuito. Meter 4 Mbps de pantalla por ahí es abusar de algo que no pagamos
  y encima va a andar mal. **Regla: si la llamada va por relé, la pantalla se limita** (por
  ejemplo 720p a 15 cuadros) y se avisa por qué. El medidor ya sabe decir si la llamada va
  directa o por relé, así que el dato está a mano.
- **Los primeros segundos se ven borrosos.** La llamada arranca con poco bitrate y sube a
  medida que comprueba que la red aguanta. Diez segundos de borroso parecen un problema de
  la app. Hay que avisarlo con un cartelito que se va solo.
- **Compartir la pantalla entera muestra TODO.** Notificaciones, mails, ventanas de atrás.
  Hace falta: una cuenta regresiva de tres segundos antes de empezar (para que cierres lo
  que no querés mostrar), un indicador permanente e imposible de no ver de que estás
  compartiendo, y un atajo de corte inmediato.
- **Contenido protegido sale negro.** Algunas apps y algunos reproductores bloquean la
  captura. No es un bug nuestro, pero hay que detectarlo y decirlo.
- **Adornar el video cuesta.** Un `<video>` se dibuja en la placa casi gratis, pero si le
  ponés bordes redondeados, sombras, filtros o transformaciones, puede caer a dibujarse por
  procesador. **Esto va dicho a la interfaz como restricción**, no como sugerencia.
- **Notebooks a batería.** Compartir a 60 cuadros con una notebook desenchufada la funde en
  media hora. Si se puede detectar que está a batería (*hay que verificar si las APIs que
  tenemos lo dan*), sugerir bajar el preset.
- **El permiso de captura dentro de la app de escritorio.** El selector de fuentes es una
  ventana del motor del sistema. **Hay que verificar** que aparezca bien dentro de nuestra
  ventana y que no haya que aprobar el permiso a mano cada vez.
- **La app usa un puerto fijo y no puede haber dos copias abiertas.** Eso complica probar
  video en una sola máquina. Toda prueba de esta área necesita **dos PCs**, y conviene
  decirlo desde el principio.

---

## 5. CÓMO SE CONECTA CON LOS PRESETS

### Primero, una contradicción que hay que resolver

El roadmap dice dos cosas que no cierran entre sí:

- La tabla de presets: "Soy cheto" = pantalla **1440p60**, cámara **1080p 30/60**.
- Los techos duros: **máximo 1080p**, cámara **hasta 30**, pantalla **hasta 60**.

**Recomendación: manda el techo duro.** "Soy cheto" se lee como "1080p60 con más bitrate y
mejor codec", no como más píxeles. Y 1440p queda, si acaso, como ajuste manual fuera de
preset con aviso. **Esto lo tiene que confirmar Martín**, no lo decide esta ficha.

### Lo que toma esta área en cada preset

Con esa corrección aplicada, y agregando las columnas que faltaban:

| | **PC tostadora** | **PC estándar** | **Llamadita** | **Soy cheto** |
|---|---|---|---|---|
| Cámara | 360p 15 | 540p 30 | 720p 30 | 1080p 30 |
| Bitrate de cámara | ~250 kbps | ~600 kbps | ~1,2 Mbps | ~2,5 Mbps |
| Pantalla | 720p 15 | 1080p 30 | 1080p 60 | 1080p 60 |
| Bitrate de pantalla | ~0,8 Mbps | ~2,5 Mbps | ~4 Mbps | ~7 Mbps |
| Codec | H.264 hardware | H.264 hardware | H.264 hardware | H.264, y AV1/VP9 solo de a dos si ambas placas lo bancan |
| Capas de cámara | 1 (solo la chica) | 2 | 2 | 3 |
| Al faltar banda | baja resolución | baja resolución | baja resolución | baja resolución (o la otra si es texto) |
| Audio del sistema | apagado por defecto | a elección | a elección | a elección |
| Caras que no hablan | congeladas | congeladas si hay más de 8 | congeladas si hay más de 8 | siempre en vivo |
| Recibir pantalla | 720p 15 | 1080p 30 | 1080p 60 | 1080p 60 |

Los bitrates son **punto de partida a validar con el medidor**, no verdad revelada. El de
1080p60 a 4 Mbps sí viene de la investigación.

### Qué significa eso en plata (y por qué el preset no es decoración)

De a dos siempre es **cero**, porque va directo. En grupo, lo que sale del repartidor a cada
espectador es lo que se cuenta contra los 1.000 GB por mes gratis. Con **tres personas
mirando una pantalla compartida**:

| Preset | GB por hora | Horas gratis por mes | Y si se pasa |
|---|---|---|---|
| Tostadora | 1,1 | ~920 | 5 centavos de dólar cada 20 GB |
| Estándar | 3,4 | ~295 | |
| Llamadita | 5,4 | ~185 | unos 27 centavos de dólar la hora |
| Soy cheto | 9,5 | ~105 | unos 47 centavos de dólar la hora |

Nueve veces de diferencia entre las dos puntas. **Ese es el motivo por el que los presets
existen.**

Y para las cámaras, la regla de que cada una viaja del tamaño en que se muestra: ocho
caritas dibujadas en recuadros de 200 píxeles necesitan una capa de 320x180, que son unos
150 kbps, contra los 1.200 kbps de la capa grande. Ocho veces menos, y nadie ve ninguna
diferencia. El roadmap estima que bien hecho ese caso pasa de 34 a 126 horas gratis por mes.

### Cuando el usuario quiere más de lo que su preset permite

Palabras de Martín: *"si tenés el preset en modo tostadora no vas a ver a 60 fps, y tiene
que aparecerte un botón para subirlo avisándote que consume más"*.

El comportamiento exacto, en cuatro reglas:

**1. Nunca se prohíbe, siempre se explica.** La opción de 60 cuadros **está visible** en
modo tostadora. No está gris ni escondida. Está marcada como "arriba de tu perfil".

**2. El aviso es un número, no un adjetivo.** Nada de "esto puede consumir más recursos".
Va así:

> **60 cuadros por segundo está arriba de tu perfil (PC tostadora).**
> Vas a necesitar unos 4 Mbps de subida (tenés 5,2 medidos).
> En tu máquina, comprimir a 60 cuadros le cuesta al juego alrededor de 8 cuadros por segundo.
> Con 3 personas mirando, una hora consume 5,4 GB de los 1.000 gratis del mes.
> [ Subirlo igual ] [ Dejarlo en 15 ]

Los tres números son medidos, no de manual: la subida la mide la app, el costo en cuadros
sale de la prueba de la sección 6, el consumo sale del contador del mes.

**3. Subirlo NO cambia el preset.** Queda como un ajuste a mano por encima del perfil, se
ve marcado en la interfaz ("PC tostadora, con 1 ajuste a mano") y hay un botón de "volver al
perfil" siempre a la vista. El roadmap ya dice que cada ajuste se puede tocar por separado:
esto es eso, nada más.

**4. Si el ajuste sale mal, la app lo dice.** Si después de subirlo el medidor ve que la
compresión no da o que la red no aguanta, aparece un aviso: "subiste a 60 y no está dando;
¿lo bajamos?". Con botón. **Nunca se baja solo y en silencio.** Que la app decida por vos
sin avisar es exactamente lo que nos molesta de la competencia.

**El caso al revés también existe:** alguien en "Soy cheto" que comparte con alguien en
tostadora. Ahí manda **el que mira**: recibe 720p15 aunque el otro esté publicando 1080p60.
Y al que publica se le muestra, sin drama, "una persona te está viendo en calidad reducida
por su configuración".

---

## 6. CÓMO SE PRUEBA

Nada de "se ve bien". Ocho criterios con número.

### 1. Cuántos cuadros le roba al juego (la prueba que define el paso 5)

**El procedimiento:**

1. Elegir un juego con un banco de pruebas repetible. CS2 permite reproducir una grabación
   siempre igual: sirve perfecto, porque la misma escena corre tres veces idéntica.
2. Correr tres veces: **sin la app abierta**, **con la app abierta sin transmitir**, **con
   la app transmitiendo a 1080p60**.
3. Anotar cuadros promedio y, más importante, **el percentil 1** (el peor 1 % de los
   cuadros, que es lo que se siente como tirón).

**Criterios de aprobación:**

| Medición | Objetivo | Inaceptable |
|---|---|---|
| App abierta sin transmitir | pérdida menor al 1 % | más del 3 % |
| Transmitiendo a 1080p30 | pérdida menor al 5 % | más del 10 % |
| Transmitiendo a 1080p60 | pérdida menor al 10 % | más del 20 % |
| Percentil 1 transmitiendo | no empeora más del 15 % | tirones visibles |

**Si a 1080p60 la pérdida da menos del 5 %, el ayudante nativo no hace falta.** Ese es el
número que decide la pieza más cara del proyecto.

**Ojo con la herramienta.** La herramienta canónica para medir cuadros desde afuera es
PresentMon (de Intel, gratis y abierta), pero **normalmente necesita permisos de
administrador y en esta máquina no hay**. Hay que verificar. Plan B: el contador de cuadros
del propio juego, que en CS2 se puede registrar y es suficiente para comparar tres corridas
de la misma grabación.

### 2. Que esté comprimiendo por hardware, confirmado

La propia llamada reporta qué está usando. En las estadísticas de salida hay un campo que
dice el nombre del compresor, y en las de entrada, el del descompresor. Hay además un
indicador de si es o no eficiente en energía. **Hay que verificar que el motor del sistema
los exponga en nuestro caso.**

**Criterio:** con H.264 a 1080p, el compresor reportado tiene que ser el de la placa, no uno
por software. Si dice software, algo está mal y el usuario tiene que enterarse.

### 3. Milisegundos por cuadro

Las estadísticas dan cuadros comprimidos y tiempo total de compresión. Dividiendo sale el
tiempo por cuadro.

**Criterio:** a 60 cuadros por segundo hay 16,6 milisegundos por cuadro de presupuesto
total. Comprimir tiene que llevar **menos de 3 ms** si va por hardware. Más de 8 ms es señal
de que cayó al procesador.

### 4. Cuadros que salen de verdad

**Criterio:** pedís 60, salen 55 o más de forma sostenida. Si salen 30, o el capturador no
da o la red no aguanta, y hay que saber cuál de las dos. El campo de "motivo de la
limitación de calidad" lo dice: procesador, ancho de banda o ninguno.

### 5. Bitrate real contra el pedido

**Criterio:** dentro del 20 % del tope del preset, sostenido. Y el tiempo hasta llegar a
calidad plena desde que empieza: **menos de 10 segundos**.

### 6. Latencia de la imagen

**Criterio:** de a dos, menos de 150 ms entre que pasa algo en tu pantalla y se ve en la
otra. **Cómo se mide sin equipo caro:** poner un cronómetro con milisegundos en la pantalla
compartida, sacarle una foto a las dos pantallas juntas con el celular, y restar. Es
rudimentario y funciona.

### 7. Que la interfaz cumpla su parte

**Criterio:** con la app minimizada, el tráfico de bajada de video tiene que caer a **cero**
en menos de 5 segundos. Se mira en el medidor. Si no cae, la desuscripción no está andando y
estamos pagando por nada.

Y: con ocho caritas de 200 píxeles en pantalla, la resolución que reporta cada video
recibido tiene que ser la chica (alrededor de 320x180), no 1280x720. Si es 1280, la regla de
oro del ahorro no está implementada.

### 8. Que el ahorro exista, en el contador del mes

Una hora compartiendo pantalla con tres mirando, en Llamadita, tiene que mover el contador
del mes **unos 5,4 GB**. En tostadora, **alrededor de 1,1 GB**. Si los dos números dan igual,
el preset no está haciendo nada.

---

## 7. LO QUE NO VA ACÁ

**Del área de voz:** el micrófono, el codec y bitrate de audio, el corte de envío en
silencio, la cancelación de eco, la supresión de ruido propia, el umbral de detección de
voz, el volumen por persona, los visualizadores de espectro, el audio posicional. **Salvo
una cosa:** el audio del **sistema** que viaja con la pantalla sí es mío.

**Del área de repartidor e infraestructura:** montar y configurar el repartidor, la cuenta
de Cloudflare, la eventual mudanza al servidor propio, el contador de consumo del mes, la
señalización, los servidores de relé, la política de reintentos. Esta área **usa** el
repartidor y declara qué necesita de él; no lo administra.

**Del área de escritorio y ayudante nativo:** cómo se saca la imagen de la memoria de la
placa, cómo se habla con el chip de compresión, el atajo global para hablar apretando una
tecla, el medidor de procesador, placa y memoria, la ventanita siempre encima, la bandeja
del sistema, el instalador. Esta área define **el pedido**, no la implementación.

**De la interfaz:** el layout de la grilla, cuántas caritas por fila, la estética, el tema
claro y oscuro, las animaciones. Con **una excepción que vuelve para acá**: el tamaño en
píxeles en que se dibuja cada video, y el aviso de cuándo un video dejó de verse.

**Decisiones ya tomadas que no se reabren:**

- **La capa pegada adentro del juego: no.** Está en la lista de "lo que decidimos NO hacer".
  Es justamente lo que le tira los cuadros a la competencia. La alternativa nuestra es la
  ventanita chica siempre encima, y eso es del hito 6 y de otra área.
- **Empaquetar un navegador propio: no.** Aunque diera mejor control de la compresión.

**Fuera de alcance por decisión de producto:**

- Grabar la pantalla en disco, transmitir a plataformas de streaming, recortar y publicar
  clips.
- Ver videos juntos o jugar adentro de la app: ya está descartado en el roadmap.
- Fondos virtuales, desenfoque de fondo, filtros y máscaras de cámara. Son lindos y comen
  placa de video en la máquina del que transmite, que es exactamente lo que el proyecto
  promete no hacer. Si algún día entra, entra como opción apagada por defecto y solo en
  "Soy cheto".
- Emisión de uno a muchos a escala (uno habla, cien miran). Es el caso más caro de reparto y
  ya está descartado.
- Compartir dos pantallas propias al mismo tiempo (ver sección 4).
- Video en el cliente web y en el móvil: eso es el hito 8, y cada plataforma nueva
  multiplica el trabajo de todo lo anterior.

---

## Resumen de lo que hay que verificar antes de escribir código

| # | Qué | Quién puede contestarlo |
|---|---|---|
| 1 | La contradicción de "Soy cheto" (1440p contra el techo de 1080p) | **Martín** |
| 2 | Cómo entra el video del ayudante nativo a la llamada | esta área + escritorio |
| 3 | La matriz de audio del sistema (5 filas de la sección 4) | prueba real en Windows |
| 4 | Si el capturador del sistema se cuela nuestra propia llamada (eco) | prueba real |
| 5 | Qué hace la captura con un juego en pantalla completa exclusiva | prueba real |
| 6 | Si el motor del sistema expone el nombre del compresor y descompresor | prueba real |
| 7 | Cuántas sesiones de compresión por hardware da la 1060 con el controlador actual | prueba real |
| 8 | Si hay forma de medir cuadros del juego sin permisos de administrador | prueba real |
| 9 | Si el capturador respeta un pedido de cuadros exacto (48/72 en un monitor de 144 Hz) | prueba real |
| 10 | Si el selector de fuentes se ve bien dentro de la ventana de la app | prueba real |
| 11 | Si el repartidor de Cloudflare transcodifica (yo asumo que no) | documentación |
