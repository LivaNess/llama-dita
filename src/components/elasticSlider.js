/**
 * ElasticSlider - Adaptación modular en JavaScript Vanilla y CSS puro
 * Inspirado en el componente ElasticSlider de ReactBits (física de goma elástica y rebote spring).
 * Cero dependencias pesadas: rendimiento óptimo a 60 FPS con transformaciones por hardware.
 */

const MAX_OVERFLOW = 42;

function decay(value, max) {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

export function createElasticSlider({
  container,
  startingValue = 0,
  maxValue = 100,
  defaultValue = 50,
  stepSize = 1,
  isStepped = false,
  leftIcon = null,
  rightIcon = null,
  leftIconTitle = '',
  rightIconTitle = '',
  onLeftIconClick = null,
  onRightIconClick = null,
  onChange = null,
  ariaLabel = 'Deslizador'
}) {
  if (!container) return null;

  let value = Math.min(Math.max(defaultValue, startingValue), maxValue);
  let isDragging = false;
  let isHovered = false;
  let currentOverflow = 0;
  let currentRegion = 'middle'; // 'left' | 'middle' | 'right'
  let clientX = 0;
  let springAnimId = null;

  // Estructura DOM del ElasticSlider
  const root = document.createElement('div');
  root.className = 'elastic-slider-container';

  const wrapper = document.createElement('div');
  wrapper.className = 'elastic-slider-wrapper';

  // Icono Izquierdo
  const leftIconEl = document.createElement('div');
  leftIconEl.className = 'elastic-slider-icon elastic-icon-left';
  if (leftIconTitle) leftIconEl.title = leftIconTitle;
  if (typeof leftIcon === 'string') {
    leftIconEl.innerHTML = leftIcon;
  } else if (leftIcon instanceof HTMLElement) {
    leftIconEl.appendChild(leftIcon);
  }
  if (onLeftIconClick) {
    leftIconEl.classList.add('clickable');
    leftIconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onLeftIconClick(value);
    });
  }

  // Zona central de interacción
  const sliderRoot = document.createElement('div');
  sliderRoot.className = 'elastic-slider-root';
  sliderRoot.tabIndex = 0;
  sliderRoot.setAttribute('role', 'slider');
  sliderRoot.setAttribute('aria-label', ariaLabel);
  sliderRoot.setAttribute('aria-valuemin', String(startingValue));
  sliderRoot.setAttribute('aria-valuemax', String(maxValue));
  sliderRoot.setAttribute('aria-valuenow', String(Math.round(value)));

  const trackWrapper = document.createElement('div');
  trackWrapper.className = 'elastic-slider-track-wrapper';

  const track = document.createElement('div');
  track.className = 'elastic-slider-track';

  const range = document.createElement('div');
  range.className = 'elastic-slider-range';

  track.appendChild(range);
  trackWrapper.appendChild(track);
  sliderRoot.appendChild(trackWrapper);

  // Icono Derecho
  const rightIconEl = document.createElement('div');
  rightIconEl.className = 'elastic-slider-icon elastic-icon-right';
  if (rightIconTitle) rightIconEl.title = rightIconTitle;
  if (typeof rightIcon === 'string') {
    rightIconEl.innerHTML = rightIcon;
  } else if (rightIcon instanceof HTMLElement) {
    rightIconEl.appendChild(rightIcon);
  }
  if (onRightIconClick) {
    rightIconEl.classList.add('clickable');
    rightIconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onRightIconClick(value);
    });
  }

  wrapper.appendChild(leftIconEl);
  wrapper.appendChild(sliderRoot);
  wrapper.appendChild(rightIconEl);
  root.appendChild(wrapper);

  // Reemplazar o insertar en el contenedor
  container.innerHTML = '';
  container.appendChild(root);

  // Cálculo del porcentaje de rango
  function getRangePercentage() {
    const total = maxValue - startingValue;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, ((value - startingValue) / total) * 100));
  }

  // Actualizar renderizado visual
  function updateVisuals() {
    range.style.width = `${getRangePercentage()}%`;
    sliderRoot.setAttribute('aria-valuenow', String(Math.round(value)));

    // Transformación elástica del track
    const rect = sliderRoot.getBoundingClientRect();
    const width = rect.width || 180;

    let scaleX = 1;
    let scaleY = 1;
    let origin = 'center';

    if (currentOverflow > 0) {
      scaleX = 1 + currentOverflow / width;
      scaleY = Math.max(0.72, 1 - (currentOverflow / MAX_OVERFLOW) * 0.28);
      origin = currentRegion === 'left' ? 'right center' : 'left center';
    }

    trackWrapper.style.transformOrigin = origin;
    trackWrapper.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;

    // Desplazamiento y escala elástica de los iconos
    if (currentRegion === 'left' && currentOverflow > 0) {
      const shiftX = -currentOverflow * 0.55;
      const iconScale = 1 + (currentOverflow / MAX_OVERFLOW) * 0.35;
      leftIconEl.style.transform = `translateX(${shiftX}px) scale(${iconScale})`;
      rightIconEl.style.transform = '';
    } else if (currentRegion === 'right' && currentOverflow > 0) {
      const shiftX = currentOverflow * 0.55;
      const iconScale = 1 + (currentOverflow / MAX_OVERFLOW) * 0.35;
      rightIconEl.style.transform = `translateX(${shiftX}px) scale(${iconScale})`;
      leftIconEl.style.transform = '';
    } else {
      leftIconEl.style.transform = '';
      rightIconEl.style.transform = '';
    }
  }

  // Detener resorte anterior si está activo
  function stopSpring() {
    if (springAnimId) {
      cancelAnimationFrame(springAnimId);
      springAnimId = null;
    }
  }

  // Animación física de resorte (spring bounce) al soltar
  function bounceBackSpring() {
    stopSpring();
    if (currentOverflow <= 0.05) {
      currentOverflow = 0;
      currentRegion = 'middle';
      updateVisuals();
      return;
    }

    let pos = currentOverflow;
    let velocity = 0;
    const stiffness = 280;
    const damping = 22;
    let lastTime = performance.now();

    function step(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.032);
      lastTime = now;

      const springForce = -stiffness * pos;
      const dampingForce = -damping * velocity;
      const acceleration = springForce + dampingForce;

      velocity += acceleration * dt;
      pos += velocity * dt;

      currentOverflow = Math.max(0, pos);
      updateVisuals();

      if (Math.abs(pos) < 0.1 && Math.abs(velocity) < 0.2) {
        currentOverflow = 0;
        currentRegion = 'middle';
        updateVisuals();
        springAnimId = null;
        return;
      }

      springAnimId = requestAnimationFrame(step);
    }

    springAnimId = requestAnimationFrame(step);
  }

  // Manejo del arrastre
  function updateFromPointer(e) {
    const rect = sliderRoot.getBoundingClientRect();
    const width = rect.width;
    if (width <= 0) return;

    clientX = e.clientX;
    const left = rect.left;
    const right = rect.right;

    let rawOverflow = 0;
    if (clientX < left) {
      currentRegion = 'left';
      rawOverflow = left - clientX;
    } else if (clientX > right) {
      currentRegion = 'right';
      rawOverflow = clientX - right;
    } else {
      currentRegion = 'middle';
      rawOverflow = 0;
    }

    currentOverflow = decay(rawOverflow, MAX_OVERFLOW);

    const ratio = (clientX - left) / width;
    let newVal = startingValue + ratio * (maxValue - startingValue);

    if (isStepped) {
      newVal = Math.round(newVal / stepSize) * stepSize;
    }

    newVal = Math.min(Math.max(newVal, startingValue), maxValue);

    if (newVal !== value) {
      value = newVal;
      if (onChange) onChange(value);
    }

    updateVisuals();
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return; // Solo clic primario
    isDragging = true;
    stopSpring();
    sliderRoot.classList.add('active');
    wrapper.classList.add('active');
    sliderRoot.setPointerCapture(e.pointerId);
    updateFromPointer(e);
  }

  function handlePointerMove(e) {
    if (!isDragging) return;
    updateFromPointer(e);
  }

  function handlePointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    sliderRoot.classList.remove('active');
    wrapper.classList.remove('active');
    try {
      if (sliderRoot.hasPointerCapture(e.pointerId)) {
        sliderRoot.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    bounceBackSpring();
  }

  sliderRoot.addEventListener('pointerdown', handlePointerDown);
  sliderRoot.addEventListener('pointermove', handlePointerMove);
  sliderRoot.addEventListener('pointerup', handlePointerUp);
  sliderRoot.addEventListener('pointercancel', handlePointerUp);
  sliderRoot.addEventListener('lostpointercapture', handlePointerUp);

  // Hover
  wrapper.addEventListener('pointerenter', () => {
    isHovered = true;
    wrapper.classList.add('hovered');
  });
  wrapper.addEventListener('pointerleave', () => {
    isHovered = false;
    if (!isDragging) wrapper.classList.remove('hovered');
  });

  // Soporte de accesibilidad por teclado
  sliderRoot.addEventListener('keydown', (e) => {
    let delta = 0;
    const step = isStepped ? stepSize : Math.max(1, (maxValue - startingValue) / 50);

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'PageUp') delta = step * 5;
    else if (e.key === 'PageDown') delta = -step * 5;
    else if (e.key === 'Home') {
      value = startingValue;
      if (onChange) onChange(value);
      updateVisuals();
      e.preventDefault();
      return;
    } else if (e.key === 'End') {
      value = maxValue;
      if (onChange) onChange(value);
      updateVisuals();
      e.preventDefault();
      return;
    }

    if (delta !== 0) {
      e.preventDefault();
      let newVal = Math.min(Math.max(value + delta, startingValue), maxValue);
      if (isStepped) newVal = Math.round(newVal / stepSize) * stepSize;
      if (newVal !== value) {
        value = newVal;
        if (onChange) onChange(value);
        updateVisuals();
      }
    }
  });

  // Render inicial
  updateVisuals();

  return {
    getValue: () => value,
    setValue: (val) => {
      const newVal = Math.min(Math.max(val, startingValue), maxValue);
      value = newVal;
      updateVisuals();
    },
    setLeftIcon: (htmlOrEl) => {
      leftIconEl.innerHTML = '';
      if (typeof htmlOrEl === 'string') leftIconEl.innerHTML = htmlOrEl;
      else if (htmlOrEl instanceof HTMLElement) leftIconEl.appendChild(htmlOrEl);
    },
    setRightIcon: (htmlOrEl) => {
      rightIconEl.innerHTML = '';
      if (typeof htmlOrEl === 'string') rightIconEl.innerHTML = htmlOrEl;
      else if (htmlOrEl instanceof HTMLElement) rightIconEl.appendChild(htmlOrEl);
    },
    destroy: () => {
      stopSpring();
      root.remove();
    }
  };
}
