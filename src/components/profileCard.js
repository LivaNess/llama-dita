/**
 * ProfileCard - Componente ReactBits Holographic ID Card (Vanilla JS + CSS)
 * - Fondo: Foto de perfil en cover de alta fidelidad con viñeta de gradiente oscuro
 * - Efectos: Foil iridiscente arcoíris reactivo al cursor, textura de grano satinado, destellitos animados
 * - Tipografía: Google Sans Flex con modulación de ejes variables (wght, wdth, opsz, ROND)
 * - Distinciones: Badges vectoriales nítidos (sin emojis) con Glow CEO especial y lógica Alfa Tester
 */
import './profileCard.css';

// Iconos vectoriales limpios y minimalistas (SVG puro, sin emojis)
const ICON_CROWN = `<svg class="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 18h16a1 1 0 0 0 1-1V8.5a.5.5 0 0 0-.85-.35L16 12l-3.2-4.8a1 1 0 0 0-1.6 0L8 12 3.85 8.15A.5.5 0 0 0 3 8.5V17a1 1 0 0 0 1 1z"/></svg>`;
const ICON_SPARKLE = `<svg class="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_CALENDAR = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
const ICON_FRIENDS = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const ICON_ROCKET = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4.5c1.47-1.47 4.5-2 4.5-2"></path><path d="M12 15v5s3.03-.55 4.5-2c1.47-1.47 2-4.5 2-4.5"></path></svg>`;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

export function createProfileCard({
  name = 'Usuario',
  handle = '',
  status = 'Conectado',
  statusClass = 'online',
  avatarUrl = '',
  avatarInitials = '',
  enableTilt = true,
  enableMobileTilt = false,
  onClose = null,
  behindGlowEnabled = true,
  versionDesde = '0.24.2Z',
  isAlphaTester = true,
  isCEO = false,
  fechaUnion = '',
  fechaAmigos = ''
}) {
  const container = document.createElement('div');
  container.className = `profile-card-perspective ${isCEO ? 'is-ceo' : ''}`;

  // Aura Glow exterior reactiva detrás de la tarjeta
  let glowEl = null;
  if (behindGlowEnabled) {
    glowEl = document.createElement('div');
    glowEl.className = 'profile-card-behind-glow';
    container.appendChild(glowEl);
  }

  // Shell / Estructura principal
  const shell = document.createElement('div');
  shell.className = `profile-card-shell ${isCEO ? 'shell-ceo' : ''}`;

  // 1. Capa de fondo: Foto de perfil en cover
  const bgCover = document.createElement('div');
  bgCover.className = 'profile-card-bg-cover';
  if (avatarUrl) {
    bgCover.style.backgroundImage = `url("${avatarUrl}")`;
  }
  shell.appendChild(bgCover);

  // Fallback si no tiene foto o mientras carga
  const bgFallback = document.createElement('div');
  bgFallback.className = 'profile-card-bg-fallback';
  const initials = esc(avatarInitials || (name || '?').slice(0, 2).toUpperCase());
  bgFallback.innerHTML = `<span class="profile-card-bg-initials">${initials}</span>`;
  if (avatarUrl) {
    bgFallback.style.display = 'none';
  }
  shell.appendChild(bgFallback);

  // 2. Capa de viñeta oscura para contraste
  const overlay = document.createElement('div');
  overlay.className = 'profile-card-overlay';
  shell.appendChild(overlay);

  // 3. Foil Iridiscente Arcoíris (ReactBits)
  const iridescent = document.createElement('div');
  iridescent.className = 'profile-card-iridescent';
  shell.appendChild(iridescent);

  // 4. Textura de grano / ruido satinado
  const noise = document.createElement('div');
  noise.className = 'profile-card-noise';
  shell.appendChild(noise);

  // 5. Destellitos animados vectoriales
  const sparkles = document.createElement('div');
  sparkles.className = 'profile-card-sparkles';
  sparkles.innerHTML = `
    <div class="profile-card-sparkle sp-1">${ICON_SPARKLE}</div>
    <div class="profile-card-sparkle sp-2">${ICON_SPARKLE}</div>
    <div class="profile-card-sparkle sp-3">${ICON_SPARKLE}</div>
  `;
  shell.appendChild(sparkles);

  // 6. Reflejo especular Glare
  const glare = document.createElement('div');
  glare.className = 'profile-card-glare';
  shell.appendChild(glare);

  // Botón de cierre en la esquina superior derecha
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'profile-card-close';
  closeBtn.title = 'Cerrar perfil';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  closeBtn.innerHTML = ICON_CLOSE;
  shell.appendChild(closeBtn);

  // 7. Contenido estructurado en 3 zonas: Top (badges), Middle (nombre), Bottom (info)
  const content = document.createElement('div');
  content.className = 'profile-card-content';

  // Badges y distinciones
  let badgesHtml = '';
  if (isCEO) {
    badgesHtml += `
      <span class="profile-badge badge-ceo" title="Fundador / CEO de Llamadita">
        ${ICON_CROWN}
        <span>CEO</span>
      </span>
    `;
  }
  if (isAlphaTester) {
    badgesHtml += `
      <span class="profile-badge badge-alpha" title="Tester de la primera hora de Llamadita">
        ${ICON_SPARKLE}
        <span>Alfa Tester · v${esc(versionDesde)}</span>
      </span>
    `;
  }

  // Filas de metadatos de membresía
  let metaRowsHtml = '';

  // Para usuarios que NO son Alfa Tester, se muestra "En Llamadita desde: v..."
  if (!isAlphaTester && versionDesde) {
    metaRowsHtml += `
      <div class="profile-meta-row">
        <span class="profile-meta-label">
          ${ICON_ROCKET}
          <span>En Llamadita desde</span>
        </span>
        <span class="profile-meta-val version-badge">v${esc(versionDesde)}</span>
      </div>
    `;
  }

  // Fecha de registro / unión
  if (fechaUnion) {
    metaRowsHtml += `
      <div class="profile-meta-row">
        <span class="profile-meta-label">
          ${ICON_CALENDAR}
          <span>Miembro desde</span>
        </span>
        <span class="profile-meta-val" id="profileCardJoinDate">${esc(fechaUnion)}</span>
      </div>
    `;
  }

  // Fecha de amistad si son amigos
  if (fechaAmigos) {
    metaRowsHtml += `
      <div class="profile-meta-row">
        <span class="profile-meta-label">
          ${ICON_FRIENDS}
          <span>Amigos desde</span>
        </span>
        <span class="profile-meta-val">${esc(fechaAmigos)}</span>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="profile-card-top">
      <div class="profile-card-badges">
        ${badgesHtml}
        <div class="profile-status-indicator status-${statusClass}" title="Estado: ${esc(status)}">
          <span class="status-dot"></span>
          <span>${esc(status)}</span>
        </div>
      </div>
    </div>

    <div class="profile-card-middle">
      <h3 class="profile-card-name">${esc(name)}</h3>
      ${handle ? `<span class="profile-card-handle">@${esc(handle)}</span>` : ''}
    </div>

    <div class="profile-card-bottom">
      ${metaRowsHtml}
    </div>
  `;

  shell.appendChild(content);
  container.appendChild(shell);

  // Cerrar modal
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.();
  });

  // -------------------------------------------------------------
  // Física 3D Tilt, Glare e Iridiscencia Reactiva (ReactBits)
  // -------------------------------------------------------------
  const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;
  const shouldTilt = enableTilt && (!isTouchDevice() || enableMobileTilt);

  let rafId = null;

  if (shouldTilt) {
    const onPointerMove = (e) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const px = Math.min(Math.max(x / rect.width, 0), 1);
        const py = Math.min(Math.max(y / rect.height, 0), 1);

        // Inclinación angular (-12 a +12 grados)
        const rotX = (0.5 - py) * 22;
        const rotY = (px - 0.5) * 22;

        shell.style.transition = 'none';
        shell.style.transform = `perspective(1100px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(1.025, 1.025, 1.025)`;

        // Foil Iridiscente: desplaza y orienta la refracción del arcoíris
        iridescent.style.backgroundPosition = `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`;
        iridescent.style.opacity = `${0.45 + Math.abs(px - 0.5) * 0.45}`;

        // Reflejo especular Glare
        glare.style.opacity = '1';
        glare.style.background = `radial-gradient(circle 260px at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255, 255, 255, 0.22) 0%, transparent 75%)`;

        // Behind Glow suave sincronizado con la inclinación
        if (glowEl) {
          glowEl.style.opacity = '1';
          glowEl.style.transform = `translate(${(px - 0.5) * 26}px, ${(py - 0.5) * 26}px) scale(1.04)`;
        }
      });
    };

    const onPointerLeave = () => {
      if (rafId) cancelAnimationFrame(rafId);
      shell.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
      shell.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      iridescent.style.opacity = '0.35';
      iridescent.style.backgroundPosition = '50% 50%';
      glare.style.opacity = '0';
      if (glowEl) {
        glowEl.style.opacity = isCEO ? '0.85' : '0.6';
        glowEl.style.transform = 'translate(0px, 0px) scale(1)';
      }
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
  }

  // Método público para actualizar la imagen de fondo cuando se resuelva la URL
  const setAvatarUrl = (url) => {
    if (!url) return;
    bgCover.style.backgroundImage = `url("${url}")`;
    bgFallback.style.display = 'none';
  };

  return {
    element: container,
    shell,
    setAvatarUrl,
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      container.remove();
    }
  };
}

export default createProfileCard;
