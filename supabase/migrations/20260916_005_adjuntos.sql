-- ============================================================
-- Llama-dita · 005 · Imágenes y archivos en el chat
--
-- Paso 3 de `areas/chat-e-historial.md`. Los bytes NO viven en esta base: viven en un bucket
-- de objetos (Cloudflare R2), que da 10 GB gratis y **la salida nunca se paga**, que es justo
-- lo que querés para una foto que se mira veinte veces. El almacenamiento de Supabase da 1 GB
-- y cobra la salida: no sirve para esto.
--
-- Acá vive solo la ficha de cada archivo: de qué mensaje cuelga, cómo se llama el objeto, qué
-- pesa y de qué tipo es. El permiso para subirlo y para verlo lo reparte un Worker aparte
-- (`workers/adjuntos/`), que valida la sesión y firma un permiso que vence.
--
-- Dos cosas que se resuelven acá y son fáciles de no ver:
--
--   1. UN MENSAJE PUEDE NO TENER TEXTO. Si mandás solo una captura, el cuerpo va vacío. El
--      control que exigía por lo menos un carácter se afloja, y en su lugar entra uno que
--      exige que un mensaje tenga texto **o** un adjunto: vacío del todo no se puede.
--
--   2. LOS ARCHIVOS NO SE BORRAN SOLOS. Cuando se borra un mensaje (o un canal entero) la
--      cascada se lleva las filas, pero el objeto queda ocupando los 10 GB para siempre, sin
--      ninguna fila que lo nombre. Es el tipo de fuga que aparece a los seis meses con el cupo
--      lleno y nadie sabiendo por qué. Por eso hay una COLA de objetos a borrar que se llena
--      sola con un disparador, y que después vacía el Worker.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA FICHA DE CADA ARCHIVO
-- ------------------------------------------------------------
create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  bigint not null references public.messages(id) on delete cascade,
  channel_id  uuid   not null references public.channels(id) on delete cascade,
  uploader_id uuid   references public.profiles(id) on delete set null,
  -- La dirección del objeto dentro del bucket. Lleva un identificador al azar, así que no se
  -- puede adivinar aunque el bucket dejara de ser privado.
  object_key  text not null unique,
  nombre      text not null check (char_length(nombre) between 1 and 200),
  mime        text not null check (char_length(mime) between 1 and 100),
  bytes       bigint not null check (bytes > 0 and bytes <= 104857600), -- 100 MB, la decisión de Martín
  ancho       int,
  alto        int,
  -- Si el que subió pidió mandarla sin comprimir, queda anotado: es la diferencia entre 300 KB
  -- y 4 MB, y explica sola por qué el cupo se mueve.
  original    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists attachments_message_idx on public.attachments (message_id);
create index if not exists attachments_channel_idx on public.attachments (channel_id, created_at);

alter table public.attachments enable row level security;

-- Se ven si estás en el canal, igual que los mensajes. Esta política es además la que usa el
-- Worker para decidir si te firma el permiso de lectura: te consulta la tabla con TU sesión,
-- y si RLS te devuelve la fila, es que podés verla. Así el Worker no necesita ninguna llave
-- de la base.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  to authenticated using (public.is_channel_member(channel_id));

-- Subir lo tuyo, a un mensaje tuyo, en un canal donde estás.
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  to authenticated with check (
    uploader_id = auth.uid()
    and public.is_channel_member(channel_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.author_id = auth.uid() and m.channel_id = attachments.channel_id)
  );

-- No se borran a mano: se van con su mensaje. Sin política de baja, nadie puede desprender un
-- archivo de su mensaje y dejarlo colgado.

-- ------------------------------------------------------------
-- 2. UN MENSAJE PUEDE SER SOLO UNA IMAGEN
-- ------------------------------------------------------------
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(body) <= 2000);

-- Pero no puede estar vacío del todo. Se controla al final de la transacción, porque el
-- adjunto se inserta después que el mensaje.
create or replace function public.messages_no_vacios() returns trigger
language plpgsql set search_path = public as $$
begin
  if char_length(coalesce(new.body, '')) = 0
     and not exists (select 1 from public.attachments a where a.message_id = new.id) then
    raise exception 'Un mensaje vacío necesita por lo menos un archivo.';
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_no_vacios on public.messages;
create constraint trigger trg_messages_no_vacios
  after insert or update on public.messages
  deferrable initially deferred
  for each row execute function public.messages_no_vacios();

-- ------------------------------------------------------------
-- 3. LA COLA DE OBJETOS A BORRAR
-- ------------------------------------------------------------
-- El área de canales no tiene que saber nada de archivos: cuando borra un canal, la cascada
-- se lleva los mensajes y los adjuntos, y este disparador anota los objetos que quedaron
-- huérfanos. Sirve para los tres casos (un mensaje, una conversación y un canal entero).
create table if not exists public.objetos_a_borrar (
  object_key text primary key,
  pedido_at  timestamptz not null default now(),
  intentos   int not null default 0
);
create index if not exists objetos_a_borrar_pedido_idx on public.objetos_a_borrar (pedido_at);

alter table public.objetos_a_borrar enable row level security;
-- Sin ninguna política: nadie llega a esta tabla desde la app. La llena el disparador de abajo
-- y la vacía el Worker con una llave de servicio.

create or replace function public.attachments_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.objetos_a_borrar (object_key) values (old.object_key)
  on conflict (object_key) do nothing;
  return old;
end $$;

drop trigger if exists trg_attachments_after_delete on public.attachments;
create trigger trg_attachments_after_delete
  after delete on public.attachments
  for each row execute function public.attachments_after_delete();

-- ------------------------------------------------------------
-- 3b. MANDAR UN MENSAJE CON ARCHIVOS, DE UNA SOLA VEZ
-- ------------------------------------------------------------
-- Tiene que ser atomico: el control de "no puede estar vacio del todo" se revisa al cerrar la
-- transaccion, y el mensaje y su adjunto se insertan uno despues del otro. Si fueran dos
-- llamadas separadas, la primera cerraria con el mensaje todavia sin archivo y fallaria.
--
-- Ademas deja el caso feo resuelto: si el alta del adjunto falla, tampoco queda el mensaje.
create or replace function public.enviar_con_archivos(
  canal      uuid,
  texto      text,
  id_cliente uuid,
  archivos   jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  yo  uuid := auth.uid();
  m   bigint;
  a   jsonb;
begin
  if yo is null then raise exception 'Necesitás iniciar sesión.'; end if;
  if not public.is_channel_member(canal) then raise exception 'No estás en ese canal.'; end if;
  if jsonb_typeof(archivos) <> 'array' or jsonb_array_length(archivos) = 0 then
    raise exception 'No hay archivos que adjuntar.';
  end if;
  if jsonb_array_length(archivos) > 10 then
    raise exception 'Hasta diez archivos por mensaje.';
  end if;

  insert into public.messages (channel_id, author_id, body, client_id)
  values (canal, yo, coalesce(texto, ''), id_cliente)
  returning id into m;

  for a in select * from jsonb_array_elements(archivos) loop
    insert into public.attachments (message_id, channel_id, uploader_id, object_key, nombre, mime, bytes, ancho, alto, original)
    values (
      m, canal, yo,
      a->>'object_key',
      left(coalesce(a->>'nombre', 'archivo'), 200),
      coalesce(a->>'mime', 'application/octet-stream'),
      (a->>'bytes')::bigint,
      nullif(a->>'ancho', '')::int,
      nullif(a->>'alto', '')::int,
      coalesce((a->>'original')::boolean, false)
    );
  end loop;

  return m;
end $$;
grant execute on function public.enviar_con_archivos(uuid, text, uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 4. CUÁNTO ESTÁ OCUPANDO CADA UNO
-- ------------------------------------------------------------
-- El Worker la usa para el cupo por persona, y sirve para saber cuándo nos acercamos a los
-- 10 GB sin tener que ir a mirar el panel de Cloudflare.
create or replace function public.mi_consumo_de_archivos() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(bytes), 0)::bigint from public.attachments where uploader_id = auth.uid()
$$;
grant execute on function public.mi_consumo_de_archivos() to authenticated;

-- ------------------------------------------------------------
-- 5. TIEMPO REAL
-- ------------------------------------------------------------
-- El adjunto viaja junto con su mensaje: cuando llega el aviso del mensaje, el cliente pide la
-- ficha del archivo. Igual se publica la tabla para que un adjunto que llega un instante
-- después del mensaje no quede sin dibujar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;
