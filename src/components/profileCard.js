/**
 * ProfileCard - Componente modular adaptado de ReactBits (Vanilla JS + CSS)
 * Incluye:
 * - Efecto 3D Tilt suave al mover el cursor con perspectiva y física limpia.
 * - Behind Glow (halo de luz atmosférico que acompaña el cursor detrás de la tarjeta).
 * - Reflejo Glare reactivo según el ángulo de inclinación.
 * - Badges dinámicos: "CEO" (liva, devliva, dantey24) y "Alfa Tester" (versión <= 0.24.2Z).
 * - Cero dependencias pesadas: rendimiento nativo a 60 FPS con transformaciones GPU.
 */
import './profileCard.css';

const ICONO_TELEFONO = `<svg class="sc-icono-tel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

export function createProfileCard({
  name = 'Usuario',
  title = '',
  handle = '',
  status = 'Conectado',
  statusClass = 'online',
  contactText = '💬 Enviar mensaje',
  callText = `${ICONO_TELEFONO} Llamar`,
  avatarUrl = '',
  avatarKey = '',
  avatarInitials = '',
  showUserInfo = true,
  enableTilt = true,
  enableMobileTilt = false,
  onContactClick = null,
  onCallClick = null,
  onClose = null,
  behindGlowEnabled = true,
  innerGradient = 'linear-gradient(145deg, #60496e8c 0%, #71C4FF44 100%)',
  versionDesde = 'v0.24.2Z',
  isAlphaTester = true,
  isCEO = false,
  fechaUnion = '',
  fechaAmigos = '',
  canCall = false
}) {
  const container = document.createElement('div');
  container.className = 'profile-card-perspective';

  // Glow atmosférico detrás de la tarjeta
  let glowEl = null;
  if (behindGlowEnabled) {
    glowEl = document.createElement('div');
    glowEl.className = 'profile-card-behind-glow';
    container.appendChild(glowEl);
  }

  // Capa principal de la tarjeta
  const shell = document.createElement('div');
  shell.className = 'profile-card-shell';
  if (innerGradient) {
    shell.style.backgroundImage = innerGradient;
  }

  // Reflejo Glare reactivo
  const glare = document.createElement('div');
  glare.className = 'profile-card-glare';
  shell.appendChild(glare);

  // Botón de cierre
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'profile-card-close';
  closeBtn.title = 'Cerrar perfil';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  closeBtn.textContent = '✕';
  shell.appendChild(closeBtn);

  // Contenido
  const content = document.createElement('div');
  content.className = 'profile-card-content';

  // Preparar avatar
  let avatarHtml = '';
  if (avatarUrl) {
    avatarHtml = `<span class="sc-foto-grande"><img src="${esc(avatarUrl)}" alt="${esc(name)}" /></span>`;
  } else if (avatarKey) {
    avatarHtml = `<span class="sc-foto-grande"><img data-key="${esc(avatarKey)}" alt="${esc(name)}" loading="lazy" /></span>`;
  } else {
    const initials = esc(avatarInitials || (name || '?').slice(0, 2).toUpperCase());
    avatarHtml = `<span class="sc-foto-grande sin-foto">${initials}</span>`;
  }

  content.innerHTML = `
    <div class="profile-card-avatar-wrap">
      <div class="profile-card-avatar-disc status-${statusClass}">
        ${avatarHtml}
      </div>
    </div>

    <div class="profile-card-header-info">
      <h3 class="profile-card-name">${esc(name)}</h3>
      ${handle ? `<span class="profile-card-handle">@${esc(handle)}</span>` : ''}
      
      <div class="profile-card-badges">
        ${isCEO ? `<span class="profile-badge badge-ceo" title="Fundador / CEO de Llamadita">👑 CEO</span>` : ''}
        ${isAlphaTester ? `<span class="profile-badge badge-alpha" title="Tester de la primera hora de Llamadita">✨ Alfa Tester</span>` : ''}
        <span class="profile-badge badge-status status-${statusClass}">
          <span class="sc-dot ${statusClass}"></span>
          <span>${esc(status)}</span>
        </span>
      </div>
    </div>

    ${showUserInfo ? `
      <div class="profile-card-details">
        <div class="profile-card-row">
          <span class="profile-card-label">En Llamadita desde</span>
          <span class="profile-card-val version-val">${esc(versionDesde)}</span>
        </div>
        ${fechaUnion ? `
          <div class="profile-card-row">
            <span class="profile-card-label">Se unió</span>
            <span class="profile-card-val" id="profileCardJoinDate">${esc(fechaUnion)}</span>
          </div>
        ` : ''}
        ${fechaAmigos ? `
          <div class="profile-card-row">
            <span class="profile-card-label">Amigos desde</span>
            <span class="profile-card-val">${esc(fechaAmigos)}</span>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="profile-card-actions">
      <button type="button" class="btn-profile-contact" id="btnProfileCardContact">
        ${contactText}
      </button>
      <button type="button" class="btn-profile-call" id="btnProfileCardCall" ${canCall ? '' : 'disabled'} title="${canCall ? 'Llamar a ' + esc(name) : 'No está conectado'}">
        ${callText}
      </button>
    </div>
  `;

  shell.appendChild(content);
  container.appendChild(shell);

  // Eventos de botones
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.();
  });

  content.querySelector('#btnProfileCardContact')?.addEventListener('click', (e) => {
    e.stopPropagation();
    onContactClick?.();
  });

  content.querySelector('#btnProfileCardCall')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (canCall) onCallClick?.();
  });

  // -------------------------------------------------------------
  // Física 3D Tilt y Glare interactivo (ReactBits)
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

        // Inclinación angular (-10 a +10 grados)
        const rotX = (0.5 - py) * 22;
        const rotY = (px - 0.5) * 22;

        shell.style.transition = 'none';
        shell.style.transform = `perspective(1100px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(1.025, 1.025, 1.025)`;

        // Reflejo especular Glare
        glare.style.opacity = '1';
        glare.style.background = `radial-gradient(circle 240px at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255, 255, 255, 0.16) 0%, transparent 75%)`;

        // Behind Glow suave en consonancia con la inclinación
        if (glowEl) {
          glowEl.style.opacity = '1';
          glowEl.style.transform = `translate(${(px - 0.5) * 28}px, ${(py - 0.5) * 28}px) scale(1.05)`;
        }
      });
    };

    const onPointerLeave = () => {
      if (rafId) cancelAnimationFrame(rafId);
      shell.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
      shell.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      glare.style.opacity = '0';
      if (glowEl) {
        glowEl.style.opacity = '0';
        glowEl.style.transform = 'translate(0px, 0px) scale(1)';
      }
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
  }

  return {
    element: container,
    shell,
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      container.remove();
    }
  };
}

export default createProfileCard;
