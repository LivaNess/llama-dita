# Área: espacios, canales, roles y permisos

**Qué es esto:** la ficha de diseño de la estructura social de Llama-dita. Quién existe,
quién es amigo de quién, qué canales hay, quién puede entrar, quién puede hablar y quién
puede echar a alguien. No es código: es lo que hay que decidir **antes** de escribir código.

**Fecha:** 16 de septiembre de 2026. **Versión de la app al escribirlo:** 1.3.1A en `main`.
**Base leída:** `supabase/migrations/20260915_001_cuentas_amigos_canales.sql`,
`20260915_002_presencia_sin_escrituras.sql`, `src/social/api.js`, `panel.js`, `auth.js`.

**Escala que manda todo lo de abajo:** techo 100 a 200 personas registradas, uso real de 20 a
50, pico de 40 conectadas. Cada vez que abajo diga "esto lo simplificamos", es por esto.

---

## 1. FRONTERAS

### Lo que ES de esta área

| Cosa | Por qué es nuestra |
|---|---|
| Cuentas y perfil (`profiles`) | es la identidad sobre la que se cuelga todo permiso |
| Amistades (`friendships`) | es el primer permiso que existe: "este me puede llamar" |
| Espacios (no existen todavía) | el contenedor que agrupa canales y dice quién pertenece |
| Canales: crear, renombrar, borrar, de texto o de voz | el objeto sobre el que se aplican los permisos |
| Membresía (`channel_members` y lo que venga) | quién está adentro de qué |
| Roles y su máscara de permisos | el mecanismo entero |
| Excepciones de permiso por canal | lo mismo, a nivel fino |
| Invitaciones: crear, vencer, contar usos, revocar | es la puerta de entrada |
| Moderación: expulsar, silenciar, banear | son permisos aplicados |
| Las políticas RLS de todas esas tablas | **acá está la seguridad de verdad** |
| Presencia: quién está conectado y dónde | es una lista de personas, y es cara |

### Lo que NO es de esta área, y dónde está el corte exacto

**Con el chat.** El corte es limpio: **el contenido de los mensajes es de ellos, el derecho a
escribir es nuestro.**

- Nuestro: quién puede ver el canal, quién puede escribir, quién puede borrar mensajes
  ajenos, quién puede adjuntar archivos, quién puede mencionar a todos.
- De ellos: cómo se ve el mensaje, formato, respuestas, reacciones, editar, adjuntos,
  historial local, buscador, retención.
- El punto de contacto es **una sola función**: la política de `INSERT` en `messages` y la de
  `SELECT` preguntan "¿tiene permiso?". El área de chat no escribe esa función, la llama.
  Si mañana el chat agrega hilos o reacciones, esas tablas nuevas también llaman a la misma
  función y no inventan la suya.

**Con la voz.** El corte es igual de limpio: **quién entra al canal de voz es nuestro, cómo
suena adentro es de ellos.**

- Nuestro: quién puede entrar, quién puede hablar (contra solo escuchar), quién puede
  compartir pantalla al canal, quién puede silenciar o desconectar a otro, quién es hablante
  prioritario.
- De ellos: codec, bitrate, mono o estéreo, supresión de ruido, cancelación de eco, el
  repartidor, los presets de calidad, la conexión directa contra el repartidor.
- **Acá hay una trampa que no está en el chat y hay que decirla fuerte:** la voz no pasa por
  la base de datos. Una vez que dos máquinas se conectaron directo, la base no las puede
  separar. Entonces el permiso de voz **no se puede hacer cumplir con RLS sola**. Se hace
  cumplir en dos lugares: (a) el `room_code` del canal no se puede leer sin permiso, que es
  RLS común, y (b) cuando exista el repartidor, la credencial para entrar la emite un
  servidor nuestro (una función de Cloudflare o de Supabase) que chequea el permiso antes de
  firmarla, y dura poco. Ver la decisión D3 y el caso borde 4.5.

**Con las cuentas.** El corte: **quién sos es de nosotros, cómo probás que sos vos es de
afuera.**

- Nuestro: el perfil, el nombre de usuario, el estado, qué pasa cuando alguien se borra la
  cuenta (que es un problema serio, ver 4.1 y 4.6).
- No nuestro: el envío del mail, el código de un solo uso, la sesión, el enlace que abre la
  app, el proveedor de mail. Eso ya funciona y vive en `auth.js` y `deeplink.js`.
- **Y una decisión de frontera que ya está tomada por el roadmap:** no hay verificación de
  identidad con documento ni con cara. Eso limita lo que podemos prometer sobre baneos, y
  está asumido (ver 4.3).

**Con los presets y el medidor.** Casi nada. Ver sección 5.

---

## 2. EL CAMINO

El orden importa y no es el obvio. La intuición dice "primero espacios, después permisos,
después moderación". Está mal por una razón concreta: **el hito 4 trae canales de voz con
varias personas, y un canal de voz de 8 sin permisos no se puede usar.** Con dos personas no
hace falta ningún permiso: si molesta, cortás. Con ocho, el que pone el micrófono contra el
parlante arruina la sala y no hay forma de sacarlo. Por eso "quién puede hablar" y "quién
puede desconectar a otro" van **antes** de que el canal de voz múltiple esté terminado, no
después.

### Paso 0 (ya está, no se toca): lo que funciona hoy

Cuenta sin contraseña, perfil, amigos con presencia, canales sueltos de texto y de voz con
código de invitación, dueño y miembro. Todo con RLS. Esto anda y es la base.

### Paso 1: emprolijar lo que ya hay, sin agregar nada

*Es el paso más aburrido y el más importante: son agujeros que ya están abiertos.*

1. **Sacar el `on delete cascade` que borra historia ajena.** Hoy, si el dueño de un canal se
   borra la cuenta, se borra el canal entero con los mensajes de todos. Y si cualquiera se
   borra la cuenta, se borran todos sus mensajes en todos lados. Ver 4.1 y 4.6.
2. **Filtrar las suscripciones en vivo.** Hoy el panel escucha *todos* los cambios de
   `friendships` y de `channel_members` sin filtro. Ver 4.10 y D4.
3. **Separar la invitación del canal.** Hoy el código de invitación es una columna fija del
   canal, sin vencimiento, sin tope de usos y sin forma de revocarlo. Ver 4.4.
4. **Escribir la prueba de que RLS no se puede saltear** (sección 6), antes de que haya más
   reglas que probar.

*Queda andando:* exactamente lo mismo que hoy, pero sin que borrar una cuenta destruya un
canal y sin gastar mensajes de Realtime al pedo.

### Paso 2: el motor de permisos, con roles fijos y sin interfaz

*Acá se construye el mecanismo entero pero todavía no se ve casi nada.*

1. Tablas `space` (uno solo por ahora), `space_member`, `role`, `member_role`,
   `channel_permission_overwrite`.
2. La máscara de bits y la lista de permisos cerrada (D2).
3. **La función `tiene_permiso(usuario, canal, bit)`** y todas las políticas RLS existentes
   reescritas para llamarla: las de `messages`, `channels` y `channel_members`.
4. Dos roles creados solos en cada espacio: `@todos` (el rol base, rango 0) y `admin`.
5. El disparador anti-escalación: nadie puede darse un permiso que no tiene, ni tocar un rol
   de rango igual o mayor al suyo.

*Queda andando:* todo igual que antes para el usuario, pero por debajo ya no manda
`owner_id`, manda el permiso. Es un cambio invisible y es el corazón del área.

### Paso 3: canales de voz con permisos, junto con el hito 4

1. Permisos de voz: entrar, hablar, compartir al canal, mover o desconectar, silenciar a otro.
2. El `room_code` deja de leerse de la tabla y pasa a entregarse por una función que chequea
   el permiso.
3. El repartidor, cuando llegue, pide credencial a esa misma función.

*Queda andando:* una sala de 8 donde alguien puede callar al que tiene el micrófono abierto.
Sin esto, la sala de 8 del hito 4 no es usable.

### Paso 4: invitaciones de verdad

Tabla de invitaciones con código largo, vencimiento, tope de usos, contador atómico,
revocación y registro de quién invitó a quién. Más el permiso de crear invitaciones.

*Queda andando:* se puede abrir el grupo a gente nueva sin que el código quede dando vueltas
para siempre.

### Paso 5: espacios visibles y roles editables

Recién acá aparece la idea de "espacio" en la pantalla, la lista de canales agrupada, la
pantalla de roles y la asignación de roles a personas. El mecanismo ya estaba desde el paso 2;
esto es ponerle cara.

*Queda andando:* un grupo que se administra solo, sin que Martín toque SQL.

### Paso 6: moderación

Expulsar, silenciar por tiempo y banear, con registro de quién lo hizo y por qué. Va al final
porque **es el único paso que no se puede hacer bien sin los anteriores**: expulsar sin
invitaciones revocables no sirve de nada, y banear sin roles no se sabe quién puede hacerlo.

---

## 3. DECISIONES QUE HAY QUE TOMAR ANTES DE ESCRIBIR CÓDIGO

### D1. ¿Un solo espacio o varios? A 50 personas, ¿hace falta la idea de "servidor"?

**Qué está en juego.** Hoy los canales son sueltos: cada uno cuelga de su dueño y se entra con
un código por canal. La competencia grande agrupa los canales en "servidores". La pregunta es
si a 50 personas ese contenedor sirve para algo o es burocracia.

**Opciones.**

- **A. Sin espacios, canales sueltos (lo de hoy).** Simple. Pero los permisos no tienen dónde
  vivir: un rol de "moderador" tendría que darse canal por canal, y con 12 canales eso son 12
  lugares donde equivocarse. Y la lista de canales se vuelve una bolsa sin orden.
- **B. Un espacio, siempre, pero invisible.** La tabla `space` existe desde el día uno, todo
  canal tiene `space_id`, pero la pantalla no muestra ningún selector: entrás y ves los
  canales.
- **C. Multi-espacio completo y visible desde el arranque.** Como la competencia.

**Recomendación: B, con la tabla armada para C.**

**Motivo.** Hay que separar dos cosas que se confunden: *tener la columna* y *mostrar la
pantalla*. Agregar `space_id` más adelante es una migración sobre datos vivos que además
obliga a reescribir todas las políticas RLS, que es justo lo que no querés tocar dos veces.
Agregar la pantalla del selector más adelante es media tarde de trabajo. Entonces: la
estructura de datos se hace bien desde el principio, la interfaz aparece cuando haga falta.

Y sí hace falta el contenedor, aun a 50 personas, por una razón que no tiene nada que ver con
la escala: **los permisos necesitan un lugar donde vivir que no sea el canal.** "Juan es
moderador" es una frase sobre el grupo, no sobre el canal `#general`. Sin espacio, esa frase
no se puede escribir en ningún lado.

**Qué simplificamos por ser pocos:**
- Sin carpetas ni categorías de canales adentro del espacio. Con 12 canales la lista entra en
  la pantalla. Esto además nos ahorra el nivel intermedio de herencia de permisos, que es la
  parte más enredada del modelo de la competencia: ellos resuelven espacio, después categoría,
  después canal; nosotros espacio y canal, y listo.
- Sin descubrimiento público, sin directorio, sin plantillas de espacio, sin niveles ni
  mejoras pagas del espacio, sin pantalla de bienvenida con aceptación de reglas.
- Sin límite de espacios por persona ni de canales por espacio, más allá de un tope duro por
  higiene (digamos 100 canales) para que nadie haga un bucle que cree mil.

**Qué hay que verificar:** si alguien va a estar en más de dos espacios en la práctica. Si la
respuesta es no, el selector de la opción C puede no construirse nunca y no pasa nada.

---

### D2. ¿Máscara de bits o tabla de permisos?

**Qué está en juego, en criollo.** Hay dos formas de guardar "qué puede hacer este rol".

- **Máscara de bits:** un solo número grande por rol. Cada permiso es una posición de ese
  número: prendido es sí, apagado es no. Preguntar "¿puede escribir?" es una cuenta
  aritmética, instantánea.
- **Tabla de permisos:** una fila por cada permiso que tiene el rol. Preguntar "¿puede
  escribir?" es ir a buscar una fila.

**Opciones.**

- **A. Máscara de bits en un `bigint`, con excepciones por canal.** Es lo que hace la
  competencia y lo tiene documentado público.
- **B. Tabla `permiso(rol, nombre, permitido)`, una fila por permiso.** Se lee más fácil en
  la base y se pueden agregar permisos sin tocar el código.
- **C. Sin permisos finos: tres roles fijos (dueño, moderador, miembro) cableados.**

**Recomendación: A, pero con 16 permisos definidos, no 64.**

**Motivo.** El motivo real no es el ahorro de espacio: con 50 personas no ahorrás nada. Es
**dónde se paga el chequeo.** Nuestro chequeo no corre una vez por pantalla: corre adentro de
las políticas RLS, y RLS se evalúa **fila por fila**. Si el chequeo es una cuenta sobre un
número que ya está en memoria, es gratis. Si es un cruce contra una tabla de permisos, lo
pagás por cada mensaje que se lee. Con 500 mensajes en pantalla, eso es la diferencia entre
que abra al toque o que se note.

La opción C se descarta porque la vida real la rompe rápido: "que este pueda invitar pero no
echar", "que en el canal de anuncios solo escriban los admins". Son pedidos normales en un
grupo de 30 y con roles cableados no hay forma.

**Cómo queda, concretamente.**

- Un `bigint` por rol. **Usar como mucho 62 posiciones**, no 64: el `bigint` de Postgres tiene
  signo y la posición 63 vuelve el número negativo. Funciona igual, pero confunde a cualquiera
  que lea ese número después. Como vamos a definir 16, sobra.
- **La lista, cerrada y en un solo lugar del código.** El número de cada permiso no se cambia
  nunca, solo se agregan al final. Si se reordena la lista, todos los permisos de todos los
  roles cambian de significado en silencio, y eso no da error: da desastre.
- Los 16 propuestos, en cuatro familias:

| Familia | Permisos |
|---|---|
| Espacio | gestionar espacio, gestionar roles, gestionar canales, crear invitación |
| Moderación | expulsar, banear, silenciar, ver el registro |
| Texto | ver canal, escribir, adjuntar, borrar mensajes ajenos, mencionar a todos |
| Voz | entrar a voz, hablar, compartir al canal |

  Mover o desconectar de un canal de voz se resuelve con "expulsar", y silenciar a alguien en
  voz con "silenciar". No hacen falta permisos aparte.

**Qué simplificamos por ser pocos:**
- 16 permisos, no 64. La competencia tiene permisos para tienda, para eventos con escenario,
  para hilos privados, para emojis propios, para el modo comunidad. Nada de eso existe acá.
- **Un solo nivel de excepciones: por canal.** No hay excepciones por categoría porque no hay
  categorías.
- **Jerarquía por un número de rango, no por una lista ordenada que se arrastra.** Cada rol
  tiene un rango entero. Solo podés tocar a alguien cuyo rango máximo sea menor al tuyo. Con
  5 roles esto alcanza y se explica en una frase; la lista arrastrable existe porque ellos
  tienen espacios con 40 roles.
- Sin roles que se dan solos por antigüedad, sin roles que se piden con un botón, sin roles
  que se compran.

---

### D3. ¿Cómo se hace que la base garantice el permiso, y no solo la pantalla?

**Qué está en juego.** Las claves que la app lleva adentro son públicas por diseño (ya está
escrito en `ESQUELETO.md`). Cualquiera puede abrir la consola del navegador y hablarle
directo a la base con la sesión de su propio usuario. **Si un permiso solo se chequea antes de
dibujar un botón, ese permiso no existe.**

**Opciones.**

- **A. Chequear en la pantalla.** Descartado, es lo que acabamos de decir que no.
- **B. Todo por funciones del servidor que corren con permisos elevados:** la app no toca las
  tablas, llama funciones, y la función decide. Es sólido, pero perdés las consultas directas,
  perdés los cambios en vivo filtrados por RLS (que hoy le muestran a cada uno solo lo suyo) y
  terminás escribiendo una función por cada cosa que quieras hacer.
- **C. RLS en todas las tablas, con una función central de permiso.** Las consultas siguen
  siendo directas, los cambios en vivo siguen filtrándose solos, y el permiso se chequea una
  sola vez, escrito en un solo lugar.
- **D. Mezcla: C para todo, más B solo para lo que necesita varios pasos que no se pueden
  partir** (usar una invitación, entrar a un canal de voz, cambiar un rol).

**Recomendación: D.**

**Cómo, en concreto. Son seis piezas y ninguna es opcional:**

1. **Una función `tiene_permiso(usuario, canal, bit)` y nada más.** Marcada `stable` y
   `security definer` con `set search_path = public`, igual que las que ya existen
   (`is_channel_member`, `are_friends`). Devuelve un sí o un no y **nunca devuelve datos**:
   `security definer` saltea RLS, así que si devolviera filas sería un agujero.

2. **El orden de resolución, corto y escrito una sola vez:** se juntan con "o" las máscaras
   de todos los roles que tiene la persona, incluido `@todos`; después se aplican las
   excepciones del canal para esos roles (primero las negaciones, después los permisos); y al
   final la excepción del canal para esa persona puntual. El dueño del espacio siempre da que
   sí, sin pasar por la cuenta. Ese último atajo evita el espacio que se cierra solo.

3. **Cada política RLS llama a esa función y a ninguna otra lógica.** Si aparece una política
   con su propia condición hecha a mano, es un error de revisión, no un detalle de estilo.

4. **Un disparador anti-escalación en la tabla que asigna roles.** RLS dice quién puede
   escribir la fila; el disparador dice qué puede escribir. Tres reglas: no te podés asignar
   un rol de rango mayor o igual al tuyo, no podés crear un rol con permisos que vos no
   tenés, y no podés sacarle el rol a alguien de rango mayor. Esta pieza es la que evita el
   caso "me hago admin solo", y **no se puede resolver con RLS sola**, porque RLS mira la fila
   entera y no la diferencia entre lo viejo y lo nuevo. El proyecto ya tiene esta forma de
   trabajar en `profiles_before_update` y `friendships_before_update`.

5. **Cuidado con la concesión general que ya está en la base.** La migración 001 termina con
   `grant select, insert, update, delete on all tables in schema public to authenticated`.
   Eso significa que **una tabla nueva a la que te olvides de activarle RLS queda abierta a
   cualquiera que tenga cuenta.** Con seis tablas nuevas por delante, esto pasa de curiosidad
   a riesgo real. Va como chequeo automático, ver 6.2.

6. **Rendimiento:** como RLS corre por fila, la llamada a la función se envuelve en un
   `select` para que Postgres la calcule una sola vez por consulta en vez de una vez por fila.
   Es un truco conocido de Supabase. **Hay que verificar con `explain analyze`** sobre una
   tabla con 5.000 mensajes que efectivamente se calcula una sola vez.

**Y el caso que RLS no cubre: la voz.** La base no puede desconectar a nadie de una llamada
que ya está establecida entre dos máquinas. Entonces el permiso de voz se sostiene así: el
`room_code` solo se entrega por función con permiso chequeado, y cuando exista el repartidor,
la credencial de entrada la firma un servidor nuestro y **dura entre 5 y 15 minutos**, así el
que perdió el permiso se cae solo al renovar, sin que nadie tenga que programar una expulsión.
Esto último **hay que verificarlo** contra lo que ofrezca el repartidor que se elija.

---

### D4. ¿Cómo se abaratan la presencia y las notificaciones?

**Qué está en juego, con números.** El plan gratis da **200 conexiones simultáneas** y
**2 millones de mensajes por mes**, y cada mensaje cuenta **una vez al enviarse y una vez por
cada cliente que lo recibe**. Con 40 conectados, cada entrada o salida son 40 mensajes.

**Lo que cuesta hoy, estimado con los supuestos del documento de investigación** (200
registrados, 40 en el pico, 2.000 mensajes de chat por día, 400 entra-sale por día):

| Concepto | Cuenta | Por mes |
|---|---|---|
| Presencia | 400 eventos x 40 receptores | ~480.000 |
| Chat, con 20 suscriptos por canal | 2.000 x 21 | ~1.260.000 |
| **Total** | | **~1.740.000 de 2.000.000** |

O sea: **87 % del cupo gratis, y todavía no agregamos ni espacios ni roles ni avisos.**
Pasarse cuesta USD 2,50 por millón, así que el desastre económico no existe, pero el margen
para funciones nuevas sí se termina.

**Opciones para la presencia.**

- **A. Un canal de presencia global (lo de hoy).** Todos ven a todos.
- **B. Un canal de presencia por espacio.** Con un solo espacio no cambia nada; con tres, el
  reparto se divide.
- **C. Presencia solo de amigos.** Lo más barato, pero rompe la lista de miembros del canal.
- **D. Agrupar los cambios: en vez de avisar cada alta y baja al instante, mandar una tanda
  cada 5 segundos.**

**Recomendación: B + D.** B no cuesta nada implementarlo ahora y evita la migración después.
D es donde está el ahorro real: alguien que abre y cierra la app tres veces en un minuto hoy
genera 240 mensajes, agrupado genera 40. Además hay que **soltar el canal de presencia cuando
la app está en la bandeja sin usarse**, que es el estado normal de esta app.

**Y la palanca más grande de todas, que no es la presencia: el chat.** Hoy cada mensaje se
reparte a todos los suscriptos del canal. Si en vez de eso **solo recibe en vivo el que tiene
el canal abierto en pantalla** (promedio realista: 3 personas, no 20), los 1.260.000 bajan a
unos 240.000. El resto se entera por el contador de no leídos, que se calcula **al abrir**,
con una consulta normal contra una marca de última lectura por persona y por canal. Esa marca
se escribe una sola vez, cuando cerrás el canal: es una escritura chica y no va por Realtime.

**Con las dos palancas juntas: de ~1.740.000 a unos ~540.000 por mes.** Queda margen de sobra
para roles, avisos y lo que venga. **Hay que verificar** el número real contra el panel de
Supabase después de una semana de uso: estas son cuentas de manual.

**Qué simplificamos por ser pocos:**
- Sin servidor de presencia propio, sin partir nada por carga, sin agregación por niveles.
- Sin "está escribiendo" por defecto: se prende solo en canales de menos de 10 y con
  cuentagotas. Es la función con peor relación entre lo que aporta y lo que consume.
- Sin notificaciones automáticas por cada mención en cada canal: el contador de no leídos
  alcanza. Las notificaciones de escritorio de verdad van al hito 7.

**Dos trampas del tope de conexiones (200):** la regla del proyecto de no crear un segundo
cliente de Supabase existe justo por esto, y hay que recordar que **una persona con la app y
la web abiertas a la vez son dos conexiones**. Con 40 en el pico sobra; con 150 conectados al
mismo tiempo, no. Ese es el techo duro real del plan gratis, más que los mensajes.

---

## 4. LO QUE SE NOS ESTÁ OLVIDANDO

### 4.1 El dueño que se va (y esto ya está roto hoy)

`channels.owner_id` referencia a `profiles` con `on delete cascade`. **Si el dueño de un canal
borra su cuenta, se borra el canal entero, con todos los mensajes de todos los demás.** No es
un caso borde futuro: es el comportamiento actual.

Y el modelo de hoy no tiene salida del todo: la política de borrado de miembros exige que el
rol no sea `owner`, o sea que **el dueño ni siquiera puede irse de su propio canal**.

Qué hacer: la referencia pasa a `on delete set null` y se agrega una regla de sucesión. Al
quedar sin dueño, hereda quien tenga el rango más alto y, a igualdad, el más antiguo. Si no
hay nadie, el espacio queda marcado como huérfano y lo adopta el primero que entre con permiso
de gestionar el espacio. Todo esto va en un disparador de la base, **no en la pantalla**: la
cuenta se puede borrar desde afuera de la app.

### 4.2 El último administrador que se borra la cuenta

Variante peor de la anterior: el espacio queda sin nadie que pueda dar permisos, o sea
congelado para siempre. Regla dura, con disparador: **no se puede quitar el último rol con
permiso de gestionar el espacio si el espacio tiene más de un miembro.** Si esa persona
insiste en irse, la app la obliga a elegir sucesor primero. Y como refuerzo, la sucesión
automática de 4.1 cubre el caso de la cuenta borrada de golpe.

### 4.3 El expulsado que vuelve con otra cuenta

**Hay que ser honestos: esto no se puede resolver del todo, y la decisión ya está tomada.** El
roadmap prohíbe la verificación de identidad con documento o con cara, justamente porque es
una de las razones por las que la gente busca alternativas. Sin identidad fuerte, cualquiera
se hace un mail nuevo en dos minutos.

Lo que sí se puede, en orden de utilidad real:

1. **La defensa verdadera es la puerta, no la lista negra.** Si las invitaciones vencen, tienen
   tope de usos y se sabe quién las creó, el expulsado no tiene por dónde volver a entrar.
   Esto es lo que de verdad funciona en un grupo de 50 y es barato.
2. Baneo por identificador de usuario: trivial, y cubre al que vuelve con la misma cuenta.
3. Baneo por mail: el mismo mail en minúscula, guardado como huella y no en claro, para no
   armar una lista de mails en una tabla que alguien pueda leer.
4. **Baneo por dirección de internet: no lo tenemos.** Desde la base no llega la dirección del
   cliente sino la del intermediario de conexiones. **Hay que verificar** si se puede sacar de
   otro lado, pero no vale la pena pelearla: se resuelve con el punto 1.

Lo que sí hay que agregar es una red de seguridad: si un espacio está configurado como
cerrado, **entrar requiere que alguien apruebe**, no solo tener el código. Un botón de "sala
de espera" para el caso del grupo que está siendo molestado.

### 4.4 Invitaciones filtradas

Hoy el código de invitación es una columna del canal, se genera con 4 bytes al azar, no vence
nunca, no tiene tope de usos, no se puede revocar sin borrar el canal, y se muestra en un
botón del panel. Y la función que lo canjea corre con permisos elevados, o sea que **saltea
RLS y no chequea absolutamente nada más que si el código existe**.

Qué cambia:

- Tabla de invitaciones aparte: código, quién la creó, para qué espacio o canal, cuándo vence,
  cuántos usos como máximo, cuántos lleva, si está revocada.
- **Código de al menos 12 bytes al azar**, no 4. Con 4 bytes el espacio de códigos es lo
  bastante chico como para que probar a lo bruto tenga sentido, y no hay ningún freno por
  intentos: la función se puede llamar todas las veces que quieras.
- **Freno por intentos fallidos**, por usuario y por hora. Un contador chico en la misma
  función alcanza.
- **El contador de usos tiene que subir en la misma operación que valida**, con un
  `update ... where usos < tope returning`, no leer y después escribir. Si no, dos personas
  canjean a la vez la última invitación disponible y entran las dos. Es una carrera tonta pero
  real.
- **Quién invitó a quién queda registrado.** En un grupo de 50, saber que el que rompió todo
  entró con la invitación de fulano es el 90 % de la moderación.
- La invitación puede ser al espacio o a un canal puntual. Si es al canal, hereda el espacio.

### 4.5 Cambios de permiso mientras alguien está adentro de un canal

RLS chequea cuando consultás. Si te sacan el permiso de escribir, no podés escribir de nuevo,
pero **lo que ya bajaste sigue en tu pantalla y sigue en tu máquina.** Y en voz es peor: si ya
estás conectado directo con otro, la base no te puede separar.

Qué hacer:

- **Texto:** un aviso en vivo por el canal del espacio cuando cambia un rol o una excepción.
  Es un mensaje chiquito que dice "volvé a chequear", y los clientes vuelven a pedir lo suyo.
  Cuesta un mensaje por persona conectada, y pasa pocas veces por día.
- **Voz:** credenciales cortas que se renuevan (ver D3). El que perdió el permiso se cae al
  renovar, en menos de 15 minutos, sin que nadie programe nada.
- **Lo que ya vio, lo vio.** Hay que asumirlo y decirlo. No hay forma de borrar de la cabeza
  ni del disco de alguien lo que ya se le mostró.
- **El caso al revés también importa:** si te *dan* un permiso, la pantalla tiene que
  enterarse sin que cierres la app. Mismo aviso, mismo mecanismo.

### 4.6 Los mensajes de alguien que se va

Hoy `messages.author_id` tiene `on delete cascade`: **borrar la cuenta borra todos sus
mensajes en todos los canales**, dejando las conversaciones agujereadas como un queso. Nadie
decidió eso; salió de fábrica.

Hay que elegir a propósito, y hay tres caminos:

- **A. Borrar todo.** Máximo respeto por quien se va, máximo daño a la conversación del grupo.
- **B. Conservar el texto y despersonalizar el autor** (`on delete set null`, y se muestra
  "usuario eliminado"). La conversación sigue teniendo sentido.
- **C. Conservar todo con nombre y todo.** Raro y desprolijo.

**Recomendación: B por defecto, más un botón aparte de "borrar todos mis mensajes"** que la
persona puede usar antes de irse si quiere. Son dos decisiones distintas y hay que dejar que
sean dos: "me voy" no es lo mismo que "borren lo que dije".

### 4.7 El nombre de usuario que se recicla

`profiles.username` es único, pero si alguien borra la cuenta el nombre queda libre y otro lo
puede tomar. Las menciones viejas y las capturas de pantalla pasan a apuntar a otra persona.
Arreglo barato: **las menciones se guardan por identificador, no por texto**, y el nombre de
usuario de una cuenta borrada queda reservado. A 200 personas no nos vamos a quedar sin
nombres.

### 4.8 El espacio que se cierra solo

Es fácil configurar un canal donde nadie tiene permiso de verlo, o quitarle el permiso de
gestionar roles a todos los roles a la vez. Queda un canal fantasma o un espacio que nadie
puede arreglar. El atajo del dueño (punto 2 de D3) lo cubre, pero conviene además **avisar en
la pantalla antes de guardar** un cambio que deja un canal sin nadie que lo vea.

### 4.9 Amistad, bloqueo y canales compartidos

Hoy hay tres cosas sin conectar: la llamada directa exige ser amigos, sumar a alguien a un
canal exige ser amigos, pero **entrar por código no exige nada**. Y el estado `blocked` de
`friendships` existe en la base pero no hace nada: el panel solo lo filtra de la lista.

Hay que decidir explícitamente qué significa bloquear a alguien cuando están en el mismo
canal. La opción barata y honesta es **bloqueo del lado de quien bloquea**: no le veo los
mensajes, no me puede llamar, no me puede mandar solicitud, y no se pretende expulsarlo del
canal. Prometer más que eso en un grupo de 50 es prometer lo que no se puede cumplir.

### 4.10 Lo que ya está gastando de más

`subscribeAll` en `panel.js` se suscribe a **todos** los cambios de `friendships` y de
`channel_members` sin filtro, y cada cambio dispara una recarga completa de amigos o de
canales. RLS filtra lo que no podés ver, pero **hay que verificar si un cambio filtrado por
RLS cuenta igual como mensaje facturado**. Sea cual sea la respuesta, la recarga completa por
cada cambio sí es nuestra y es evitable: filtrar por el usuario y actualizar solo la fila que
cambió.

### 4.11 El cargo de "dueño" desaparece y hay que migrar

Cuando `owner_id` deje de ser la fuente de la verdad, la migración tiene que **crear los roles
equivalentes para todos los canales que ya existen**, en la misma migración, no después. Un
canal que queda sin rol y sin dueño es un canal al que no entra nadie.

---

## 5. CÓMO SE CONECTA CON LOS PRESETS

**En una línea: esta área casi no toca los presets, porque los presets regulan lo que consume
la máquina y la red, y acá no se transmite nada.**

Lo que sí, y son cuatro cosas concretas:

1. **Cuánta gente se muestra con presencia en vivo.** En modo "PC tostadora" la lista de
   miembros muestra el punto de conectado solo para los amigos, no para los 200 del espacio, y
   se actualiza cada 15 segundos en vez de cada 5. Es el ajuste más directo y el que más
   ahorra, tanto en mensajes como en re-dibujos de pantalla.
2. **Suscripciones en vivo a canales que no estás mirando.** En tostadora, cero: te enterás al
   abrir. En "soy cheto", el aviso llega igual.
3. **"Está escribiendo".** Apagado en tostadora y en estándar, prendido de ahí para arriba, y
   nunca en canales de más de 10 personas.
4. **Dibujar una lista de 200 miembros no es gratis.** Con animaciones apagadas, la lista va
   sin transiciones y se dibuja de a pedazos.

Lo que **no** toca: nada de calidad de audio, video, codecs, repartidor ni medidor de consumo.
El único lugar donde nos cruzamos con el medidor es que el contador de mensajes de Realtime
del mes, si algún día se muestra adentro de la app, **mide sobre todo cosas nuestras**:
presencia, avisos y chat. O sea, somos el principal cliente de ese número sin ser dueños del
medidor.

---

## 6. CÓMO SE PRUEBA

La regla que ordena todo: **una prueba que pasa por la pantalla de la app no prueba nada de
seguridad.** La app es exactamente la que sabe qué botón no dibujar. Todas las pruebas de
permiso se hacen **hablándole directo a la base**, con la clave pública y una sesión de
prueba, desde un script aparte.

### 6.1 Cómo se prueba que un permiso no se puede saltear

El montaje: un script de Node, fuera de la app, que arranca con tres sesiones reales de tres
cuentas de prueba (una admin, una miembro común, una expulsada) más una cuarta "sesión" sin
iniciar sesión. Cada caso es una llamada cruda a la base y se espera un resultado exacto.

**Criterio general y medible: por cada uno de los 16 permisos, dos casos.** Uno con el permiso
(tiene que funcionar) y uno sin (tiene que dar cero filas o error de política). Son 32 casos y
se corren en menos de un minuto. Debajo del 100 % no se publica.

Los casos que no pueden faltar:

| Prueba | Resultado esperado |
|---|---|
| Sin sesión, leer cualquier tabla | cero filas, siempre |
| Miembro común intenta cambiarse su propio rol a admin | error del disparador |
| Miembro común crea un rol con permisos que él no tiene | error del disparador |
| Miembro común le saca el rol a un admin | error del disparador |
| Leer mensajes de un canal donde no soy miembro | cero filas |
| Escribir en un canal donde puedo ver pero no escribir | error de política |
| Escribir poniendo el identificador de otro como autor | error de política |
| Pedir el `room_code` de un canal de voz sin permiso de entrar | cero filas |
| Leer el listado de miembros de un espacio ajeno | cero filas |
| Expulsado que intenta volver con la invitación vieja | rechazado |
| Leer la tabla de invitaciones de un espacio ajeno | cero filas |
| Borrar un mensaje ajeno sin el permiso correspondiente | cero filas afectadas |

### 6.2 La prueba que atrapa el olvido más caro

Una sola consulta, que se agrega a `npm run verificar` y corre en cada empuje a `main`:
**listar todas las tablas de `public` que no tienen RLS activada. Tiene que dar cero filas,
siempre.** Es una línea de SQL y cubre el riesgo de la concesión general que ya está en la
migración 001. Si alguna vez da una fila, hay una tabla abierta a cualquiera con cuenta.

Igual de barata, la hermana: **listar las políticas que no llaman a `tiene_permiso`** y
revisarlas a mano. No tiene que dar cero, pero cada una tiene que tener una razón escrita.

### 6.3 Pruebas de que no nos comemos el cupo gratis

Con número, no a ojo. Se mira el panel de Supabase antes y después.

| Qué se mide | Cómo | Objetivo |
|---|---|---|
| Mensajes por persona conectada por hora, sin hablar | 5 cuentas 30 minutos con la app abierta y quieta | menos de 100 |
| Mensajes que genera una entrada o salida | una cuenta entra y sale 10 veces, con 5 conectados | menos de 60 en total, o sea agrupado |
| Mensajes por mensaje de chat | 20 mensajes en un canal de 5 miembros, 2 con el canal abierto | cerca de 3 por mensaje, no de 6 |
| Conexiones simultáneas | 5 cuentas con app y web abiertas | exactamente 10, ni una más |
| Proyección mensual | la cuenta de D4 con los números medidos | debajo de 1.000.000 de 2.000.000 |

### 6.4 Pruebas de los casos borde

Cada una es un caso concreto, no una charla:

- **Borrado de cuenta:** una cuenta crea un espacio con 3 miembros y 20 mensajes, y se borra
  desde la administración de Supabase, no desde la app. Se verifica: el espacio sigue, los
  canales siguen, los 20 mensajes siguen con "usuario eliminado", y hay un admin nuevo.
- **Último admin:** se intenta quitar el último permiso de gestionar el espacio. Tiene que
  fallar.
- **Carrera de la invitación:** una invitación de 3 usos, 5 clientes la canjean en el mismo
  instante. Tienen que entrar exactamente 3.
- **Cambio de permiso en caliente:** A está en un canal de texto, B le saca el permiso de
  escribir. A intenta escribir sin recargar. Tiene que fallar del lado de la base, y la
  pantalla de A tiene que enterarse en menos de 5 segundos.
- **Rendimiento de RLS:** `explain analyze` leyendo 500 mensajes de un canal con 5.000. La
  función de permiso tiene que aparecer calculada una vez, no 500. Debajo de 100 milisegundos.

---

## 7. LO QUE NO VA ACÁ

Para no discutirlo de nuevo en tres meses.

**De otras áreas del proyecto:**
- Todo lo que sea contenido de mensaje: formato, adjuntos, respuestas, reacciones, editar,
  previsualización de enlaces, buscador, retención, historial guardado en la PC.
- Todo lo que sea calidad de audio o video: codecs, bitrate, supresión de ruido, cancelación
  de eco, el repartidor, compartir pantalla, la grilla de cámaras.
- Los presets en sí, el medidor de consumo, el ayudante nativo.
- Las actualizaciones, el instalador, la web oficial, el enlace del mail.
- El envío del código por mail y la sesión: eso es del proveedor de autenticación.

**Lo que decidimos no construir nunca, o no ahora:**
- **Verificación de identidad con documento o cara.** Decisión cerrada en el roadmap.
- **Moderación automática** (filtros de palabras, detección de correo basura, castigos solos).
  Con 50 personas que se conocen, el costo de mantenerlo supera cualquier beneficio.
- **Descubrimiento público de espacios, directorio, plantillas de espacio.** No hay millones
  de desconocidos buscando dónde entrar.
- **Tienda, monedas, misiones, niveles pagos, mejoras del espacio.** Decisión cerrada.
- **Categorías o carpetas de canales**, y con eso el nivel intermedio de herencia de permisos.
  Si algún día hay 40 canales, se reabre.
- **Roles que se dan solos por antigüedad o por actividad**, roles que se piden con un botón,
  lista de roles arrastrable.
- **Baneo por dirección de internet.** No lo podemos hacer bien y no hace falta.
- **Bots, integraciones y API.** Hito 8, y con su propio modelo de permisos cuando llegue.
- **Registro de auditoría completo de todo cambio de todo.** Solo se registran las acciones de
  moderación y los cambios de rol, que son las que alguien va a querer mirar después.
