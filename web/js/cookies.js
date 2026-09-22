// Aviso accesible de almacenamiento técnico y cookies (Ley 25.326 / GDPR)
const CONSENT_KEY = 'llamadita_cookie_consent';

export function initCookieBanner() {
  try {
    if (localStorage.getItem(CONSENT_KEY) === '1') return;
  } catch (_) {
    return;
  }

  const banner = document.createElement('aside');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Aviso de privacidad y almacenamiento local');

  banner.innerHTML = `
    <div class="cookie-banner-copy">
      <strong>Privacidad y cookies técnicas:</strong> Utilizamos almacenamiento local estrictamente necesario para la autenticación segura y tus preferencias. <strong>No utilizamos cookies de publicidad ni rastreadores de terceros.</strong> Podés consultar los detalles en nuestra <a href="/cookies/">Política de Cookies</a>.
    </div>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-primary btn-small" id="btnAcceptCookies" aria-label="Aceptar y cerrar aviso de cookies">
        Entendido
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  const btn = banner.querySelector('#btnAcceptCookies');
  btn?.addEventListener('click', () => {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch (_) {}
    banner.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => banner.remove(), 220);
  });
}

// Iniciar automáticamente si el DOM ya está cargado o esperar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieBanner);
} else {
  initCookieBanner();
}
