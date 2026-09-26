-- ============================================================================================
-- 008 · Modo admin
--
-- Tres cuentas (dantey24, liva, devliva) pueden entrar en "modo admin" desde la app. Lo que
-- las hace admin vive ACÁ, en la base: el botón de la app solo aparece si la base dice que sí,
-- y cada cosa que hace el modo admin vuelve a preguntarle a la base. Tocar la pantalla no da
-- ningún permiso.
--
-- Decisiones:
--  1. Mirar como admin va por FUNCIONES, no por permisos generales sobre las tablas. Si los
--     admins pudieran leer todas las tablas, la suscripción en vivo a los mensajes les haría
--     sonar avisos de todos los canales de la plataforma aunque estén en modo normal.
--  2. Los chats privados (kind = 'dm') NO se ven nunca, ni siquiera como admin.
--  3. El baneo se hace cumplir con reglas RESTRICTIVAS: se suman a las que ya existen y solo
--     frenan a quien está baneado. Para todos los demás no cambia nada.
--  4. Banear la cuenta en Auth y cambiarle el mail necesitan la llave maestra, así que eso lo
--     hace la función de servidor `admin` (supabase/functions/admin). Esa función también
--     escribe en `bans` y en `admin_registro`.
-- ============================================================================================

-- ---------- Quién es admin ----------
create table if not exists public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.admins enable row level security;
-- Sin políticas a propósito: desde la app no se lee ni se escribe. Solo las funciones de abajo.

insert into public.admins (user_id) values
  ('8eb6dcf1-10de-4f35-a275-2b729917c67e'),  -- dantey24 (Martín)
  ('9550ef50-39fa-457d-afd6-16f2237aca4d'),  -- liva (Juan)
  ('b448ada7-c57b-41d4-a0c2-ef5c275c11bd')   -- devliva (Juan)
on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

-- La app pregunta esto para decidir si muestra el botón.
create or replace function public.soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
$$;

-- ---------- Baneos ----------
create table if not exists public.bans (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  hasta     timestamptz,                                   -- null = para siempre
  motivo    text check (motivo is null or char_length(motivo) <= 300),
  por       uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);
alter table public.bans enable row level security;

-- Cada uno puede ver SU propio baneo (la app lo usa para mostrar el cartel y cerrar sesión).
drop policy if exists bans_select_propio on public.bans;
create policy bans_select_propio on public.bans for select
  to authenticated using (user_id = auth.uid());

create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bans b
    where b.user_id = auth.uid() and (b.hasta is null or b.hasta > now())
  )
$$;

-- Reglas restrictivas: un baneado no lee, no escribe, no entra ni invita a nada.
do $$
declare t text;
begin
  foreach t in array array[
    'messages', 'reactions', 'attachments', 'message_tombstones',
    'channels', 'channel_members', 'spaces', 'space_members',
    'friendships', 'call_invites'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_sin_baneados', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (not public.is_banned()) with check (not public.is_banned())',
      t || '_sin_baneados', t
    );
  end loop;
end $$;

-- En vivo: al banear a alguien, su app se entera al instante y cierra la sesión.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bans'
  ) then
    alter publication supabase_realtime add table public.bans;
  end if;
end $$;

-- ---------- Registro de lo que hacen los admins ----------
create table if not exists public.admin_registro (
  id        bigint generated always as identity primary key,
  admin_id  uuid references auth.users(id) on delete set null,
  accion    text not null,
  objetivo  uuid,
  detalle   jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
alter table public.admin_registro enable row level security;
-- Sin políticas: lo escribe la función de servidor y se lee con admin_registro_lista().

-- ---------- Lo que ve el modo admin ----------
create or replace function public.admin_usuarios()
returns table (
  id uuid, username text, display_name text, avatar_key text, email text,
  creado timestamptz, ultimo_ingreso timestamptz, visto timestamptz,
  baneado_hasta timestamptz, baneado boolean, motivo_baneo text, es_admin boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins' using errcode = '42501'; end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_key, u.email::text,
           p.created_at, u.last_sign_in_at, p.last_seen_at,
           b.hasta,
           (b.user_id is not null and (b.hasta is null or b.hasta > now())),
           b.motivo,
           exists (select 1 from public.admins a where a.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.bans b on b.user_id = p.id
    order by p.created_at desc;
end $$;

create or replace function public.admin_canales()
returns table (
  id uuid, name text, kind text, invite_code text, room_code text, creado timestamptz,
  dueno_username text, dueno_nombre text, miembros bigint, mensajes bigint, ultimo_mensaje timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins' using errcode = '42501'; end if;
  return query
    select c.id, c.name, c.kind, c.invite_code, c.room_code, c.created_at,
           o.username, o.display_name,
           (select count(*) from public.channel_members m where m.channel_id = c.id),
           (select count(*) from public.messages x where x.channel_id = c.id),
           (select max(x.created_at) from public.messages x where x.channel_id = c.id)
    from public.channels c
    left join public.profiles o on o.id = c.owner_id
    where c.kind <> 'dm'
    order by c.created_at desc;
end $$;

create or replace function public.admin_miembros(canal uuid)
returns table (user_id uuid, username text, display_name text, avatar_key text, rol text, desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins' using errcode = '42501'; end if;
  if exists (select 1 from public.channels c where c.id = canal and c.kind = 'dm') then
    raise exception 'Los chats privados no se ven' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.username, p.display_name, p.avatar_key, m.role, m.joined_at
    from public.channel_members m
    join public.profiles p on p.id = m.user_id
    where m.channel_id = canal
    order by m.joined_at;
end $$;

create or replace function public.admin_mensajes(canal uuid, antes timestamptz default null, limite int default 60)
returns table (id bigint, autor_id uuid, autor_username text, autor_nombre text, body text,
               creado timestamptz, editado timestamptz, fijado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins' using errcode = '42501'; end if;
  if not exists (select 1 from public.channels c where c.id = canal and c.kind <> 'dm') then
    raise exception 'Los chats privados no se ven' using errcode = '42501';
  end if;
  return query
    select x.id, x.author_id, p.username, p.display_name, x.body, x.created_at, x.edited_at, x.fijado
    from public.messages x
    left join public.profiles p on p.id = x.author_id
    where x.channel_id = canal and (antes is null or x.created_at < antes)
    order by x.created_at desc
    limit least(greatest(coalesce(limite, 60), 1), 200);
end $$;

create or replace function public.admin_registro_lista(limite int default 100)
returns table (id bigint, admin_username text, accion text, objetivo_username text, detalle jsonb, creado timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins' using errcode = '42501'; end if;
  return query
    select r.id, a.username, r.accion, o.username, r.detalle, r.creado_en
    from public.admin_registro r
    left join public.profiles a on a.id = r.admin_id
    left join public.profiles o on o.id = r.objetivo
    order by r.creado_en desc
    limit least(greatest(coalesce(limite, 100), 1), 500);
end $$;

-- ---------- Quién puede llamar a qué ----------
do $$
declare f text;
begin
  foreach f in array array[
    'is_admin()', 'soy_admin()', 'is_banned()',
    'admin_usuarios()', 'admin_canales()', 'admin_miembros(uuid)',
    'admin_mensajes(uuid, timestamptz, int)', 'admin_registro_lista(int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
