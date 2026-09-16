# Área: el medidor de consumo (el bench) y los cuatro presets

**Qué es este documento.** La ficha de diseño del área, escrita antes de tocar código. No es
el roadmap (eso está en `ROADMAP.md`) ni la investigación (está en
`INVESTIGACION-COMPETENCIA.md`): es el detalle fino de cómo se construye esta pieza, en qué
orden, qué decisiones hay que cerrar primero y con qué se la prueba.

**Fecha:** 16 de septiembre de 2026. **Versión de la app al escribirlo:** `0.16.2A`.

**El chiste que hay que evitar, dicho de entrada:** un medidor que consume es un chiste. Esta
área tiene que ser la más barata de todas, porque es la que le pone número a la promesa
principal del proyecto. Si el medidor gasta, no podemos mostrar el número sin hacer trampa.

**Lo que ya está medido y no se discute:** con la app abierta, la ventana a la vista y sin
llamada, gastábamos 6,49 % de procesador dibujando medidores a 60 cuadros por segundo contra
pantallas que nadie estaba mirando. Arreglado (versión `1.15.1A`) quedó en **0,45 %**. La
memoria propia es de **220 MB**. Esos tres números son el punto de partida de todo lo que
sigue.

---

## 1. FRONTERAS

### 1.1 Lo que entra

**a. El medidor (el bench).**
- De dónde sale cada número, con qué API y con qué costo.
- Cada cuánto se refresca cada grupo de números, y quién maneja ese reloj.
- Dónde se dibuja, con qué reglas visuales (por qué no puede tener vidrio esmerilado ni
  animaciones) y cómo se prende y se apaga.
- Qué muestra cuando no hay nada que medir (sin llamada), que es el 90 % del tiempo.
- El contrato con el ayudante nativo que hace falta para leer procesador y memoria de verdad:
  qué le pedimos, cada cuánto, y en qué formato contesta.

**b. El cajón de la configuración.**
- Un solo lugar donde vive todo ajuste que consuma recursos: leer, escribir, avisar a quien
  le interese que algo cambió, guardar entre sesiones.
- El registro de ajustes: qué ajustes existen, en qué unidad, qué valores acepta cada uno,
  cuál es el techo duro, cuánto cuesta cada opción y quién lo aplica.

**c. Los cuatro perfiles.**
- Qué valor toma cada ajuste en cada perfil.
- Qué pasa cuando alguien toca un ajuste suelto y se sale del perfil.
- Cómo se avisa el costo cuando quiere subir la calidad, y cómo se ofrece subirla igual.

**d. Lo nuestro que consume.** El bucle de dibujo, los visualizadores, las animaciones de la
interfaz y la cadena de medición de audio. Esta parte es importante y suele olvidarse: **el
preset también nos aprieta a nosotros**, no solo a la red.

### 1.2 Lo que NO entra

- **Aplicar** los ajustes de audio (bitrate, mono o estéreo, corte en silencio, cancelación
  de eco). Yo defino la perilla, su nombre, su unidad y sus valores. Escribir eso en la
  llamada es del área de voz.
- **Aplicar** los ajustes de cámara y pantalla. Ídem.
- **Juntar** el consumo del mes. El acumulador vive donde pasa el tráfico (red y grupo, hito
  4). El medidor solo lo muestra.
- **Optimizar** el motor de audio. Si encuentro que algo gasta de más (y encontré, ver
  sección 4), lo denuncio, no lo arreglo.
- **La pantalla general de ajustes de la app** (dispositivos, notificaciones, cuenta). El
  cajón donde se guardan es mío; la ventana donde se tocan es de interfaz.

### 1.3 Con qué áreas linda, y dónde está el límite exacto

| Área vecina | Dónde termina la mía | Dónde empieza la de ellos |
|---|---|---|
| **Voz** (`audioManager.js`, `peerManager.js`) | el ajuste `audio.bitrate = 32` guardado en el cajón, y el número que el medidor lee de vuelta de la llamada | escribirlo en la negociación de la llamada y que el micrófono salga así |
| **Pantalla y cámara** (hito 3) | los ajustes `pantalla.resolucion`, `pantalla.fps`, el techo duro y el cartel de costo | capturar, comprimir y mandar |
| **Chat** (hito 5) | el ajuste `interfaz.animaciones` y la clase que lo apaga en toda la app de una | que el chat se vea bien sin animaciones |
| **Escritorio y empaquetado** | el contrato con el ayudante nativo (qué datos, cada cuántos segundos, en qué formato) | compilar ese ayudante, meterlo en el instalador, lidiar con el antivirus |
| **Red y grupo** (hito 4) | mostrar el contador del mes en el panel del medidor | juntar los gigabytes y guardarlos |

### 1.4 Lo que es ambiguo y hay que cerrar de palabra antes de arrancar

1. **El ayudante nativo, ¿de quién es?** Mi propuesta: el contrato es mío (qué pide el
   medidor), el binario es del área de escritorio. Si nadie lo aclara, alguien va a escribir
   un ejecutable adentro del área del medidor y después no se sabe quién lo mantiene.
2. **El atajo de teclado.** Mientras sea adentro de la app, es mío. El día que sea un atajo
   global (que anda aunque estés en el juego), pasa a escritorio, porque necesita ayuda
   nativa. Son dos cosas distintas con el mismo nombre.
3. **La ventana de ajustes.** El cajón es mío, la ventana es de interfaz. Pero el *registro
   de ajustes* (qué ajuste existe, qué valores acepta) tiene que ser mío y único, si no la
   ventana va a tener su propia lista y en tres meses no coinciden.
4. **La cadena de medición de audio.** El `ScriptProcessorNode` de `audioManager.js` corre
   siempre, aunque los visualizadores estén apagados (ver 4.2). Apagarlo es del área de voz,
   pero el ajuste que lo apaga es mío. Hay que ponerse de acuerdo en quién lo hace, porque es
   de las pocas cosas que gastan procesador incluso con la ventana minimizada.

---

## 2. EL CAMINO

Seis pasos. El orden importa y cada paso dice qué queda andando y qué se rompe si se hace
después.

### Paso 1. El cajón de la configuración, chiquito pero de verdad

**Qué se hace.** Un área nueva, `src/config/`, con dos archivos: uno que guarda y avisa
(`preferencias.js`) y otro que declara qué ajustes existen (`ajustes.js`). Nada visible.
Persiste en el navegador (`localStorage`) con una copia en disco (ver decisión D1) y lleva un
número de versión del formato desde el día uno.

**Qué queda andando.** Podés cambiar un valor desde la consola y algo reacciona. Suena a poco
y es la pieza que sostiene todo lo demás.

**Qué se rompe si se hace después.** Esto es lo importante y es la única parte donde me
aparto del orden que propone el roadmap. Si el medidor se construye primero, el medidor va a
guardarse solo si está abierto o cerrado, con su propia llave en `localStorage`. Después llega
la capa de presets, que en la tabla dice *"medidor de consumo: visible en tostadora, oculto en
estándar"*. Y ahí tenés dos fuentes peleando por lo mismo: cambiás el preset a tostadora y el
medidor no aparece, porque se acuerda de que vos lo cerraste. Ese bug es clásico, tarda media
hora en encontrarse y obliga a reescribir el medidor entero para sacarle su memoria propia.
Media hora de hacer el cajón primero lo evita.

El cajón arranca con tres o cuatro llaves nomás, las que el medidor necesita. Se llena en el
paso 3.

### Paso 2. El medidor, etapa 1: solo lo que ya se puede leer

**Qué se hace.** El recuadro, en texto plano, con lo que la propia llamada entrega sin ayuda
de afuera: subida y bajada en kbps, paquetes perdidos, jitter, ida y vuelta, si la llamada va
directa o por relé, y el codec y el bitrate reales con los que está saliendo la voz. Del lado
de la máquina: los cuadros por segundo que está dibujando la interfaz. Refresco: una vez por
segundo. Apagado por defecto, se prende con un atajo.

**Qué queda andando.** Por primera vez hay un número a la vista de la promesa principal. Y de
paso sale el pendiente número 2 de la investigación: **con qué bitrate y qué codec está
saliendo la voz hoy**, que es el dato que falta para escribir la fila "Llamadita" de la tabla
de presets. Hoy lo decide el navegador solo y nadie lo miró.

**Qué se rompe si se hace después.** Los cuatro presets se escriben a ciegas. La columna
"Llamadita" dice "lo que suena hoy" justamente porque nadie sabe qué es. Si armás los presets
antes de medir, inventás un número, la voz suena distinta a como sonaba, y no tenés con qué
comparar.

### Paso 3. Los cuatro presets sobre el cajón

**Qué se hace.** Se llena el registro de ajustes con todo lo que existe hoy, se escriben los
cuatro perfiles, se arma la lógica de "perfil más retoques" (decisión D2) y el rótulo
*"(modificado)"*. Se conectan los ajustes que ya se pueden aplicar hoy: visualizadores,
animaciones, tope de cuadros del bucle de dibujo, visibilidad del medidor. Los de audio quedan
declarados y los aplica el área de voz.

**Qué queda andando.** Ponés la app en tostadora, se apagan los visualizadores, el bucle baja
a 15 cuadros y el medidor lo muestra. Es el "listo cuando" del hito 2, con una aclaración
honesta: en esta etapa el procesador todavía se mira en el Administrador de tareas, igual que
se midió la línea de base. El medidor todavía no lo sabe leer.

**Qué se rompe si se hace después.** Nada grave, pero el paso 4 no se puede hacer: no hay
techo del que salirse.

### Paso 4. El aviso de costo y el botón de subir igual

**Qué se hace.** El mecanismo que Martín describió: si estás en tostadora no vas a ver a 60
cuadros por segundo, pero la opción está a la vista, apagada, con el motivo escrito y un botón
que dice "subirlo igual". Al tocarlo aparece el costo concreto, en números, no en adjetivos, y
tres salidas: subir solo eso, cambiar de perfil entero, o dejarlo como está.

**Qué queda andando.** La app deja de ser paternalista. Nunca te esconde una opción: te dice
lo que cuesta y decidís vos.

**Qué se rompe si se hace después.** Si primero se hace el ayudante nativo (paso 5) y esto
queda para el final, el usuario que abre la app en tostadora ve opciones grises sin
explicación y asume que la app no las tiene. Es la peor primera impresión posible para un
proyecto cuya bandera es "la calidad no se paga".

### Paso 5. El medidor, etapa 2: procesador, memoria y placa de video de verdad

**Qué se hace.** El ayudante nativo, chiquito, que reporta cada 2 o 3 segundos. Se agrega el
permiso que falte en la configuración de escritorio (hoy `computer.*` ni siquiera está
habilitado, ver decisión D8) y se mete el binario en el empaquetado.

**Qué queda andando.** El número que le importa a todo el mundo: cuánto procesador está
usando. Sin abrir el Administrador de tareas.

**Qué va último, y por qué.** Es el único paso que necesita un binario nuevo, un cambio en el
empaquetado, un permiso nuevo y probablemente una pelea con el antivirus. Si se hace primero,
toda el área queda trabada esperando que el instalador ande. Todo lo de los pasos 1 a 4 se
hace con lo que ya tenemos.

### Paso 6 (después, hito 4). El contador del mes

Se enchufa al mismo cajón y al mismo panel. No se construye ahora, pero **se le deja el lugar
ahora**: una fila vacía en el panel y una llave reservada en el cajón. Si no, cuando llegue
hay que rediseñar el panel.

---

## 3. DECISIONES QUE HAY QUE TOMAR ANTES DE ESCRIBIR CÓDIGO

Estas son las que si se toman mal obligan a rehacer.

### D1. ¿Dónde se guarda la configuración?

**Opciones reales:**
- **a. En el navegador de la app** (`localStorage`, que es lo que ya usa el updater).
- **b. En la cuenta de Supabase**, así te sigue de una máquina a otra.
- **c. En un archivo en disco**, con la API de archivos de Neutralino (ya está permitida).

**Recomiendo: (a) como principal, con una copia en (c).**

**Por qué.** Un preset describe **la máquina**, no la persona. Si te seguís a vos, entrás en
la PC de tu amigo y le ponés "soy cheto" a una notebook. Y guardar en la cuenta cuesta lo que
menos nos sobra: escrituras y mensajes de Supabase, que es el cuello de botella real del
proyecto (el techo son 2 millones de mensajes por mes y la cuenta ya daba 1,6 millones).

**Por qué la copia en disco, que parece paranoia y no lo es.** Ya nos pasó. En la versión
`1.5.1A` la app abría en un puerto distinto cada vez y el navegador interno la veía como otro
sitio, así que pedía el micrófono de nuevo en cada apertura. Todo lo guardado en
`localStorage` está atado a `http://localhost:24024`: si ese puerto cambiara alguna vez, o si
alguien limpia los datos del WebView, la configuración se va entera y el usuario vuelve a
"Llamadita" sin entender por qué. La copia en disco cuesta diez líneas: se escribe cuando
cambia algo (nunca en cada tick) y se lee solo si `localStorage` vino vacío.

**Hay que verificar:** si reinstalar con el instalador conserva la carpeta de datos del
WebView2. No lo sé y cambia cuán necesaria es la copia.

### D2. ¿Perfil con retoques, o valores planos?

**Opciones reales:**
- **a. Plano.** Elegir un perfil copia sus valores al cajón y se olvida de dónde salieron.
- **b. Perfil más retoques.** Se guarda `{perfil: "llamadita", retoques: {"pantalla.fps": 60}}`
  y el valor efectivo se calcula.

**Recomiendo: (b), sin dudarlo.**

**Por qué.** Tres razones concretas.
1. Podés mostrar *"Llamadita (modificado)"* y un botón "volver al perfil". Con la opción (a)
   no hay forma de saber qué tocaste.
2. La app se actualiza sola. El día que midamos el bitrate real de la voz y corrijamos el
   perfil "Llamadita", con la opción (b) todos los que están en Llamadita reciben la
   corrección. Con la (a) quedan congelados para siempre en los números del día que
   eligieron el perfil, y nadie entiende por qué a uno le suena distinto que al otro.
3. Un ajuste nuevo que aparece en una versión futura (supresión de ruido propia, por ejemplo)
   se suma solo a todos los perfiles. Con la opción (a) hay que migrar la configuración de
   cada usuario.

### D3. ¿Los ajustes se declaran en un solo lugar o se escriben donde haga falta?

**Opciones reales:**
- **a. Cada pantalla arma su lista** de opciones a mano.
- **b. Un registro declarativo**: cada ajuste es una entrada con id, nombre en criollo,
  unidad, valores permitidos, techo duro, costo estimado de cada valor, quién lo aplica, y si
  se puede cambiar en el medio de una llamada o no.

**Recomiendo: (b).**

**Por qué.** Del mismo registro comen tres cosas: la pantalla de ajustes, la tabla de los
cuatro perfiles y el cartel de costo. Si son tres listas separadas, en dos meses el cartel de
costo habla de 1080p y la pantalla ofrece 1440p. Es el error más caro de esta área porque no
se rompe: se desincroniza en silencio.

Forma propuesta de una entrada (esto es el esqueleto, no código):

```
pantalla.fps
  nombre visible: "Cuadros por segundo de la pantalla compartida"
  unidad: fps
  valores: 15, 30, 60
  techo duro: 60
  costo: 15 -> ~0,8 Mbps de subida | 30 -> ~2,5 Mbps | 60 -> ~4 Mbps
  lo aplica: área de pantalla
  en caliente: no (se aplica cuando arranca la próxima transmisión)
```

### D4. ¿Un solo reloj para el medidor o uno por número?

**Recomiendo: un solo reloj, y que se pare del todo cuando el panel está cerrado.**

Un `setInterval` de 1 segundo. Cada tres vueltas, además, le pide los datos al ayudante
nativo. Cuando el panel se cierra, `clearInterval`, no "salteá el dibujo". La diferencia es
justamente la lección de la versión `1.15.1A`: un bucle que sigue corriendo y descarta el
trabajo igual gasta.

**Prohibido de entrada:** `requestAnimationFrame` adentro del medidor. Nunca. Ni para
"suavizar" un número.

### D5. ¿Cómo se cuentan los cuadros por segundo de la interfaz sin crearlos?

Esta es una trampa fina y merece ser decisión. Para contar cuadros por segundo hace falta un
bucle que corra en cada cuadro. Si el medidor arma su propio bucle para contar, **fuerza al
navegador a dibujar 60 veces por segundo aunque no haya nada que dibujar**, o sea que el
medidor crea exactamente el consumo que dice estar midiendo. Sería el chiste perfecto.

**Recomiendo:** el bucle que ya existe en `main.js` lleva su propia cuenta (una suma, cuesta
nada) y el medidor la lee una vez por segundo. Si el bucle no está corriendo porque no hay
nada a la vista, el medidor muestra **"en reposo"**, no "0 fps". Un cero se lee como falla; "en
reposo" se lee como que la app está haciendo lo correcto.

### D6. ¿Qué atajo lo prende?

**Recomiendo `Ctrl + Shift + M`** (de medidor), más un ítem en ajustes y más lo que diga el
perfil. Adentro de la app nomás: el atajo global necesita ayuda nativa y es del hito 6.
**Hay que verificar** que ese atajo no se lo coma WebView2 (varias combinaciones con `Ctrl +
Shift` están tomadas por el navegador). Si está tomada, la segunda opción es `F9`.

### D7. ¿Qué pasa con los números que saltan?

Decisión chica que se nota mucho: el bitrate calculado segundo a segundo salta como loco.

**Recomiendo:** promedio de las últimas 3 muestras, y **que el panel diga "promedio de 3 s"**.
Además: mientras no haya dos muestras, se muestra un guion, no un cero (la gente saca captura
del cero y pregunta por qué no anda). Y los números van con ancho fijo y cantidad fija de
dígitos, con la tipografía monoespaciada que la app ya carga, porque si el ancho cambia el
panel se mueve solo, y mover cosas cuesta dibujar.

### D8. ¿Cómo se lee el procesador de verdad?

**Opciones reales:**
- **a. La API `computer.*` de Neutralino.** Ya está verificado: da RAM total del sistema, datos
  del procesador, pantallas y discos, pero **no da uso de procesador ni memoria del proceso**.
  Encima **hoy ni siquiera está habilitada**: la lista de permisos en
  `desktop/neutralino.config.json` tiene `app`, `os`, `window`, `updater`, `events`,
  `filesystem` y `clipboard`. No sirve sola, igual conviene habilitarla para saber cuánta RAM
  tiene la máquina y poder sugerir un perfil.
- **b. Ejecutar un comando del sistema** cada 3 segundos con `os.execCommand` (ya permitido).
  Cero binarios nuevos. Pero levantar un intérprete de comandos cada 3 segundos cuesta bastante
  procesador por sí solo: sería la forma más graciosa posible de demostrar la ironía del área.
- **c. Un ayudante nativo que queda vivo** (extensión de Neutralino) y reporta por su cuenta.

**Recomiendo: (c), y (a) de paso para la RAM total.** El (b) sirve para una prueba de una
tarde, para saber si el número que queremos leer es el que creemos, y nada más.

**Costo en plata:** cero. Todo esto es gratis. El único gasto posible aparece si en algún
momento queremos firmar el ejecutable para que Windows no muestre la advertencia de editor
desconocido: un certificado de firma anda por los **USD 100 a 400 por año** (hay que
verificar precio actual). No hace falta para funcionar, sí para que el instalador no asuste.

**Hay que verificar:** las extensiones de Neutralino necesitan estar habilitadas en la
configuración (hoy no hay ninguna clave de extensiones) y suman un segundo ejecutable adentro
de la instalación, que es justo lo que los antivirus miran con lupa.

### D9. ¿Se puede pasar de un perfil a otro perdiendo los retoques?

**Recomiendo:** al cambiar de perfil los retoques se descartan, **avisando cuántos son**
("vas a perder 3 ajustes que tocaste a mano"), con un "deshacer" en el aviso que dura unos
segundos. Es barato y evita el enojo de perder media hora de configuración por un click.

### D10. ¿Se elige perfil la primera vez que abrís?

**Recomiendo: no hay asistente inicial.** Arranca en "Llamadita" (que es el recomendado) y
listo. Una sola vez, la app puede **sugerir** (no imponer) otro perfil si la máquina parece
justa, leyendo la cantidad de núcleos y la RAM. Sugerir, con un "no, gracias" que no vuelve a
aparecer.

**Hay que verificar:** `navigator.deviceMemory` en WebView2 (en algunos motores no existe).
La cantidad de núcleos (`navigator.hardwareConcurrency`) sí está en todos lados.

### D11. ¿El medidor puede ser lindo?

**Recomiendo: no como el resto de la app, y a propósito.** El estilo de la app es vidrio
esmerilado y sombras. El esmerilado es de las cosas más caras que puede hacer una interfaz, y
las sombras del visualizador también. El medidor va **fondo sólido, tipografía monoespaciada,
sin sombra, sin transiciones, sin animación**. Que parezca un instrumento y no una tarjeta.
Eso no es dejadez estética: es coherencia. Un medidor con vidrio esmerilado encima del juego
sería la contradicción hecha pixel.

---

## 4. LO QUE SE NOS ESTÁ OLVIDANDO

Acá va lo despiadado. Varias de estas las encontré leyendo el código, no son teoría.

### 4.1 La línea de base que tenemos es la del caso aburrido

Los 0,45 % están medidos **sin llamada**. Y el arreglo de la `1.15.1A` funciona porque el
bucle no dibuja cuando las cabinas no están a la vista. **Pero en una llamada las cabinas
están a la vista, y ahí el bucle vuelve a correr a pleno, con dos canvas, dos espectros de 32
barras con sombra y dos formas de onda.** O sea: el número que publicamos como diferencial es
el del caso en que la app no hace nada. **El consumo en llamada no está medido por nadie.**

Esto es lo primero que tiene que medir el medidor, y hay que estar preparados para que el
número no sea lindo.

### 4.2 Hay consumo que el preset no apaga y nadie está mirando

En `audioManager.js`, tanto el micrófono propio como el audio del otro pasan por un
`ScriptProcessorNode` de 1024 muestras. Eso significa una función de JavaScript que se ejecuta
**unas 47 veces por segundo, en el hilo principal**, recorriendo muestra por muestra 1024
valores, y por partida doble cuando hay llamada. Corre aunque:

- los visualizadores estén apagados,
- el medidor esté cerrado,
- estés silenciado (la función igual se llama, solo que sale antes),
- **la ventana esté minimizada**.

Además el procesador está conectado a la salida de audio, lo que mantiene el motor de audio
corriendo todo el tiempo. Y esa pieza está marcada como obsoleta desde hace años.

**Por qué importa acá:** el perfil "PC tostadora" apaga los visualizadores y la gente va a
esperar que el consumo se desplome. Si esto queda prendido, no se desploma, y el perfil queda
como que no sirve. **El ajuste de tostadora tiene que apagar o aflojar también la medición de
audio**, no solo el dibujo. Opciones para el área de voz: usar el analizador que ya está en la
cadena (que corre fuera del hilo principal) en vez del procesador, mover el procesador a un
hilo de audio aparte, o al menos agrandar el buffer a 4096 (de 47 llamadas por segundo a 12).

Marcado como **hay que verificar**: no está medido cuánto cuesta. Pero es el único candidato
que explica consumo con la ventana minimizada, y es exactamente el tipo de cosa que se
descubre midiendo. Es, para mí, el hallazgo más valioso de esta lectura.

### 4.3 El monitor de 144 Hz rompe la cuenta de "60 cuadros por segundo"

Todos los comentarios del código hablan de 60 cuadros por segundo. `requestAnimationFrame` no
corre a 60: corre **a la frecuencia del monitor**. En la máquina de Martín, que es de 144 Hz,
el bucle corre 144 veces por segundo, o sea **2,4 veces más caro de lo que dice el comentario**.
Y el freno que hay hoy solo actúa cuando la ventana perdió el foco.

Consecuencias directas para esta área:
- El perfil "Llamadita" no puede decir "visualizadores completos" a secas: tiene que decir
  **"hasta 60 cuadros por segundo"**, con un tope real en milisegundos.
- El tope se escribe en milisegundos entre cuadros, nunca como "uno sí, uno no", porque "uno
  sí uno no" da 72 en un monitor de 144 y 30 en uno de 60. Distinto resultado según el
  monitor.
- **Hay que verificar** en la máquina de Martín: contar cuadros durante 10 segundos con el
  bucle actual y ver si da 600 o 1.440.

### 4.4 El medidor de memoria puede hacernos quedar como mentirosos

`performance.memory` (lo que se puede leer sin ayuda nativa) devuelve **solo el montón de
JavaScript**, que va a marcar unas decenas de megas. La memoria real de la app son 220 MB de
memoria propia y 422 MB de memoria de trabajo. Si el panel dice "Memoria: 48 MB" y el
Administrador de tareas dice 420, el medidor pierde toda credibilidad de una, y con él la
promesa del proyecto.

**Recomiendo:** en la etapa 1, o no mostrar memoria, o mostrarla con el rótulo exacto
*"memoria de JavaScript"* y una aclaración de que no es el total. La memoria de verdad llega
en la etapa 2.

**Hay que verificar:** existe una función más nueva que sí mide más cosas
(`measureUserAgentSpecificMemory`), pero pide que la página esté aislada de otros orígenes, lo
que puede pelearse con el cliente de Supabase y con las tipografías que se cargan de afuera.
Probarla antes de contar con ella.

### 4.5 Los números del medidor son contadores acumulados, no velocidades

Lo que entrega la llamada son totales desde que arrancó (bytes mandados, paquetes perdidos).
El bitrate es una resta entre dos muestras dividida por el tiempo. Tres trampas:

- Si se usa el reloj de pared y la máquina se suspende o se cambia la hora, la resta da
  cualquier cosa y el panel muestra un número absurdo. Usar el reloj monótono de la página.
- Si la máquina duerme, el intervalo no se ejecuta y la siguiente muestra tiene un hueco de
  minutos. Hay que descartar las muestras con un hueco raro, no dibujarlas.
- Al reconectar, los contadores vuelven a cero y el bitrate da negativo. Hay que detectarlo y
  reiniciar la cuenta.

### 4.6 Pedirle datos a la llamada 60 veces por segundo hace que la memoria se vea mal

Cada pedido de estadísticas arma un mapa con decenas de entradas. A una vez por segundo es
nada. A 60 por segundo es basura constante que el recolector tiene que limpiar, y los picos
de limpieza **hacen saltar el número de memoria que el propio medidor está mostrando**. El
medidor empeoraría la métrica que muestra. Una vez por segundo y punto.

### 4.7 "Directa o por relé" no es un dato de color, es plata

Si la llamada se cae a relé (porque una de las dos redes no deja pasar la conexión directa),
el audio y la pantalla pasan por un servidor de terceros. Hoy usamos un servicio gratuito
ajeno, así que no lo pagamos nosotros. Pero:

- la latencia sube, que es justo nuestro diferencial;
- el cifrado de punta a punta sigue estando, pero la ruta ya no es nuestra;
- **si algún día ese servicio gratuito deja de serlo o desaparece** y pasamos al relé pago,
  una llamada de voz relevada cuesta centavos por hora (unos 0,03 a 0,06 GB por hora a USD
  0,05 el GB: menos de un centavo), pero **una pantalla a 1080p60 relevada son unos 1,8 GB
  por hora, o sea unos USD 0,09 por hora**. Con gente compartiendo pantalla seguido, eso
  empieza a ser una cuenta.

Por eso el renglón "directa / por relé" del medidor es, además, la alerta temprana más barata
que tenemos.

**Hay que verificar:** que el servicio de relé gratuito que usamos siga teniendo cupo libre.
Es una dependencia externa que puede evaporarse sin aviso.

### 4.8 Mi preset no me protege del otro

Los cuatro perfiles, como están escritos, describen **lo que yo mando y lo que yo dibujo**. No
dicen nada de **lo que yo acepto recibir**. En una llamada de a dos, si el otro está en "soy
cheto" y manda 1440p a 60 cuadros, **el que paga la descompresión es mi máquina**, la que está
en tostadora. Mi perfil no me salva.

Esto cambia la forma del registro de ajustes: cada ajuste tiene que saber si es **de salida**
(lo que mando) o **de entrada** (lo que acepto). Y hace falta, más adelante, poder pedirle al
otro que baje. Si esto no se contempla ahora, se contempla rehaciendo el registro.

Mínimo para el hito 2: que el registro tenga el campo, aunque todavía no haya ningún ajuste de
entrada. Para el hito 3, cuando aparezca la pantalla, ya hace falta de verdad.

### 4.9 Cambiar un ajuste en el medio de una llamada no siempre se puede

Algunas cosas (el bitrate del audio, el codec) se negocian cuando la llamada arranca. Cambiarlas
en caliente o requiere renegociar o directamente no se puede. Si el usuario toca la perilla y no
pasa nada, piensa que la app está rota.

**Recomiendo:** cada ajuste declara si se aplica en caliente o no, y la interfaz dice
**"se aplica en la próxima llamada"** al lado del control. Es una línea de texto que evita un
bug reportado.

### 4.10 Escribir la configuración en cada tick congela la app

`localStorage` se escribe de forma bloqueante. Si el contador del mes (paso 6) o cualquier otra
cosa guarda en cada vuelta del reloj, la app tiene un micro-freno cada segundo. **Se guarda
cuando algo cambia, agrupado, nunca en cada muestra.**

### 4.11 La configuración vieja tiene que poder abrirse con la app nueva

La app se actualiza sola. Alguien que estuvo un mes sin abrirla salta varias versiones de una.
Si la configuración guardada tiene un ajuste que ya no existe, o le falta uno nuevo, no puede
romper nada. **Número de versión del formato desde el día uno, y lo que no se entiende se
ignora y se usa el valor del perfil.** Es media hora ahora y un dolor de cabeza evitado
después.

### 4.12 Los números en desarrollo no son los números de la app instalada

Todo lo medible de esta área se mide **en la app instalada**, con el Administrador de tareas
mirando el árbol de procesos completo, que es como se hizo la línea de base. En
`npm run dev`, en una pestaña del navegador, los números son otros. Y como la app usa un
puerto fijo, **no se pueden tener dos copias abiertas a la vez**: la prueba de dos personas
se hace con dos máquinas, o una instalada y una pestaña.

### 4.13 El medidor no puede mostrar direcciones IP

Las estadísticas de la llamada incluyen las direcciones de los dos lados. En el panel va el
**tipo** de ruta ("directa" o "por relé"), nunca la dirección. Alguien va a transmitir con el
medidor abierto en pantalla.

### 4.14 Detalles chicos que arruinan la experiencia

- El panel en una esquina puede tapar algo. Que se pueda elegir entre las cuatro esquinas (es
  una clase de CSS, cuesta cero). Arrastrable, no: cuesta y no hace falta.
- Si el panel está abierto 30 minutos guardando historial para un gráfico, la memoria crece.
  Por eso en la etapa 1 no hay gráfico: solo el último valor y el promedio de 3.
- El nombre "Llamadita" para un perfil, adentro de una app que se llama Llama-dita, se lee
  raro. Sugiero que en la interfaz aparezca como **"Llamadita (recomendado)"**. No toco los
  nombres, que ya están decididos.

---

## 5. CÓMO SE CONECTA CON LOS PRESETS

Acá va el detalle fino, que es el corazón del área.

### 5.1 Los cuatro perfiles, ajuste por ajuste

Lo que sigue **respeta** la tabla del roadmap y le agrega la parte que falta: qué significa
exactamente cada casillero del lado nuestro (dibujo y medición), que es la parte que nadie
había escrito.

| Ajuste | **PC tostadora** | **PC estándar** | **Llamadita** | **Soy cheto** |
|---|---|---|---|---|
| **Visualizadores de audio** | apagados: el canvas ni se dibuja | livianos | completos | completos |
| Qué es "livianos" | no aplica | 16 barras, sin sombra, sin forma de onda | 32 barras con sombra y forma de onda | igual que Llamadita |
| **Tope del bucle de dibujo** | 15 cuadros/s | 30 cuadros/s | 60 cuadros/s | lo que dé el monitor, con tope 144 |
| **Barra de nivel (el vúmetro)** | se actualiza 10 veces por segundo | 20 | 30 | 30 |
| **Animaciones de la interfaz** | apagadas (una clase que corta todas las transiciones) | básicas | completas | completas |
| **Vidrio esmerilado** | apagado (fondo sólido) | apagado | encendido | encendido |
| **Audio** | mono, bitrate bajo, corta el envío en silencio | intermedio | lo que suena hoy | estéreo, bitrate alto |
| **Supresión de ruido** | apagada | la del sistema | la del sistema | filtro propio (hito 6) |
| **Cámara** | 360p 15 fps | 540p 30 fps | 720p 30 fps | 1080p 30 fps |
| **Pantalla** | 720p 15 fps | 1080p 30 fps | 1080p 60 fps | 1440p 60 fps |
| **Codec de video** | H.264 por hardware | H.264 por hardware | H.264 por hardware | AV1 o VP9 |
| **Medidor de consumo** | visible, 1 vez por segundo, versión corta | oculto | oculto | visible, versión completa |
| **Medición de audio (lo nuestro)** | mínima (ver 4.2) | normal | normal | normal |

**Números de audio propuestos, a confirmar después de medir** (el paso 2 del camino es
justamente medir con qué sale hoy):

| | tostadora | estándar | Llamadita | cheto |
|---|---|---|---|---|
| Canales | mono | mono | a medir | estéreo |
| Bitrate | ~24 kbps | ~32 kbps | a medir | 96 a 128 kbps |
| Corte en silencio | sí | sí | a medir | no |

Los tres primeros son propuestas. **No se escriben en la tabla oficial hasta medir.**

**Techos duros, por encima de cualquier perfil y de cualquier retoque:** máximo 1080p de
resolución, cámara hasta 30 cuadros por segundo, pantalla hasta 60. Viven en el registro de
ajustes, en un solo lugar, no en cada pantalla.

### 5.2 Qué muestra el medidor en cada versión

**Versión corta (la de tostadora), cuatro renglones:**

```
CPU      2,1 %
RAM      238 MB
Subida   31 kbps      Bajada  33 kbps
Ruta     directa      Ida y vuelta  38 ms
```

**Versión completa (la de cheto):** lo anterior más paquetes perdidos, jitter, cuadros por
segundo de la interfaz, codec en uso, cuadros por segundo del video cuando lo haya, y el
contador del mes cuando exista.

**Sin llamada** (o sea, casi siempre), los renglones de red no muestran ceros:

```
CPU      0,5 %
RAM      221 MB
Llamada  sin llamada
Dibujo   en reposo
```

### 5.3 Cuando el usuario quiere más de lo que su perfil permite

Este es el caso que pidió Martín, palabra por palabra: *"si tenés el preset en modo tostadora
no vas a ver a 60 fps, y tiene que aparecerte un botón para subirlo avisándote que consume
más"*.

**Regla número uno: la opción nunca se esconde.** Aparece, apagada, con el motivo escrito al
lado. Esconder opciones es exactamente lo que hace la app que cobra por calidad, y nosotros
estamos haciendo lo contrario.

**Cómo se ve, paso a paso.** Estás en tostadora y abrís la calidad de la pantalla compartida:

```
Cuadros por segundo
  ( ) 15    ← elegido por tu perfil (PC tostadora)
  ( ) 30    Tu perfil llega hasta 15.  [ Subirlo igual ]
  ( ) 60    Tu perfil llega hasta 15.  [ Subirlo igual ]
```

Tocás "Subirlo igual" en 60 y aparece el cartel, con números y no con adjetivos:

> **Subir la pantalla a 60 cuadros por segundo**
>
> Vas a necesitar unos **4 Mbps de subida** sostenidos (ahora estás mandando 0,8) y va a
> usar más procesador para comprimir. Tu perfil es **PC tostadora**, que existe justamente
> para que la app no te moleste mientras jugás.
>
> [ Subir solo esto ]   [ Cambiar a Llamadita ]   [ Dejarlo como está ]
>
> *Si subís solo esto, tu perfil va a figurar como "PC tostadora (modificado)".*

**Después de aceptar:**
1. El perfil pasa a llamarse *"PC tostadora (modificado)"* en todos lados donde se muestre.
2. Aparece un botón **"volver al perfil"** que deshace todos los retoques de una.
3. **El medidor se abre solo, una vez**, apuntando al renglón que cambió. Es el momento
   exacto en que el número sirve: subiste la calidad, mirá lo que costó. Cerrarlo lo deja
   cerrado, no insiste.
4. Si el cambio no se puede aplicar en caliente, el cartel lo dice antes: *"se aplica en la
   próxima transmisión"*.

**Al revés (bajar la calidad) no hay cartel ni fricción.** Bajar es gratis y siempre se puede.

### 5.4 Cuando la app detecta que el perfil le queda grande

Si el medidor ve pérdida de paquetes alta sostenida, o el ayudante nativo ve el procesador
clavado, la app **sugiere**, nunca cambia sola:

> Estás perdiendo el 8 % de los paquetes. Bajar la pantalla a 30 cuadros suele arreglarlo.
> [ Bajar ]   [ No, gracias ]

**Nunca cambiar en silencio lo que el usuario eligió.** Eso sí: la llamada por su cuenta baja
la calidad cuando la conexión no da (eso lo hace el motor de WebRTC y no lo podemos ni lo
queremos apagar). Cuando pase, **el medidor lo tiene que decir**: *"la llamada bajó sola la
calidad porque la conexión no daba"*. Si no lo decimos, el usuario ve que eligió 60 y el
medidor marca 24, y concluye que el medidor miente.

### 5.5 Cómo se aplica un ajuste sin que el cajón dependa de medio proyecto

El cajón no puede importar el área de audio ni la de dibujo, si no se arma una dependencia
circular y el arranque se complica. Al revés: **cada área se suscribe al cajón** y aplica lo
que le toca. El cajón no sabe qué es un visualizador.

Para las cosas visuales hay un atajo que cuesta cero: el cajón escribe un atributo en la
etiqueta raíz del documento (algo como `data-perfil="tostadora"`) y el CSS apaga
transiciones, sombras y esmerilado para toda la app de una sola vez, sin que chat, panel
social ni cabinas tengan una línea de JavaScript para eso.

---

## 6. CÓMO SE PRUEBA

Todo se mide **en la app instalada**, con el Administrador de tareas sobre el árbol de
procesos completo, promediando 60 segundos, que es el método con el que se sacó la línea de
base. Los números de `npm run dev` no valen para estos criterios.

### 6.1 El medidor no puede costar

| Prueba | Criterio |
|---|---|
| App abierta, sin llamada, **medidor apagado** | procesador **≤ 0,6 %** (la base es 0,45) |
| Lo mismo con el **medidor prendido** | la diferencia contra la fila anterior **≤ 0,2 puntos porcentuales** |
| Medidor prendido 30 minutos seguidos | la memoria no crece más de **10 MB** entre el minuto 1 y el 30 |
| Medidor prendido, ventana minimizada | el reloj del medidor **no se ejecuta** (se comprueba con un contador interno, no a ojo) |

El segundo renglón es **el criterio que define si el área está bien hecha**. Si el medidor
cuesta más de 0,2 puntos, no se publica.

### 6.2 Los presets tienen que mover la aguja

| Prueba | Criterio |
|---|---|
| En llamada, cabinas a la vista, perfil Llamadita | **medir y anotar**. Hoy nadie sabe cuánto es. Es el número que falta. |
| Lo mismo en tostadora | **menos de la mitad** que Llamadita, medido en el mismo momento y con el mismo método |
| Tope de cuadros: contar cuadros durante 10 s en tostadora | entre **140 y 160** (o sea 15 por segundo), no 600 ni 1.440 |
| Tope de cuadros en Llamadita, en el monitor de 144 Hz | cerca de **600**, no de 1.440 |

### 6.3 Los números tienen que ser ciertos

- **Al menos una vez** hay que contrastar el bitrate que muestra el medidor contra una fuente
  de afuera (la columna de red del Administrador de tareas durante una llamada larga y
  quieta). Si no se contrasta nunca, el medidor es decorativo. Tolerancia razonable: 20 %,
  porque las dos cosas cuentan encabezados distintos.
- Con el micrófono silenciado y sin llamada, la subida tiene que mostrar un valor bajo y
  estable, no ceros y picos alternados.
- Al arrancar, mientras no haya dos muestras, guiones y no ceros.
- Sin llamada, el panel dice "sin llamada", no una fila de ceros.

### 6.4 La configuración tiene que aguantar

| Prueba | Criterio |
|---|---|
| Cambiar de perfil, cerrar, abrir | sigue en el perfil elegido |
| Cambiar de perfil y **actualizar la app** (updater) | sigue en el perfil elegido |
| Tocar un ajuste a mano | el rótulo dice **"(modificado)"** y aparece "volver al perfil" |
| Tocar "volver al perfil" | vuelven todos los valores del perfil, no solo el último |
| Cambiar de perfil con 3 retoques puestos | avisa que se pierden 3, y el "deshacer" los recupera |
| Meter a mano una configuración de una versión futura (un ajuste inventado) | la app abre igual, ignora lo que no entiende |
| Borrar los datos del navegador de la app | la configuración vuelve de la copia en disco |

### 6.5 El aviso de costo

| Prueba | Criterio |
|---|---|
| Tostadora, abrir calidad de pantalla | las opciones 30 y 60 **están a la vista**, apagadas, con motivo escrito |
| Tocar "subirlo igual" en 60 | el cartel muestra **un número de Mbps**, no un adjetivo |
| Aceptar | el perfil pasa a "(modificado)" y el medidor se abre una vez |
| Bajar de 60 a 15 | no aparece ningún cartel |

---

## 7. LO QUE NO VA ACÁ

Todo esto va a querer entrar a esta área. Hay que mandarlo a donde corresponde.

| Lo que va a querer entrar | A dónde va | Por qué |
|---|---|---|
| Arreglar la cadena de medición de audio (lo de 4.2) | **Voz** | yo encuentro y denuncio; el motor de audio es de ellos. El ajuste que lo apaga sí es mío |
| Implementar la captura de pantalla a 60 cuadros | **Pantalla y cámara (hito 3)** | yo defino la perilla y el cartel de costo, no la captura |
| Juntar los gigabytes del mes | **Red y grupo (hito 4)** | el acumulador vive donde pasa el tráfico; el medidor solo lo muestra |
| Un gráfico con historial, líneas de tiempo, exportar a archivo | **a ningún lado, por ahora** | es un analizador de rendimiento, no un medidor. Guardar historial es memoria que crece |
| Mandar las métricas a un servidor para ver cómo le va a la gente | **a ningún lado, y es un no** | cuesta mensajes de Supabase (el cuello de botella real) y va contra el espíritu del proyecto. Si alguna vez queremos números agregados, se piden a mano |
| Que la app baje la calidad sola cuando ve que la máquina sufre | **no** | sugerir sí, cambiar en silencio no. Y la adaptación de la llamada ya la hace el motor |
| Atajo global que prenda el medidor desde adentro del juego | **Comodidades de jugador (hito 6)** | necesita ayuda nativa |
| El modo que esconde datos personales al transmitir | **Comodidades de jugador (hito 6)** | al medidor le alcanza con no mostrar direcciones nunca |
| La ventana general de ajustes de la app | **Interfaz** | el cajón es mío, la ventana es de ellos |
| Una pantalla que compare nuestro consumo contra el de la otra app | **a la web, no a la app** | adentro del repositorio no se nombran otras apps, y eso es material de presentación |
| Elegir micrófono y parlante, volumen por persona | **Voz** | no es consumo, es dispositivo |
| Detectar el juego que estás corriendo para ajustar solo | **no** | eso pide engancharse al juego, que es justo lo que decidimos no hacer |

---

## Apéndice: lo que queda marcado como "hay que verificar"

1. Si reinstalar con el instalador conserva la carpeta de datos del navegador interno (define
   cuán necesaria es la copia en disco de la configuración).
2. Si `Ctrl + Shift + M` está libre en WebView2.
3. Cuánto cuesta realmente el `ScriptProcessorNode` de la cadena de audio (punto 4.2). Es la
   medición más urgente de todas.
4. Si el bucle de dibujo corre a 144 cuadros por segundo en la máquina de Martín (punto 4.3).
5. Si `measureUserAgentSpecificMemory` se puede usar sin romper el cliente de Supabase ni las
   tipografías (punto 4.4).
6. Si `navigator.deviceMemory` existe en WebView2 (para sugerir perfil en el primer arranque).
7. Si habilitar extensiones de Neutralino complica el instalador o dispara el antivirus.
8. Precio actual de un certificado de firma de código (estimado USD 100 a 400 por año; no
   hace falta para funcionar).
9. Si el servicio de relé gratuito que usamos hoy sigue teniendo cupo.
10. El bitrate y el codec reales con los que sale la voz hoy. Es el dato que completa la
    columna "Llamadita" de la tabla de presets, y sale gratis en el paso 2 del camino.
