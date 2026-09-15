-- ============================================================
-- Llama-dita · 001 · cuentas, amigos, canales, mensajes, llamadas
-- Aplicado el 2026-09-15 sobre el proyecto mwzkrahindnheuheoycv.
-- Auth: magic link / código por mail (sin contraseñas).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PERFILES (1:1 con auth.users, se crea solo al registrarse)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null default '' check (char_length(display_name) <= 40),
  avatar_url    text,
  status        text not null default 'offline' check (status in ('online','idle','dnd','offline')),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user' || base; end if;
  base := left(base, 14);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || '_' || (floor(random() * 9000) + 1000)::int;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anti-escalación: el usuario edita su perfil pero no puede tocar id/created_at.
create or replace function public.profiles_before_update() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_profiles_before_update on public.profiles;
create trigger trg_profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  to authenticated using (true);            -- cualquiera logueado puede buscar usuarios

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ------------------------------------------------------------
-- AMISTADES (solicitud → aceptada; una fila por par)
-- ------------------------------------------------------------
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  )
$$;

-- Solo el destinatario puede aceptar; nadie puede cambiar quién es quién.
create or replace function public.friendships_before_update() returns trigger
language plpgsql as $$
begin
  new.requester_id := old.requester_id;
  new.addressee_id := old.addressee_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.status = 'accepted' and old.status <> 'accepted' and auth.uid() <> old.addressee_id then
    raise exception 'Solo quien recibió la solicitud puede aceptarla';
  end if;
  return new;
end $$;

drop trigger if exists trg_friendships_before_update on public.friendships;
create trigger trg_friendships_before_update
  before update on public.friendships
  for each row execute function public.friendships_before_update();

alter table public.friendships enable row level security;

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select
  to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert
  to authenticated with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships for update
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete
  to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ------------------------------------------------------------
-- CANALES (cada usuario crea los suyos; texto o voz) + MIEMBROS
-- ------------------------------------------------------------
create table if not exists public.channels (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  kind         text not null default 'text' check (kind in ('text','voice')),
  invite_code  text not null unique default encode(gen_random_bytes(4), 'hex'),
  room_code    text not null unique default ('llamadita-' || encode(gen_random_bytes(3), 'hex')),
  created_at   timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','member')),
  joined_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists channel_members_user_idx on public.channel_members (user_id);

create or replace function public.is_channel_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channel_members m where m.channel_id = c and m.user_id = auth.uid())
$$;

create or replace function public.is_channel_owner(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels ch where ch.id = c and ch.owner_id = auth.uid())
$$;

-- El dueño queda como miembro automáticamente.
create or replace function public.channels_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.channel_members (channel_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_channels_after_insert on public.channels;
create trigger trg_channels_after_insert
  after insert on public.channels
  for each row execute function public.channels_after_insert();

create or replace function public.channels_before_update() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists trg_channels_before_update on public.channels;
create trigger trg_channels_before_update
  before update on public.channels
  for each row execute function public.channels_before_update();

alter table public.channels enable row level security;

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select
  to authenticated using (owner_id = auth.uid() or public.is_channel_member(id));

drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert
  to authenticated with check (owner_id = auth.uid());

drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels for delete
  to authenticated using (owner_id = auth.uid());

alter table public.channel_members enable row level security;

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members for select
  to authenticated using (public.is_channel_member(channel_id));

-- El dueño puede sumar a sus amigos. Entrar por código va por RPC (abajo).
drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members for insert
  to authenticated with check (
    role = 'member'
    and public.is_channel_owner(channel_id)
    and public.are_friends(auth.uid(), user_id)
  );

-- Uno se puede ir; el dueño puede sacar gente. Al dueño no se lo saca (se borra el canal).
drop policy if exists channel_members_delete on public.channel_members;
create policy channel_members_delete on public.channel_members for delete
  to authenticated using (
    role <> 'owner' and (user_id = auth.uid() or public.is_channel_owner(channel_id))
  );

-- Entrar a un canal con su código de invitación.
create or replace function public.join_channel_by_code(code text)
returns public.channels
language plpgsql security definer set search_path = public as $$
declare ch public.channels;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into ch from public.channels where invite_code = lower(trim(code));
  if ch.id is null then raise exception 'Código de canal inválido'; end if;
  insert into public.channel_members (channel_id, user_id, role)
  values (ch.id, auth.uid(), 'member')
  on conflict do nothing;
  return ch;
end $$;
grant execute on function public.join_channel_by_code(text) to authenticated;

-- ------------------------------------------------------------
-- MENSAJES de texto por canal
-- ------------------------------------------------------------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  channel_id  uuid not null references public.channels(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists messages_channel_created_idx on public.messages (channel_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  to authenticated using (public.is_channel_member(channel_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  to authenticated with check (author_id = auth.uid() and public.is_channel_member(channel_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete
  to authenticated using (author_id = auth.uid() or public.is_channel_owner(channel_id));

-- ------------------------------------------------------------
-- LLAMADAS directas entre amigos (timbre + sala P2P existente)
-- ------------------------------------------------------------
create table if not exists public.call_invites (
  id          uuid primary key default gen_random_uuid(),
  caller_id   uuid not null references public.profiles(id) on delete cascade,
  callee_id   uuid not null references public.profiles(id) on delete cascade,
  room_code   text not null,
  status      text not null default 'ringing' check (status in ('ringing','accepted','declined','ended','missed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (caller_id <> callee_id)
);
create index if not exists call_invites_callee_idx on public.call_invites (callee_id, status);
create index if not exists call_invites_caller_idx on public.call_invites (caller_id, status);

create or replace function public.call_invites_before_update() returns trigger
language plpgsql as $$
begin
  new.caller_id := old.caller_id;
  new.callee_id := old.callee_id;
  new.room_code := old.room_code;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_call_invites_before_update on public.call_invites;
create trigger trg_call_invites_before_update
  before update on public.call_invites
  for each row execute function public.call_invites_before_update();

alter table public.call_invites enable row level security;

drop policy if exists call_invites_select on public.call_invites;
create policy call_invites_select on public.call_invites for select
  to authenticated using (caller_id = auth.uid() or callee_id = auth.uid());

drop policy if exists call_invites_insert on public.call_invites;
create policy call_invites_insert on public.call_invites for insert
  to authenticated with check (
    caller_id = auth.uid() and status = 'ringing' and public.are_friends(auth.uid(), callee_id)
  );

drop policy if exists call_invites_update on public.call_invites;
create policy call_invites_update on public.call_invites for update
  to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid())
  with check (caller_id = auth.uid() or callee_id = auth.uid());

-- ------------------------------------------------------------
-- REALTIME: cambios en vivo (respetan RLS)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','call_invites','friendships','channel_members','profiles'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Permisos base (anon no lee nada: todas las políticas son "to authenticated")
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
