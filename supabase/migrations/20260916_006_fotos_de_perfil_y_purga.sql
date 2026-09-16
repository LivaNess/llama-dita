-- ============================================================
-- Llama-dita · 006 · Fotos de perfil, y que lo borrado se borre de verdad
--
-- Dos cosas que van juntas y por eso viajan en la misma migración.
--
-- 1. FOTO DE PERFIL. Cada uno tiene la suya y la cambia cuando quiere. Vive en el mismo bucket
--    de objetos que los adjuntos del chat, con el mismo repartidor de permisos.
--
-- 2. QUE EL ARCHIVO VIEJO SE BORRE. Es la parte que importa y la que se olvida siempre. Si
--    cambiás la foto diez veces, las nueve viejas no le sirven a nadie: son bytes ocupando el
--    cupo para siempre. Acá el cambio de foto **encola la anterior** para borrarla, igual que
--    ya pasaba con las imágenes del chat.
--
--    Y como encolar sin vaciar la cola no borra nada, esta migración cierra el circuito: le da
--    al repartidor una forma de leer la cola, borrar los objetos de verdad y confirmar. El
--    repartidor lo hace solo cada media hora.
--
-- POR QUÉ NO SE USA LA LLAVE MAESTRA DE LA BASE. La cola no tiene políticas: desde la app no se
-- llega. La forma obvia de que el repartidor la lea sería darle la llave de servicio de
-- Supabase, pero esa llave abre **toda** la base sin pasar por ninguna política. En vez de eso
-- hay dos funciones que solo hacen lo suyo y piden un secreto propio: si ese secreto se filtra,
-- lo peor que se puede hacer es borrar archivos que ya estaban marcados para borrarse.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA FOTO DE PERFIL
-- ------------------------------------------------------------
-- `avatar_url` viene de la migración 001 y nunca se usó. No se toca acá (no se borra lo que no
-- se pidió borrar); la foto de verdad es `avatar_key`, que apunta al objeto en el bucket.
alter table public.profiles add column if not exists avatar_key text;

-- ------------------------------------------------------------
-- 2. CAMBIAR LA FOTO ENCOLA LA ANTERIOR
-- ------------------------------------------------------------
-- Se dispara al cambiar la foto y al borrar la cuenta. Es lo único que impide que el bucket se
-- llene de avatares que ya nadie mira.
create or replace function public.profiles_avatar_viejo_a_la_cola() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  viejo text := old.avatar_key;
  nuevo text := case when tg_op = 'DELETE' then null else new.avatar_key end;
begin
  if viejo is not null and viejo is distinct from nuevo then
    insert into public.objetos_a_borrar (object_key) values (viejo)
    on conflict (object_key) do nothing;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_profiles_avatar_viejo on public.profiles;
create trigger trg_profiles_avatar_viejo
  after update or delete on public.profiles
  for each row execute function public.profiles_avatar_viejo_a_la_cola();

-- ------------------------------------------------------------
-- 3. EL SECRETO DE LA PURGA
-- ------------------------------------------------------------
-- Tabla con las políticas activadas y **ninguna política escrita**: desde la app no se llega,
-- ni para leer. Solo la alcanzan las dos funciones de abajo, que corren con permisos propios.
create table if not exists public.config_privada (
  clave text primary key,
  valor text not null,
  creado_at timestamptz not null default now()
);
alter table public.config_privada enable row level security;

-- La base guarda el HASH del secreto, nunca el secreto. El repartidor lo manda en claro por
-- HTTPS y la base compara los hashes: si alguien llegara a leer esta tabla, no se lleva nada
-- con lo que pueda llamar a las funciones de abajo.
--
-- El valor se carga a mano una sola vez (no va escrito acá, por razones obvias):
--   insert into public.config_privada (clave, valor)
--   values ('purga_secreto_sha256', '<sha256 del secreto del Worker>');

create or replace function public.purga_secreto_ok(secreto text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select secreto is not null
     and encode(extensions.digest(secreto, 'sha256'), 'hex')
         = coalesce((select valor from public.config_privada where clave = 'purga_secreto_sha256'), '-')
$$;
-- Nadie la llama desde afuera: es la pieza que decide, y se usa solo desde las de abajo.
revoke execute on function public.purga_secreto_ok(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. VACIAR LA COLA DE VERDAD
-- ------------------------------------------------------------
-- El repartidor pide qué borrar, borra los objetos del bucket, y recién entonces confirma. Si
-- se corta en el medio, las filas siguen en la cola y se reintenta en la vuelta siguiente: es
-- preferible intentar borrar dos veces (que no hace nada) a perder el rastro de un archivo.
create or replace function public.tomar_objetos_a_borrar(secreto text, tope int default 100)
returns setof text
language plpgsql security definer set search_path = public as $$
begin
  if not public.purga_secreto_ok(secreto) then raise exception 'No.'; end if;
  return query
    select object_key from public.objetos_a_borrar
    order by pedido_at
    limit greatest(1, least(coalesce(tope, 100), 200));
end $$;

create or replace function public.confirmar_objetos_borrados(secreto text, claves text[])
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.purga_secreto_ok(secreto) then raise exception 'No.'; end if;
  delete from public.objetos_a_borrar where object_key = any(coalesce(claves, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.cuantos_objetos_esperan(secreto text)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.purga_secreto_ok(secreto) then raise exception 'No.'; end if;
  return (select count(*)::int from public.objetos_a_borrar);
end $$;

-- Las llama el repartidor sin sesión de nadie, así que van con el rol anónimo. Lo que las
-- protege es el secreto, no el rol.
grant execute on function public.tomar_objetos_a_borrar(text, int) to anon, authenticated;
grant execute on function public.confirmar_objetos_borrados(text, text[]) to anon, authenticated;
grant execute on function public.cuantos_objetos_esperan(text) to anon, authenticated;
