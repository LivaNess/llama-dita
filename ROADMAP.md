# Roadmap de Llamadita

A dónde va esto y en qué orden. Es el mapa largo: lo que se está haciendo ahora vive en
`SYNC.md`, lo que ya se hizo en `CAMBIOS.md`.

---

## 1. La apuesta, en una frase

Hoy existen dos familias de apps para hablar mientras jugás. Una es liviana, con latencia
muy baja y se puede hostear uno mismo, pero el chat es pobre, casi no tiene video y hay que
saber montar un servidor. La otra tiene todo (chat, video, pantalla, comunidad, móvil) pero
pesa: en reposo se come entre 500 MB y 1 GB de memoria, hay reportes de más de 4 GB, y su
capa arriba del juego te cuesta cuadros por segundo. Encima cobra por calidad: en el plan
gratis la pantalla va a 720p y 30 fps, y el audio del canal arranca en 64 kbps.

**Llamadita quiere ser la primera con el consumo de la segunda, y sin cobrar por calidad.**

Las tres promesas, y en este orden:

1. **Que no te robe la máquina.** Si está abierta mientras jugás, no se tiene que notar.
2. **Que la calidad no se pague.** Pantalla a 60 fps, audio bueno, sin suscripción.
3. **Que tenga todo lo que la gente usa todos los días.** Chat con imágenes, video, grupos,
   historial.

---

## 2. Reglas de arquitectura que no se negocian

Estas cuatro salen de la investigación y de las cuentas. Romper una rompe la apuesta entera.

**a. De a dos, siempre directo.** La voz y el video de una llamada de dos personas van de
una PC a la otra, sin pasar por ningún servidor. Eso es lo que hace que la latencia sea
mínima, que quede cifrado de punta a punta de verdad, y que **transmitir pantalla a 60 fps
nos cueste exactamente cero pesos**. Es nuestro mayor diferencial y ya lo tenemos.

**b. En grupo, un repartidor, y recién a partir de tres.** Con tres o más, mandar tu video a
cada uno por separado te funde la conexión de subida. Ahí hace falta un servidor que reciba
una copia y la reparta. La cuenta con el servicio de Cloudflare, que da 1.000 GB por mes sin
cargo: la voz en grupo entra gratis de sobra (una sala de 10 personas consume 0,24 GB por
hora, o sea más de 4.000 horas mensuales gratis) y compartir pantalla en 1080p60 con tres
personas mirando da unas 200 horas por mes gratis, y después cuesta 25 centavos de dólar la
hora. **Los presets de calidad no son solo comodidad: son lo que decide si el mes sale cero.**

**c. Nunca empaquetar un navegador adentro de la app.** La app usa el WebView2 que ya viene
con Windows. Ese es el motivo estructural por el que podemos pesar cinco veces menos que la
competencia. Si algún día alguien propone migrar a un framework que mete su propio Chromium,
la respuesta es no.

**Línea de base medida (2026-09-15, versión `1.15.1A`):** con la app abierta y sin llamada,
422 MB de memoria de trabajo, 220 MB de memoria propia y 0,45 % de procesador. La primera
medición había dado 6,49 % de procesador: era nuestro propio bucle de dibujo corriendo a 60
cuadros por segundo contra pantallas que nadie estaba mirando. Sirve de recordatorio de la
regla que sigue.

**d. Primero se mide, después se optimiza.** Si el diferencial es "consume menos", tiene que
haber un número a la vista. Por eso el medidor de consumo es el primer hito y no el último.

---

## 2b. Cómo está construida la competencia, y qué copiamos achicado

No hay nada que inventar. Las dos familias de apps publicaron cómo funcionan por dentro. La
grande son ocho piezas, y la mayor parte de su complejidad existe **por tener millones de
usuarios**, no por las funciones.

| Pieza | Cómo la hace la grande | Qué necesita un grupo de 100 |
|---|---|---|
| Señalización (quién está conectado) | Gateway propio, partido en pedazos por carga | Supabase Realtime. **Ya está** |
| Repartidor de voz y video | Repartidor propio en C++, **850 servidores en 13 regiones**, te asigna el más cercano | **Uno solo**, en São Paulo, porque están todos en Argentina |
| Mezcla del audio | **No mezcla**: reparte y mezcla cada PC | igual, y es gratis |
| Base de mensajes | Base gigante especializada, después de cambiarla dos veces | Postgres común. **Ya está** |
| Cliente | Navegador empaquetado adentro | El WebView del sistema + ayudante nativo. **Ya está y medido** |
| Permisos | Máscara de 64 bits + excepciones por canal, documentado público | copiar tal cual |
| Archivos | Red de distribución propia | R2, salida gratis |
| Bots y API | Gateway + REST + comandos | después, y chico |

**Lo que nos salteamos entero por no tener escala:** 850 servidores, 13 regiones, asignación
por latencia, redundancia anti-ataques, partir el gateway, base de datos especializada, red de
distribución global, moderación automática, verificación de identidad, descubrimiento público
y toda la monetización.

Y del otro lado, la familia liviana probó lo contrario: **un servidor por comunidad**, chico,
que atiende a tu grupo y nada más. Funciona hace veinte años.

> **La tesis del proyecto:** el modelo de un servidor para tu grupo, con la tecnología y la
> facilidad de entrar de la grande.

**De las ocho piezas, infraestructura falta una: el repartidor. Y no hay que escribirlo.**
mediasoup y LiveKit son exactamente eso, abiertos y hechos. Se instala, no se programa.

---

## 2c. El repartidor: cómo tiene que estar hecho

Esto define si el sistema aguanta o se cae con seis personas. **Son cuatro condiciones y las
cuatro vienen de fábrica** en mediasoup, LiveKit y el servicio de Cloudflare. Hay que usarlas,
no inventarlas.

1. **Suscripción selectiva.** Te llega solo lo que estás mirando. Es lo que hace que 30
   personas compartiendo pantalla cueste lo mismo que una: las otras 29 no te llegan.
2. **Capas de calidad.** Cada uno publica su video en dos o tres tamaños a la vez, y el
   repartidor elige cuál mandarle a cada quien. Así una grilla de caritas en miniatura
   funciona: cada cámara viaja del tamaño en que se ve.
3. **Solo viaja el audio de quien habla.** En una sala de 20 no viajan 20 voces.
4. **Comprimir una sola vez, por hardware.** Sin repartidor tendrías que comprimir tu pantalla
   una vez por cada persona. Con repartidor, una sola vez, sean 3 o 30. **El repartidor no es
   lo que cuesta: es lo que salva la PC.**

Con las cuatro, **el costo en tu máquina deja de depender de cuánta gente haya**.

### Dónde vive el repartidor

| Etapa | Dónde | Aguanta | Trabajo |
|---|---|---|---|
| **Primero** | Cloudflare (1.000 GB/mes) | ~100 h/mes de pantalla compartida en grupo | 10 minutos, nada que mantener |
| **Si algún día aprieta** | Máquina gratis de Oracle en São Paulo (10.000 GB/mes) | 10 veces más | montar y mantener un Linux |

La mudanza es **cambiar una dirección**: el código de la app no cambia. Por eso no es una
decisión que haya que tomar hoy. Y por eso el contador de consumo del mes adentro de la app
no es un chiche: es el que avisa cuándo tocar la mudanza.

---

## 2d. El tallo y las ramas

Las áreas dicen **de qué se trata cada cosa**. No dicen **qué va primero**. Y no es lo mismo un
cimiento que una rama, por gruesa que sea la rama.

### El tallo: siete cosas que, si se hacen tarde, obligan a rehacer lo de arriba

1. **Dónde vive la configuración.** Un solo lugar donde están los ajustes y los perfiles. Todo
   lo que venga después se enchufa acá. Si cada función guarda lo suyo por su lado, después hay
   dos fuentes peleando por el mismo dato.
2. **La forma de los datos.** Espacio, canal, miembro, mensaje. Agregar la idea de "espacio"
   más adelante es una migración sobre datos que ya existen; agregarla ahora es una columna.
3. **Los permisos garantizados por la base.** Si un permiso solo se respeta en la pantalla, no
   existe: cualquiera que sepa pedirlo de otra forma se lo saltea.
4. **El historial guardado en la PC y el borrado.** Define si el chat escala sin pagar y si
   "borrar" significa algo. Va antes de las funciones lindas del chat, no después.
5. **La señalización dirigida.** Que el apretón de manos de una llamada le llegue a la persona
   que corresponde y no a toda la sala. Hoy se le grita a todos y cada uno descarta lo que no
   es suyo, y eso multiplica el consumo por la cantidad de gente que haya.
6. **La puerta del repartidor.** Una función chica de servidor que entrega pases de entrada.
   Es donde se hace cumplir quién puede entrar, y es la costura que permite cambiar de
   proveedor sin tocar la app.
7. **El transporte detrás de una sola interfaz.** Que "hablar con alguien" sea una sola puerta
   por dentro, y que si atrás hay conexión directa, todos con todos, o repartidor, sea un
   detalle que se cambia sin que nada de arriba se entere.

### Las ramas gruesas

Cuelgan del tallo. Entre ellas se pueden hacer en el orden que convenga, y ninguna obliga a
rehacer el tallo: **el chat completo**, **la voz en grupo**, **pantalla y cámara**, **el
medidor y los presets**, **el ayudante nativo**.

### Las ramitas

Se suman cuando haya ganas y no cambian nada de abajo: encuestas, hilos, foros, emojis propios,
soundboard, eventos programados, bots.

### El primer tramo: un chat que ande bien

Decisión de Martín y Juan: **lo primero que tiene que funcionar, sin cosas raras, es el chat.**

Y es una buena elección por un motivo que no es obvio: **un chat bien hecho arrastra cuatro de
los siete cimientos.** Para que ande de verdad hace falta la forma de los datos (1 y 2), los
permisos de quién escribe dónde (3) y el historial local con su borrado (4). O sea que mientras
se construye lo que se ve, queda hecho más de la mitad de lo que no se ve.

Los tres cimientos que quedan (5, 6 y 7) son todos de llamadas, y van con la voz en grupo.

---

## 3. Los cuatro presets

Todo lo que consume recursos se agrupa en cuatro perfiles. Se elige uno y listo, pero cada
ajuste se puede tocar a mano por separado.

| | **PC tostadora** | **PC estándar** | **Llamadita** | **Soy cheto** |
|---|---|---|---|---|
| Para quién | máquina justa, o jugando algo pesado | una PC normal | nuestro recomendado | sobra máquina y sobra internet |
| Audio | mono, bitrate bajo, corta el envío en silencio | intermedio | **lo que suena hoy** | estéreo, bitrate alto |
| Cámara | 360p 15 fps | 540p 30 fps | 720p 30 fps | 1080p 30 fps |
| Pantalla | 720p 15 fps | 1080p 30 fps | 1080p 60 fps | 1080p 60 fps, bitrate alto |
| Codec de video | H.264 por hardware | H.264 por hardware | H.264 por hardware | AV1 o VP9 |
| Visualizadores de audio | apagados | livianos | completos | completos |
| Animaciones de la interfaz | apagadas | básicas | completas | completas |
| Supresión de ruido | apagada | la del sistema | la del sistema | filtro propio |
| Medidor de consumo | visible | oculto | oculto | visible |

**Techos duros, por encima de cualquier preset:** máximo 1080p, cámara hasta 30 cuadros por
segundo, pantalla hasta 60. Una cámara a 60 no le sirve a nadie.

Tres aclaraciones sobre la tabla:

- **"Lo que suena hoy"** no es un número inventado: el primer paso del hito 2 es medir con
  qué bitrate y qué codec está saliendo la voz ahora mismo, y recién ahí se escribe el
  número en esta tabla. Hoy lo elige el navegador solo.
- **Cada cámara viaja del tamaño en que se muestra.** Ocho caras en miniatura se dibujan en
  recuadros de 200 píxeles: mandarles 1280 es tirar el 80 % a la basura. Bien hecho, ese caso
  pasa de 34 a 126 horas gratis por mes, y nadie ve ninguna diferencia.
- **Los visualizadores de audio son nuestros.** Los canvas que dibujan el espectro corren a
  60 cuadros por segundo. Son lindos y consumen. En modo tostadora se apagan: es el ejemplo
  más claro de que el preset también nos aprieta a nosotros, no solo a la red.

---

## 4. El mapa, hito por hito

Cada hito es un "antes y después". El número de hito sube **solo con permiso** (regla de
`VERSIONADO.md`), así que esto es la propuesta del orden, no una autorización.

### Hito 2: que se pueda medir y regular
*Lo que hace falta antes de agregar una sola función nueva.*

1. **Medidor de consumo (el bench), primera versión.** Un recuadro chico en un borde, que se
   prende y apaga con un atajo, y que muestra lo que se puede leer sin ayuda de afuera:
   bitrate de subida y bajada, cuadros por segundo, paquetes perdidos, jitter, latencia de
   ida y vuelta, si la llamada va directa o por relé, y la memoria del motor de la app. Todo
   eso lo da la propia llamada, no cuesta nada medirlo.
2. **Medidor, segunda versión: CPU, GPU y RAM de verdad.** Esto ya no se puede leer desde
   adentro de la app y necesita un ayudante nativo chiquito. Hay que hacerlo bien: si el
   medidor consume, es un chiste. Objetivo: refrescar cada 2 o 3 segundos, no cada cuadro.
3. **Capa de presets.** Un solo lugar donde vive la configuración, los cuatro perfiles y la
   posibilidad de tocar cada cosa a mano. Todo lo que venga después se enchufa acá.
4. **Calidad de audio regulable.** Elegir bitrate, mono o estéreo, corte en silencio,
   cancelación de eco y supresión de ruido. Por defecto, lo de hoy.

*Listo cuando:* se puede poner la app en tostadora, ver el número bajar en el medidor, y que
la voz siga siendo usable.

### Hito 3: mostrar (cámara y pantalla)
1. **Compartir pantalla** con elección de monitor o ventana, y de 15, 30 o 60 fps.
2. **Cámara** con resolución elegible.
3. **Audio del sistema** junto con la pantalla (tiene limitaciones conocidas en Windows: hay
   que probar cuáles).
4. **Aviso honesto de consumo**: al elegir 60 fps, que la app diga cuánta subida necesita.

*Listo cuando:* dos personas pueden mirar una pantalla a 1080p60 sin que nadie pague nada.

### Hito 4: grupo de verdad
1. **Canales de voz con varias personas** a la vez (el repartidor del punto 2b), con
   fallback automático a directo cuando son dos.
2. **Transmitir la pantalla a todo el canal**, no solo a una persona.
3. **Contador de consumo del mes** para saber cuándo nos acercamos al tope gratis.
4. **Roles y permisos por canal** (quién puede hablar, quién puede invitar).

*Listo cuando:* cinco personas hablan en un canal y alguien comparte pantalla, y el mes
sigue costando cero.

### Hito 5: el chat como corresponde
1. **Imágenes y archivos**, guardados en el almacenamiento de objetos que ya usamos en otro
   proyecto (10 GB gratis y salida de datos sin cargo). Límite por archivo cómodamente por
   arriba de los 20 MB del plan gratis ajeno.
2. **Previsualización de enlaces**, formato básico, respuestas, editar, reacciones.
3. **Historial que se conserva y se puede borrar**: por mensaje, por conversación y por
   canal, con la opción de definir cuánto tiempo se guarda.
4. **Buscador** adentro del historial.

*Listo cuando:* se puede pegar una captura en el chat, verla, y borrarla de verdad.

### Hito 6: comodidades de jugador
1. **Hablar apretando una tecla** (con atajo global, que necesita ayuda nativa).
2. **Ventanita chica siempre encima** en lugar de una capa pegada al juego. Esta es una
   decisión deliberada: la capa que se engancha al juego es justamente lo que le tira los
   cuadros a la competencia. Nosotros no vamos por ahí.
3. **Elección de dispositivos de entrada y salida**, atajos, modo silencioso.
4. **Supresión de ruido propia**, opcional y apagable.
5. Más adelante: **audio posicional** (escuchar al compañero desde donde está en el juego).
   Nadie lo hace bien salvo una app muy de nicho, y es un imán para equipos competitivos.

### Hito 7: comunidad
Espacios con varios canales, invitaciones, moderación básica, menciones, notificaciones
configurables, mensajes fijados, hilos. Todo esto es mucho trabajo y poco diferencial: va
después de que lo de arriba ande bien.

### Hito 8: fuera de Windows
Cliente web, móvil, y una API para automatizar. Es lo último a propósito: cada plataforma
nueva multiplica el trabajo de todas las funciones anteriores.

---

## 5. Lo que decidimos NO hacer

Que quede escrito, para no discutirlo de nuevo dentro de seis meses:

- **Tienda, monedas, misiones, niveles pagos.** Existen para monetizar a millones de
  desconocidos. No es nuestro caso.
- **Verificación de identidad con documento o escaneo facial.** Es una de las razones por las
  que la gente está buscando alternativas justo ahora.
- **Capa pegada adentro del juego.** Ver hito 6, punto 2.
- **Cobrar por calidad.** Toda la calidad que sea técnicamente gratis, es gratis.
- **Migrar a un framework que empaquete su propio navegador.** Ver regla 2c.

---

## 6. Lo próximo concreto

Terminar el hito 1 (lo que hay hoy: voz de a dos, cuentas, amigos, canales, actualizaciones)
con la prueba real de llamada entre dos PCs, y arrancar el hito 2 por el medidor de consumo
en su versión que no necesita ayuda nativa. Es la pieza que le pone número a la promesa
principal y se puede hacer entera con lo que ya tenemos.
