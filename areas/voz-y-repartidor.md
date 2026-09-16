# Área: la voz y el repartidor

**Qué es esto.** La ficha de pensamiento del área de voz: de la llamada de a dos que ya
anda, a los canales de voz con varias personas, y el servidor repartidor que los hace
posibles. No es código ni un plan de tareas: es qué entra, en qué orden, qué hay que
decidir antes de escribir la primera línea, y qué nos estamos olvidando.

**Fecha:** 16 de septiembre de 2026. **Versión de la app al escribirlo:** `0.16.2A`.
**Documentos que manda:** `ROADMAP.md` (sobre todo 2b, 2c y los presets), `CLAUDE.md`,
`ESQUELETO.md` (área D: red y voz), y el capítulo 6 de `INVESTIGACION-COMPETENCIA.md`.

**Estado real de lo que hay hoy**, leído del código y no de memoria:
`src/network/peerManager.js` conecta **exactamente dos personas**. Tiene una sola
`RTCPeerConnection`, un solo `remotePeerId`, y cuando detecta un tercero corta con
"Sala completa (máximo 2 participantes)". La señalización (el "apretón de manos" para
armar la llamada) viaja por un canal de Supabase Realtime llamado `room_<sala>` y se le
manda **a toda la sala**: cada cliente recibe todo y descarta lo que no es para él con un
`if (payload.to !== this.myPeerId) return`. Los canales de voz del panel social
(`src/social/panel.js`) hoy no son canales de voz de verdad: el botón "Entrar a la sala de
voz" llama a `hooks.joinRoom(room_code)`, que hace `setRoom()` en el `peerManager` y te
mete en la misma sala de a dos. El propio texto de la interfaz lo admite: "por ahora de a
dos personas por sala".

---

## 1. Fronteras

### Lo que entra en esta área

1. **El transporte.** Todo lo que pasa entre que una pista de audio o video sale de tu
   máquina y llega a la de otro: la conexión (`RTCPeerConnection`), la negociación, los
   servidores de relevo (STUN y TURN), y la decisión de si la cosa va directa o por un
   servidor en el medio.
2. **La señalización.** Cómo se encuentran dos máquinas y se ponen de acuerdo, y cuántos
   mensajes de Supabase cuesta eso. Incluye el arreglo pendiente de mandarle el apretón de
   manos a la persona que corresponde en vez de gritárselo a toda la sala.
3. **El canal de voz como lugar persistente.** Que exista una lista de quién está adentro
   ahora, que la gente entre y salga sola sin que nadie llame a nadie, y que esa lista se
   vea desde afuera sin tener que entrar.
4. **El repartidor.** Cuál, dónde vive, cómo se enchufa, cómo se paga (o cómo no se paga),
   cómo se cambia por otro sin publicar una versión nueva de la app, y las cuatro
   condiciones del `ROADMAP.md` 2c aplicadas a la voz.
5. **La calidad de audio regulable.** Bitrate, mono o estéreo, corte de envío en silencio,
   corrección de errores, tamaño de paquete. Todo lo que define cuánto ocupa tu voz en el
   cable y cuánta máquina cuesta armarla.
6. **La reconexión y la caída.** Qué pasa cuando se corta, cuando cambia la red, cuando el
   repartidor se muere, cuando alguien entra tarde.

### Lo que NO entra pero linda pegado

**Pantalla y cámara (hito 3 y 4).** Comparten el mismo repartidor y la misma conexión. El
corte es este, y hay que escribirlo con precisión porque si queda borroso vamos a terminar
con dos sistemas de negociación peleándose:

| Cosa | De quién es |
|---|---|
| Que exista una conexión con la otra máquina, y que funcione | **voz** |
| Decidir si esa conexión va directa o por el repartidor | **voz** |
| Conseguir la dirección del repartidor y el permiso para entrar | **voz** |
| Los servidores de relevo para la gente detrás de CGNAT | **voz** |
| Meter una pista de audio en esa conexión y sacarle el sonido | **voz** |
| Meter una pista de **video** en esa conexión | **video**, usando la puerta que abre voz |
| Qué resolución, cuántos cuadros, qué codec, cuántas capas lleva ese video | **video** |
| A qué cámara ajena me suscribo y en qué tamaño la pido | **video** |
| La grilla, las miniaturas, el selector de monitor | **video** |
| Pedir un cuadro clave cuando alguien entra tarde | **video** pide, **voz** transmite el pedido |

**La regla de la frontera, en una línea: el área de video no abre conexiones nunca.** Le
pide una al transporte. Si algún día video necesita una conexión aparte (por ejemplo para
que la pantalla no arrastre a la voz cuando se cae), esa conexión también la abre y la
administra el transporte, no video.

**El único punto que no es de nadie y hay que acordar entre las dos:** en el momento en que
alguien publica video con tres o más personas en el canal, la regla de conmutación cambia y
hay que pasar todo el mundo al repartidor (`ROADMAP.md` 2b). La regla vive en mi área, pero
la dispara video. Concretamente: video **avisa antes** ("voy a publicar pantalla"), el
transporte promueve a todos, y recién entonces video empieza a publicar. Si video publica
primero y avisa después, el momento de la promoción se ve y se escucha como un corte.

**Otras áreas que lindan, y dónde está el corte:**

- **Captura de audio (`src/audio/audioManager.js`).** Esa área es dueña del micrófono y de
  cómo suena tu voz antes de salir: qué dispositivo, cancelación de eco, supresión de
  ruido, ganancia automática, el filtro propio del futuro. **Mi área toma la pista ya
  hecha y se ocupa de lo que le pasa cuando sale de la máquina.** El límite exacto: todo
  lo que se configura en `getUserMedia` es de ellos; todo lo que se configura en el emisor
  (`RTCRtpSender`) o en la descripción de la sesión es mío.
- **El medidor de consumo (hito 2, puntos 1 y 2).** Casi todos los números que muestra
  salen de `getStats()` de la conexión, que es mía. **Yo entrego los datos crudos, el
  medidor los dibuja.** El medidor no toca la conexión y yo no dibujo nada.
- **Los presets (hito 2, punto 3).** Ellos son dueños de dónde vive la configuración y de
  la interfaz. Yo soy dueño de **qué hace cada perilla de audio y qué pasa si alguien la
  mueve** (capítulo 5 de esta ficha). Yo leo el preset, no lo guardo.
- **Roles y permisos por canal (hito 4, punto 4).** El modelo de datos, las tablas y la
  interfaz son del panel social. Pero **el lugar donde el permiso se hace cumplir de
  verdad es la función de servidor que entrega el permiso de entrada al repartidor**, y esa
  función es mía. O sea: ellos definen quién puede hablar, yo hago que el que no puede, no
  pueda, aunque toquetee la app.
- **El contador de consumo del mes (hito 4, punto 3).** Yo reporto bytes; el contador los
  acumula, los guarda y los muestra.

---

## 2. El camino

El orden importa más que la velocidad. Cada paso deja algo funcionando y, si se hace
después del que le sigue, rompe o se tira a la basura.

### Paso 0. La prueba real entre dos PCs

**Antes que nada.** Es el pendiente número uno del proyecto (riesgo 1 de la investigación)
y todavía no se hizo. Dos máquinas distintas, en casas distintas, con micrófonos de verdad.

*Queda andando:* la certeza de que lo que ya escribimos funciona fuera de dos pestañas del
mismo navegador. *Si se hace después:* construimos tres hitos arriba de algo que nunca se
comprobó, y el día que falle no vamos a saber si es lo viejo o lo nuevo.

Criterios y planilla, en el capítulo 6.

### Paso 1. Medir con qué está saliendo la voz hoy

Hoy el bitrate y el codec los elige el navegador solo y **nosotros no sabemos cuáles son**
(riesgo 2 de la investigación). Se lee de `getStats()` en una llamada real: codec, bitrate
de salida, tamaño de paquete, si hay corte en silencio.

*Queda andando:* el número que va en la columna "Llamadita" de la tabla de presets, que hoy
dice "lo que suena hoy" y es un lugar vacío. *Si se hace después:* los cuatro presets se
escriben a ojo y el recomendado queda definido por una casualidad del navegador.

Esto se apoya en el medidor (hito 2, punto 1), que es de otra área. Se puede hacer a mano
en la consola antes de que el medidor exista.

### Paso 2. La señalización dirigida (el arreglo pendiente)

Hoy cada mensaje del apretón de manos se manda al canal `room_<sala>` entero. Supabase
cobra **un mensaje por cada cliente que lo recibe**, no por mensaje enviado. En una sala de
dos da igual. En un canal de diez, cada candidato de red que manda uno se cobra diez veces.

El arreglo es un canal por par de personas. Propuesta concreta: el roster (quién está en el
canal) sigue en un canal compartido, que es barato porque solo se mueve cuando alguien
entra o sale; el apretón de manos se muda a un canal cuyo nombre lo determinan los dos
identificadores ordenados, al que solo están suscriptos esos dos.

*Queda andando:* armar un canal de voz de seis personas pasa de unos diez mil mensajes a
unos mil quinientos. *Si se hace después de la malla:* durante todas las pruebas de la
malla quemamos el presupuesto mensual de mensajes, y encima hay que rehacer el apretón de
manos entero porque la versión de a dos no se generaliza a N sola.

**Hay que verificar** antes de escribir código: si suscribirse y desuscribirse de un canal
de Supabase cuenta mensajes facturables, y si el tope de 200 son conexiones (un websocket
por persona, que es lo que creemos) o canales. Si fueran canales, la malla de ocho abre
siete canales por persona y el cálculo cambia entero.

**Oportunidad que aparece acá y es casi gratis:** hoy mandamos cada candidato de red por
separado apenas aparece. Se puede esperar medio segundo a que se junten los que hay y
mandar la oferta con todo adentro, y trickear solo los que llegan tarde. Cuesta entre medio
y un segundo más para conectar, y saca de encima la mayor parte de los mensajes. Con 20 a
50 personas, un segundo más para entrar a un canal no lo nota nadie. Es el ejemplo típico
de "más simple porque somos pocos".

### Paso 3. Las perillas de audio

Bitrate máximo, mono o estéreo, corte de envío en silencio, corrección de errores, tamaño
de paquete. Por defecto, exactamente lo que se midió en el paso 1, así nadie nota nada.

*Queda andando:* el punto 4 del hito 2 del roadmap, y una sala de a dos que se puede poner
en modo tostadora. *Si se hace después de la malla:* la malla de ocho personas se prueba
con la voz a lo que el navegador quiera, suena mal o consume de más, y sacamos la
conclusión equivocada de que la malla no sirve. **El corte de envío en silencio no es un
lujo del preset tostadora: es lo que hace viable la malla**, porque en un grupo de ocho
hablan uno o dos a la vez y los otros seis mandan casi nada.

### Paso 4. La malla: el canal deja de ser de dos

Acá pasa lo grande. Una conexión por persona en vez de una sola: el `pc` único se convierte
en un diccionario de sesiones. La regla de quién ofrece ya existe y se generaliza sola (el
identificador más alto ofrece), así que no hay que inventar nada.

**Y acá se construye ya la interfaz de transporte**, no después. Una sola puerta con estas
operaciones: entrar al canal, publicar una pista, dejar de publicar, suscribirse a alguien,
salir, y contar el estado. **La malla es la primera implementación de esa puerta. El
repartidor va a ser la segunda.** Si la puerta se inventa después, cuando llegue el
repartidor hay que reescribir el cliente y la promesa de "la mudanza es cambiar una
dirección" se muere ahí.

*Queda andando:* canales de voz reales de hasta seis u ocho personas, **gratis para
siempre, sin ningún servidor, con la latencia más baja que se puede conseguir**. Según el
capítulo 6.3 de la investigación, ocho personas en voz son unos 450 kbps de subida a 64
kbps cada una, y bastante menos con mono y corte en silencio. Entra en cualquier fibra.
Para un grupo de amigos de 20 a 50, **este paso solo ya cubre el uso cotidiano**.

*Si se hace después del repartidor:* nunca sabríamos si el repartidor hace falta, y
estaríamos gastando egress en salas de cuatro que no lo necesitan.

### Paso 5. El canal de voz persistente en la interfaz

Entrar y salir con un click, ver quién está adentro sin entrar, que el que entra se sume a
lo que ya está pasando. Esto es lo que hace cómoda a la competencia y es barato de hacer.

Propuesta de diseño para no gastar mensajes: **la membresía del canal de voz viaja en el
mismo canal de presencia que ya existe** (`presencia`, en `panel.js`), agregando a la meta
de cada persona en qué canal de voz está. Entrar a un canal de voz pasa a costar **una**
actualización de presencia, no una suscripción nueva a un canal nuevo. Y todo el mundo ve
quién está en cada canal sin suscribirse a nada más.

*Queda andando:* el canal de voz deja de ser un código de sala disfrazado.

### Paso 6. El repartidor detrás de la misma puerta

Se enchufa la segunda implementación de la interfaz del paso 4. Primero el servicio
administrado (ver decisión 3a). Mientras tanto la malla sigue funcionando y se puede
comparar una contra la otra con el mismo medidor.

*Si se hace antes del paso 4:* pagamos (en GB y en complejidad) por salas de tres que
andaban gratis, y perdemos la carta más fuerte que tenemos, que es la latencia mínima.

### Paso 7. La regla de conmutación y la promoción en caliente

Cuándo directo, cuándo malla, cuándo repartidor, y cómo se pasa de uno a otro sin que se
corte la charla. Va último de los grandes porque **recién acá hay dos modos entre los que
elegir**. Detalle en la decisión 3b.

*Queda andando:* el canal se adapta solo, y el usuario no se entera salvo por un cartelito
honesto que dice por dónde va.

### Paso 8. Lo que aparece cuando apriete

El contador de consumo del mes (hito 4, punto 3) y, si algún día hace falta, la mudanza a
una máquina propia. **No es trabajo de hoy**: el roadmap ya dice que la mudanza es cambiar
una dirección, y la decisión 3d define el mecanismo para que eso sea cierto.

---

## 3. Decisiones que hay que tomar antes de escribir código

### 3a. Qué repartidor

**Las opciones reales, con su costo:**

| Opción | Qué es | Costo | Trabajo nuestro |
|---|---|---|---|
| **Servicio de Cloudflare** | repartidor administrado, no se instala nada | **1.000 GB/mes gratis**, después **USD 0,05 por GB** | conectarse a su interfaz y nada más |
| **LiveKit** | repartidor abierto, completo (salas, participantes, capas, cifrado de punta a punta incluido) | el software es gratis; en máquina propia el costo es la máquina | montar y mantener un Linux, o usar su nube (**hay que verificar** el plan gratis actual) |
| **mediasoup** | biblioteca de repartidor, la más liviana y la que más control da | gratis | **hay que escribir el servidor de salas uno mismo** |
| **Janus** | repartidor viejo y sólido, por complementos | gratis | mantenerlo; su complemento de audio **mezcla**, y nosotros no queremos mezclar |

**Recomendación: el servicio de Cloudflare como repartidor de producción, y LiveKit como
el repartidor de la mudanza.**

Los motivos, en criollo:

1. **Cloudflare ya está en nuestra pila.** Ahí vive la web, ahí vive el dominio. No es un
   proveedor nuevo ni una cuenta nueva ni un riesgo nuevo.
2. **Los 1.000 GB gratis cubren el uso real con mucho margen.** Según el capítulo 6.6 de la
   investigación, una comunidad de 200 personas con tres horas de voz en grupo por día usa
   9,6 GB por mes en voz. Es el 1 % del cupo. Lo que come el cupo es la pantalla, no la voz.
3. **No hay nada que mantener.** El roadmap ya lo dice: diez minutos de trabajo. Una
   máquina propia es un Linux más que se actualiza, se cae y hay que mirar.
4. **mediasoup queda descartado por una razón de principio**: el roadmap dice "se instala,
   no se programa". mediasoup es justo lo contrario: te da las piezas y el servidor de
   salas lo escribís vos. Es la opción correcta si necesitáramos algo muy particular, y no
   lo necesitamos.
5. **LiveKit queda para el día que apriete**, no mediasoup, porque trae el modelo de salas y
   participantes ya hecho y la biblioteca de cliente lista. Ahí la máquina gratis de Oracle
   (4 núcleos ARM, 24 GB de RAM y **10 TB de salida por mes, USD 0**) da diez veces el cupo
   de Cloudflare.

**Lo que hay que verificar antes de comprometerse**, y que no está verificado hoy:

- Que el plan gratis del servicio de Cloudflare siga en 1.000 GB y USD 0,05 por GB
  (el dato es de la investigación del 15/09, conviene mirarlo el día que se empiece).
- Si su repartidor sabe reenviar **solo la voz de quien habla** (condición 3 del roadmap
  2c) o si esa selección la tenemos que hacer nosotros desde el cliente. LiveKit sí trae
  detección de hablante activo.
- Si soporta cifrado extremo a extremo del contenido (ver 3c).
- Cuánto pesa la biblioteca de cliente de LiveKit. **Si pesa mucho, choca de frente con la
  promesa de ser liviana** y habría que repensarlo.

### 3b. Cómo se decide si una llamada va directa o por repartidor

**Opciones:**

1. **Por cantidad, con un número fijo.** Predecible y explicable.
2. **Por medición:** arrancar en malla y degradar si la subida no da.
3. **Manual:** que lo elija el usuario.

**Recomendación: por cantidad, con el número guardado en la configuración y no clavado en
el código, más tres excepciones que fuerzan el repartidor.**

Los números propuestos, que salen del capítulo 6.4 de la investigación:

| Situación | Modo | Nos cuesta |
|---|---|---|
| 2 personas, cualquier cosa | **directo** | cero, siempre |
| 3 a 6 personas, solo voz | **malla** (cada uno con cada uno) | cero, siempre |
| 7 o más, solo voz | **repartidor** | egress |
| 3 o más con cámara o pantalla | **repartidor** | egress |

Y tres excepciones que pasan al repartidor aunque haya poca gente:

- **Alguien publica video con tres o más adentro.** Regla 2b del roadmap, sin discusión.
- **Mi preset es tostadora.** Explicado en el capítulo 5: la malla cuesta un codificador de
  audio por persona, el repartidor cuesta uno solo. Una máquina justa se cansa antes por la
  máquina que por la red.
- **Estoy con datos móviles o con poca subida.** Acá conviene un interruptor manual
  ("estoy con datos") antes que confiar en lo que informa el sistema, que en una PC de
  escritorio casi siempre miente.

**El detalle que define si esto funciona o se rompe: la decisión la toma uno solo.** Si
cada cliente decide por su cuenta, terminás con tres en malla y dos en el repartidor, y
nadie se escucha con nadie. Tiene que haber un árbitro determinístico (el de identificador
más bajo, o el dueño del canal) que escribe el modo en el roster, y los demás obedecen lo
que dice el roster. Nunca dos fuentes de verdad.

**Por qué guardar el umbral en configuración y no en el código:** el día que la prueba real
diga que la malla aguanta diez y no seis, o que aguanta cuatro, se cambia un número y lo
tienen todos, sin publicar una versión ni esperar que todos actualicen.

### 3c. Qué pasa con el cifrado cuando hay un servidor en el medio

**El hecho técnico, sin vueltas:** WebRTC siempre va cifrado, pero de salto en salto. En
una llamada directa hay un solo salto, así que **el cifrado es de punta a punta de verdad y
nadie más puede escuchar**. Con un repartidor en el medio hay dos saltos: vos ciframos
hasta el repartidor, el repartidor descifra, y vuelve a cifrar hacia el otro. **El
repartidor, técnicamente, puede escuchar.**

Eso no es un defecto de nuestro diseño: le pasa a todo el que usa un repartidor. Lo que se
decide es qué hacemos con eso.

**Opciones:**

1. **Aceptarlo y decirlo.** En la interfaz, que se vea en qué modo estás.
2. **Cifrar el contenido en el cliente** (lo que se llama "cuadros cifrados"): el repartidor
   reparte paquetes que no puede leer. Se puede hacer en el navegador que usamos. Cuesta:
   hay que repartir y rotar una clave cada vez que alguien entra o sale del canal (que es
   justamente lo que más pasa en un canal persistente), gasta más procesador, y le saca al
   repartidor la posibilidad de hacer algunas cosas.

**Recomendación: la opción 1 ahora, y la 2 más adelante solo si alguien la pide, pero
haciendo hoy dos cosas que no cuestan nada.**

Las dos cosas:

- **Un indicador honesto y permanente** que diga en qué modo va la conversación: directo
  (punta a punta), malla (punta a punta, porque tampoco hay servidor en el medio), o por
  repartidor. Dicho en criollo, no con jerga.
- **No diseñar nada que impida agregar el cifrado propio después.** En concreto, que la
  puerta del transporte pueda envolver los cuadros antes de que salgan. Es una línea de
  previsión, no trabajo.

Los motivos: el gran diferencial de "de a dos va directo" **ya nos da el cifrado real
donde más importa**, que es la charla privada. La malla de tres a seis también, y eso es un
argumento de venta buenísimo que hay que decir. Para el canal de grupo, con 20 a 50 amigos,
lo que la gente quiere saber es "¿esto lo lee una empresa?", y la respuesta honesta es "va
cifrado hasta un repartidor que no graba nada". Poner un sistema de claves rotativas para
un grupo de amigos, con la complejidad de repartirlas cada vez que alguien entra, es mucho
trabajo por poca diferencia real. Y **decir que algo es punta a punta cuando no lo es sería
exactamente la clase de cosa por la que la gente se está yendo de la otra app.**

Si algún día se hace: LiveKit lo trae de fábrica, lo que refuerza tenerlo como plan B.

### 3d. Cómo se hace la mudanza de un repartidor a otro sin tocar la app

**El hallazgo que cambia el diseño:** hasta hoy todas nuestras claves son públicas a
propósito (la de Supabase está pensada para ir en el cliente y lo que protege es RLS). **La
clave de un repartidor no es así: es un secreto que no se puede meter en la app.** Si la
ponemos en el cliente, cualquiera la saca del paquete y usa nuestros GB.

O sea que, quieras o no, hace falta **una pieza chiquita del lado del servidor**. Y esa
pieza es exactamente la costura por la que se hace la mudanza.

**Opciones:**

1. La dirección clavada en el código. Mudarse es publicar una versión y esperar que todos
   actualicen. **No.**
2. La dirección en un archivo de configuración que la app lee al abrir. Mejor, pero sigue
   sin resolver el secreto.
3. **Una función de servidor que dice "dame entrada al canal"** y devuelve todo junto: la
   dirección del repartidor, un permiso de entrada de vida corta y limitado a ese canal, y
   los servidores de relevo a usar.

**Recomendación: la opción 3, en una función de Supabase o de Cloudflare, consultada al
entrar a cada canal (no una sola vez al abrir la app).**

Por qué esta y no otra:

- **La mudanza pasa a ser cambiar esa función.** Nadie actualiza nada. El roadmap promete
  "cambiar una dirección"; esto es lo que hace que la promesa sea cierta.
- **Se consulta al entrar al canal**, así que se puede mudar un martes y la llamada de esa
  noche ya sale por el repartidor nuevo.
- **Ahí adentro vive el permiso.** La función mira si sos miembro del canal y si tenés
  permiso de hablar antes de darte el pase. Eso resuelve gratis el punto 4 del hito 4, y es
  el único lugar donde el permiso no se puede saltear toqueteando la app.
- **De paso arregla otra cosa que hoy está clavada: los servidores de relevo.** Hoy están
  escritos a mano en `peerManager.js` con usuario y contraseña públicos de un servicio
  gratuito sin ninguna garantía. Si ese servicio cierra, **toda la gente detrás de CGNAT se
  queda sin llamadas y hay que publicar una versión**. Si los entrega esta función, se
  cambian de proveedor en cinco minutos.
- **Y sirve de válvula.** Si algo se desmadra en consumo, se corta desde ahí.

Del lado del cliente, la otra mitad de la costura es la interfaz de transporte del paso 4,
con dos implementaciones (malla y repartidor). **Las dos cosas juntas son lo que hace que
cambiar de repartidor sea un trámite y no un proyecto.**

---

## 4. Lo que se nos está olvidando

### CGNAT, que en Argentina es la regla y no la excepción

Muchas conexiones hogareñas de acá (sobre todo cablemódem y todo lo móvil) comparten una
misma dirección pública entre montones de clientes. Resultado: las dos máquinas no se
pueden ver directamente ni con ayuda, y el audio tiene que pasar por un servidor de relevo.

**Lo que esto le hace a nuestra promesa:** "de a dos no cuesta nada" es cierto cuando la
conexión es directa. Si los dos están detrás de CGNAT, **la llamada de a dos también pasa
por un servidor**, aunque no haya repartidor. Las cuentas:

- Voz por relevo: unos 64 kbps, o sea **0,06 GB por hora** para la pareja. Contra 1.000 GB
  al mes, no se nota.
- **Pantalla en 1080p a 60 cuadros por relevo: unos 4 Mbps, o sea 1,8 GB por hora.** Ahí
  el caso estrella de "gratis para siempre" deja de ser gratis, y nadie lo tenía anotado.

Qué hacer con esto:

1. **Medirlo antes de suponer.** El medidor ya va a decir si la llamada va directa o por
   relevo. Con quince llamadas reales entre nosotros ya sabemos qué porcentaje de la gente
   necesita relevo. Sin ese dato, cualquier cuenta de costos de pantalla es de fantasía.
2. **Avisar honestamente.** Si vas a compartir pantalla en 60 cuadros y la conexión está
   yendo por relevo, la app debería decirlo.
3. **Sacar los servidores de relevo del código** (ver 3d).

### Si el repartidor se cae en medio de una llamada

Tres casos distintos y la app tiene que distinguirlos: que se muera el repartidor, que nos
corten por cupo, o que se nos venza el permiso de entrada (esto último se arregla renovando
antes de que venza, y es el más fácil de olvidar).

**La decisión de arquitectura que hay que tomar hoy, porque después no se puede: quién está
en el canal lo dice Supabase, no el repartidor.** Si el repartidor se cae, nadie "sale" del
canal: la gente sigue en la lista, se queda muda unos segundos y se reconecta. Si en cambio
la lista viviera en el repartidor, una caída vacía el canal y todos tienen que volver a
entrar a mano. Es una línea de diseño que cuesta cero ahora y es imposible de cambiar
después.

Y la caída tiene una salida elegante que solo existe porque tenemos los dos modos: **si se
cae el repartidor y hay seis o menos, se cae a malla**. Sigue la charla, con un cartel
honesto. Es de las pocas veces que tener dos caminos paga solo.

### Reconexión

Acá hay algo concreto para mirar en el código de hoy, y **hay que verificarlo en una prueba
real**: cuando la conexión falla, `restartIceConnection()` pide un reinicio de ICE (que es
la manera barata de reconectar sin perder nada) y **acto seguido, si sos el que llama,
arranca una llamada nueva de cero**, que cierra la conexión anterior y tira abajo el canal
de datos. O sea, el reinicio barato no llega a hacer nada. Si es así, la reconexión es
siempre la cara: se pierde el canal de datos, y con él el nombre que se muestra en la
cabina del otro.

Además, en ese mismo lugar se compara el identificador propio contra el del otro cuando el
del otro puede ser nulo (después de una desconexión se pone en `null`). Es chico, pero en
el momento justo hace que reconecte el que no debe, o ninguno.

Casos que hay que probar y que hoy no están cubiertos: suspender la notebook y despertarla,
pasar de wifi a cable, que se caiga internet diez segundos y vuelva, y que se caiga el
canal de señalización (Supabase) mientras la voz sigue andando, que es un caso lindo porque
la llamada **no se corta** pero nadie nuevo puede entrar.

### El que entra tarde a un canal que ya está andando

En malla, el que entra tiene que armar conexión con todos los que ya están. Con la regla
actual (el identificador más alto ofrece), si al que entra le tocó un identificador bajo,
tiene que esperar a que los seis le ofrezcan, y le van a llegar seis negociaciones al mismo
tiempo. Funciona, pero conviene escalonarlas unos milisegundos para que la máquina no se
trabe en el momento exacto en que entrás.

Con repartidor es más fácil: el que entra pide la lista de quién está publicando y se
suscribe. La lista sale del roster, que es lo que ya decidimos que vive en Supabase.

**Lo que en voz no es problema pero en video sí, y por eso lo anoto acá:** el audio no
tiene historia, así que el que entra tarde simplemente empieza a escuchar. El video no: el
que entra necesita un cuadro completo, y hasta que el que publica lo mande, ve gris. Es del
área de video, pero el pedido viaja por mi transporte.

### Eco

Tres trampas, y solo una es la obvia:

1. **La obvia:** que el micrófono levante lo que sale del parlante. La cancelación del
   navegador lo resuelve bien y ya está prendida por defecto.
2. **La que nos va a pasar:** la misma persona abierta dos veces en el mismo canal (la app
   de escritorio y el navegador, por ejemplo). Ahí hay un lazo de realimentación y un
   chillido. La app de escritorio usa un puerto fijo y por eso no se puede abrir dos veces,
   pero nada impide escritorio más navegador. **Hace falta una regla explícita: una sola
   sesión por persona en un canal de voz, y la nueva echa a la vieja.**
3. **La de diseño:** hoy el audio remoto va a un elemento de audio en la página
   (`remoteAudioElement`). Con una malla de seis serían seis elementos. **Conviene mezclar
   todas las voces remotas en un solo destino de audio**, no seis elementos sueltos: la
   cancelación de eco tiene una sola salida que cancelar, el volumen por persona (que ya
   está pedido para el hito 3) sale gratis, y se gasta menos máquina. Es una decisión que
   se toma en el paso 4 o no se toma nunca.

### Dispositivos que cambian

Enchufar los auriculares en medio de una llamada, que se caiga el bluetooth, que se
desconecte el micrófono. Hoy existe `updateLocalStream()` pero **reemplaza la pista en una
sola conexión**: con malla tiene que hacerlo en todas, y si falla en una, esa persona deja
de escucharte y vos no te enterás.

Falta además: escuchar el aviso del sistema de que la lista de dispositivos cambió (**hay
que verificar** si el área de audio ya lo hace), y poder elegir la **salida**, que hoy no se
puede en ningún lado (la investigación lo marca como pendiente del hito 2). Y un caso feo
de Windows: cuando desaparece el dispositivo por defecto, el navegador cambia a otro sin
avisar, y de golpe te estás escuchando por el parlante de la pantalla.

### El consumo de mensajes de señalización

Además del arreglo del paso 2, tres cosas que suman y que no estaban anotadas:

- **El pozo de candidatos está en 10** (`iceCandidatePoolSize: 10`). Junta candidatos de
  antemano para conectar más rápido. Más candidatos son más mensajes. Con la señalización
  dirigida deja de importar tanto; conviene revisarlo igual.
- **La presencia global.** El canal `presencia` le avisa a todos los conectados cada vez que
  alguien entra o sale. Con 40 conectados es medio millón de mensajes por mes solo por el
  puntito verde (capítulo 6.7 de la investigación). Si le agregamos un canal de presencia
  por cada canal de voz, lo duplicamos. **Por eso la propuesta del paso 5 es meter el canal
  de voz en la presencia que ya existe** en vez de abrir una nueva.
- **Cada formación de canal cuesta.** Una malla de ocho son 28 pares, y cada par son entre
  30 y 60 mensajes: entre mil y mil setecientos mensajes cada vez que se arma el canal.
  Está bien, pero si alguien tiene mala conexión y se reconecta cada dos minutos, esa
  persona sola puede costar más que todo el chat.

### Fantasmas en el canal

Si alguien cierra la app de un tirón (o se le corta la luz), el aviso de salida no llega
siempre. Queda figurando adentro del canal de voz para siempre. Supabase tiene un tiempo de
espera propio para eso (**hay que verificar cuál**), y conviene igual guardar en la presencia
la hora del último latido y tapar a los que están viejos.

### La sala que queda abierta toda la noche

Alguien se olvida el canal de voz abierto y se va a dormir. Con malla no pasa nada: el corte
en silencio hace que no viaje casi nada y no cuesta plata. **Con repartidor sí cuesta**, y
más si dejó la cámara. Propuesta: avisar (no echar) después de un rato largo sin audio ni
actividad, y que el aviso diga el número. Echar gente automáticamente es de las cosas que
hacen que una app caiga mal.

### Y dos cosas que ya están bien y no hay que romper

- Cuando dos se llaman al mismo tiempo, la regla del identificador más alto evita que los
  dos ofrezcan a la vez. Se generaliza sola a la malla.
- El que no tiene micrófono, o le negó el permiso, entra igual con una pista muda
  (`createSilentStream`). **En un canal de voz eso deja de ser un parche y pasa a ser un
  modo legítimo: entrar solo a escuchar.** Y es el participante más barato que existe,
  porque no publica nada. Conviene mostrarlo como tal en la lista, no como alguien roto.

---

## 5. Cómo se conecta con los presets

### Qué ajusta la voz en cada perfil

Las perillas que son mías son seis. Los valores son la propuesta; los de la columna
"Llamadita" **salen de la medición del paso 1 y hoy no los sabemos** (es el riesgo 2 de la
investigación y hay que respetarlo: no inventar el número).

| Perilla | Tostadora | Estándar | Llamadita | Soy cheto |
|---|---|---|---|---|
| Canales | mono | mono | *lo medido* | estéreo |
| Bitrate máximo | ~16 a 24 kbps | ~32 kbps | *lo medido* | 96 a 128 kbps |
| Corte de envío en silencio | **sí** | sí | sí | no |
| Corrección de errores | no | sí | sí | sí |
| Tamaño de paquete | grande (menos paquetes, menos máquina) | normal | normal | normal |
| Umbral para pasar al repartidor | **4** | 6 | 6 | 8 |

Las tres cosas que explican esa tabla:

1. **El corte de envío en silencio es la perilla más importante de todas, y no por la
   plata.** En un grupo de ocho hablan uno o dos a la vez. Sin corte en silencio viajan
   ocho voces todo el tiempo; con corte, viajan las que suenan. Es exactamente la condición
   3 del repartidor (`ROADMAP.md` 2c) pero conseguida desde el cliente, **y funciona igual
   en malla, donde no hay ningún repartidor que la aplique**. En "Soy cheto" se apaga a
   propósito: el corte se nota un poquito al arranque de cada palabra, y esa columna es
   para el que prefiere gastar antes que escuchar un artefacto.

2. **Por qué el umbral de conmutación es parte del preset, y esto es lo que más se pasa por
   alto:** en la malla, tu máquina arma un codificador de audio por cada persona. Con siete
   personas son siete codificadores, siete conexiones cifradas y siete colas de paquetes.
   Con repartidor es **uno solo, sean tres o treinta**. Es la condición 4 del roadmap ("el
   repartidor no es lo que cuesta: es lo que salva la PC"), que casi siempre se explica con
   la pantalla, pero **aplica igual a la voz, más discreta**. Por eso "tostadora" pasa al
   repartidor antes: no porque le falte internet, sino porque le falta máquina.

3. **De las cuatro condiciones del repartidor, para voz sola manda una y media.** La
   suscripción selectiva casi no cambia nada en audio (el audio es diminuto al lado del
   video). Las capas de calidad directamente **no existen para audio**: se usan para que
   una carita en miniatura viaje chica, y el sonido no tiene "tamaño". Las que importan de
   verdad son la 3 (solo viaja el que habla) y la 4 (comprimir una vez sola). Las otras dos
   empiezan a pesar cuando llega el video. **Conviene tenerlo escrito para no exigirle al
   repartidor de voz cosas que solo sirven para video.**

### Qué pasa si el usuario quiere más calidad de la que su preset permite

**Regla madre: el preset es un valor por defecto, no una jaula.** Ya está escrito en el
roadmap ("se elige uno y listo, pero cada ajuste se puede tocar a mano"). Se respeta.

Con tres precisiones que hacen falta:

1. **Si tocás una perilla, el preset pasa a llamarse "Personalizado".** No se queda diciendo
   "PC tostadora" mientras manda estéreo a 128. El medidor y el soporte entre nosotros
   dependen de que lo que dice la etiqueta sea verdad.

2. **Hay un techo duro, y para audio es uno solo: 128 kbps estéreo.** Arriba de eso Opus no
   entrega nada que un oído humano note en una charla, y el roadmap ya tiene la costumbre
   de poner techos duros para el video por el mismo motivo. Que exista el techo no es
   cobrarte la calidad: **es no mentirte con un número que no cambia nada.**

3. **Y acá viene la asimetría que hay que explicar bien, porque es la respuesta honesta:
   vos elegís lo que mandás, no lo que te mandan.** Si vos estás en tostadora y tu amigo en
   "Soy cheto", en malla te va a llegar su voz en estéreo a 128 y no hay perilla tuya que
   lo baje (el audio no tiene capas, así que no hay una versión chica para pedir). La buena
   noticia es que **eso no es un problema**: recibir 128 kbps no le pesa a nadie, ni en
   internet ni en máquina. **Lo caro de la calidad alta lo paga el que la eligió**, en su
   subida y en su procesador, y lo paga el cupo mensual de GB si hay repartidor. O sea: la
   elección del que quiere calidad **no le arruina la experiencia al que tiene la máquina
   justa**, y por eso se puede permitir sin pedirle permiso a nadie.

4. **Cuando la elección sí cuesta plata, se dice el número antes.** Es el punto 4 del hito 3
   del roadmap ("aviso honesto de consumo") y vale igual para la voz cuando hay repartidor:
   "esto son tantos GB por hora, te quedan tantos del mes". Nunca enterarse después.

---

## 6. Cómo se prueba

### Prueba cero: dos PCs distintas, que es el pendiente número uno

**Todavía no se hizo y está antes que todo lo demás.** Dos máquinas, dos casas, dos
proveedores de internet distintos, micrófonos de verdad.

Criterios medibles, todos leíbles desde `getStats()` de la propia llamada:

| Qué | Objetivo | Cómo se lee |
|---|---|---|
| Se escucha en los dos sentidos | sí o no | el oído |
| Tiempo desde aceptar hasta escuchar | menos de 5 segundos | cronómetro |
| Por dónde va | anotar **directo o por relevo** | el par de candidatos elegido |
| Ida y vuelta | menos de 80 ms entre dos puntos de Argentina | `roundTripTime` |
| Paquetes perdidos | menos de 1 % | `packetsLost` |
| Fluctuación | menos de 30 ms | `jitter` |
| Codec y bitrate reales | **anotar**, es el dato del paso 1 | `codecId` y bytes por segundo |
| Cortes en 10 minutos | cero | el oído |
| Procesador de la app en llamada | **anotar**, todavía no hay línea de base con llamada | Administrador de tareas |

De esos, el que más vale es el de "directo o por relevo": es el que dice si la promesa de
costo cero es cierta para gente real de acá.

**Y hay que anotarlo en una planilla, no en la memoria.** Una fila por prueba: fecha,
versión, los dos proveedores de internet, si hay CGNAT, directo o relevo, codec y bitrate,
ida y vuelta, pérdida, fluctuación, procesador y memoria, y una nota del 1 al 5 de cómo se
escuchó. Diez filas de esas valen más que todo este documento.

### Prueba de la malla

Con tres, después cinco, después ocho personas. Se pasa si:

- La subida de cada uno queda **abajo de 500 kbps** con ocho adentro (la cuenta de manual
  da unos 450 a 64 kbps, y bastante menos con mono y corte en silencio).
- El procesador de la app se mantiene en un número que se pueda defender. **Hoy solo
  tenemos la línea de base sin llamada: 0,45 % y 422 MB.** El número de la llamada hay que
  establecerlo con la prueba cero y después mirar cuánto sube por persona: **lo que importa
  no es el valor, es cuánto crece por cada uno que entra.** Si crece parejo, la malla
  escala; si se dispara en el quinto, ahí está el techo real y el umbral de conmutación hay
  que bajarlo.
- Nadie se cae en 30 minutos.
- Alguien entra y sale tres veces y la sala queda consistente en las ocho pantallas.

### Prueba del presupuesto de mensajes

La única del proyecto que se mide en el panel de Supabase y no en la app. Se hace **el mismo
escenario dos veces**, antes y después del arreglo de la señalización dirigida: armar un
canal de seis, esperar que conecten todos, salir.

- Se pasa si el consumo baja **al menos cinco veces**.
- Conviene además contar los mensajes desde el cliente (una variable que suma cada envío y
  cada recepción), porque el panel de Supabase tarda en actualizarse y no separa por
  motivo. **Hay que verificar** con cuánto retraso y con cuánto detalle informa.

### Prueba del repartidor

El mismo escenario que la malla, pero con repartidor, y la pregunta a contestar es una
sola: **¿el consumo real se parece a la cuenta de manual?** El roadmap dice que una sala de
diez consume 0,24 GB por hora, y la investigación admite que es una cuenta de manual sin
verificar (riesgo 4).

- Se pasa si el consumo medido queda dentro de un 30 % de lo calculado.
- **Si no da, no es un ajuste: se cae toda la planificación de costos** y hay que rehacer el
  capítulo 6.6 de la investigación antes de seguir. Por eso esta prueba va apenas se
  enchufa el repartidor y no al final.
- Anotar también cuánta subida usa cada uno (tiene que ser una sola copia, sin importar
  cuántos haya) y cuánto procesador. **La comparación contra la malla en la misma máquina,
  con la misma gente, es el número que justifica el umbral de conmutación del capítulo 5.**

### Pruebas de rotura, cada una con su comportamiento esperado escrito antes

| Qué se rompe | Cómo se rompe a propósito | Qué tiene que pasar |
|---|---|---|
| Internet | desenchufar el cable 10 segundos | vuelve solo, sin tocar nada |
| El repartidor | bloquear su dominio en el archivo de nombres de Windows | si son 6 o menos, cae a malla; si no, cartel honesto |
| La señalización | cortar Supabase con la llamada andando | la llamada **sigue**; no entra nadie nuevo |
| Los auriculares | desenchufarlos en medio | sigue por el otro dispositivo, y **todos** te siguen escuchando |
| El que entra tarde | entrar cuando ya hay cinco hablando | escucha a los cinco en menos de 5 segundos |
| Dos sesiones | la misma cuenta en escritorio y en navegador | la nueva echa a la vieja, **sin chillido** |
| CGNAT | forzar que la conexión use relevo sí o sí desde una versión de prueba | la llamada conecta igual, el medidor dice "por relevo" |

Ese último truco (forzar relevo desde una versión de prueba) es la única forma práctica de
probar el caso argentino sin ir a buscar una conexión con CGNAT. Vale la pena tenerlo.

### Prueba de que no rompimos lo que anda

**La llamada de a dos tiene que seguir yendo directa, siempre.** Una prueba que falle si
una llamada de dos personas alguna vez sale por el repartidor. Es el diferencial más grande
que tenemos (latencia mínima, cifrado real, costo cero) y es exactamente la clase de cosa
que se rompe sin querer el día que se enchufa el repartidor.

### Prueba larga

Un canal con tres personas abierto cuatro horas. Se mira que la memoria no suba con el
tiempo. Una malla con varias conexiones es el lugar clásico donde queda basura: con un
diccionario de sesiones, cada entrada y salida tiene que limpiar todo, y si limpia el 90 %
no se nota hasta la hora tres.

---

## 7. Lo que no va acá

- **Capturar pantalla o cámara, y sus ajustes** (hito 3): elegir monitor o ventana,
  resolución, cuadros por segundo, codec, capas de calidad, la grilla de videos, el audio
  del sistema. Es del área de video, que usa mi transporte. La frontera exacta está en el
  capítulo 1.
- **El medidor de consumo** como recuadro en pantalla, y el ayudante nativo que lee
  procesador, placa de video y memoria (hito 2, puntos 1 y 2). Yo entrego los números de la
  llamada; el medidor los dibuja.
- **Dónde se guarda la configuración y la interfaz de los presets** (hito 2, punto 3). Yo
  defino qué hace cada perilla de audio y la leo; no la guardo ni la dibujo.
- **La supresión de ruido propia, hablar apretando una tecla, atajos globales, la ventana
  chica siempre encima, el tablero de sonidos y el audio posicional** (hito 6). Los tres
  primeros necesitan un ayudante nativo, y todos son del área de captura o de la app, no
  del transporte.
- **El modelo de roles y permisos por canal** (hito 4, punto 4): las tablas, las políticas y
  la interfaz son del panel social y de la base. De mi área es un solo renglón: **la función
  que entrega el pase al repartidor tiene que preguntar por el permiso**, porque es el único
  lugar donde no se puede saltear.
- **El contador de consumo del mes** (hito 4, punto 3): yo reporto bytes, otro los acumula,
  los guarda y los muestra.
- **Todo el chat**: mensajes, historial, imágenes, archivos, buscador, borrado y retención
  (hito 5). Ni siquiera comparte transporte: eso va por Supabase y por el almacenamiento de
  objetos.
- **Mezclar el audio en el servidor.** No es una omisión, es una decisión ya tomada
  (`ROADMAP.md` 2b): el repartidor **reparte y mezcla cada PC**. Un servidor que mezcla
  gasta procesador por sala, te saca el volumen por persona y te mete latencia. Si alguien
  lo propone, la respuesta es no y el motivo está acá.
- **Clientes fuera de Windows** (hito 8). El transporte que salga de acá tiene que ser
  código de navegador común para no complicar ese día, pero adaptarlo no es de esta área.

---

## Apéndice: la lista de "hay que verificar"

Lo que este documento supone y **no** está comprobado. Cada uno puede cambiar una decisión:

1. Si suscribirse a un canal de Supabase Realtime cuenta mensajes facturables, y si el tope
   de 200 son conexiones o canales.
2. Con cuánto retraso y cuánto detalle informa el panel de consumo de Supabase.
3. El cupo y el precio vigentes del repartidor de Cloudflare (la investigación dice 1.000
   GB gratis y USD 0,05 por GB al 15/09/2026).
4. Si el repartidor de Cloudflare sabe reenviar solo la voz de quien habla, o si esa
   selección la tenemos que hacer desde el cliente.
5. Si soporta cifrado del contenido extremo a extremo.
6. Cuánto pesa la biblioteca de cliente de LiveKit, por la promesa de ser liviana.
7. Los límites vigentes del servicio gratuito de relevo que usamos hoy, y si tiene alguna
   garantía (sospecha fuerte: no).
8. El tiempo de espera de la presencia de Supabase para detectar a alguien que se fue mal.
9. Si el área de captura de audio ya escucha el aviso del sistema cuando cambian los
   dispositivos.
10. Que el reinicio barato de la conexión esté efectivamente anulado por la llamada nueva
    que viene atrás, como parece leerse en el código.
11. Con qué bitrate, codec y tamaño de paquete sale la voz hoy (el paso 1 del camino).
12. Cuánto procesador y memoria usa la app **con una llamada andando**: hoy solo está
    medido el reposo.
