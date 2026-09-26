// Función de servidor del modo admin (ver supabase/migrations/20260926_008_modo_admin.sql).
//
// Hace lo único que el modo admin no puede hacer desde la app: tocar cuentas de Auth, que
// requiere la llave maestra. La llave maestra vive acá (Supabase la pone sola en el entorno)
// y nunca viaja a la app.
//
// Acciones (POST, cuerpo JSON):
//   { accion: 'banear',        user_id, dias: 1 | 7 | null (para siempre), motivo? }
//   { accion: 'desbanear',     user_id }
//   { accion: 'cambiar_email', user_id, email }
//
// Cada pedido comprueba que quien llama esté en la tabla `admins`. Todo queda en `admin_registro`.
//
// Se publica con verify_jwt en false: el control de la puerta de Supabase solo entiende el
// formato viejo de sesión. La sesión se verifica acá adentro con auth.getUser(), que sirve
// para los dos formatos.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// La app de escritorio corre en un puerto que cambia en cada arranque: no hay un origen fijo que
// permitir. No hace falta: el permiso lo da el token del admin, que el navegador no manda solo.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return responder({ error: 'Falta la sesión' }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: quien, error: errQuien } = await sb.auth.getUser(jwt);
  if (errQuien || !quien?.user) return responder({ error: 'Sesión inválida' }, 401);
  const adminId = quien.user.id;

  const { data: esAdmin } = await sb.from('admins').select('user_id').eq('user_id', adminId).maybeSingle();
  if (!esAdmin) return responder({ error: 'Solo para admins' }, 403);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: 'Pedido mal armado' }, 400);
  }

  const accion = String(cuerpo.accion || '');
  const userId = String(cuerpo.user_id || '');
  if (!UUID.test(userId)) return responder({ error: 'Usuario inválido' }, 400);

  const { data: objetivo, error: errObjetivo } = await sb.auth.admin.getUserById(userId);
  if (errObjetivo || !objetivo?.user) return responder({ error: 'Ese usuario no existe' }, 404);

  const registrar = (detalle: Record<string, unknown>) =>
    sb.from('admin_registro').insert({ admin_id: adminId, accion, objetivo: userId, detalle });

  if (accion === 'banear') {
    const { data: objetivoEsAdmin } = await sb.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (objetivoEsAdmin) return responder({ error: 'No se puede banear a un admin' }, 400);

    const dias = cuerpo.dias === null || cuerpo.dias === undefined ? null : Number(cuerpo.dias);
    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 3650)) {
      return responder({ error: 'Duración inválida' }, 400);
    }
    const motivo = cuerpo.motivo ? String(cuerpo.motivo).slice(0, 300) : null;
    const hasta = dias === null ? null : new Date(Date.now() + dias * 86400000).toISOString();

    // Primero la base (corta el acceso al instante y avisa a su app), después la cuenta.
    const { error: errBan } = await sb.from('bans').upsert({ user_id: userId, hasta, motivo, por: adminId, creado_en: new Date().toISOString() });
    if (errBan) return responder({ error: 'No se pudo guardar el baneo' }, 500);

    const { error: errAuth } = await sb.auth.admin.updateUserById(userId, {
      ban_duration: dias === null ? '876000h' : `${dias * 24}h`,
    });
    if (errAuth) return responder({ error: 'Quedó bloqueado en la app, pero no se pudo bloquear la cuenta: ' + errAuth.message }, 500);

    await registrar({ dias, hasta, motivo });
    return responder({ ok: true, hasta });
  }

  if (accion === 'desbanear') {
    await sb.from('bans').delete().eq('user_id', userId);
    const { error: errAuth } = await sb.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (errAuth) return responder({ error: 'No se pudo desbloquear la cuenta: ' + errAuth.message }, 500);
    await registrar({});
    return responder({ ok: true });
  }

  if (accion === 'cambiar_email') {
    const email = String(cuerpo.email || '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return responder({ error: 'Ese mail no es válido' }, 400);
    const anterior = objetivo.user.email || null;
    if (anterior === email) return responder({ error: 'Ya tiene ese mail' }, 400);

    // email_confirm: el admin da fe del mail nuevo; la persona entra con el código que le llega ahí.
    const { error: errMail } = await sb.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (errMail) {
      const yaUsado = /already|registered|exists/i.test(errMail.message);
      return responder({ error: yaUsado ? 'Ese mail ya lo usa otra cuenta' : 'No se pudo cambiar el mail: ' + errMail.message }, 400);
    }
    await registrar({ anterior, nuevo: email });
    return responder({ ok: true, email });
  }

  return responder({ error: 'Acción desconocida' }, 400);
});
