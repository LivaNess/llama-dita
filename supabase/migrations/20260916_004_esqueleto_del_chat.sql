-- ============================================================
-- Llama-dita · 004 · El esqueleto del chat
--
-- Este es el cimiento que el chat arrastra, hecho de una sola vez en vez de en cinco parches.
-- Sale de `areas/chat-e-historial.md` (paso 2 del camino) y de las cuatro decisiones que tomó
-- Martín el 16/09/2026, anotadas en SYNC.md.
--
-- Qué entra acá y por qué:
--
--   1. ESPACIOS. Un espacio es una comunidad que adentro tiene canales. Las tablas nacen con
--      la idea, aunque la pantalla muestre uno solo y no haya selector. Agregarlo después
--      sería una migración sobre mensajes que ya existen; agregarlo ahora es una columna.
--
--   2. CHATS PRIVADOS. Un chat de a dos es un canal más, de tipo 'dm', sin espacio y con una
--      clave única armada con los dos identificadores. Así reusa mensajes, membresías,
--      permisos y tiempo real, en vez de tener un sistema paralelo que después hay que
--      arreglar dos veces.
--
--   3. IDENTIDAD Y ORDEN DE LOS MENSAJES. Un identificador puesto por el cliente (para que un
--      reenvío no duplique el mensaje) y una fecha de última modificación indexada, que es lo
--      que permite pedirle al servidor "dame solo lo que cambió desde tal momento" en vez de
--      bajar los últimos 60 mensajes cada vez que abrís un canal.
--
--   4. LÁPIDAS. El borrado es duro: la fila se va de verdad, no se marca como borrada. Pero si
--      la fila desaparece, el que estaba desconectado no tiene forma de enterarse y se queda
--      con su copia para siempre. La lápida es una fila mínima que dice "el mensaje tal, del
--      canal tal, se borró a tal hora". Pesa unos 40 bytes, viaja por tiempo real y se limpia
--      a los 90 días.
--
--   5. RETENCIÓN. Por decisión de Martín: el texto se guarda para siempre y los adjuntos 90
--      días. Las columnas se crean ahora; la purga automática viene con los adjuntos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ESPACIOS
-- ------------------------------------------------------------
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  joined_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_members_user_idx on public.space_members (user_id);

create or replace function public.is_space_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.space_members m where m.space_id = s and m.user_id = auth.uid())
$$;

-- El espacio de la casa. Identificador fijo a propósito: la app lo nombra sin tener que buscarlo.
insert into public.spaces (id, name, owner_id)
values ('00000000-0000-0000-0000-000000000001', 'Llamadita', null)
on conflict (id) do nothing;

-- Todo el que tenga cuenta hoy entra al espacio de la casa.
insert into public.space_members (space_id, user_id)
select '00000000-0000-0000-0000-000000000001', p.id from public.profiles p
on conflict do nothing;

-- Y el que se cree una cuenta de acá en adelante, también.
create or replace function public.profiles_after_insert_espacio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.space_members (space_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_profiles_after_insert_espacio on public.profiles;
create trigger trg_profiles_after_insert_espacio
  after insert on public.profiles
  for each row execute function public.profiles_after_insert_espacio();

alter table public.spaces enable row level security;

drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select
  to authenticated using (public.is_space_member(id));

-- Crear, renombrar y borrar espacios todavía no lo hace nadie desde la app: sin políticas de
-- alta, cambio o baja, el espacio de la casa no se puede tocar ni por error.

alter table public.space_members enable row level security;

drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members for select
  to authenticated using (public.is_space_member(space_id));

-- Uno se puede ir de un espacio; sumar gente lo hace el disparador de arriba.
drop policy if exists space_members_delete on public.space_members;
create policy space_members_delete on public.space_members for delete
  to authenticated using (user_id = auth.uid() and role <> 'owner');

-- ------------------------------------------------------------
-- 2. CANALES: espacio, chats privados y retención
-- ------------------------------------------------------------
alter table public.channels add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.channels add column if not exists dm_key text;
alter table public.channels add column if not exists retencion_texto_dias int;
alter table public.channels add column if not exists retencion_adjuntos_dias int not null default 90;

-- Un chat privado no tiene nombre propio: la app muestra el nombre del otro.
alter table public.channels drop constraint if exists channels_name_check;
alter table public.channels add constraint channels_name_check check (char_length(name) <= 40);

alter table public.channels drop constraint if exists channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text','voice','dm'));

-- Una sola conversación privada por par de personas, pase lo que pase.
create unique index if not exists channels_dm_key_idx on public.channels (dm_key) where dm_key is not null;

-- Los canales que ya existían pasan al espacio de la casa.
update public.channels set space_id = '00000000-0000-0000-0000-000000000001'
where space_id is null and kind <> 'dm';

-- Un canal normal vive en un espacio; un chat privado no vive en ninguno.
alter table public.channels drop constraint if exists channels_forma_check;
alter table public.channels add constraint channels_forma_check check (
  (kind = 'dm' and dm_key is not null and space_id is null)
  or (kind <> 'dm' and dm_key is null)
);

create index if not exists channels_space_idx on public.channels (space_id);

create or replace function public.es_directo(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels ch where ch.id = c and ch.kind = 'dm')
$$;

-- Un canal nuevo solo puede nacer en un espacio del que sos miembro.
-- Los chats privados se abren por la función del punto 5, que comprueba que sean amigos.
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert
  to authenticated with check (
    owner_id = auth.uid()
    and kind <> 'dm'
    and space_id is not null
    and public.is_space_member(space_id)
  );

-- ------------------------------------------------------------
-- 3. MENSAJES: identidad, orden y edición
-- ------------------------------------------------------------
alter table public.messages add column if not exists client_id uuid;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists updated_at timestamptz not null default now();

-- El mismo mensaje reenviado dos veces (por un corte de red) entra una sola vez.
create unique index if not exists messages_client_id_idx on public.messages (channel_id, client_id) where client_id is not null;

-- El índice que hace barata la sincronización por diferencia: "dame lo que cambió desde tal hora".
create index if not exists messages_channel_updated_idx on public.messages (channel_id, updated_at);

create or replace function public.messages_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- De un mensaje solo se puede cambiar el texto. Ni el autor, ni el canal, ni la hora.
    new.id := old.id;
    new.channel_id := old.channel_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.client_id := old.client_id;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_messages_before_write on public.messages;
create trigger trg_messages_before_write
  before insert or update on public.messages
  for each row execute function public.messages_before_write();

-- Editar: solo lo tuyo. Antes no existía esta política, así que no se podía editar nada.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Borrar: lo tuyo siempre. Lo ajeno, solo el dueño de un canal y NUNCA en un chat privado
-- (si no, el que abrió la conversación podría borrar lo que dijo el otro).
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete
  to authenticated using (
    author_id = auth.uid()
    or (public.is_channel_owner(channel_id) and not public.es_directo(channel_id))
  );

-- ------------------------------------------------------------
-- 4. LÁPIDAS: para que un borrado viaje
-- ------------------------------------------------------------
create table if not exists public.message_tombstones (
  message_id  bigint primary key,
  channel_id  uuid not null references public.channels(id) on delete cascade,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid references public.profiles(id) on delete set null
);
create index if not exists message_tombstones_channel_idx on public.message_tombstones (channel_id, deleted_at);

create or replace function public.messages_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.message_tombstones (message_id, channel_id, deleted_by)
  values (old.id, old.channel_id, auth.uid())
  on conflict (message_id) do nothing;
  return old;
end $$;

drop trigger if exists trg_messages_after_delete on public.messages;
create trigger trg_messages_after_delete
  after delete on public.messages
  for each row execute function public.messages_after_delete();

alter table public.message_tombstones enable row level security;

-- Se leen (es como se entera el que estuvo desconectado) pero no se escriben a mano:
-- la única que las crea es la función de arriba, y nadie las borra salvo la purga.
drop policy if exists message_tombstones_select on public.message_tombstones;
create policy message_tombstones_select on public.message_tombstones for select
  to authenticated using (public.is_channel_member(channel_id));

-- La lápida también se va. A los 90 días, el que no abrió la app en todo ese tiempo se baja
-- el canal de cero en vez de sincronizar por diferencia.
create or replace function public.purgar_lapidas() returns integer
language sql security definer set search_path = public as $$
  with borradas as (
    delete from public.message_tombstones where deleted_at < now() - interval '90 days' returning 1
  ) select count(*)::int from borradas
$$;

-- La purga no la llama la app: la llama el trabajo programado. Sin esto quedaba expuesta como
-- una funcion mas de la API y cualquiera con cuenta podia disparar el borrado de lapidas.
revoke all on function public.purgar_lapidas() from public;
revoke all on function public.purgar_lapidas() from anon;
revoke all on function public.purgar_lapidas() from authenticated;

-- ------------------------------------------------------------
-- 5. ABRIR UN CHAT PRIVADO CON UN AMIGO
-- ------------------------------------------------------------
create or replace function public.abrir_chat_directo(otro uuid)
returns public.channels
language plpgsql security definer set search_path = public as $$
declare
  yo    uuid := auth.uid();
  clave text;
  ch    public.channels;
begin
  if yo is null then raise exception 'Necesitás iniciar sesión.'; end if;
  if otro is null or otro = yo then raise exception 'No se puede abrir un chat con esa persona.'; end if;
  if not public.are_friends(yo, otro) then raise exception 'Solo podés chatear con tus amigos.'; end if;

  clave := least(yo::text, otro::text) || ':' || greatest(yo::text, otro::text);

  select * into ch from public.channels where dm_key = clave;
  if found then
    -- Si alguno se había ido, vuelve a entrar.
    insert into public.channel_members (channel_id, user_id, role)
    values (ch.id, yo, 'member'), (ch.id, otro, 'member')
    on conflict do nothing;
    return ch;
  end if;

  insert into public.channels (owner_id, name, kind, dm_key, space_id)
  values (yo, '', 'dm', clave, null)
  on conflict (dm_key) where dm_key is not null do nothing
  returning * into ch;

  -- Si los dos lo abrieron en el mismo instante, el que perdió la carrera usa el que quedó.
  if ch.id is null then
    select * into ch from public.channels where dm_key = clave;
  end if;

  insert into public.channel_members (channel_id, user_id, role)
  values (ch.id, otro, 'member')
  on conflict do nothing;

  return ch;
end $$;
grant execute on function public.abrir_chat_directo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. TIEMPO REAL
-- ------------------------------------------------------------
-- El borrado viaja como el alta de una lápida. Un alta sí se puede filtrar por canal y sí
-- respeta los permisos; el aviso de una fila borrada viaja solo con su clave y no sirve.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_tombstones'
  ) then
    alter publication supabase_realtime add table public.message_tombstones;
  end if;
end $$;
