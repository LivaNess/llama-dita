// Modo admin, modo user y modo dev.
//
// Todos entran en modo normal. Solo los admins (tabla `admins` de la base: dantey24, liva y
// devliva) ven arriba a la derecha el botón "Modo admin". Adentro hay dos botones en el mismo
// lugar: "Modo user" (vuelve a la app común) y "Modo dev" (reabre la app en la versión de
// prueba, la que solo ven ustedes).
//
// Lo que manda es la base, no este archivo: el botón aparece si la base dice que sos admin, y
// cada cosa del panel vuelve a preguntarle (supabase/migrations/20260926_008_modo_admin.sql).
// Banear y cambiar mails lo hace la función de servidor `admin` (supabase/functions/admin).
//
// También vive acá el control de baneo para TODOS los usuarios: si te banean, tu app se entera
// al instante, te muestra el cartel y cierra la sesión.
//
// Todo lo que viene de la base (nombres, mails, mensajes) se pone como texto, nunca como HTML.

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../supabase/client.js';
import { APP_VERSION, CANAL, SITIO_DEV } from '../updater.js';
import { joinVoiceChannel } from '../social/panel.js';
import { joinChannelByCode } from '../social/api.js';

let hooks = {};
let miId = null;
let esAdmin = false;
let panelAbierto = false;
let pestana = 'usuarios';
let canalBaneo = null;
let ocupado = false;

const esEscritorio = () => typeof window.NL_PORT !== 'undefined';

// ---------- Helpers de DOM (todo por textContent) ----------
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'text') nodo.textContent = valor;
    else if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

const fecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const hace = (iso) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
};

const toast = (msg) => hooks.toast?.(msg);

// ---------- Arranque ----------
export function initModoAdmin(h = {}) {
  hooks = h;
  pintarBarra();
  if (CANAL === 'dev') document.body.classList.add('canal-dev');
  supabase.auth.getSession().then(({ data }) => alCambiarSesion(data?.session || null));
  supabase.auth.onAuthStateChange((_evento, session) => alCambiarSesion(session));
}

async function alCambiarSesion(session) {
  const id = session?.user?.id || null;
  if (id === miId) return;
  miId = id;
  esAdmin = false;
  cerrarPanel();
  vigilarBaneo();
  if (id) {
    try {
      const { data } = await supabase.rpc('soy_admin');
      esAdmin = data === true && miId === id;
    } catch (_) {
      esAdmin = false;
    }
  }
  pintarBarra();
}

// ---------- Baneo (vale para todos) ----------
function baneoVigente(fila) {
  return !!fila && (!fila.hasta || new Date(fila.hasta).getTime() > Date.now());
}

async function vigilarBaneo() {
  if (canalBaneo) {
    try { supabase.removeChannel(canalBaneo); } catch (_) {}
    canalBaneo = null;
  }
  if (!miId) return;
  const id = miId;
  try {
    const { data } = await supabase.from('bans').select('hasta, motivo').eq('user_id', id).maybeSingle();
    if (baneoVigente(data)) { mostrarBaneo(data); return; }
  } catch (_) {}
  canalBaneo = supabase
    .channel(`baneo-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bans', filter: `user_id=eq.${id}` }, (cambio) => {
      if (cambio.eventType !== 'DELETE' && baneoVigente(cambio.new)) mostrarBaneo(cambio.new);
    })
    .subscribe();
}

function mostrarBaneo(fila) {
  document.getElementById('cartelBaneo')?.remove();
  const hasta = fila?.hasta ? `Podés volver a entrar el ${fecha(fila.hasta)}.` : 'Es por tiempo indefinido.';
  const cartel = el('div', { id: 'cartelBaneo', class: 'cartel-baneo', role: 'alertdialog', 'aria-modal': 'true' },
    el('div', { class: 'cartel-baneo-caja' },
      el('h2', { text: 'Tu cuenta está suspendida' }),
      el('p', { text: hasta }),
      fila?.motivo ? el('p', { class: 'cartel-baneo-motivo', text: `Motivo: ${fila.motivo}` }) : null,
      el('button', { class: 'admin-btn', text: 'Entendido', onclick: () => cartel.remove() })
    )
  );
  document.body.append(cartel);
  hooks.alBanear?.();
  supabase.auth.signOut().catch(() => {});
}

// ---------- Botones de arriba a la derecha ----------
function pintarBarra() {
  let barra = document.getElementById('modoAdminBarra');
  if (!barra) {
    barra = el('div', { id: 'modoAdminBarra', class: 'modo-admin-barra' });
    document.body.append(barra);
  }
  barra.replaceChildren();
  const enDev = CANAL === 'dev';
  // En la versión dev la barra se muestra siempre (aunque se cierre la sesión), para que
  // nunca quede nadie trabado sin forma de volver a la versión de todos.
  const visible = esAdmin || enDev;
  const adminActivo = panelAbierto || enDev;
  document.body.classList.toggle('con-modo-admin', visible);
  document.body.classList.toggle('en-modo-admin', visible && adminActivo);
  if (!visible) { barra.hidden = true; return; }
  barra.hidden = false;

  if (enDev) {
    barra.append(el('span', { class: 'modo-dev-sello', title: `Estás en la versión de prueba ${APP_VERSION}`, text: 'DEV' }));
  }

  if (!adminActivo) {
    barra.append(el('button', { class: 'modo-btn', text: 'Modo admin', onclick: abrirPanel }));
    return;
  }
  if (esAdmin && !panelAbierto) {
    barra.append(el('button', { class: 'modo-btn', text: 'Panel', title: 'Abrir el panel admin', onclick: abrirPanel }));
  }
  barra.append(
    el('button', {
      class: 'modo-btn',
      text: 'Modo user',
      title: enDev ? 'Salir del modo admin y volver a la versión de todos' : 'Volver a la app común',
      onclick: salirDelModoAdmin,
    }),
    el('button', {
      class: 'modo-btn' + (enDev ? ' activo' : ''),
      text: enDev ? 'Salir del modo dev' : 'Entrar en versión dev',
      title: enDev ? 'Estás en la versión de prueba. Tocá para volver a la de todos.' : 'Abrir la versión de prueba (solo para admins)',
      onclick: alternarDev,
    })
  );
}

// Salir del modo admin también saca del modo dev: se vuelve a la versión de todos.
function salirDelModoAdmin() {
  if (CANAL === 'dev') { alternarDev(); return; }
  cerrarPanel();
}

// ---------- Panel ----------
function abrirPanel() {
  panelAbierto = true;
  pintarBarra();
  let panel = document.getElementById('panelAdmin');
  if (!panel) {
    panel = el('section', { id: 'panelAdmin', class: 'panel-admin', 'aria-label': 'Panel de admin' });
    (document.getElementById('appMainArea') || document.body).append(panel);
  }
  panel.hidden = false;
  pintarPanel();
}

function cerrarPanel() {
  panelAbierto = false;
  const panel = document.getElementById('panelAdmin');
  if (panel) panel.hidden = true;
  pintarBarra();
}

async function pintarPanel() {
  const panel = document.getElementById('panelAdmin');
  if (!panel || !panelAbierto) return;
  const pestanas = [['usuarios', 'Usuarios'], ['canales', 'Canales'], ['registro', 'Registro'], ['versiones', 'Versiones']];
  const cuerpo = el('div', { class: 'panel-admin-cuerpo' }, el('p', { class: 'admin-vacio', text: 'Cargando…' }));
  panel.replaceChildren(
    el('header', { class: 'panel-admin-cabeza' },
      el('h2', { text: 'Panel admin' }),
      el('nav', { class: 'panel-admin-pestanas' },
        pestanas.map(([clave, nombre]) => el('button', {
          class: 'admin-pestana' + (pestana === clave ? ' activa' : ''),
          text: nombre,
          onclick: () => { pestana = clave; pintarPanel(); },
        }))
      ),
      el('button', { class: 'admin-btn chico', text: 'Actualizar', onclick: pintarPanel })
    ),
    cuerpo
  );
  try {
    if (pestana === 'usuarios') await pintarUsuarios(cuerpo);
    else if (pestana === 'canales') await pintarCanales(cuerpo);
    else if (pestana === 'registro') await pintarRegistro(cuerpo);
    else pintarVersiones(cuerpo);
  } catch (e) {
    cuerpo.replaceChildren(el('p', { class: 'admin-error', text: e?.message || 'No se pudo cargar' }));
  }
}

async function rpc(nombre, args) {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data || [];
}

async function accionServidor(cuerpo) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Se cerró la sesión');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) throw new Error(json.error || `Error ${r.status}`);
  return json;
}

// ---------- Usuarios ----------
async function pintarUsuarios(cuerpo) {
  const usuarios = await rpc('admin_usuarios');
  const baneados = usuarios.filter((u) => u.baneado).length;
  const activos7 = usuarios.filter((u) => u.ultimo_ingreso && Date.now() - new Date(u.ultimo_ingreso).getTime() < 7 * 86400000).length;
  const buscador = el('input', { class: 'admin-buscar', type: 'search', placeholder: 'Buscar por nombre, usuario o mail' });
  const lista = el('div', { class: 'admin-lista' });

  const pintarLista = () => {
    const q = buscador.value.trim().toLowerCase();
    const filtrados = usuarios.filter((u) => !q || [u.username, u.display_name, u.email].some((x) => (x || '').toLowerCase().includes(q)));
    lista.replaceChildren(...filtrados.map(filaUsuario));
    if (!filtrados.length) lista.append(el('p', { class: 'admin-vacio', text: 'Nadie coincide con esa búsqueda.' }));
  };
  buscador.addEventListener('input', pintarLista);

  cuerpo.replaceChildren(
    el('div', { class: 'admin-resumen' },
      el('span', { text: `${usuarios.length} usuarios` }),
      el('span', { text: `${activos7} entraron en los últimos 7 días` }),
      el('span', { class: baneados ? 'rojo' : '', text: `${baneados} baneados` })
    ),
    buscador,
    lista
  );
  pintarLista();
}

function filaUsuario(u) {
  const acciones = el('div', { class: 'admin-acciones' });
  const zona = el('div', { class: 'admin-zona' });
  const fila = el('article', { class: 'admin-fila' + (u.baneado ? ' baneado' : '') },
    el('div', { class: 'admin-fila-principal' },
      el('div', { class: 'admin-quien' },
        el('strong', { text: u.display_name || u.username }),
        el('span', { class: 'admin-sub', text: `@${u.username}` }),
        u.es_admin ? el('span', { class: 'admin-etiqueta', text: 'admin' }) : null,
        u.baneado ? el('span', { class: 'admin-etiqueta rojo', text: u.baneado_hasta ? `baneado hasta ${fecha(u.baneado_hasta)}` : 'baneado para siempre' }) : null
      ),
      el('div', { class: 'admin-datos' },
        el('span', { title: 'Mail de la cuenta', text: u.email || '(sin mail)' }),
        el('span', { title: 'Alta', text: `alta ${fecha(u.creado)}` }),
        el('span', { title: 'Último ingreso con código', text: `ingresó ${hace(u.ultimo_ingreso)}` }),
        el('span', { title: 'Última vez visto en la app', text: `visto ${hace(u.visto)}` })
      ),
      acciones
    ),
    u.motivo_baneo && u.baneado ? el('p', { class: 'admin-sub', text: `Motivo: ${u.motivo_baneo}` }) : null,
    zona
  );

  if (!u.es_admin) {
    if (u.baneado) acciones.append(el('button', { class: 'admin-btn chico', text: 'Desbanear', onclick: () => desbanear(u) }));
    else acciones.append(el('button', { class: 'admin-btn chico peligro', text: 'Banear', onclick: () => formBaneo(u, zona) }));
  }
  acciones.append(el('button', { class: 'admin-btn chico', text: 'Cambiar mail', onclick: () => formMail(u, zona) }));
  return fila;
}

function formBaneo(u, zona) {
  const duracion = el('select', { class: 'admin-input' },
    el('option', { value: '1', text: '1 día' }),
    el('option', { value: '7', text: '1 semana' }),
    el('option', { value: 'siempre', text: 'Para siempre' })
  );
  const motivo = el('input', { class: 'admin-input', maxlength: '300', placeholder: 'Motivo (opcional, lo ve la persona)' });
  const confirmar = el('button', {
    class: 'admin-btn chico peligro',
    text: `Banear a @${u.username}`,
    onclick: async () => {
      if (ocupado) return;
      ocupado = true;
      confirmar.disabled = true;
      try {
        await accionServidor({ accion: 'banear', user_id: u.id, dias: duracion.value === 'siempre' ? null : Number(duracion.value), motivo: motivo.value.trim() || null });
        toast(`@${u.username} quedó baneado`);
        pintarPanel();
      } catch (e) {
        toast(e.message);
        confirmar.disabled = false;
      } finally {
        ocupado = false;
      }
    },
  });
  zona.replaceChildren(el('div', { class: 'admin-form' }, duracion, motivo, confirmar,
    el('button', { class: 'admin-btn chico', text: 'Cancelar', onclick: () => zona.replaceChildren() })));
}

async function desbanear(u) {
  if (ocupado) return;
  ocupado = true;
  try {
    await accionServidor({ accion: 'desbanear', user_id: u.id });
    toast(`@${u.username} puede volver a entrar`);
    pintarPanel();
  } catch (e) {
    toast(e.message);
  } finally {
    ocupado = false;
  }
}

function formMail(u, zona) {
  const input = el('input', { class: 'admin-input', type: 'email', placeholder: 'Mail nuevo', value: '' });
  const guardar = el('button', {
    class: 'admin-btn chico',
    text: 'Guardar mail',
    onclick: async () => {
      if (ocupado) return;
      const email = input.value.trim();
      if (!email) { input.focus(); return; }
      ocupado = true;
      guardar.disabled = true;
      try {
        await accionServidor({ accion: 'cambiar_email', user_id: u.id, email });
        toast(`@${u.username} ahora entra con ${email}`);
        pintarPanel();
      } catch (e) {
        toast(e.message);
        guardar.disabled = false;
      } finally {
        ocupado = false;
      }
    },
  });
  zona.replaceChildren(el('div', { class: 'admin-form' },
    el('span', { class: 'admin-sub', text: `Actual: ${u.email || '(sin mail)'}. Con el nuevo entra con el código que le llegue ahí.` }),
    input, guardar,
    el('button', { class: 'admin-btn chico', text: 'Cancelar', onclick: () => zona.replaceChildren() })));
  input.focus();
}

// ---------- Canales ----------
async function pintarCanales(cuerpo) {
  const canales = await rpc('admin_canales');
  const texto = canales.filter((c) => c.kind === 'text').length;
  const voz = canales.filter((c) => c.kind === 'voice').length;
  cuerpo.replaceChildren(
    el('div', { class: 'admin-resumen' },
      el('span', { text: `${canales.length} canales` }),
      el('span', { text: `${texto} de texto · ${voz} de voz` }),
      el('span', { class: 'admin-sub', text: 'Los chats privados no aparecen acá.' })
    ),
    el('div', { class: 'admin-lista' }, canales.map(filaCanal))
  );
  if (!canales.length) cuerpo.append(el('p', { class: 'admin-vacio', text: 'No hay canales todavía.' }));
}

function filaCanal(c) {
  const zona = el('div', { class: 'admin-zona' });
  const acciones = el('div', { class: 'admin-acciones' },
    el('button', { class: 'admin-btn chico', text: 'Ver adentro', onclick: () => verCanal(c, zona) })
  );
  if (c.kind === 'voice') {
    acciones.append(el('button', {
      class: 'admin-btn chico',
      text: 'Entrar a la voz',
      onclick: () => {
        joinVoiceChannel({ id: c.id, name: c.name, kind: c.kind, room_code: c.room_code, invite_code: c.invite_code });
        cerrarPanel();
      },
    }));
  }
  acciones.append(el('button', {
    class: 'admin-btn chico',
    text: 'Unirme',
    title: 'Te suma como miembro: el canal aparece en tu lista como cualquier otro',
    onclick: async () => {
      try {
        await joinChannelByCode(c.invite_code);
        toast(`Te uniste a #${c.name}`);
      } catch (e) {
        toast(e.message);
      }
    },
  }));
  return el('article', { class: 'admin-fila' },
    el('div', { class: 'admin-fila-principal' },
      el('div', { class: 'admin-quien' },
        el('strong', { text: c.kind === 'voice' ? `${c.name} · voz` : `#${c.name}` }),
        el('span', { class: 'admin-sub', text: `de @${c.dueno_username || '—'}` })
      ),
      el('div', { class: 'admin-datos' },
        el('span', { text: `${c.miembros} miembros` }),
        el('span', { text: `${c.mensajes} mensajes` }),
        el('span', { text: `último ${hace(c.ultimo_mensaje)}` }),
        el('span', { text: `creado ${fecha(c.creado)}` }),
        el('span', { title: 'Código de invitación', text: `código ${c.invite_code}` })
      ),
      acciones
    ),
    zona
  );
}

async function verCanal(c, zona) {
  zona.replaceChildren(el('p', { class: 'admin-vacio', text: 'Cargando…' }));
  try {
    const [miembros, mensajes] = await Promise.all([
      rpc('admin_miembros', { canal: c.id }),
      rpc('admin_mensajes', { canal: c.id, limite: 60 }),
    ]);
    zona.replaceChildren(
      el('div', { class: 'admin-miembros' },
        miembros.map((m) => el('span', { class: 'admin-chip', title: `desde ${fecha(m.desde)}`, text: `${m.display_name || m.username}${m.rol === 'owner' ? ' (dueño)' : ''}` }))
      ),
      el('div', { class: 'admin-mensajes' },
        mensajes.length
          ? mensajes.slice().reverse().map((m) => el('div', { class: 'admin-msg' },
              el('span', { class: 'admin-msg-hora', text: fecha(m.creado) }),
              el('strong', { text: m.autor_nombre || m.autor_username || 'cuenta borrada' }),
              el('span', { class: 'admin-msg-texto', text: m.body || '' }),
              m.editado ? el('span', { class: 'admin-sub', text: '(editado)' }) : null
            ))
          : el('p', { class: 'admin-vacio', text: c.kind === 'voice' ? 'Canal de voz sin mensajes.' : 'Sin mensajes.' })
      ),
      el('button', { class: 'admin-btn chico', text: 'Cerrar', onclick: () => zona.replaceChildren() })
    );
  } catch (e) {
    zona.replaceChildren(el('p', { class: 'admin-error', text: e.message }));
  }
}

// ---------- Registro ----------
async function pintarRegistro(cuerpo) {
  const filas = await rpc('admin_registro_lista', { limite: 200 });
  const nombres = { banear: 'baneó a', desbanear: 'desbaneó a', cambiar_email: 'le cambió el mail a' };
  cuerpo.replaceChildren(
    el('p', { class: 'admin-sub', text: 'Todo lo que hacen los admins queda anotado acá.' }),
    el('div', { class: 'admin-lista' },
      filas.length
        ? filas.map((r) => el('div', { class: 'admin-registro' },
            el('span', { class: 'admin-msg-hora', text: fecha(r.creado) }),
            el('span', { text: `@${r.admin_username || '—'} ${nombres[r.accion] || r.accion} @${r.objetivo_username || '—'}` }),
            el('span', { class: 'admin-sub', text: detalleRegistro(r) })
          ))
        : el('p', { class: 'admin-vacio', text: 'Todavía no hay nada anotado.' })
    )
  );
}

function detalleRegistro(r) {
  const d = r.detalle || {};
  if (r.accion === 'banear') return d.hasta ? `hasta ${fecha(d.hasta)}${d.motivo ? ` · ${d.motivo}` : ''}` : `para siempre${d.motivo ? ` · ${d.motivo}` : ''}`;
  if (r.accion === 'cambiar_email') return `${d.anterior || '—'} → ${d.nuevo || '—'}`;
  return '';
}

// ---------- Versiones y modo dev ----------
function pintarVersiones(cuerpo) {
  const estado = el('p', { class: 'admin-sub', text: 'Consultando la versión dev publicada…' });
  cuerpo.replaceChildren(
    el('div', { class: 'admin-resumen' },
      el('span', { text: `Estás usando: ${CANAL === 'dev' ? 'versión de prueba (dev)' : 'versión de todos (live)'}` }),
      el('span', { text: `v${APP_VERSION}` })
    ),
    el('p', { class: 'admin-sub', text: 'La versión dev la publican ustedes con "npm run publicar:dev". No le llega a nadie más: solo la abre quien toca "Entrar en versión dev", y la app queda en esa versión hasta tocar "Salir del modo dev" o "Modo user".' }),
    estado
  );
  leerManifiestoDev()
    .then((m) => { estado.textContent = `Versión dev publicada: v${m.version} (${fecha(m.data?.releasedAt)})`; })
    .catch(() => { estado.textContent = 'Todavía no hay ninguna versión dev publicada.'; });
}

async function leerManifiestoDev() {
  const r = await fetch(`${SITIO_DEV}/update-manifest.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const m = await r.json();
  if (!m?.version || !m?.sha256) throw new Error('manifiesto inválido');
  return m;
}

async function neutralino() {
  const lib = window.Neutralino || (await import('@neutralinojs/lib'));
  try { await lib.init?.(); } catch (_) { /* ya estaba iniciado */ }
  return lib;
}

// Las dos versiones conviven en la carpeta de la app: resources.neu es la que arranca y
// resources-live.neu guarda la de todos mientras se usa la dev. Cambiar de una a otra es el
// mismo mecanismo que ya usa el actualizador (pisar resources.neu y reiniciar).
// La app queda en la versión elegida hasta que se vuelve a tocar "Modo dev".
const PAQUETE = () => `${window.NL_PATH}/resources.neu`;
const RESGUARDO_LIVE = () => `${window.NL_PATH}/resources-live.neu`;

async function huellaDe(datos) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function volverALive(nl) {
  let datos = null;
  try { datos = await nl.filesystem.readBinaryFile(RESGUARDO_LIVE()); } catch (_) { datos = null; }
  if (!datos || datos.byteLength < 10000) {
    // Sin resguardo (por ejemplo, si se reinstaló): se baja la live publicada, con su huella.
    const m = await (await fetch(`https://llamadita.com.ar/update-manifest.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    const r = await fetch(`https://llamadita.com.ar/descargas/resources.neu?v=${encodeURIComponent(m.version)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`No pude bajar la versión de todos (HTTP ${r.status})`);
    datos = await r.arrayBuffer();
    if (!m.sha256 || (await huellaDe(datos)) !== m.sha256) throw new Error('La versión de todos no coincide con la publicada. No se cambió nada.');
  }
  await nl.filesystem.writeBinaryFile(PAQUETE(), datos);
  try { await nl.filesystem.remove(RESGUARDO_LIVE()); } catch (_) {}
  await nl.app.restartProcess();
}

async function pasarADev(nl) {
  const manifiesto = await leerManifiestoDev();
  const r = await fetch(`${SITIO_DEV}/resources.neu?v=${encodeURIComponent(manifiesto.version)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No pude bajar la versión dev (HTTP ${r.status})`);
  const datos = await r.arrayBuffer();
  if ((await huellaDe(datos)) !== manifiesto.sha256) throw new Error('La versión dev bajada no coincide con la publicada. No se cambió nada.');
  // Primero el resguardo de la live; si eso falla, no se toca nada.
  const live = await nl.filesystem.readBinaryFile(PAQUETE());
  await nl.filesystem.writeBinaryFile(RESGUARDO_LIVE(), live);
  await nl.filesystem.writeBinaryFile(PAQUETE(), datos);
  toast(`Abriendo la versión dev v${manifiesto.version}…`);
  await nl.app.restartProcess();
}

async function alternarDev() {
  if (!esEscritorio()) {
    toast('El modo dev funciona en la app de escritorio.');
    return;
  }
  if (ocupado) return;
  ocupado = true;
  try {
    const nl = await neutralino();
    if (CANAL === 'dev') {
      toast('Volviendo a la versión de todos…');
      await volverALive(nl);
    } else {
      toast('Bajando la versión dev…');
      await pasarADev(nl);
    }
  } catch (e) {
    toast(e.message || 'No se pudo cambiar de versión');
  } finally {
    ocupado = false;
  }
}
