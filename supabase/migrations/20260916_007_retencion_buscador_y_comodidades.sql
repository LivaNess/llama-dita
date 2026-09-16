-- ============================================================
-- Llama-dita · 007 · Lo que le falta al tronco del chat
--
-- Cierra los pasos 4, 5 y 6 de `areas/chat-e-historial.md` en un solo cambio de esquema, que
-- es la regla del área: un esqueleto de una vez en lugar de cinco parches.
--
--   4. RETENCIÓN. Hasta acá, el costo del chat crecía solo y para siempre. Ahora cada canal
--      dice cuánto guarda, y hay una purga que borra lo vencido. El texto y los adjuntos
--      vencen por separado a propósito: el texto es barato y lo querés tener, las imágenes son
--      el volumen. Por defecto el texto queda para siempre y los adjuntos 90 días, que es la
--      decisión de Martín del 16/09/2026.
--
--   5. BUSCADOR. Del lado del servidor, para lo que nunca bajaste a esta PC. Lo de todos los
--      días lo resuelve la caché local sin tocar la red.
--
--   6. COMODIDADES. Responder a un mensaje, fijarlo y reaccionarle. Las tres cuelgan del
--      esqueleto que ya estaba y no tocan nada de abajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COMODIDADES
-- ------------------------------------------------------------
-- Si borrás el mensaje al que alguien respondió, la respuesta NO se borra en cascada: quedaría
-- borrando conversación ajena. La respuesta queda mostrando "el mensaje al que respondía ya no
-- está", que es lo honesto.
alter table public.messages add column if not exists reply_to bigint references public.messages(id) on delete set null;
alter table public.messages add column if not exists fijado boolean not null default false;
create index if not exists messages_reply_idx on public.messages (reply_to) where reply_to is not null;
create index if not exists messages_fijados_idx on public.messages (channel_id) where fijado;

create table if not exists public.reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  -- El canal va repetido acá a propósito: es lo que deja filtrar el aviso en vivo por canal y
  -- lo que usan las políticas sin tener que salir a buscar el mensaje.
  channel_id uuid   not null references public.channels(id) on delete cascade,
  emoji      text   not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists reactions_channel_idx on public.reactions (channel_id, created_at);

alter table public.reactions enable row level security;

drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select
  to authenticated using (public.is_channel_member(channel_id));

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert
  to authenticated with check (
    user_id = auth.uid()
    and public.is_channel_member(channel_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.channel_id = reactions.channel_id)
  );

-- Cada uno saca la suya. Nadie saca la de otro, ni el dueño del canal.
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete
  to authenticated using (user_id = auth.uid());

-- Fijar es cosa del dueño del canal; en un privado, de cualquiera de los dos. Va por función
-- porque la política de cambio de `messages` solo deja al autor tocar su mensaje.
create or replace function public.fijar_mensaje(mensaje bigint, valor boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select channel_id into c from public.messages where id = mensaje;
  if c is null then raise exception 'Ese mensaje no existe.'; end if;
  if not public.is_channel_member(c) then raise exception 'No estás en ese canal.'; end if;
  if not (public.es_directo(c) or public.is_channel_owner(c)) then
    raise exception 'Solo el dueño del canal puede fijar mensajes.';
  end if;
  update public.messages set fijado = coalesce(valor, false) where id = mensaje;
end $$;
grant execute on function public.fijar_mensaje(bigint, boolean) to authenticated;

-- El disparador que protege los mensajes: ahora también blinda a quién le respondía, para que
-- editar un mensaje no pueda reapuntar la respuesta a otra cosa.
create or replace function public.messages_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.channel_id := old.channel_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.client_id := old.client_id;
    new.reply_to := old.reply_to;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------
-- 2. EL BUSCADOR
-- ------------------------------------------------------------
-- `ilike` con un índice de trigramas alcanza y sobra a esta escala, y encuentra pedazos de
-- palabra ("garch" encuentra "garchar"), que es como busca la gente de verdad. La búsqueda de
-- libro por palabras completas no serviría para eso.
create extension if not exists pg_trgm with schema extensions;
create index if not exists messages_body_trgm_idx on public.messages using gin (body extensions.gin_trgm_ops);

-- Corre con TU sesión (security invoker), así que solo encuentra donde podés ver. Verificado:
-- un usuario ajeno al canal recibe cero resultados.
create or replace function public.buscar_mensajes(termino text, canal uuid default null, tope int default 50)
returns setof public.messages
language sql stable security invoker set search_path = public as $$
  select m.* from public.messages m
  where char_length(coalesce(termino, '')) >= 2
    and m.body ilike '%' || termino || '%'
    and (canal is null or m.channel_id = canal)
  order by m.created_at desc
  limit greatest(1, least(coalesce(tope, 50), 200))
$$;
grant execute on function public.buscar_mensajes(text, uuid, int) to authenticated;

-- ------------------------------------------------------------
-- 3. RETENCIÓN
-- ------------------------------------------------------------
create or replace function public.definir_retencion(canal uuid, texto_dias int, adjuntos_dias int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_channel_member(canal) then raise exception 'No estás en ese canal.'; end if;
  if not (public.es_directo(canal) or public.is_channel_owner(canal)) then
    raise exception 'Solo el dueño del canal puede cambiar esto.';
  end if;
  if texto_dias is not null and texto_dias < 1 then raise exception 'El mínimo es un día.'; end if;
  if adjuntos_dias is not null and adjuntos_dias < 1 then raise exception 'El mínimo es un día.'; end if;
  update public.channels
     set retencion_texto_dias = texto_dias,
         retencion_adjuntos_dias = coalesce(adjuntos_dias, 90)
   where id = canal;
end $$;
grant execute on function public.definir_retencion(uuid, int, int) to authenticated;

-- La purga de lo vencido, que llama el repartidor con su secreto igual que la de objetos.
--
-- Son dos pasos y no uno porque borran cosas distintas: borrar un adjunto vencido **no** borra
-- su mensaje. Queda el texto y se va la foto, que es lo que hace que un canal con "texto para
-- siempre y adjuntos 90 días" signifique algo.
--
-- Los adjuntos borrados encolan su objeto solos (disparador de la migración 005) y los
-- mensajes borrados dejan su lápida sola (migración 004). Acá no hay que acordarse de nada.
create or replace function public.purgar_vencidos(secreto text, tope int default 500)
returns table (adjuntos_borrados int, mensajes_borrados int)
language plpgsql security definer set search_path = public as $$
declare a int; m int;
begin
  if not public.purga_secreto_ok(secreto) then raise exception 'No.'; end if;

  with vencidos as (
    select at.id from public.attachments at
    join public.channels ch on ch.id = at.channel_id
    where ch.retencion_adjuntos_dias is not null
      and at.created_at < now() - (ch.retencion_adjuntos_dias || ' days')::interval
    limit greatest(1, least(coalesce(tope, 500), 2000))
  )
  delete from public.attachments where id in (select id from vencidos);
  get diagnostics a = row_count;

  with vencidos as (
    select ms.id from public.messages ms
    join public.channels ch on ch.id = ms.channel_id
    where ch.retencion_texto_dias is not null
      and ms.created_at < now() - (ch.retencion_texto_dias || ' days')::interval
    limit greatest(1, least(coalesce(tope, 500), 2000))
  )
  delete from public.messages where id in (select id from vencidos);
  get diagnostics m = row_count;

  return query select a, m;
end $$;
grant execute on function public.purgar_vencidos(text, int) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. TIEMPO REAL
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reactions') then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;
