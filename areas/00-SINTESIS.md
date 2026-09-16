# Síntesis de las seis áreas

Seis agentes pensaron en paralelo, cada uno con su área y sus fronteras definidas de
antemano. Este documento es la reconciliación: **dónde se contradicen, dónde coincidieron sin
hablarse, qué quedó decidido y qué queda para que decidan Martín o Juan.**

Las fichas completas están al lado, una por área. Esto es lo que hay que leer primero.

---

## 1. La contradicción real: ¿una conexión o dos?

Es la única pelea de fondo entre áreas, y hay que resolverla **antes** de escribir la primera
línea de video.

**Pantalla y cámara dice: dos conexiones separadas.** La voz es sagrada y el video es
sacrificable. Si compartir pantalla te corta la conversación, la app perdió. Con dos caminos
independientes, una pantalla que satura no se lleva puesta la charla.

**Voz dice: una sola.** El video mete sus pistas por la conexión que ya existe y nunca abre la
suya. Una sola negociación, un solo camino que abrir a través del router, la mitad de consumo
cuando hay que pasar por un relevo, y un solo lugar donde puede fallar.

**Lo que hay que saber para decidir:** en una sola conexión, la voz igual tiene prioridad sobre
el video, así que el escenario que le preocupa a pantalla está parcialmente cubierto de fábrica.
Pero cuando lo que se satura es tu conexión de subida, se satura para todo, tengas uno o dos
caminos. **Hay que verificarlo midiendo**, no discutiéndolo: una prueba de compartir pantalla
mientras se habla, con la subida limitada a propósito, contesta la pregunta en una tarde.

---

## 2. La convergencia: los presets están incompletos, y de la mitad que falta

**Tres áreas, sin hablarse, encontraron el mismo agujero.** Los presets describen **lo que yo
mando**. No dicen nada de **lo que estoy dispuesto a recibir**. Y lo que te funde la máquina es
lo que recibís.

- **Pantalla:** el codec lo elige el que transmite y lo sufre el que mira. Una placa GTX 1060
  no descomprime AV1: si alguien con una placa nueva transmite en ese formato porque tiene el
  perfil en "Soy cheto", el que se funde es el otro, que ni eligió.
- **Consumo:** si el otro manda a la máxima calidad, el que paga la descompresión es mi
  tostadora. Cada ajuste tiene que declarar si es de entrada o de salida, **ahora**, aunque
  todavía no exista ninguno de entrada.
- **Chat:** propone una distinción más fina y que conviene adoptar en todo el proyecto:
  separar los ajustes que gastan **tu máquina** (ahí manda tu preset, y "cheto" sube lo que
  quiera) de los que gastan el **cupo común del mes** (ahí los cuatro perfiles valen igual,
  porque no estás gastando lo tuyo sino el mes de todos).

**Conclusión:** la tabla de presets del roadmap se queda corta. Necesita tres columnas
conceptuales, no una: lo que mando, lo que acepto recibir, y lo que gasta del cupo común.

---

## 3. El orden del roadmap está mal en tres lugares

Tres áreas, por separado, dijeron que el orden obvio es el equivocado. Las tres correcciones
dicen lo mismo: **el cimiento va antes que la función.**

| Área | El roadmap dice | Va al revés | Por qué |
|---|---|---|---|
| Consumo | primero el medidor, después los presets | primero dónde se guarda la configuración | si no, cuando llegue "medidor visible en tostadora" hay dos fuentes peleando por lo mismo |
| Espacios y roles | permisos en el hito 7 | permisos **antes** del canal de voz con varios | una sala de ocho sin "quién puede hablar" y "quién puede desconectar" no es usable |
| Chat | primero las funciones del chat | primero la caché local y el borrado | cada función nueva multiplica una factura que todavía no sabemos leer |

---

## 4. Bugs vivos, verificados en el código de hoy

No son hipótesis: los confirmé uno por uno leyendo el repositorio y la base.

| Qué | Dónde | Gravedad |
|---|---|---|
| Si el dueño de un canal borra su cuenta, **se borra el canal con los mensajes de todos**. Si cualquiera borra la suya, desaparecen todos sus mensajes de todos lados | migración 001, borrado en cascada | **alta**: pérdida de datos ajenos |
| La migración da permiso de leer y escribir **sobre todas las tablas** a cualquiera con cuenta. Hoy está tapado por las políticas de cada tabla; la próxima tabla sin políticas queda abierta | migración 001, línea final | **alta**: con seis tablas por delante, va a pasar |
| Los códigos de invitación no vencen, no tienen tope de usos y no se pueden dar de baja. La función que los canjea entra saltándose las políticas | migración 001 | media |
| El actualizador acepta cualquier descarga de más de 10 KB como válida, sin verificar que sea lo que decía el manifiesto. Y no sabe volver atrás si una versión sale rota | `src/updater.js` | media |
| El instalador registra el esquema del enlace apuntando a un archivo que **no instala**: lo escribe la app al primer arranque. En una máquina nueva, el enlace del mail puede no hacer nada | `installer.iss` | media |
| El motor de audio corre unas 47 veces por segundo en el hilo principal **aunque estés silenciado, con los visualizadores apagados y la ventana minimizada** | `src/audio/audioManager.js` | media: es el piso de consumo que parecía irreducible |
| Al fallar la conexión se pide un reinicio de red y acto seguido se crea una conexión nueva que lo tira a la basura | `src/network/peerManager.js` | baja: funciona igual, pero no hace lo que dice |

---

## 5. Decisiones que quedaron cerradas

Para no volver a discutirlas:

- **No se reescribe el cliente.** Se gana memoria y se tiran doce áreas, el cliente web y el
  móvil. Además, el 6,49 % de procesador que parecía culpa del motor eran cuatro líneas
  nuestras. La reescritura se dispara solo si se cumplen **las tres juntas**: memoria propia
  por encima de 400 MB con todo lo nuestro apagado, más de 3 % de procesador sostenido en
  llamada que no sea código nuestro, y que siga pasando después de actualizar el motor.
- **No se paga la firma del instalador.** Desde 2024 el certificado caro ya no limpia el aviso
  al instante: la confianza se gana por volumen de descargas, y con 20 a 50 usuarios no se
  junta nunca. En su lugar, una página que explique los dos clicks y publicar la huella del
  archivo. Se revisa a las 500 instalaciones. **Con esto, el proyecto no tiene ningún gasto
  obligatorio.**
- **Repartidor: el servicio de Cloudflare primero**, y LiveKit el día de mudarse a la máquina
  gratis. mediasoup queda afuera: hay que escribirle el servidor de salas, y la regla es que se
  instala, no se programa.
- **Hace falta una función chica de servidor que reparta pases de entrada al repartidor.** Es
  donde se hace cumplir quién puede entrar, es la costura que permite mudar de proveedor sin
  tocar la app, y saca del código los servidores de relevo que hoy están clavados a mano.
- **El ayudante nativo va en Rust, como extensión, viaja dentro del instalador y no arranca
  solo:** se enciende cuando se prende el medidor o la tecla para hablar. Ojo con la trampa
  documentada: al cerrar la app las extensiones **no se mueren solas**.
- **Borrado duro, no marca de borrado**, con una tabla de lápidas para que el que estuvo
  desconectado se entere. Cuatro capas con promesas distintas, y de lo que el otro ya hizo con
  el mensaje (una captura) no se promete nada.
- **Las imágenes se reencodan antes de subir.** De 2 a 5 MB pasan a 200 a 400 KB. Convierte
  "el cupo se llena en 3 meses" en "se llena en dos años", gratis, en la máquina del que sube.

---

## 6. Lo que queda para decidir

1. **Una conexión o dos** (punto 1). Se contesta midiendo.
2. **Un solo espacio o varios.** La tabla se arma preparada para varios igual, porque agregarlo
   después es una migración sobre datos vivos. Lo que se decide es si la pantalla los muestra.
3. **Cómo funcionan las invitaciones:** vencimiento, tope de usos, y poder darlas de baja.
4. **Si le proponemos a Juan el camino del medio:** que el ayudante nativo se coma capturar,
   comprimir y medir, y el navegador quede solo dibujando. Se gana lo mismo donde importa,
   durante la llamada, sin tirar nada.

---

## 7. Lo que hay que medir antes de seguir

Cuatro mediciones, ninguna cuesta plata, y todas destraban decisiones:

1. **El consumo con una llamada andando.** Los 0,45 % conocidos son con la app abierta sin
   hacer nada. Nadie midió en llamada.
2. **Con qué bitrate y qué codec sale la voz hoy.** Lo elige el navegador solo, y de eso depende
   el número que va en la fila "Llamadita" de la tabla de presets.
3. **Cuánto cuesta el motor de audio** que corre 47 veces por segundo aunque esté todo apagado.
4. **Si el plan gratis de la base hace copias de respaldo.** Cambia qué se puede prometer
   honestamente en la pantalla de borrado.
