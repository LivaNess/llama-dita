// Puente entre el enlace del mail y la app de escritorio.
//
// Supabase verifica el enlace y manda acá con los tokens en el # de la dirección.
// Desde una página normal sí se puede saltar a la app (llamadita://), cosa que el
// navegador no permite hacer directo desde la redirección del servidor.
const APP = 'llamadita://auth';

const estado = document.getElementById('estado');
const btn = document.getElementById('btnAbrir');

const fragmento = (location.hash || '').replace(/^#/, '');
const params = new URLSearchParams(fragmento);
const error = params.get('error_description') || params.get('error');

if (error) {
  estado.textContent = 'Ese enlace ya no sirve: ' + error.replace(/\+/g, ' ') + '. Pedí un código nuevo desde la app.';
  btn.style.display = 'none';
} else if (!params.get('access_token')) {
  estado.textContent = 'Este enlace no trae los datos para entrar. Pedí un código nuevo desde la app.';
  btn.style.display = 'none';
} else {
  const destino = `${APP}#${fragmento}`;
  btn.href = destino;

  // Intento automático. Si el navegador lo bloquea, queda el botón.
  setTimeout(() => { window.location.href = destino; }, 400);

  setTimeout(() => {
    estado.textContent = 'Si la app no se abrió sola, tocá el botón.';
  }, 2500);

  // Limpia los tokens de la barra de direcciones una vez usados.
  setTimeout(() => {
    try { history.replaceState({}, '', '/entrar/'); } catch (_) {}
  }, 4000);
}
