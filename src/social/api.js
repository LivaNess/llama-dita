import { supabase } from '../supabase/client.js';

// Todas las lecturas/escrituras pasan por RLS: cada usuario solo ve lo suyo.

function fail(error) {
  if (!error) return;
  const m = (error.message || '').toLowerCase();
  if (m.includes('duplicate') || m.includes('unique')) throw new Error('Ya existe.');
  if (m.includes('row-level security')) throw new Error('No tenés permiso para eso.');
  throw new Error(error.message || 'Error inesperado');
}

// ---------- Perfil ----------
export async function getProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  fail(error);
  return data;
}

export const getMyProfile = getProfile;

export async function updateMyProfile(uid, patch) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select().single();
  fail(error);
  return data;
}

export async function setStatus(uid, status) {
  await supabase.from('profiles').update({ status, last_seen_at: new Date().toISOString() }).eq('id', uid);
}

export async function searchUsers(q, excludeId) {
  const term = q.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, status, last_seen_at, avatar_key')
    .ilike('username', `%${term}%`)
    .neq('id', excludeId)
    .limit(8);
  fail(error);
  return data || [];
}

// ---------- Amigos ----------
export async function listFriendships() {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id, addressee_id, created_at, requester:profiles!friendships_requester_id_fkey(id, username, display_name, status, last_seen_at, avatar_key, created_at), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, status, last_seen_at, avatar_key, created_at)')
    .neq('status', 'blocked')
    .order('created_at', { ascending: false });
  fail(error);
  return data || [];
}

export async function sendFriendRequest(myId, targetId) {
  const { error } = await supabase.from('friendships').insert({ requester_id: myId, addressee_id: targetId });
  if (error && (error.message || '').toLowerCase().includes('unique')) throw new Error('Ya hay una solicitud o amistad con esa persona.');
  fail(error);
}

export async function acceptFriendRequest(id) {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
  fail(error);
}

export async function removeFriendship(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  fail(error);
}

// ---------- Canales ----------
export async function listChannels() {
  const { data, error } = await supabase
    .from('channels')
    .select('id, owner_id, name, kind, invite_code, room_code, created_at, space_id, dm_key')
    .neq('kind', 'dm')
    .order('created_at', { ascending: true });
  fail(error);
  return data || [];
}

// Los canales nacen en el espacio de la casa. Es un solo espacio y no se muestra en la
// pantalla, pero las tablas ya saben de su existencia: el día que haya varios, no hay que
// migrar mensajes que ya existen.
export const ESPACIO_CASA = '00000000-0000-0000-0000-000000000001';

export async function createChannel(myId, name, kind) {
  const { data, error } = await supabase
    .from('channels')
    .insert({ owner_id: myId, name: name.trim(), kind, space_id: ESPACIO_CASA })
    .select()
    .single();
  fail(error);
  return data;
}

export async function joinChannelByCode(code) {
  const { data, error } = await supabase.rpc('join_channel_by_code', { code });
  fail(error);
  return data;
}

export async function deleteChannel(id) {
  const { error } = await supabase.from('channels').delete().eq('id', id);
  fail(error);
}

export async function leaveChannel(channelId, myId) {
  const { error } = await supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', myId);
  fail(error);
}

export async function listMembers(channelId) {
  const { data, error } = await supabase
    .from('channel_members')
    .select('user_id, role, profile:profiles(id, username, display_name, status, last_seen_at, avatar_key)')
    .eq('channel_id', channelId);
  fail(error);
  return data || [];
}

export async function addFriendToChannel(channelId, userId) {
  const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId });
  fail(error);
}

// ---------- Chat privado con un amigo ----------
// El servidor comprueba que sean amigos y devuelve la conversación, creándola si es la
// primera vez. Una sola por par de personas, aunque los dos la abran en el mismo instante.
export async function abrirChatDirecto(otroId) {
  const { data, error } = await supabase.rpc('abrir_chat_directo', { otro: otroId });
  fail(error);
  return data;
}

// ---------- Mensajes ----------
// Los adjuntos viajan pegados al mensaje: una consulta en vez de dos.
const CAMPOS_ADJUNTO = 'id, object_key, nombre, mime, bytes, ancho, alto';
const CAMPOS_MENSAJE = `id, body, created_at, updated_at, edited_at, author_id, client_id, reply_to, fijado, author:profiles!messages_author_id_fkey(username, display_name, avatar_key), adjuntos:attachments(${CAMPOS_ADJUNTO}), reacciones:reactions(emoji, user_id)`;

// Primera vez en un canal: se baja un pedazo de historial y listo. De ahí en adelante manda
// `sincronizarCanal`, que pide solo lo que cambió.
export async function listMessages(channelId, limit = 200) {
  const { data, error } = await supabase
    .from('messages')
    .select(CAMPOS_MENSAJE)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);
  fail(error);
  return (data || []).reverse();
}

// El corazón del historial barato: en vez de bajar los últimos 60 mensajes cada vez que abrís
// un canal, se le pregunta al servidor "¿qué cambió desde tal momento?". Dos consultas cortas
// que casi siempre vuelven vacías: una por lo nuevo o editado, otra por lo borrado.
//
// `desde` se pide siempre 30 segundos para atrás a propósito (ver SOLAPE_MS en cacheLocal.js):
// bajás un puñado de mensajes repetidos, que se descartan por identificador, y a cambio no se
// pierde ninguno por la forma en que Postgres asigna las horas.
export async function sincronizarCanal(channelId, desde, solapeMs = 30000) {
  if (!desde) {
    const mensajes = await listMessages(channelId);
    return { mensajes, lapidas: [], completo: true };
  }
  const corte = new Date(new Date(desde).getTime() - solapeMs).toISOString();
  const [nuevos, borrados] = await Promise.all([
    supabase.from('messages').select(CAMPOS_MENSAJE).eq('channel_id', channelId).gte('updated_at', corte).order('created_at', { ascending: true }).limit(500),
    supabase.from('message_tombstones').select('message_id, deleted_at').eq('channel_id', channelId).gte('deleted_at', corte)
  ]);
  fail(nuevos.error);
  fail(borrados.error);
  return { mensajes: nuevos.data || [], lapidas: borrados.data || [], completo: false };
}

export async function sendMessage(channelId, myId, body, clientId, replyTo) {
  const text = body.trim();
  if (!text) return;
  // El identificador lo pone el cliente: si la red corta y el mensaje se reenvía, entra una
  // sola vez en lugar de aparecer duplicado.
  const fila = { channel_id: channelId, author_id: myId, body: text, client_id: clientId || crearId() };
  if (replyTo) fila.reply_to = replyTo;
  const { error } = await supabase.from('messages').insert(fila);
  if (error && (error.message || '').toLowerCase().includes('duplicate')) return; // ya había entrado
  fail(error);
}

// Mandar un mensaje con archivos. Va por una función del servidor y no por dos altas sueltas
// porque tiene que ser todo o nada: si el archivo no queda anotado, tampoco queda el mensaje.
export async function enviarConArchivos(channelId, body, archivos, clientId) {
  const { data, error } = await supabase.rpc('enviar_con_archivos', {
    canal: channelId,
    texto: (body || '').trim(),
    id_cliente: clientId || crearId(),
    archivos
  });
  fail(error);
  return data;
}

// Los adjuntos de un mensaje que llegó en vivo: el aviso de tiempo real trae la fila del
// mensaje pelada, sin lo que cuelga de ella.
export async function adjuntosDe(messageId) {
  const { data, error } = await supabase
    .from('attachments')
    .select(CAMPOS_ADJUNTO)
    .eq('message_id', messageId);
  fail(error);
  return data || [];
}

// ---------- Comodidades ----------
export async function reaccionar(messageId, channelId, myId, emoji) {
  const { error } = await supabase.from('reactions').insert({ message_id: messageId, channel_id: channelId, user_id: myId, emoji });
  // Reaccionar dos veces con lo mismo no es un error: es que ya estaba.
  if (error && (error.message || '').toLowerCase().includes('duplicate')) return;
  fail(error);
}

export async function sacarReaccion(messageId, myId, emoji) {
  const { error } = await supabase.from('reactions').delete().eq('message_id', messageId).eq('user_id', myId).eq('emoji', emoji);
  fail(error);
}

export async function reaccionesDe(messageId) {
  const { data, error } = await supabase.from('reactions').select('emoji, user_id').eq('message_id', messageId);
  fail(error);
  return data || [];
}

export async function fijarMensaje(id, valor) {
  const { error } = await supabase.rpc('fijar_mensaje', { mensaje: id, valor });
  fail(error);
}

// ---------- Buscador ----------
// Solo para lo que nunca bajaste a esta PC: lo de todos los días lo resuelve la caché local
// sin tocar la red. Corre con tu sesión, así que encuentra solo donde podés ver.
export async function buscarEnElServidor(termino, channelId) {
  const t = (termino || '').trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase.rpc('buscar_mensajes', { termino: t, canal: channelId || null, tope: 50 });
  fail(error);
  return data || [];
}

// ---------- Retención ----------
export async function definirRetencion(channelId, textoDias, adjuntosDias) {
  const { error } = await supabase.rpc('definir_retencion', {
    canal: channelId,
    texto_dias: textoDias ?? null,
    adjuntos_dias: adjuntosDias ?? 90
  });
  fail(error);
}

export async function editMessage(id, body) {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('messages').update({ body: text }).eq('id', id);
  fail(error);
}

// Borrado duro: la fila se va de verdad, no queda marcada como borrada. Lo que queda es una
// lápida de unos 40 bytes, que es lo que le avisa al que estaba desconectado.
export async function deleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  fail(error);
}

// "Borrarlo para los dos" en un chat privado: solo alcanza lo que escribiste vos. Si alcanzara
// lo del otro, cualquiera podría borrar la conversación ajena.
export async function deleteMyMessages(channelId, myId) {
  const { error } = await supabase.from('messages').delete().eq('channel_id', channelId).eq('author_id', myId);
  fail(error);
}

export function crearId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- Llamadas directas ----------
export async function createCallInvite(myId, calleeId, roomCode) {
  const { data, error } = await supabase
    .from('call_invites')
    .insert({ caller_id: myId, callee_id: calleeId, room_code: roomCode })
    .select()
    .single();
  fail(error);
  return data;
}

export async function updateCallInvite(id, status) {
  const { error } = await supabase.from('call_invites').update({ status }).eq('id', id);
  fail(error);
}

// ---------- "Está escribiendo" ----------
// Va por aviso suelto (broadcast) y no por la base: un mensaje que se empieza a escribir y se
// descarta no tiene por qué dejar una fila en ningún lado.
//
// Es la función con peor relación entre lo que aporta y lo que gasta del cupo común, así que
// el cuentagotas y las demás reglas viven en `panel.js`, donde se decide **cuándo** avisar.
export function canalDeEscritura(channelId, alEscribir) {
  const ch = supabase.channel('escribiendo-' + channelId, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'escribiendo' }, (m) => alEscribir(m.payload));
  ch.subscribe();
  return {
    avisar: (payload) => ch.send({ type: 'broadcast', event: 'escribiendo', payload }),
    cerrar: () => supabase.removeChannel(ch)
  };
}

// ---------- Realtime (respeta RLS: solo llegan filas que podés ver) ----------
export function subscribe(name, handlers) {
  let ch = supabase.channel(name);
  for (const h of handlers) {
    ch = ch.on('postgres_changes', { event: h.event || '*', schema: 'public', table: h.table, ...(h.filter ? { filter: h.filter } : {}) }, h.cb);
  }
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}
