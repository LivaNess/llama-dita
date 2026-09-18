// Puente entre el enlace del mail y la app de escritorio.
//
// Supabase verifica el enlace y manda acá con los tokens en el # de la dirección.
// Desde acá se intenta abrir la app de dos maneras:
//   1. Saltando al esquema llamadita:// (funciona si el navegador lo permite).
//   2. Copiando ese mismo enlace al portapapeles: la app, si está abierta, lo
//      detecta sola y entra. Este camino no depende del navegador.
const APP = 'llamadita://auth';

const estado = document.getElementById('estado');
const btn = document.getElementById('btnAbrir');

const fragmento = (location.hash || '').replace(/^#/, '');
const params = new URLSearchParams(fragmento);
const error = params.get('error_description') || params.get('error');
const destino = `${APP}#${fragmento}`;

function avisar(texto) { estado.textContent = texto; }

async function copiar() {
  try {
    await navigator.clipboard.writeText(destino);
    return true;
  } catch (_) {
    // Sin permiso de portapapeles: se usa el método viejo.
    try {
      const ta = document.createElement('textarea');
      ta.value = destino;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }
}

async function abrir() {
  const copiado = await copiar();
  try { window.location.href = destino; } catch (_) {}
  avisar(copiado
    ? 'Listo. Volvé a la ventana de Llamadita: entra sola en un par de segundos.'
    : 'Abrí Llamadita y, si no entra sola, pedí un código nuevo desde la app.');
}

if (error) {
  avisar('Ese enlace ya no sirve: ' + error.replace(/\+/g, ' ') + '. Pedí un código nuevo desde la app.');
  btn.style.display = 'none';
} else if (!params.get('access_token')) {
  avisar('Este enlace no trae los datos para entrar. Pedí un código nuevo desde la app.');
  btn.style.display = 'none';
} else {
  btn.href = destino;
  btn.textContent = 'Entrar en la app';
  btn.addEventListener('click', (e) => { e.preventDefault(); abrir(); });

  // Intento automático apenas se abre la página.
  abrir();

  setTimeout(() => {
    try { history.replaceState({}, '', '/entrar/'); } catch (_) {}
  }, 5000);
}
