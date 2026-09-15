import { supabase } from '../supabase/client.js';

// Sesión actual (null si no hay)
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// Paso 1: mandar el mail con enlace + código (sin contraseñas)
export async function sendCode(email) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Escribí un mail válido');
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error) throw translate(error);
  return clean;
}

// Paso 2: validar lo que llegó por mail. Acepta:
//  - el código numérico (6 dígitos)
//  - el enlace completo pegado (útil en la app de escritorio, donde el link abre el navegador)
export async function verifyCode(email, input) {
  const v = (input || '').trim();
  let params = null;

  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const tokenHash = u.searchParams.get('token');
      const type = u.searchParams.get('type') || 'magiclink';
      if (tokenHash) params = { token_hash: tokenHash, type };
    } catch (_) { /* no era una URL válida */ }
  }

  if (!params) {
    const digits = v.replace(/\D/g, '');
    if (digits.length >= 6) params = { email, token: digits, type: 'email' };
  }

  if (!params) throw new Error('Pegá el código del mail o el enlace completo');

  const { data, error } = await supabase.auth.verifyOtp(params);
  if (error) throw translate(error);
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

function translate(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('rate limit') || m.includes('too many')) return new Error('Demasiados intentos. Esperá unos minutos y volvé a probar.');
  if (m.includes('expired')) return new Error('El código venció. Pedí uno nuevo.');
  if (m.includes('invalid') || m.includes('token')) return new Error('Código o enlace incorrecto.');
  return new Error(error?.message || 'Error inesperado');
}
