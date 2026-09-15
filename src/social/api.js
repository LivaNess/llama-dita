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
export async function getMyProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  fail(error);
  return data;
}

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
    .select('id, username, display_name, status, last_seen_at')
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
    .select('id, status, requester_id, addressee_id, created_at, requester:profiles!friendships_requester_id_fkey(id, username, display_name, status, last_seen_at), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, status, last_seen_at)')
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
    .select('id, owner_id, name, kind, invite_code, room_code, created_at')
    .order('created_at', { ascending: true });
  fail(error);
  return data || [];
}

export async function createChannel(myId, name, kind) {
  const { data, error } = await supabase
    .from('channels')
    .insert({ owner_id: myId, name: name.trim(), kind })
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
    .select('user_id, role, profile:profiles(id, username, display_name, status, last_seen_at)')
    .eq('channel_id', channelId);
  fail(error);
  return data || [];
}

export async function addFriendToChannel(channelId, userId) {
  const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId });
  fail(error);
}

// ---------- Mensajes ----------
export async function listMessages(channelId, limit = 60) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, author_id, author:profiles(username, display_name)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);
  fail(error);
  return (data || []).reverse();
}

export async function sendMessage(channelId, myId, body) {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('messages').insert({ channel_id: channelId, author_id: myId, body: text });
  fail(error);
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

// ---------- Realtime (respeta RLS: solo llegan filas que podés ver) ----------
export function subscribe(name, handlers) {
  let ch = supabase.channel(name);
  for (const h of handlers) {
    ch = ch.on('postgres_changes', { event: h.event || '*', schema: 'public', table: h.table, ...(h.filter ? { filter: h.filter } : {}) }, h.cb);
  }
  ch.subscribe();
  return () => supabase.removeChannel(ch);
}
