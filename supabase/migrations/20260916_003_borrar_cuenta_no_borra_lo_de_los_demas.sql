-- 003 · Que borrar una cuenta no se lleve puesto el contenido de los demás
--
-- El problema, tal como estaba:
--   * `channels.owner_id` tenía borrado en cascada contra `profiles`. Si el dueño de un canal
--     borraba su cuenta, se borraba el canal, y como los mensajes cuelgan del canal en cascada,
--     se borraban TODOS los mensajes de TODOS los que hablaron ahí.
--   * `messages.author_id` tenía lo mismo. Si cualquiera borraba su cuenta, desaparecían todos
--     sus mensajes de todas las conversaciones, como si nunca hubiera hablado.
--
-- Nadie decidió eso: salió así de fábrica al escribir la migración 001.
--
-- Arreglo: esas dos columnas pasan a quedar en nulo cuando se borra el perfil, en vez de
-- arrastrar la fila. El canal sobrevive sin dueño y los mensajes sobreviven sin autor (la app
-- los muestra como "cuenta borrada").
--
-- Las otras siete claves foráneas del esquema se revisaron y están bien: amistades, membresías
-- de canal e invitaciones de llamada SÍ tienen que irse con la cuenta.
--
-- Nota para quien siga: mientras un canal esté sin dueño, nadie puede renombrarlo ni borrarlo,
-- porque esas políticas piden ser el dueño. El traspaso de dueño va con el trabajo de roles.

-- ------------------------------------------------------------
-- CANALES: el canal sobrevive al dueño
-- ------------------------------------------------------------
alter table public.channels alter column owner_id drop not null;

alter table public.channels drop constraint if exists channels_owner_id_fkey;
alter table public.channels add constraint channels_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete set null;

-- ------------------------------------------------------------
-- MENSAJES: el mensaje sobrevive al autor
-- ------------------------------------------------------------
alter table public.messages alter column author_id drop not null;

alter table public.messages drop constraint if exists messages_author_id_fkey;
alter table public.messages add constraint messages_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

-- La política de alta sigue exigiendo `author_id = auth.uid()`, así que nadie puede crear un
-- mensaje sin autor: el nulo solo puede aparecer cuando se borra una cuenta.
