# Área: El chat — mensajes, imágenes y archivos, historial, borrado y buscador

**Qué es esto:** la ficha de diseño del área de chat de Llama-dita. No es código ni
autorización para escribirlo: es el mapa de qué entra, en qué orden, qué hay que decidir
antes de tocar el teclado y con qué números se verifica después.

**Fecha:** 16 de septiembre de 2026. **Versión de la app al escribirlo:** `1.15.1A`.
**Hito de referencia en el roadmap:** hito 5 ("el chat como corresponde"). El número de hito
no sube sin permiso de Martín o Juan.

**Base de la que sale:** `ROADMAP.md` (reglas de arquitectura y presets),
`INVESTIGACION-COMPETENCIA.md` capítulo 6 (topes de los planes gratis y los dos cuellos de
botella), y el código que ya existe: `src/social/api.js`, `src/social/panel.js`,
`src/supabase/client.js` y `supabase/migrations/20260915_001_cuentas_amigos_canales.sql`.

**Qué hay hoy, leído en el código y no de memoria:**

- Tabla `messages` con `id bigint identity`, `channel_id`, `author_id`, `body` (1 a 2000
  caracteres) y `created_at`. Índice por `(channel_id, created_at desc)`. RLS: ve el que es
  miembro del canal, escribe el que es miembro y además es el autor, borra el autor o el
  dueño del canal.
- `listMessages()` trae los últimos 60 mensajes de un canal, siempre de cero, cada vez que
  abrís el canal.
- `openChannel()` se suscribe a Realtime solo al `INSERT` de ese canal, y se desuscribe al
  cerrarlo.
- No hay adjuntos, no hay edición, no hay reacciones, no hay buscador, no hay caché local,
  no hay borrado desde la interfaz, y no hay privados (un privado hoy sería un canal de dos).

---

## 1. FRONTERAS

### Qué entra en esta área

| Cosa | Detalle |
|---|---|
| Mandar y recibir mensajes | en canales y en privado, con eco optimista y confirmación |
| Adjuntos | imágenes, audio, video y archivos sueltos: subida, miniatura, descarga, borrado |
| Previsualización de enlaces | leer título, descripción e imagen de un link pegado |
| Formato | markdown básico, bloques de código, citas, spoilers |
| Responder, editar, reaccionar | incluido qué pasa con lo que el otro ya leyó |
| Mensajes fijados | la lista por canal y su límite |
| Menciones | a una persona, y el aviso cuando no tenés ese canal abierto |
| "Está escribiendo" | y su presupuesto de mensajes, que es lo caro |
| Historial | la caché local, la sincronización de lo nuevo y el scroll hacia atrás |
| Buscador | local primero, servidor solo para lo que no está en la caché |
| Borrado | por mensaje, por conversación y por canal |
| Retención configurable | cuánto se guarda y la purga que lo hace cumplir |
| El presupuesto de consumo del chat | mensajes de Realtime y egress: es nuestro, no de otra área |

### Qué NO entra, y de quién es

**Del área de espacios, canales y roles:**

- **Quién puede escribir dónde.** Toda la pregunta de permisos es de ellos. Nosotros
  *consumimos* el permiso, no lo definimos: el chat pregunta "¿este puede escribir acá?" y
  obedece. Hoy eso lo contesta la política `messages_insert` con `is_channel_member()`;
  mañana lo va a contestar algo más fino y el chat no se entera.
- Quién puede borrar los mensajes de otro. Hoy la política dice "el autor o el dueño del
  canal". El día que haya moderadores, la regla cambia allá, no acá.
- Quién puede fijar un mensaje, quién puede cambiar la retención de un canal, quién invita.
  Todo eso es permiso.
- Crear, renombrar, archivar o borrar un canal. **Ojo con este: borrar el canal es de ellos,
  pero limpiar lo que ese canal deja tirado (mensajes y adjuntos en el almacenamiento de
  objetos) es nuestro.** El contrato entre las dos áreas está en la decisión D6.
- Menciones a un rol entero (`@moderadores`). La mención a una persona es nuestra; saber
  quiénes están adentro de un rol es de ellos.

**Del área de escritorio:**

- Notificaciones del sistema operativo, ícono de bandeja, contador en la barra de tareas,
  sonido de aviso. El chat **emite el hecho** ("te mencionaron acá") y escritorio decide cómo
  se ve y suena eso fuera de la ventana.
- Arrastrar un archivo desde el escritorio a la ventana, el portapapeles del sistema, abrir
  la carpeta de descargas, elegir dónde se guarda un archivo bajado.
- Dónde vive físicamente la caché local en el disco y qué pasa con ella al desinstalar.
- Atajos globales de teclado.

**De otras áreas, para que quede escrito:** la voz, la cámara y la pantalla no son del chat
(áreas de audio y de red). Los mensajes de voz sí, porque son un adjunto más. El medidor de
consumo es del área de presets y medición: nosotros le entregamos nuestros números, no
dibujamos el recuadro.

---

## 2. EL CAMINO

El orden no es caprichoso: **primero lo que evita que el chat se vuelva caro, después lo que
lo hace lindo.** Si se hace al revés, cada función nueva multiplica una factura que todavía
no sabemos leer. Cada paso deja algo andando y usable; nada de "esto recién sirve en el
paso 5".

### Paso 0 — Instrumentar lo que ya hay, antes de agregar una sola función

Lo mismo que el roadmap hizo con el medidor de consumo, aplicado al chat: poner el número a
la vista antes de optimizar.

- Contar, del lado del cliente, cuántos mensajes de Realtime mandamos y recibimos por hora, y
  cuántos bytes bajamos de la base.
- Anotar el contador real del panel de Supabase antes y después de una sesión de prueba.

*Queda andando:* el chat de hoy igual, pero con un número. **Sin este paso, los pasos 1 y 4
son adivinanza.**

### Paso 1 — La caché local y la sincronización por diferencia

El corazón del área. El historial pasa a vivir en la PC de cada uno y al servidor se le pide
solo lo nuevo.

*Queda andando:* abrir un canal es instantáneo y no baja nada si no hubo novedades. El
historial deja de tener tope de 60 mensajes. Recién acá se puede prometer "historial
completo" sin que cueste plata.

### Paso 2 — Identidad, orden y borrado de verdad, en el esqueleto

Antes de agregar adjuntos hay que arreglar la plomería: identificador de mensaje puesto por
el cliente (contra duplicados), orden estable, tabla de lápidas (para que un borrado viaje) y
campos de edición. Es un solo cambio de esquema en vez de cinco parches.

*Queda andando:* borrar un mensaje y que desaparezca de la pantalla del otro, incluso si el
otro estaba desconectado cuando lo borraste. Editar y que se vea editado.

### Paso 3 — Imágenes y archivos

El ayudante que firma las subidas, el reencodado de imágenes antes de subir, la miniatura, la
descarga, y el borrado del objeto cuando se borra el mensaje.

*Queda andando:* pegar una captura en el chat, verla, y borrarla de verdad. **Eso es
exactamente el "listo cuando" del hito 5 del roadmap.**

### Paso 4 — Retención y purga

La configuración de cuánto se guarda, la purga automática y la limpieza de lo huérfano. Va
acá y no al final porque es lo que evita que los 10 GB del almacenamiento de objetos se
llenen en tres meses, que es lo que dice la cuenta del capítulo 6 de la investigación.

*Queda andando:* el costo del chat deja de crecer solo.

### Paso 5 — El buscador

Local sobre la caché (instantáneo y gratis) y del servidor solo para lo que nunca bajaste. Va
después del paso 1 porque sin caché el buscador es un grifo de egress abierto.

*Queda andando:* encontrar algo que dijiste hace ocho meses sin bajar ocho meses de chat.

### Paso 6 — Las comodidades

Responder, editar desde la interfaz, reacciones, markdown y bloques de código, menciones,
mensajes fijados, previsualización de enlaces. Todas se cuelgan del esqueleto del paso 2 sin
tocar nada de lo anterior. Se pueden hacer en cualquier orden, de a una, y cada una entra
sola.

### Paso 7 — "Está escribiendo"

Último a propósito. Es la función con peor relación entre lo que aporta y lo que gasta del
cupo común (ver D5). Se hace cuando ya sabemos leer el contador y podemos ver en vivo cuánto
cuesta prenderla.

### Lo que NO está en el camino todavía

Hilos, foros, encuestas, emojis propios y stickers. Están en el hito 7 del roadmap y ahí se
quedan: mucho trabajo, poco diferencial.

---

## 3. DECISIONES QUE HAY QUE TOMAR ANTES DE ESCRIBIR CÓDIGO

### D1 — Dónde vive el historial y cómo se sincroniza

**El problema, en criollo:** hoy, cada vez que abrís un canal, la app le pide al servidor los
últimos 60 mensajes. Siempre. Aunque ya los hayas visto mil veces. El plan gratis de Supabase
da 5 GB de bajada por mes y esa bajada se cuenta toda: si 200 personas bajan 1 MB de historial
por día, son 6 GB y ya nos pasamos sin haber hecho una sola llamada.

**Opciones:**

| | Cómo es | En contra |
|---|---|---|
| **A. Como hoy** | pedir los últimos N cada vez | el historial no puede crecer, el buscador es impagable, y con 200 se pasa el cupo |
| **B. Caché en memoria** | guardar lo bajado mientras la app está abierta | se pierde al cerrar; al día siguiente no arregló nada |
| **C. Caché en el disco de cada uno** | base de datos local del motor (IndexedDB), y al servidor se le pide "dame lo que pasó desde tal momento" | hay que resolver el borrado y el orden (D3 y sección 4) |

**Recomendación: C.** Es lo que dice la investigación y no hay alternativa real. Es la
diferencia entre bajar todo cada vez que abrís un canal y bajar los tres mensajes que
faltaban.

**Cómo se sincroniza, en concreto.** Por cada canal la app guarda una marca: "de este canal
tengo todo hasta tal fecha y hora". Al abrir la app, por cada canal hace tres preguntas
cortas:

1. ¿Qué mensajes nuevos hay desde mi marca?
2. ¿Qué mensajes se **editaron** desde mi marca?
3. ¿Qué mensajes se **borraron** desde mi marca? (esto es la tabla de lápidas, D3)

Tres consultas chiquitas que casi siempre vuelven vacías. Y mientras la app está abierta y el
canal abierto, lo nuevo llega por Realtime, que es lo que ya hace hoy.

**La trampa que rompe esto si se ignora:** pedir "desde mi marca exacta" pierde mensajes.
Postgres pone el `created_at` cuando la transacción **arranca**, pero la fila se hace visible
cuando **termina**. Dos mensajes mandados casi juntos pueden hacerse visibles en orden
distinto al de su hora. Si pedís "desde las 10:00:05" justo cuando un mensaje de las 10:00:04
todavía no terminó de guardarse, ese mensaje no lo ves nunca más.

**La salida simple, que es la que corresponde a nuestra escala:** pedir siempre desde **la
marca menos 30 segundos** y tirar los repetidos por identificador. Bajás un puñado de mensajes
de más y listo. La alternativa correcta de libro (un número de orden por canal asignado con
bloqueo de fila) es más código, más lento y no la necesitamos con 50 personas.

**Cuánto ocupa la caché:** el texto es liviano. Según la cuenta del capítulo 6, 200 personas
generan 12 MB de texto por mes en el servidor. Un usuario nuestro, con tres años de chat
encima, está en el orden de los 100 MB de disco. Las imágenes son el volumen, y por eso su
caché tiene tope por preset (sección 5). Tiene que haber botón de "vaciar la caché local" y
mostrar cuánto ocupa, sin vueltas.

**Hay que verificar:** que el motor de la app (WebView2) le dé a IndexedDB almacenamiento
duradero y no lo borre cuando el disco se llena; en concreto, si `navigator.storage.persist()`
devuelve verdadero en la app empaquetada. Y que la app se sirva siempre desde el mismo puerto
fijo: si el origen cambia, la caché se pierde entera. No es fatal (se vuelve a bajar), pero es
un mes de egress de golpe si le pasa a todos el mismo día.

### D2 — Cómo se suben las imágenes al almacenamiento de objetos sin exponer credenciales

**El problema, en criollo:** las imágenes van a Cloudflare R2 porque da 10 GB gratis y **la
salida nunca se paga**, que es justo lo que querés para una foto que se mira veinte veces. El
almacenamiento de Supabase da 1 GB y cobra la salida: no sirve. Pero para escribir en R2 hace
falta una clave secreta, y una clave secreta adentro de la app es una clave publicada:
cualquiera abre el ejecutable, la saca, y te llena el bucket o te lo vacía.

Esto **no** es lo mismo que la clave de Supabase que está en `src/supabase/client.js`. Esa es
pública a propósito y lo que protege es RLS. R2 no tiene RLS: la clave es la llave del
candado entero.

**Opciones:**

| | Cómo es | A favor | En contra |
|---|---|---|---|
| **A. Clave en la app** | R2 directo desde el cliente | trivial | **inaceptable.** Ni se discute |
| **B. Ayudante que firma** | un Worker de Cloudflare revisa quién sos y devuelve un permiso temporal para subir un archivo puntual. Los bytes van del cliente a R2 sin pasar por nadie | el archivo no pasa por nuestra compute, el permiso vence, se puede poner cupo por persona | hay que escribir y mantener el ayudante (unas 80 líneas) |
| **C. Ayudante que recibe el archivo** | el Worker recibe los bytes y los escribe él | no hay que firmar nada | el archivo pasa por el Worker, con su límite de tamaño de cuerpo; un archivo grande se complica |
| **D. Función de Supabase** | lo mismo que B pero del lado de Supabase | ya tiene la sesión del usuario a mano | mete a Supabase en un camino donde no aporta nada, y es el servicio que tiene el cupo ajustado |

**Recomendación: B.** El Worker hace tres cosas y nada más:

1. Comprueba que el que pide sea un usuario logueado de verdad (valida el token de Supabase
   contra las claves públicas del proyecto).
2. Comprueba que el archivo entre en los límites: tamaño, tipo y cupo del que sube.
3. Devuelve una dirección de subida que vence en 5 minutos y sirve para **ese** archivo y
   nada más.

Las credenciales de R2 viven como secreto del Worker y no salen de ahí. La app nunca las ve.
Y queda un lugar donde poner el freno: si alguien intenta subir 500 archivos en un minuto, el
Worker le dice que no.

**Costo:** Workers en plan gratis da 100.000 pedidos por día. Nuestro uso proyectado con 50
personas activas es del orden de 800 pedidos por día. No se roza el techo.

**La otra mitad, que se olvida siempre: cómo se ven las imágenes después.** Dos caminos con un
intercambio honesto:

- **Bucket público con nombres impredecibles.** La imagen se ve poniendo la dirección, no
  cuesta ningún pedido al Worker y el motor la cachea solo. **Pero el que tenga la dirección la
  ve para siempre**, aunque después lo eches del canal, y la única forma de revocar es borrar
  el archivo.
- **Bucket privado y el Worker firma también la lectura.** Cada imagen se pide una vez con un
  permiso que vence. Cuesta un pedido al Worker por imagen y por persona, pero como la app
  guarda la imagen en su caché local, es una sola vez por persona.

**Recomendación: bucket privado, permiso de lectura que vence en 1 hora, y caché local.** Es lo
único coherente con prometer borrado. El costo extra es despreciable a nuestra escala y la
caché local lo absorbe.

**Límite por archivo:** el plan gratis de la competencia está en 20 MB (subió en agosto de
2026, venía de 10). **Propuesta: 100 MB.** Es cinco veces más, es un número redondo que se
entiende, y se banca sin partir el archivo en pedazos. Lo que no se puede poner es
"ilimitado": con 10 GB de cupo total, tres videos de 2 GB se comen todo.

**Hay que verificar:** que una subida de 100 MB de un tirón con permiso firmado funcione bien
desde WebView2, sin cortarse por tiempo ni comerse la memoria. Si se corta, hay que partir el
archivo en pedazos (el estándar lo soporta) y eso es bastante más código. **Hay que
verificar** también los precios de las operaciones de R2 más allá del cupo gratis; el guardado
a 0,015 dólares por GB y mes sí está confirmado en la investigación, las operaciones no.

**La decisión que ahorra más plata de todo el documento: reencodar antes de subir.** Una
captura de pantalla pegada sale de 2 a 5 MB. La misma imagen redimensionada a 1600 píxeles de
lado mayor y guardada en un formato moderno queda en 200 a 400 KB, y en una ventana de chat no
se nota la diferencia. **Eso convierte "el cupo se llena en 3 meses" en "el cupo se llena en
dos años".** Se hace en la propia PC del que sube, con lo que ya trae el motor, y no cuesta un
peso. El original se guarda solo si el que sube marca "mandar sin comprimir".

### D3 — Qué significa exactamente "borrar de verdad", y qué se puede prometer

Acá hay que ser prolijos, porque es fácil prometer algo que después no se cumple. Un mensaje
borrado vive en cuatro lugares y **el control que tenemos sobre cada uno es distinto.**

| Dónde está | ¿Lo podemos borrar? | Qué se promete |
|---|---|---|
| **1. La base del servidor** | Sí, y de verdad: la fila se va, no se marca como borrada | **Se promete sin asterisco**, y se puede verificar mirando la base |
| **2. El adjunto en el almacenamiento** | Sí: se borra el objeto y la dirección pasa a devolver "no existe" | **Se promete**, con el asterisco de que un permiso de lectura firmado antes del borrado sigue sirviendo hasta que vence (por eso la hora de D2) |
| **3. La caché local de los otros** | Sí, pero solo cuando esa persona vuelve a abrir la app | **"Desaparece de la pantalla de los demás."** Asterisco: si esa persona no abre la app nunca más, su copia sigue en su disco |
| **4. Lo que el otro ya hizo con eso** | **No** | **No se promete nada.** Capturas de pantalla, el archivo ya bajado a su carpeta, una copia modificada de la app |

**La decisión: borrado duro, no marca de borrado.** Muchas apps guardan la fila y le ponen una
banderita de "borrado". Es más fácil y permite arrepentirse. **Acá no**, por tres razones que
tiran para el mismo lado: (a) Martín lo pidió explícito; (b) el espacio de la base es uno de
los dos cuellos de botella y guardar basura marcada no ayuda; (c) prometer "borrado" con la
fila todavía adentro es mentira.

**La pieza técnica que es fácil no ver:** si la fila desaparece, la sincronización por
diferencia de D1 **no tiene forma de enterarse**. El que estaba desconectado pide "qué hay de
nuevo desde ayer", no le llega nada sobre ese mensaje, y se queda con la copia vieja para
siempre. Por eso hace falta una **tabla de lápidas**: una fila mínima que dice "el mensaje tal,
del canal tal, se borró a tal hora". Pesa unos 40 bytes y es lo único que queda. El que se
reconecta la lee y limpia su copia.

**Y la lápida también se va.** Propuesta: se guardan **90 días**. El que estuvo más de 90 días
sin abrir la app, al volver, en vez de sincronizar por diferencia **se baja el canal de cero**.
Es más caro para esa persona una sola vez, y evita tener lápidas eternas.

**Los tres botones y qué hace cada uno:**

- **Borrar un mensaje:** la fila se va, su adjunto se va, queda la lápida. Si tenía respuestas
  colgadas, esas quedan mostrando "el mensaje al que respondía ya no está". No se borran en
  cascada: borrarías conversación de otro.
- **Borrar una conversación (privado):** acá hay una pregunta que contestar y no es técnica:
  **¿borra para los dos o solo para mí?** Propuesta: **dos acciones separadas y escritas sin
  eufemismos.** "Sacarlo de mi vista" borra solo mi caché local y es reversible volviendo a
  sincronizar. "Borrarlo para los dos" borra del servidor, y solo puede alcanzar los mensajes
  que escribiste vos, salvo que el otro lo autorice: si no, cualquiera borraría la conversación
  ajena.
- **Vaciar un canal entero:** todos los mensajes y todos los adjuntos. Quién puede hacerlo es
  del área de permisos; qué hace es nuestro.

**Retención configurable:** por canal, con opciones cerradas (para siempre / 1 año / 90 días /
30 días / 7 días / 24 horas) y **retención separada para los adjuntos**, más corta por defecto.
El texto es barato y lo querés tener; las imágenes son el volumen. Un canal con texto para
siempre y adjuntos a 90 días es la configuración sensata y debería ser el valor por defecto.

**Cómo corre la purga.** Verificado hoy contra el proyecto `mwzkrahindnheuheoycv`: `pg_cron`
1.6.4 y `pg_net` 0.20.4 están **disponibles** en la base (todavía no instalados). O sea que la
purga puede ser un trabajo programado dentro de la propia base, sin servidor y sin que nadie
tenga que dejar la app abierta: borra las filas vencidas y le avisa al Worker qué objetos tiene
que borrar del almacenamiento. Como red de seguridad, además, una regla de vencimiento del
propio bucket por si el aviso se pierde alguna vez.

**Hay que verificar:** si el plan gratis de Supabase hace copias de respaldo automáticas de la
base y cuánto las guarda. Si las hace, el mensaje borrado **sigue existiendo en esa copia**
hasta que rote, y eso hay que decirlo en la pantalla de borrado en vez de esconderlo. **Hay que
verificar** también que R2 no tenga versionado de objetos prendido (por defecto no lo tiene):
con versionado, borrar no borra.

### D4 — Cómo se evita reventar el contador de mensajes de Realtime

**El problema, en criollo:** el plan gratis da 2 millones de mensajes de Realtime por mes, y la
trampa es cómo se cuentan: **cada mensaje cuenta una vez al mandarse y una vez por cada persona
que lo recibe.** Mandás uno y lo escuchan 20: son 21.

La fórmula, para tenerla a mano:

```
mensajes por mes ≈ mensajes de chat por día × (1 + suscriptores conectados) × 30
```

Con 50 personas y unas 15 conectadas al mismo tiempo, mil mensajes por día son **480.000 por
mes**: entra cómodo. Con 200 personas y 40 conectadas, dos mil mensajes por día son
**2.460.000**: se pasa el cupo solo con el chat, sin presencia ni llamadas.

**O sea: a nuestra escala real esto no es un problema, y al techo declarado sí lo es.** Las
decisiones hay que tomarlas ahora porque después no se retrofitean barato.

**Las cuatro palancas, de la que más rinde a la que menos:**

1. **Suscribirse solo a lo que tenés abierto.** Hoy `openChannel()` ya hace esto bien. **Es la
   decisión más importante del área, ya está tomada, y no hay que romperla nunca.** Es la
   diferencia entre repartir a los 15 conectados o a los 4 que están mirando.
2. **Un aviso por persona, no un aviso por canal.** Para lo que pasa en canales que no tenés
   abiertos (una mención, un privado nuevo), un solo canal personal por usuario que recibe
   avisos mínimos. Un aviso de mención son 2 mensajes: uno que sale, uno que llega. Barato.
3. **Agrupar en vez de mandar de a uno.** Diez mensajes seguidos en 5 segundos no son diez
   avisos: es uno que dice "hay novedades". Para el canal abierto no sirve (querés verlo al
   toque); para el aviso de fondo sí, y ahorra muchísimo.
4. **Cuentagotas en "está escribiendo".** Ver D5, que es un caso aparte por lo caro.

**Lo que hay que decidir ahora y no después:** hoy el chat escucha cambios de tabla
(`postgres_changes`). Funciona y es lo más simple, pero tiene dos problemas concretos:

- **No sirve para borrados.** Cuando una fila se borra, el aviso viaja solo con la clave
  primaria, así que el filtro por canal no se puede aplicar y no se puede saber de qué canal
  era. **Solución elegante y además gratis:** el borrado viaja como el **alta de una lápida**
  (D3). Un alta sí se filtra bien por canal y sí respeta los permisos. O sea que la tabla de
  lápidas no es solo para la sincronización: también es el caño por donde viaja el borrado en
  vivo.
- **Escuchar cambios de tabla escala peor** que mandar un aviso hecho a mano, porque el
  servidor tiene que evaluar los permisos de cada cambio contra cada suscriptor.

**Recomendación:** arrancar con lo que ya hay porque anda y es poco código, **pero** tener el
borrado viajando por lápidas desde el día uno, y dejar escrito que si el contador se acerca al
50% del cupo se migra a avisos hechos a mano desde la base. **Hay que verificar** cómo se
cuentan exactamente contra el cupo de 2 millones los avisos mandados desde la base frente a
escuchar cambios de tabla: de eso depende que la migración valga la pena.

### D5 — "Está escribiendo": el caso que se decide con la calculadora

Va aparte porque es la función con peor relación entre lo que aporta y lo que cuesta.

Si se manda un aviso por cada tecla: un mensaje de 40 caracteres, con 6 personas mirando el
canal, son **240 mensajes de Realtime para avisar que alguien va a mandar uno**. Doscientas
cuarenta veces el costo de la cosa que anuncia.

Con cuentagotas de 5 segundos: un mensaje que tarda 10 segundos en escribirse son 2 avisos × 6
personas = 12 mensajes. Mil mensajes por día así son **360.000 por mes: el 18% del cupo entero
solo para los puntitos.**

**Tres cosas que lo dejan casi gratis y no se notan:**

- Cuentagotas de 5 segundos, sin excepción.
- **No mandar el "dejó de escribir".** Que se apague solo a los 7 segundos en la pantalla del
  que mira. Ahorra la mitad de los avisos y nadie lo percibe.
- **No mandarlo si no hay nadie mirando ese canal.** La presencia ya nos dice quién está: si
  escribís en un canal que nadie tiene abierto, los puntitos no viajan a ningún lado.

Con las tres, la misma cuenta baja a unos **90.000 por mes: 4,5% del cupo.** Aceptable.

**Recomendación:** hacerlo, con las tres reglas, en privados y en canales con pocos mirando.
**Y que esté en la lista de lo primero que se apaga** si el contador del mes se pone feo.

### D6 — El contrato con el área de canales: qué pasa con lo que queda tirado

Cuando el área de canales borra un canal, la base se lleva los mensajes puestos (la clave
foránea ya está en cascada). **Pero los archivos en el almacenamiento de objetos no se van
solos.** Quedan ocupando los 10 GB para siempre, sin ninguna fila que los nombre. Es el tipo de
fuga que aparece a los seis meses, con el cupo lleno y nadie sabiendo por qué.

**Recomendación:** el área de canales no tiene que saber nada de archivos. Se resuelve con un
disparador en la base que, antes de que la cascada se lleve los mensajes, anota los adjuntos de
ese canal en una **cola de objetos a borrar**, y el mismo trabajo programado de la purga la
vacía. Una cola, un trabajo, y sirve para los tres casos (mensaje, conversación y canal) y
también para los archivos que quedaron colgados de una subida que nunca terminó.

---

## 4. LO QUE SE NOS ESTÁ OLVIDANDO

**1. Mensajes que llegaron mientras estabas desconectado.** Es el caso normal, no el raro. Lo
resuelve la sincronización por diferencia de D1, con dos detalles que se escapan: el mensaje
que **se borró mientras estabas afuera** (por eso las lápidas) y el que **se editó mientras
estabas afuera** (por eso la marca de edición es parte de la consulta de sincronización, no un
adorno). Y el caso feo: estuviste seis meses afuera y tu marca es más vieja que las lápidas.
Ahí no se sincroniza, se baja el canal de cero.

**2. El orden de los mensajes.** Tres trampas encimadas:

- La hora la pone el servidor, no la PC de cada uno. Bien: si la pusiera el cliente, alguien
  con el reloj mal configurado desordenaría el canal de todos. Hoy ya está así (valor por
  defecto `now()`) y hay que dejarlo.
- Ordenar solo por hora no alcanza: dos mensajes del mismo milisegundo se ordenarían distinto
  en cada pantalla. Hay que ordenar por hora **y después por identificador**, siempre, en todos
  lados.
- El eco optimista (mostrar tu mensaje antes de que el servidor conteste) hace que por medio
  segundo veas tu mensaje último cuando en realidad quedó tercero. Se arregla reordenando
  cuando llega la confirmación, y hay que hacerlo: si no, el que escribe rápido ve una cosa y
  el que lee ve otra.

**3. Mensajes duplicados.** Mandás, la respuesta se pierde en el camino, la app reintenta,
quedan dos. Se arregla con un **identificador puesto por el cliente**: la app genera un número
único antes de mandar, la base tiene la regla de que no puede haber dos iguales en el mismo
canal, y el reintento rebota solo. El mismo identificador sirve para reconocer tu propio
mensaje cuando vuelve por Realtime y no mostrarlo dos veces.

**4. Editar algo que el otro ya leyó.** Dos problemas distintos:

- *Técnico:* si edito y el otro ya lo tiene en su caché, tiene que enterarse. Por eso la
  consulta de ediciones en la sincronización.
- *Humano, y más importante:* si se puede editar sin dejar rastro, cualquiera cambia lo que
  dijo después de que le contestaron. **Recomendación:** marca de "editado" visible siempre,
  sin excepción, y ventana de edición limitada (propuesta: 24 horas) para el texto. **Los
  adjuntos no se editan nunca**: se borran y se manda otro. Guardar el historial completo de
  ediciones es tentador y es un no: ocupa espacio y contradice el borrado duro de D3.

**5. Imágenes pesadas.** Una captura de 4K sin comprimir son 8 MB; veinte por día son 160 MB. Lo
resuelve el reencodado de D2. Tres cosas que se olvidan: **los datos escondidos en la foto**
(dónde se sacó, con qué cámara) se van solos al reencodar y eso es una ventaja de privacidad
que conviene contar; **las imágenes animadas no se reencodan igual** que las fijas y hay que
tratarlas aparte; y hay que guardar **el ancho y el alto en la fila del mensaje** para dejarle
el hueco al dibujar, porque si no la lista salta cada vez que carga una imagen, y eso es lo más
molesto que puede hacer un chat.

**6. Alguien pega un video de 200 MB.** Se rechaza **antes** de subir un solo byte, mirando el
tamaño del archivo al elegirlo, con un mensaje que diga el número ("el límite es 100 MB, este
archivo tiene 214") y que ofrezca la salida: subirlo a otro lado y pegar el enlace, que además
gana previsualización gratis. Lo que **no** vamos a hacer es convertir el video a un formato más
chico: no hay servidor para hacerlo, y hacerlo en la PC del usuario contradice la promesa número
uno del proyecto, que es no robarle la máquina. Que quede escrito para no discutirlo de nuevo.

**7. El "está escribiendo" que consume mensajes.** Ver D5. Resumen: cuentagotas de 5 segundos,
no mandar el apagado, no mandarlo si nadie mira.

**8. Borrar un mensaje que ya se descargó en la PC del otro.** Ver D3. Resumen: la lápida lo saca
de la pantalla del otro cuando vuelve; lo que ya bajó a su carpeta de descargas no se toca; la
captura de pantalla no existe para nosotros. **Se promete lo primero y se dice lo otro en la
misma pantalla, no en unos términos que nadie lee.**

**9. Alguien se va del grupo, o lo echan.** El caso con más consecuencias y el que más se olvida:

- **Lo que escribió, ¿se va con él?** Recomendación: **no.** Si se fuera, la conversación de
  todos los demás queda llena de agujeros. El mensaje queda y el autor pasa a mostrarse como
  alguien que ya no está.
- **Sus adjuntos, igual:** quedan.
- **Deja de ver lo nuevo al instante**, porque la política de lectura ya depende de ser miembro.
  Eso ya funciona hoy.
- **Pero su caché local se queda con todo el historial de antes**, y ahí no podemos hacer nada.
  Es la misma limitación honesta de D3 punto 3, y vale la pena decirla: **echar a alguien no
  borra lo que ya leyó.** Es verdad en cualquier chat y conviene decirlo en vez de dejar que se
  suponga lo contrario.
- **El caso feo:** si el que se va tenía un permiso de lectura de una imagen firmado hace 20
  minutos, lo puede usar hasta que venza. Por eso la hora de D2 y no un día.
- Si **borra su cuenta**, ahí sí el borrado es duro: la base ya está en cascada desde `profiles`,
  o sea que sus mensajes se irían. **Atención: eso choca de frente con la recomendación de
  arriba de que los mensajes queden.** Es una decisión que hay que tomar a conciencia, no por
  accidente del esquema.

**10. Cosas que no estaban en la lista y aparecieron mirando el código:**

- **El límite de 2.000 caracteres ya está en la base** (`check (char_length(body) between 1 and
  2000)`). Hay que decidir si lo subimos. Recomendación: dejarlo. Es el mismo número que usa la
  competencia, y un mensaje más largo que eso es un archivo de texto.
- **Un mensaje puede quedar sin adjunto:** subís la imagen, se corta la luz, y el objeto queda en
  el almacenamiento sin ninguna fila que lo nombre. Se resuelve escribiendo la fila del mensaje
  **después** de que la subida terminó, y con la cola de limpieza de D6 barriendo los objetos
  huérfanos de más de 24 horas.
- **Dos personas borran el mismo mensaje al mismo tiempo**, o borrás un mensaje mientras el otro
  le está poniendo una reacción. No es grave (queda borrado igual), pero la interfaz no tiene que
  tirar un error feo.
- **Pegar un enlace a una página maliciosa.** La previsualización la tiene que hacer el Worker, no
  la app: si la hiciera la app, la página del otro lado se entera de la dirección IP de cada
  persona que vio el mensaje. Y con tope de tamaño y de tiempo, porque una página puede devolver
  un archivo de 2 GB a propósito.
- **Pegar un mensaje enorme desde el portapapeles**, o arrastrar 200 archivos de una: tope a la
  cantidad de adjuntos por mensaje (propuesta: 10) y avisar.
- **El scroll infinito hacia arriba** en un canal de 50.000 mensajes: si se dibujan todos los
  mensajes, la memoria se va al demonio y contradice la promesa del proyecto. Hay que dibujar solo
  lo que se ve y soltar lo que quedó arriba. Es exactamente la misma lección del bucle que dibujaba
  a 60 cuadros por segundo pantallas que nadie miraba.

---

## 5. CÓMO SE CONECTA CON LOS PRESETS

**Primero, la distinción que ordena toda esta sección** y que no está escrita en ningún otro lado:
en el chat hay **dos clases de ajuste** y no se tratan igual.

- **Los que gastan TU máquina** (memoria, procesador, tu disco): cuántos mensajes se dibujan, si
  se animan las imágenes, cuánta caché guardás. Acá el preset manda y el que tiene máquina de
  sobra puede subir todo lo que quiera. Es su PC.
- **Los que gastan el CUPO COMÚN** (los mensajes de Realtime y el egress, que son de todos): el
  "está escribiendo", con qué frecuencia se sincroniza, el tamaño de lo que se sube. Acá **"soy
  cheto" no puede gastar más que los demás**, porque no estaría gastando lo suyo: estaría gastando
  el mes de todo el grupo. Esos ajustes tienen techo igual para los cuatro presets.

Es la misma lógica de los techos duros de video del roadmap, aplicada al chat.

### La tabla

| | **PC tostadora** | **PC estándar** | **Llamadita** | **Soy cheto** |
|---|---|---|---|---|
| Mensajes dibujados por canal | 50 | 150 | 300 | 500 |
| Imágenes | no se cargan solas: recuadro con el tamaño y botón "ver" | miniatura automática | miniatura automática | miniatura automática y la grande precargada |
| Imágenes animadas | quietas (primer cuadro), se animan al tocarlas | se animan al pasar el mouse | se animan | se animan |
| Previsualización de enlaces | apagada | encendida | encendida | encendida |
| Colores en los bloques de código | no (monoespaciado a secas) | sí | sí | sí |
| Caché local de adjuntos | 200 MB | 500 MB | 1 GB | 4 GB |
| Caché local de texto | 3 meses | 1 año | todo | todo |
| Precarga al abrir la app | solo el último canal abierto | los 3 últimos | los 5 últimos | todos |
| Animación al aparecer un mensaje | no | no | sí | sí |
| **"Está escribiendo"** | no se manda ni se muestra | cuentagotas de 5 s | **igual** | **igual, no más** |
| **Frecuencia de sincronización** | al abrir el canal | al abrir y cada 2 min | **igual** | **igual, no más** |
| **Tamaño máximo por archivo** | 100 MB | 100 MB | 100 MB | **100 MB, igual** |
| **Reencodado de imágenes al subir** | siempre | siempre | siempre | siempre (con opción manual de mandar el original) |

Las cuatro filas en negrita son las del cupo común: **iguales para los cuatro presets a
propósito.**

**Por qué cada una, cortito:**

- *Mensajes dibujados:* cada mensaje en pantalla son varios elementos del motor y ahí se va la
  memoria. Es nuestra palanca más directa sobre los 220 MB medidos.
- *Imágenes animadas:* una imagen animada es un bucle de decodificación permanente. Diez en
  pantalla es procesador tirado a la basura mientras jugás. Es el mismo error que ya nos costó
  6,49% de CPU una vez.
- *Precarga:* bajar de entrada el historial de todos los canales es justo el egress que queremos
  evitar. En "cheto" se permite porque son pocos usuarios y ya sincronizaron casi todo, pero es la
  primera fila que se revisa si el egress se pone feo.

### Cuando el usuario quiere más de lo que su preset permite

La regla del roadmap es que se elige un preset pero cada cosa se puede tocar a mano. Acá se
aplica así:

1. **Todo lo de la mitad de arriba se puede subir sin pedir permiso.** Tocás una perilla y el
   preset pasa a mostrarse como "Llamadita (modificado)". Ni esconderlo ni preguntar tres veces.
2. **Lo del cupo común tiene techo y el techo no se corre.** Si alguien quiere subir un archivo
   de 300 MB, el mensaje no es "activá el modo pro": es **el número**, honesto. "El almacenamiento
   del grupo son 10 GB para todos. Un archivo de 300 MB es el 3% del total. El límite es 100 MB."
3. **Cuando prendés algo caro, la app dice cuánto cuesta antes de prenderlo**, igual que el aviso
   de subida al elegir 60 cuadros por segundo del hito 3. "Precargar todos los canales va a bajar
   unos 40 MB ahora y unos 5 MB cada vez que abrís la app."
4. **Si el contador del mes se pone feo, hay un modo de emergencia** que baja a todos a los valores
   de tostadora en las filas del cupo común, con un aviso que explique por qué. No es censura: es
   que el mes siga costando cero, que es la promesa del proyecto.

---

## 6. CÓMO SE PRUEBA

Sin números medidos esto es opinión. Los criterios son todos verificables por alguien que no
escribió el código.

### 6.1 El presupuesto del mes con 50 personas activas

**Supuestos** (tirando para arriba a propósito, en línea con el capítulo 6 de la investigación):
50 registradas, 15 conectadas en el pico, 1.000 mensajes de chat por día, 30 imágenes por día,
cada persona en 6 canales de texto y mirando 4 a la vez.

| Recurso | Cuenta | Proyección mensual | Techo gratis | Criterio de aprobación |
|---|---|---|---|---|
| Realtime — chat | 1.000/día × (1 + 4 mirando) × 30 | **150.000** | 2.000.000 | < 300.000 |
| Realtime — "está escribiendo" | con las tres reglas de D5 | **90.000** | (el mismo cupo) | < 150.000 |
| Realtime — avisos de fondo | menciones y privados, agrupados | **40.000** | (el mismo cupo) | < 100.000 |
| **Realtime, total del chat** | | **280.000 (14%)** | 2.000.000 | **< 500.000 (25%)** |
| Egress — sincronización | 1.000 msgs × 350 bytes × 50 personas × 30 | **525 MB** | 5 GB | < 1 GB |
| Egress — payloads de Realtime | 280.000 × ~400 bytes | **112 MB** | (el mismo cupo) | < 300 MB |
| **Egress, total del chat** | | **~640 MB (13%)** | 5 GB | **< 1,5 GB (30%)** |
| Almacenamiento de objetos | 30 imágenes × 300 KB reencodadas × 30 | **270 MB/mes** | 10 GB | < 500 MB/mes |
| Pedidos al Worker | firmas de subida y de lectura | ~800/día | 100.000/día | < 10.000/día |

**El número que hay que poder decir en una frase:** con 50 personas activas, el chat entero usa
el **14% del cupo de mensajes** y el **13% del egress**, y el almacenamiento aguanta **unos 3
años** antes de tocar los 10 GB. Con retención de adjuntos a 90 días, no se llena nunca.

**Y el número incómodo, para no mentirnos:** con las mismas reglas y 200 personas con 40
conectadas, el chat solo da **2,46 millones de mensajes por mes y se pasa el cupo**. El excedente
son 2,50 dólares por millón, o sea que pasarse cuesta unos **3 dólares por mes**, no una
catástrofe. Pero hay que saberlo antes, no después.

**Cómo se verifica que la cuenta es cierta y no de manual:** anotar el contador del panel de
Supabase, hacer una sesión de prueba controlada de una hora con 3 cuentas, anotarlo de nuevo y
multiplicar. Si el número real sale más del doble del proyectado, hay una fuga y hay que buscarla
antes de seguir.

### 6.2 Criterios funcionales, cada uno con su número

| Qué se prueba | Cómo | Pasa si |
|---|---|---|
| **La caché sirve** | abrir un canal con 2.000 mensajes ya sincronizados | baja **menos de 50 KB** (sin caché serían ~700 KB) y aparece en **menos de 200 ms** |
| **La sincronización no pierde nada** | cerrar la app 3 días y abrirla | trae exactamente los mensajes de esos 3 días, en orden, sin agujeros ni repetidos |
| **El orden es el mismo en las dos pantallas** | dos personas mandan 20 mensajes cada una a la vez | las dos listas terminan idénticas, mensaje por mensaje |
| **No hay duplicados** | cortar la red justo después de mandar y dejar que reintente 3 veces | queda **un** mensaje |
| **Borrado de un mensaje con imagen** | borrar y revisar los tres lugares | la fila no está en la base, el objeto da "no existe", y desaparece de la otra PC en **menos de 5 segundos** si está abierta, y al abrir si estaba cerrada |
| **Borrado con el otro desconectado** | borrar con la otra PC cerrada y abrirla a los 10 minutos | el mensaje no aparece |
| **La retención se cumple** | poner 24 h en un canal de prueba y correr la purga | se van los viejos, quedan los nuevos, y los adjuntos viejos también se fueron |
| **Sin objetos huérfanos** | contar objetos en el almacenamiento contra filas con adjunto | la diferencia es **cero** después de correr la limpieza |
| **El límite de archivo** | subir 99 MB y después 200 MB | el de 99 anda; el de 200 se rechaza **antes de subir un byte**, con el número en el mensaje |
| **El reencodado sirve** | pegar una captura de pantalla de 4K | sube **menos de 500 KB** y a ojo no se nota la diferencia |
| **Buscador local** | 50.000 mensajes en la caché, buscar una palabra | responde en **menos de 300 ms** y **sin pedirle nada al servidor** |
| **Buscador con tildes** | buscar "camion" y que encuentre "camión" | lo encuentra (`unaccent` y `pg_trgm` están disponibles en el proyecto) |

### 6.3 Criterios de consumo de la máquina, que es la promesa número uno

Línea de base medida el 15/09/2026 en la `1.15.1A`: **422 MB de memoria de trabajo, 220 MB propia,
0,45% de procesador** sin llamada.

| Qué se prueba | Pasa si |
|---|---|
| Canal con 5.000 mensajes en caché, scroll hasta arriba del todo | preset Llamadita: **no más de +80 MB** sobre la línea de base. Tostadora: **no más de +30 MB** |
| 10 imágenes animadas visibles a la vez | Llamadita: **menos de 3%** de procesador. Tostadora: **menos de 1%** (están quietas) |
| App abierta 8 horas con el chat andando | la memoria **no crece de forma sostenida**. Si crece, hay una fuga y es nuestra |
| Escribir un mensaje largo | el procesador **no se mueve** mientras escribís. Si se mueve, el "está escribiendo" está mal hecho |

### 6.4 Lo que hay que verificar antes de dar esta ficha por buena

1. Si el almacenamiento local del motor es duradero en la app empaquetada
   (`navigator.storage.persist()` en WebView2).
2. Si una subida de 100 MB de un tirón con permiso firmado aguanta desde WebView2.
3. Si el plan gratis de Supabase hace copias de respaldo y cuánto las guarda. Afecta directamente
   **qué se puede prometer** en la pantalla de borrado.
4. Que R2 no tenga versionado de objetos prendido.
5. Cómo se cuentan contra el cupo de 2 millones los avisos mandados desde la base, frente a
   escuchar cambios de tabla.
6. Los precios de las operaciones de R2 más allá del cupo gratis. El guardado a 0,015 dólares por
   GB y mes sí está confirmado.

---

## 7. LO QUE NO VA ACÁ

Escrito para no discutirlo de nuevo dentro de seis meses.

**De otras áreas (frontera, no descarte):**

- Quién puede escribir, borrar, fijar o cambiar la retención de un canal. Es permisos.
- Crear, renombrar o borrar canales y espacios. Es canales.
- Menciones a un rol entero.
- Voz, cámara y pantalla. Grabar un mensaje de voz es del chat; la llamada no.
- Notificaciones del sistema operativo, bandeja, arrastrar y soltar desde Windows, atajos
  globales, dónde se guardan las descargas. Es escritorio.
- El recuadro del medidor de consumo. Nosotros le damos los números, no lo dibujamos.

**Descartado por ahora (hito 7 del roadmap o más lejos):**

- Hilos y foros. Mucho trabajo, poco diferencial.
- Encuestas.
- Emojis propios del espacio y stickers.
- Buscador de imágenes por contenido, transcripción de audios, resúmenes automáticos.
- Traducción automática.
- Bots, comandos con barra y ganchos web. Es hito 8.

**Descartado y que quede escrito, con el motivo:**

- **Convertir video o audio a un formato más chico.** No hay servidor para hacerlo en el plan
  gratis, y hacerlo en la PC del usuario contradice la promesa número uno del proyecto. Se rechaza
  el archivo grande con el número a la vista y se ofrece pegar un enlace.
- **Marca de borrado en vez de borrado real.** Contradice lo que pidió Martín y contradice el
  control de costos.
- **Historial completo de ediciones de cada mensaje.** Ocupa espacio y pelea con el borrado duro.
  Alcanza con la marca de "editado".
- **Cifrado de punta a punta del chat de texto.** La voz de a dos ya viaja cifrada porque va
  directo entre las PCs: eso es gratis y ya lo tenemos. El texto es otra cosa: si se cifra de
  verdad, **el buscador del servidor deja de existir, sincronizar entre dos PCs de la misma persona
  se complica, y no se puede leer el historial en una máquina nueva.** Es una decisión grande, que
  merece su propia discusión, y no se cuela adentro del hito 5. Lo que sí se puede prometer hoy sin
  mentir: nadie ajeno lo ve porque las políticas de la base lo impiden, pero el que administra el
  proyecto de Supabase técnicamente puede leerlo, y eso hay que decirlo en vez de dejar que se
  suponga lo contrario.
- **Moderación automática, filtros de palabras, detección de contenido.** El roadmap ya dijo que
  no.
- **Mensajes que se autodestruyen al leerse.** Suena bien y es la promesa más difícil de cumplir de
  todas: no podemos impedir una captura de pantalla. La retención configurable da el 90% del
  beneficio real sin prometer lo que no se puede.
