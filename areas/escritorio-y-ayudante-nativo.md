# Área: el cliente de escritorio y el ayudante nativo

Ficha de diseño. Es para pensar antes de escribir, no es código ni permiso para tocar el
repositorio. Redactada el 16/09/2026 contra la versión `0.16.2A`.

**De dónde salen los números de acá:** `ROADMAP.md` (regla 2c y línea de base medida),
`INVESTIGACION-COMPETENCIA.md` capítulos 5.1 y 9, y la lectura del código
(`desktop/neutralino.config.json`, `scripts/build-desktop.mjs`, `src/updater.js`,
`src/social/deeplink.js`, `installer.iss`).

**Los tres números que mandan (medidos el 15/09/2026, versión `1.15.1A`):**

| | Memoria de trabajo | Memoria propia | Procesador sin llamada |
|---|---|---|---|
| Llama-dita | 422 MB | 220 MB | 0,45 % |
| La app pesada de la que nos queremos diferenciar | 1.077 MB | 1.217 MB | 0,20 % |

Somos 5,5 veces más livianos en memoria propia, con el mismo gasto de procesador. Todo lo
que se decida acá se juzga contra esa tabla.

---

## 1. FRONTERAS

### Qué entra en esta área

Todo lo que el navegador no puede hacer solo, más lo que envuelve a la app como programa
de Windows.

1. **El ayudante nativo**: el programita chiquito que corre al lado de la app, el protocolo
   con el que hablan, cuándo arranca, cuándo se muere y qué pasa si se cae.
2. **Atajos globales**: apretar una tecla para hablar con el juego adelante, o sea con la
   ventana de Llama-dita atrás y sin foco. Neutralino no lo trae.
3. **Métricas reales de la máquina**: procesador, placa de video y memoria del *proceso
   nuestro*. Confirmado en el capítulo 9 de la investigación: la API de Neutralino da RAM
   total del sistema, datos del procesador, pantallas, discos y red, pero **no da uso de
   CPU, ni porcentaje de memoria, ni nada de placa de video**.
4. **Captura de pantalla con compresión por hardware**: enumerar monitores y ventanas,
   entregar la imagen y, si hace falta, comprimirla usando el chip de video en vez del
   procesador.
5. **La app como programa de Windows**: ícono en la bandeja, ventana chica siempre encima,
   una sola copia a la vez, arranque con Windows, dónde se guardan los datos.
6. **Instalador y actualizaciones**: el `.exe` de instalación, la firma (o la decisión de no
   firmar), y cómo llega una versión nueva tanto de la app como del ayudante.

### El límite con el área de pantalla y cámara

**Ellos definen QUÉ necesitan. Yo defino CÓMO se los doy.**

Ellos dicen: "necesito el monitor 2, a 1080p, 60 cuadros por segundo, comprimido con el chip
de video". Yo respondo una de dos cosas: acá tenés, o esta máquina no puede y te puedo dar
esto otro.

En criollo: ellos piden el plato, yo digo si hay ingredientes y cocino. Lo que **no** hago
es decidir el menú. La resolución, los cuadros por segundo y el codec los eligen ellos junto
con los presets. Yo tengo que entregarles, antes de que elijan, una lista honesta de lo que
la máquina aguanta: qué monitores hay, qué chip de video tiene, si ese chip puede comprimir
H.264 por hardware y cuántas cosas puede comprimir a la vez.

### El límite con el área del medidor de consumo

**Ellos muestran los números. Yo los consigo.**

Yo publico un paquete de números crudos cada tantos segundos: porcentaje de procesador de
nuestro árbol de procesos, memoria del proceso, uso del chip de video, uso del compresor de
video del chip. Nada más. No los redondeo para que queden lindos, no decido cuándo se ven,
no dibujo ni un píxel, no elijo colores ni umbrales de "esto está mal".

Del otro lado, la etapa 1 del medidor (bitrate, cuadros por segundo, paquetes perdidos,
jitter, latencia, si la llamada va directa o por relé) **no me pasa por acá**: esos números
salen de la propia llamada y no necesitan ayuda nativa. Que no se cuelen en mi área por
comodidad.

---

## 2. EL CAMINO

El orden importa por dos motivos: cada paso tiene que dejar algo funcionando, y el ayudante
tiene que crecer de lo barato y seguro a lo caro y riesgoso. Nunca al revés.

### Paso 0. Lo que ya está andando (no tocar sin motivo)

Neutralino sobre el WebView2 del sistema, instalador con Inno Setup, actualizaciones que
bajan el paquete de la web, esquema `llamadita://` para el enlace del mail. Funciona y está
medido. Es el piso.

### Paso 1. Todo lo que Neutralino ya puede, sin un solo binario nuevo

Ícono en la bandeja, ventana chica siempre encima, y **una sola copia de verdad**.

Va primero porque no agrega ni un gramo de peso, no toca antivirus, no pide permisos raros,
y resuelve el problema más viejo del proyecto: hoy la app usa el puerto fijo 24024 y la
segunda copia se muere fea. Tan es así que `abrir-enlace.cmd` tiene que preguntarle a
Windows si el proceso ya existe antes de abrirlo. Eso hay que resolverlo **antes** de que
exista el ayudante, porque si no el problema se duplica (ver sección 4).

*Queda andando:* la app se puede mandar a la bandeja y volver, y hay una ventanita chica que
se queda encima de todo mostrando quién habla.

### Paso 2. El ayudante vacío

Un programa que arranca, se conecta, contesta "estoy acá", dice su versión, y se muere solo
cuando la app cierra. **Cero funciones.**

Este paso parece tiempo perdido y es el más importante de todos. Es donde se descubre si el
antivirus lo marca, si queda colgado, si Windows lo deja arrancar, si el instalador lo copia
bien. Todos los problemas feos de esta área son de **ciclo de vida y de confianza**, no de
funcionalidad. Mejor descubrirlos con un programa que no hace nada que con uno a medio
escribir.

Regla que nace acá y no se rompe nunca más: **la app tiene que funcionar entera sin el
ayudante.** Si el ayudante no está, se apagan las funciones que dependen de él y se sigue.

*Queda andando:* nada visible para el usuario. Para nosotros: la prueba de las 20 aperturas
(ver sección 6).

### Paso 3. Métricas de procesador y memoria

Es el punto 2 del hito "que se pueda medir y regular" del roadmap. El ayudante mide nuestro
propio árbol de procesos y manda los números cada 2 o 3 segundos.

Va antes que los atajos porque es lo que le pone número a la promesa principal del proyecto,
porque solo lee información (no engancha el teclado, así que el antivirus lo mira con menos
sospecha), y porque es la función que se puede apagar sin que nadie llore si algo sale mal.

*Queda andando:* el medidor completo, con los números que hoy faltan.

### Paso 4. Atajos globales (hablar apretando una tecla)

Es el punto 1 del hito de comodidades de jugador. Ahora sí se toca el teclado, con toda la
letra chica de la sección 4.

*Queda andando:* se juega y se habla apretando una tecla, con la app atrás.

### Paso 5. Placa de video

Uso del chip de video y de su compresor. Va después porque es lo más difícil de hacer barato
(consultarle a la placa cuesta más que consultarle al procesador) y porque en máquinas con
gráficos integrados la respuesta puede ser "no hay dato", y eso hay que saber mostrarlo bien.

### Paso 6. Captura y compresión por hardware

El más caro y el último, **y solo si antes medimos que la captura del WebView no alcanza**.
Puede ser que el navegador de adentro ya comprima por hardware solo y no haya nada que
hacer. Meterse a capturar en nativo sin haber medido eso primero sería exactamente el error
que la regla 2d del roadmap nos prohíbe.

### Paso 7. Los remates

Arranque con Windows, revisión de la decisión de firmar, limpieza del desinstalador.

---

## 3. DECISIONES QUE HAY QUE TOMAR ANTES DE ESCRIBIR CÓDIGO

### 3.1 En qué lenguaje se hace el ayudante

| Opción | Tamaño del binario | Qué necesita la PC del usuario | Contra |
|---|---|---|---|
| **Rust** | 1 a 3 MB | nada | el que lo escribe tiene que instalarse la cadena de compilación (varios GB en la PC de desarrollo, no en la del usuario) |
| **C# con .NET compilado a nativo** | 2 a 10 MB | nada | necesita el kit de desarrollo de .NET para compilar; hay que verificar el tamaño real en esta configuración |
| **C# normal** | chico | el runtime de .NET instalado, o 70 MB de binario | pedirle al usuario que instale un runtime mata la promesa de "bajás una cosa y anda" |
| **Go** | 5 a 10 MB | nada | hablar con las APIs de Windows es más engorroso, y tiene fama de que algunos antivirus marcan sus binarios (hay que verificar) |
| **PowerShell** | cero | nada | arranca lento, no sirve para atajos globales, y es lo que más miran los antivirus |

**Recomendación: Rust.** Motivos, en orden:

1. **Un solo archivo `.exe` de 1 a 3 MB que no necesita nada instalado.** Eso es coherente
   con la promesa entera del proyecto: no le agregamos peso a la máquina de nadie.
2. Tiene acceso completo y documentado a las APIs de Windows sin trucos.
3. No arrastra un runtime que después haya que actualizar aparte.

**La honestidad que corresponde:** el lenguaje es la decisión menos importante de esta
sección. Los tres primeros de la tabla sirven. El riesgo verdadero está en el antivirus y en
el ciclo de vida, y esos son iguales en cualquier lenguaje. Si en algún momento la cadena de
compilación de Rust da problemas en la PC de Martín, pasarse a C# nativo es un cambio de
tarde, no de semana, siempre que el protocolo de mensajes esté separado (punto siguiente).

**Decisión pegada a esta:** el ayudante se escribe con una regla de hierro, que es **no
depender de bibliotecas de terceros salvo las imprescindibles**. Cada biblioteca que entra
es un binario más grande y una cosa más que un antivirus puede no conocer.

### 3.2 Cómo se comunica con la app

| Opción | Cómo funciona | Contra |
|---|---|---|
| **Extensión de Neutralino** | Neutralino arranca el proceso solo y le pasa por la entrada estándar el puerto y los tokens; el ayudante se conecta por WebSocket al servidor local que ya existe | te ata a Neutralino |
| Proceso suelto con su propio puerto | abrís un segundo puerto | hay que inventar la autenticación de cero, y un puerto más que puede estar ocupado o que el firewall pregunte |
| Entrada y salida estándar con `os.spawnProcess` | la app lo arranca y le habla por tubería | pasar datos binarios por ahí es incómodo y frágil |
| Archivo compartido | escriben y leen un archivo | lento, sucio, y escribir a disco cada 3 segundos es justo lo que no queremos |

**Recomendación: extensión de Neutralino.**

Verificado en la documentación oficial: se activa con `"enableExtensions": true` y un array
`extensions` donde cada entrada lleva un `id` y un `commandWindows`. Neutralino arranca el
proceso al iniciar y le manda por la entrada estándar un JSON con `nlPort`, `nlToken`,
`nlExtensionId` y `nlConnectToken`; el ayudante se conecta a
`ws://localhost:{puerto}?extensionId={id}&connectToken={token}`.

Es el camino de fábrica: la autenticación ya está resuelta, no hay puerto nuevo, no hay que
inventar nada. **Hoy no está configurado:** `desktop/neutralino.config.json` no tiene
`enableExtensions` ni el array `extensions`, aunque el bloque `cli` ya apunta a
`extensionsPath: "/extensions/"`. Hay que verificar además si hace falta agregar
`extensions.*` a `nativeAllowList` (hoy la lista es `app.*`, `os.*`, `window.*`,
`updater.*`, `events.*`, `filesystem.*`, `clipboard.*`, y la documentación no lo aclara).

**La condición que hace que esto no nos ate:** el protocolo tiene que ser mensajes JSON
simples con nombre y datos (`{"que":"metricas","cada":3000}` y respuestas del mismo estilo),
sin nada propio de Neutralino adentro. Si algún día el transporte cambia, se cambia una capa
fina y el ayudante queda igual.

**El detalle que hay que grabarse a fuego:** la documentación dice, con todas las letras, que
**cuando Neutralino cierra NO mata a las extensiones**. El ayudante tiene que vigilar el
WebSocket y suicidarse cuando se corta. Sin eso, cada vez que el usuario abre y cierra la
app queda un proceso colgado, y en dos semanas tiene quince ayudantes comiéndole memoria. Es
la trampa más concreta de toda esta ficha y está escrita en el manual.

### 3.3 Se distribuye junto al instalador o aparte

| Opción | A favor | En contra |
|---|---|---|
| **Adentro del instalador, siempre** | una sola cosa que instalar; el antivirus lo ve llegar de un instalador, no aparecer de la nada | suma 1 a 3 MB a la descarga |
| Descarga bajo demanda | el que no lo usa no lo baja | **una app que baja un ejecutable y lo escribe en disco es exactamente la conducta que marca cualquier antivirus** |
| Instalador aparte de "extras" | el usuario elige | dos descargas, dos versiones que se desincronizan, y nadie lo instala |

**Recomendación: adentro del instalador, siempre, pero apagado por defecto.**

Son 1 a 3 MB sobre un instalador que ya existe: en peso no se nota. Y el motivo de fondo no
es el peso sino la confianza: bajar un `.exe` por atrás y escribirlo a disco es la peor
decisión posible para la reputación del programa.

**Decisión separada, y esta sí importa: el ayudante no arranca con la app.** Arranca solo
cuando el usuario prende algo que lo necesita (el medidor visible, o la tecla para hablar).
Si nadie usa esas funciones, no hay un proceso extra corriendo, y la línea de base medida de
422 MB sigue siendo la línea de base real. Esto es coherente con lo que aprendimos en la
`1.15.1A`: no gastar en lo que nadie está mirando.

### 3.4 Cómo se actualiza el ayudante

Antes hay que entender un límite que **ya existe hoy y que nadie escribió**: el updater de
`src/updater.js` baja `resources.neu` y lo pisa. Eso actualiza **solamente la parte web de
adentro**. El ejecutable de Neutralino no se actualiza nunca solo: para cambiarlo hay que
reinstalar. O sea que la app ya tiene dos velocidades de actualización y el ayudante sería la
tercera pieza de la velocidad lenta.

| Opción | Contra |
|---|---|
| Viajar adentro de `resources.neu` | ese paquete no se puede ejecutar: habría que extraer un `.exe` a disco al arrancar, o sea la conducta prohibida del punto anterior |
| **Solo con el instalador** | quedan ayudantes viejos conviviendo con apps nuevas |
| Descarga aparte verificada por hash | vuelve a ser "bajar un ejecutable" |

**Recomendación: el ayudante se actualiza solo reinstalando, y se protege con un número de
versión del protocolo.**

Funciona así: al conectarse, el ayudante dice qué versión de protocolo habla. Si la app
necesita una más nueva, **apaga las funciones que dependen de él y muestra un aviso claro:
"para usar esto, bajá la versión nueva desde llamadita.com.ar"**. Nunca se rompe, nunca se
cuelga: se degrada.

El motivo es simple: medir el procesador no es algo que cambie todos los meses. El ayudante
va a cambiar cinco veces en dos años. Montar un sistema de auto-actualización de binarios
para eso, con todo lo que arrastra (firma, antivirus, permisos, volver atrás si falla), es
pagar carísimo por muy poco.

**Consecuencia que hay que asumir y escribir:** a partir de que exista el ayudante, cada
ficha de `CAMBIOS.md` tiene que aclarar si la versión llega sola o si pide reinstalar.

### 3.5 Reescribir el cliente entero, o no

La propuesta del otro desarrollador es rehacer el cliente en un lenguaje compilado con
interfaz nativa, apuntando a 35 a 55 MB. Hay que discutirla con los números adelante.

**Lo que ganaríamos:** pasar de 220 MB de memoria propia a 35 a 55 MB. Son unos 170 MB.

**Lo que perderíamos:**

1. **Todo lo construido.** Las doce áreas de `ESQUELETO.md` viven en JavaScript: el arranque,
   el audio, los visualizadores, la red, las cuentas, el panel social, el enlace del mail, las
   actualizaciones. Se tira entero.
2. **El cliente web y el móvil.** Hoy la app **ya corre en un navegador**: el hito de salir de
   Windows es "adaptarlo", no "escribirlo". Con interfaz nativa, ese hito pasa a ser escribir
   la app de cero por tercera vez.
3. **Meses.** Y el riesgo más grande del proyecto, escrito en el capítulo 10 de la
   investigación, no es técnico: es que nadie se mude si sus amigos no se mudan. La única
   defensa es que el grupo la use todos los días. Meses sin funciones nuevas es exactamente
   lo que nos mata.

**Y el argumento que cierra la discusión:** la primera medición dio **6,49 % de procesador** y
parecía la prueba de que el motor era el problema. Resultó ser un bucle nuestro dibujando a
60 cuadros por segundo pantallas que nadie miraba. **Cuatro líneas.** Quedó en 0,45 %. Si
hubiéramos reescrito por ese número, habríamos tirado el proyecto entero por un bug propio.

**Recomendación: no se reescribe. Se mueve a nativo solo lo pesado, que es exactamente el
plan de esta ficha.** Y se agotan primero todas las grasas nuestras, que es lo que hacen los
presets.

Puesto en plata: 170 MB de diferencia en máquinas de juego que tienen 8 o 16 GB. Nadie del
grupo objetivo lo va a notar. Contra la app pesada ya estamos 5,5 veces mejor, y eso ya está
cobrado sin escribir una línea.

#### La condición medible que cambiaría la respuesta

Que se dispare la reescritura pide **las tres condiciones juntas**, no una:

1. **Piso irreducible.** Con la app abierta, sin llamada, minimizada, y con todo lo nuestro
   apagado (visualizadores, animaciones, ningún bucle corriendo), la memoria propia sigue por
   encima de **400 MB**. O sea: lo que el motor consume aunque no hagamos nada duplica lo que
   medimos hoy.
2. **Procesador en llamada.** Con una llamada de voz de dos personas andando, el árbol de
   procesos pasa de **3 % sostenido** en una PC de referencia, sin que se pueda atribuir a
   código nuestro después de revisarlo.
3. **Persistencia.** Lo anterior sigue igual después de una actualización de WebView2 y
   después de probar las banderas de ahorro de recursos del WebView (hay que verificar cuáles
   aplican a la versión que estamos usando).

Una sola de las tres no alcanza. La 1 sin la 3 puede ser una versión mala de WebView2. La 2
sin la 1 es casi seguro código nuestro.

**El camino del medio, que es el que sí vale discutir con Juan:** que el ayudante nativo se
coma más trabajo (capturar, comprimir, medir, y quizás filtrar el ruido) y que el WebView
quede solamente dibujando la interfaz. Eso baja el pico de consumo durante la llamada, que es
el momento que de verdad importa, sin tirar nada de lo hecho. Es la misma ganancia por una
fracción del costo.

---

## 4. LO QUE SE NOS ESTÁ OLVIDANDO

### 4.1 Máquinas sin placa de video dedicada

Muchas PCs tienen gráficos integrados en el procesador. Tres consecuencias:

- El medidor tiene que decir **"gráficos integrados"** o **"sin dato"**, nunca un cero pelado
  que parezca un error o, peor, que parezca que no consume nada.
- La compresión por hardware **existe también en integrados**, por otro camino. Hay que
  verificar cuál y desde qué generación.
- Y al revés, en placas dedicadas hay un **límite de sesiones de compresión simultáneas**. En
  las generaciones de gama media más viejas ese límite es bajo, y si el usuario ya está
  grabando o transmitiendo con otro programa, puede que no quede ninguna libre. Hay que
  verificar el número exacto para la generación que tiene Martín (una 1060 de 3 GB). Si se
  acabaron las sesiones, la app tiene que bajar la resolución, no comprimir por software: eso
  último es justo lo que le funde el procesador a la gente.

### 4.2 Antivirus (este es el riesgo número uno del área)

Hay que decirlo sin vueltas: **un ejecutable chico, sin firma, que arranca solo, lee procesos
del sistema y engancha el teclado incluso cuando su ventana no está adelante, es literalmente
la descripción de un programa espía.** No es culpa del antivirus sospechar.

Lo que baja el riesgo, en orden de importancia:

1. **Que venga en el instalador, nunca descargado por atrás.** Ya decidido en 3.3.
2. **Que use la forma documentada de registrar un atajo, no la forma que ve todo.** Windows
   tiene dos caminos. Uno registra **una combinación específica** y solo te avisa de esa. El
   otro pone un gancho que **ve todas las teclas que apretás en toda la máquina**. El primero
   es defendible ante un antivirus y ante el usuario; el segundo no, y encima es más lento.
   El problema: el camino limpio avisa bien cuando apretás pero no tanto cuando soltás, y para
   hablar apretando una tecla necesitás las dos cosas. **Hay que verificar** si alcanza con el
   camino limpio o si hay que usar el intermedio (la interfaz de entrada cruda, que es la que
   usan los juegos y no es un gancho). Mi apuesta es que el intermedio es el correcto, pero es
   verificación, no certeza.
3. **Que no escriba ejecutables nunca.**
4. **Que se llame por su nombre.** `Llama-dita-ayudante.exe`, con la descripción del programa
   y el publicador escritos adentro del binario. No `helper.exe`, no `svc.exe`.
5. **Probar con al menos dos antivirus distintos** antes de publicar, no solo el de Windows.

### 4.3 Permisos de Windows

Hoy `installer.iss` dice `PrivilegesRequired=lowest` e instala en la carpeta local del
usuario. **Eso está bien y se mantiene: nada de esta área pide administrador, nunca.**

Dos consecuencias que hay que aceptar de frente:

- Solo podemos medir **nuestros propios procesos**. No el sistema entero ni los de otros
  usuarios. Para nuestro medidor alcanza y sobra.
- **Los atajos globales no funcionan sobre ventanas que corren con más privilegios que
  nosotros.** Si un juego con protección anti-trampas corre como administrador, mientras esa
  ventana esté adelante el atajo no llega. Eso hay que **decirlo en la interfaz** cuando pasa
  ("no pude tomar la tecla mientras ese programa está adelante"), no dejar que el usuario
  descubra solo que a veces no lo escuchan. Hay que verificar cuáles de los juegos que juega
  el grupo caen en ese caso.

### 4.4 El puerto fijo y las dos copias

`desktop/neutralino.config.json` fija `"port": 24024`. La app **no se defiende** de una
segunda copia: se abre y se muere fea. Por eso `abrir-enlace.cmd` tiene que preguntarle a
Windows si el proceso ya existe.

Con el ayudante el problema empeora: si llegaran a arrancar dos copias, **dos ayudantes pelean
por el mismo atajo global** y el segundo simplemente falla, sin que nadie se entere.

Qué hay que hacer, y antes del ayudante: **una sola copia de verdad**. Al arrancar, tomar una
marca global de Windows con el nombre de la app; si ya está tomada, traer al frente la ventana
que ya existe, pasarle el enlace si venía uno, y salir en silencio. Así también se simplifica
el `.cmd` del enlace del mail.

Y algo que hoy no sabemos: **qué pasa si el puerto 24024 ya está ocupado por otro programa.**
Probablemente la app no abra y el usuario no tenga la menor idea de por qué. Hay que verificar
y, si es así, dar un mensaje que se entienda.

### 4.5 Si el ayudante se cae

Reglas, en orden:

1. **La app nunca lo espera.** Ni para arrancar, ni para entrar en una llamada. Si tarda, se
   sigue sin él.
2. **Se degrada, no se rompe.** El medidor se apaga solo con un aviso discreto. La tecla para
   hablar pasa a funcionar solo con la ventana adelante. La llamada **no se corta jamás** por
   culpa del ayudante.
3. **Reintento con paciencia creciente**: 1 segundo, 2, 4, 8, hasta 30, y con tope. Nada de
   reintentar en bucle: eso es una bomba de procesos.
4. **Y al revés, el ayudante se suicida** cuando se le corta la conexión. Esto no es opcional
   ni es una precaución: la documentación de Neutralino dice explícitamente que al cerrar no
   les manda la señal de terminar a las extensiones.

### 4.6 Arranque con Windows

Recomendación: **apagado por defecto**, y cuando se prende, que arranque **directo a la
bandeja, sin ventana y sin ayudante**.

Se hace con una entrada en el registro del usuario, que no pide administrador. Es más limpia
de sacar que un acceso directo en la carpeta de inicio, y el desinstalador la puede borrar
solo. Cuidado: si no se borra, queda una entrada muerta que le tira un error al usuario en
cada arranque de Windows.

Lo importante no es técnico: **arrancar solo con Windows y quedarse pesando es una de las
razones por las que la gente odia a la app grande.** Si arrancamos, tenemos que arrancar
consumiendo lo mínimo, y eso hay que medirlo aparte como un escenario propio: "arrancada en
bandeja, sin sesión iniciada".

### 4.7 El aviso de Windows al instalar

**Estado hoy:** el instalador no está firmado. Windows muestra la pantalla azul de "Windows
protegió tu PC" y hay que tocar "Más información" y después "Ejecutar de todas formas". Dos
clicks que asustan.

**El dato que cambia la cuenta:** según la información pública, **desde marzo de 2024 el
certificado caro ya no limpia el aviso al instante**. Ahora tanto el barato como el caro
tienen que **construir reputación con el tiempo y con volumen de descargas**. Y desde el
15/02/2026 los certificados duran como máximo un año, así que el gasto es anual sí o sí.

Precios de referencia (páginas de reventa, **hay que verificar con una cotización real**):
el barato arranca alrededor de **USD 130 a 230 por año** y el caro alrededor de **USD 280 a
500 por año**.

**Conclusión honesta: con 20 a 50 usuarios que bajan el instalador una vez, no vas a juntar
reputación nunca.** Pagar el certificado hoy no te saca el cartel: te saca el nombre "Editor
desconocido" y deja el resto igual.

**Recomendación: no firmar todavía.** En su lugar, dos cosas que cuestan cero:

1. Una página en el sitio que muestre **con capturas** los dos clicks exactos, explicando por
   qué aparece. Convertir el susto en un paso esperado.
2. Publicar el **hash SHA-256 del instalador** al lado del botón de descarga, para que quien
   quiera pueda verificar que bajó lo que publicamos.

**Cuándo se revisa la decisión:** cuando haya más de 500 instalaciones, o cuando alguien del
grupo diga que no instaló por culpa del cartel. Ahí los USD 130 a 500 por año empiezan a
comprar algo.

### 4.8 Lo que apareció leyendo el código y no estaba anotado en ningún lado

Todo esto es "hay que verificar", pero es concreto:

- **El enlace del mail puede no funcionar en una instalación nueva.** `installer.iss` registra
  `llamadita://` apuntando a `{app}\abrir-enlace.cmd`, pero ese archivo **no está en la lista
  de archivos que instala**: lo escribe la app la primera vez que se abre
  (`src/social/deeplink.js`). Si alguien instala y toca el enlace del mail **antes** de abrir
  la app una vez, el esquema apunta a un archivo que no existe. Es del área del enlace del
  mail, pero se arregla en la mía: agregándolo al instalador.
- **El desinstalador no limpia lo que se generó después.** La carpeta `.tmp`, el `.cmd`
  generado y el `resources.neu` que pisó el updater no están en la lista original, así que
  quedan en el disco.
- **Puede no haber WebView2.** Viene de fábrica en Windows 11 y en Windows 10 al día, pero no
  siempre. Hoy, si falta, la app no abre y listo. El instalador tendría que detectarlo y
  ofrecer el instalador chiquito de Microsoft. Hay que verificar en qué versiones falta de
  verdad hoy.
- **El updater no verifica lo que baja.** `src/updater.js` acepta el paquete si pesa más de
  10.000 bytes. Nada más. Poner el hash en el manifiesto y compararlo cuesta diez líneas.
- **El updater no sabe volver atrás.** Si una versión rompe la app al abrir, el usuario queda
  con un programa que no abre y que ni siquiera puede actualizarse para salir del pozo.
  Guardar el paquete anterior como copia y tener forma de restaurarlo.
- **La ventanita siempre encima no se ve sobre juegos en pantalla completa exclusiva.** Solo
  funciona si el juego corre en ventana sin bordes. Hay que decirlo en la interfaz, no dejar
  que lo descubran.
- **El timbre de llamada con la app en la bandeja.** Si el WebView duerme el proceso por estar
  oculto, no suena y te perdés la llamada. Hay que verificar.
- **Varios monitores y escalado.** La ventanita chica con escalado al 125 % o 150 % y dos
  pantallas de resoluciones distintas. Hay que verificar cómo se porta.
- **Programa y datos mezclados.** Hoy todo vive en la carpeta local del usuario y la app
  escribe ahí mismo. Está bien mientras se instale por usuario. Si alguna vez se instala para
  toda la máquina, deja de funcionar.

---

## 5. CÓMO SE CONECTA CON LOS PRESETS

| | **PC tostadora** | **PC estándar** | **Llamadita** | **Soy cheto** |
|---|---|---|---|---|
| Ayudante corriendo | sí (el medidor está visible) | solo si se usa la tecla para hablar | solo si se usa la tecla para hablar | sí |
| Cada cuánto refresca las métricas | 5 s | 3 s, y solo si está a la vista | 3 s, y solo si está a la vista | 2 s |
| Qué mide | procesador y memoria nuestros | lo mismo | lo mismo | todo, con placa de video y compresor |
| Compresión de pantalla | H.264 por hardware, obligatorio | H.264 por hardware | H.264 por hardware | puede usar los codecs nuevos aunque cuesten procesador |
| Si no hay compresión por hardware | baja resolución, nunca comprime por software | baja resolución | avisa y baja resolución | puede comprimir por software |
| Ventanita siempre encima | sin visualizadores, solo nombres y quién habla | con indicador simple | completa | completa |
| Arranque con Windows | sugerido apagado | a gusto | a gusto | a gusto |

**El techo duro me simplifica la vida:** el roadmap fija máximo 1080p, cámara hasta 30
cuadros y pantalla hasta 60, por encima de cualquier preset. O sea que el ayudante **nunca**
tiene que comprimir por arriba de 1080p60. Eso entra cómodo en el compresor por hardware de
cualquier placa de los últimos diez años, y saca de la mesa el caso más caro de todos.

**Lo que NO cambia con el preset:** los atajos globales y el ícono en la bandeja. Cuestan casi
nada y son comodidad, no consumo. Apagarlos en tostadora sería castigar al que menos tiene sin
ganar nada.

**La paradoja que hay que mirar de frente:** en la tabla del roadmap, el medidor está
**visible** justamente en "PC tostadora". O sea que **el perfil de la máquina más débil es el
único que enciende un proceso extra sí o sí.** Tiene sentido (el que tiene la máquina justa es
el que quiere ver el número), pero obliga a algo: el ayudante tiene que estar pensado para el
caso tostadora, no para el caso cheto. Refresco cada 5 segundos, solo procesador y memoria,
sin tocar la placa de video.

**Y al revés, mi área es la que le da de comer al preset.** La primera vez que se abre, el
ayudante puede mirar cuántos núcleos tiene el procesador, cuánta memoria hay y si existe placa
dedicada, y **sugerir** un perfil. Sugerir, con un cartel que se pueda ignorar. Nunca imponer:
el usuario sabe mejor que nosotros si además está jugando algo pesado.

---

## 6. CÓMO SE PRUEBA

Las condiciones son siempre las mismas o los números no se pueden comparar: **misma PC, misma
versión de Windows, app abierta cinco minutos antes de anotar, y siempre el árbol de procesos
completo, no un proceso suelto.**

### Prueba A. Lo que cuesta el ayudante

Es la prueba que responde "el medidor no será un chiste".

1. App abierta, sin llamada, **sin ayudante**: anotar memoria de trabajo, memoria propia y
   procesador. (Referencia de hoy: 422 MB, 220 MB, 0,45 %.)
2. Exactamente la misma escena, **con el ayudante corriendo y refrescando cada 3 segundos**:
   anotar de nuevo.
3. Lo mismo con el ayudante consultando también la placa de video, que es la consulta cara.

**Aprueba si el ayudante suma menos de 15 MB de memoria de trabajo y menos de 0,3 % de
procesador**, promediado sobre cinco minutos. Si no llega, está mal hecho: se arregla o se
apaga esa función. No se publica "más o menos".

### Prueba B. Lo que ahorra

El ahorro del ayudante no es directo. El ayudante no ahorra: **muestra el número que hace que
el usuario baje el preset**, y eso es lo que ahorra. Entonces se mide así:

1. Misma llamada con pantalla compartida, primero en perfil "Llamadita" y después en
   "tostadora". Anotar procesador y subida en los dos.
2. **Aprueba si la diferencia entre los dos perfiles es por lo menos diez veces más grande que
   lo que cuesta el ayudante** (prueba A). Si bajar de perfil te ahorra 8 % de procesador y el
   ayudante te cuesta 0,3 %, se paga solo veintisiete veces.

Para los atajos globales el criterio es otro, porque no es consumo sino comodidad: **desde que
se aprieta la tecla hasta que el otro empieza a escuchar tiene que pasar menos de 100
milisegundos.** Cómo medirlo sin equipo de laboratorio: grabar las dos pantallas a 60 cuadros
por segundo con el programa de captura que ya usa Martín y contar cuadros. Hay que verificar si
ese método da la precisión suficiente.

### Prueba C. Que no rompa nada

Obligatorias, y van **antes** que cualquier función:

1. **Abrir y cerrar la app veinte veces seguidas.** Al final, cero ayudantes en el
   Administrador de tareas. Esta es la prueba de la trampa documentada del punto 3.2.
2. **Matar el ayudante a mano en medio de una llamada.** La llamada no se corta. El medidor se
   apaga con un aviso discreto. La tecla para hablar sigue funcionando con la ventana adelante.
3. **Intentar abrir una segunda copia.** Se trae al frente la que ya está. No aparece una
   ventana muerta.
4. **Instalar en una cuenta de Windows limpia y tocar el enlace del mail SIN abrir la app
   primero.** Es la verificación del punto 4.8.
5. **Instalar con un antivirus distinto al de la PC de Martín** y anotar si marca algo, qué
   marca y en qué momento.
6. **Desinstalar y revisar que no quede nada:** ni carpeta, ni entrada de arranque automático,
   ni el esquema `llamadita://` colgado.

### Prueba D. Que no empeore con el tiempo

Cada versión que toque el escritorio repite la medición de la línea de base y **el número va a
`CAMBIOS.md`**. Ya hay precedente: la `1.15.1A` dejó los tres números escritos y por eso hoy se
puede discutir con datos en vez de con opiniones.

**Si un número empeora más de un 10 % y nadie sabe por qué, no se publica.**

---

## 7. LO QUE NO VA ACÁ

- **La capa pegada adentro del juego.** Decidido, cerrado y escrito en el roadmap: es
  exactamente lo que le tira los cuadros por segundo a la app pesada. No se vuelve a discutir.
- **Elegir resolución, cuadros por segundo o codec.** Eso lo deciden el área de pantalla y
  cámara junto con los presets. Yo digo qué puede la máquina; ellos eligen.
- **Dibujar el medidor.** Yo entrego números crudos. El recuadro, los colores y los umbrales
  son de la otra área.
- **Los números de la llamada** (bitrate, cuadros, paquetes perdidos, jitter, latencia, si va
  directo o por relé). Salen de la propia llamada y no necesitan nada nativo. Que no se cuelen
  acá por comodidad.
- **La supresión de ruido.** Va adentro de la app, compilada a WebAssembly, como ya está
  verificado en el capítulo 9. Solo se mueve al ayudante si algún día se mide que ahí no
  alcanza.
- **El repartidor de grupo, la señalización, WebRTC y Supabase.** Otra área, y la mitad ya está
  hecha.
- **Mac, Linux, móvil y navegador.** El ayudante es de Windows y punto. Salir de Windows es el
  último hito del roadmap a propósito.
- **Cualquier cosa que se meta adentro de un juego**: inyectar código, engancharse al gráfico,
  leer memoria de otro proceso. Nunca, por ningún motivo, ni aunque sea más fácil.
- **El audio posicional.** Es del área de audio, aunque después necesite datos de afuera.
- **Cambiar el motor del cliente.** No es decisión de esta área sola: es del proyecto entero.
  Lo que sí es de esta área es tener la condición medible escrita, y está en el punto 3.5.
- **Empaquetar un navegador propio adentro de la app.** Regla 2c del roadmap. No se discute.
