'use strict';

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return;

  const atmosphere = document.createElement('div');
  atmosphere.className = 'background-atmosphere';
  atmosphere.setAttribute('aria-hidden', 'true');

  for (const name of ['warm', 'cool', 'grid']) {
    const layer = document.createElement('div');
    layer.className = `background-atmosphere__${name}`;
    atmosphere.append(layer);
  }

  document.body.prepend(atmosphere);

  let width = window.innerWidth;
  let height = window.innerHeight;
  let x = width * 0.22;
  let y = height * 0.68;
  let animationFrame = 0;
  let lastPaint = 0;

  function alignGrid() {
    atmosphere.style.setProperty('--grid-x', `${-(window.scrollX % 32)}px`);
    atmosphere.style.setProperty('--grid-y', `${-(window.scrollY % 32)}px`);
  }

  function paint(now) {
    animationFrame = 0;

    if (now - lastPaint >= 32) {
      const targetX = width * (0.5 + Math.sin(now / 5200) * 0.38);
      const targetY = height * (0.48 + Math.cos(now / 6800) * 0.36);

      x += (targetX - x) * 0.032;
      y += (targetY - y) * 0.032;
      atmosphere.style.setProperty('--light-x', `${x.toFixed(1)}px`);
      atmosphere.style.setProperty('--light-y', `${y.toFixed(1)}px`);
      lastPaint = now;
    }

    if (!document.hidden) animationFrame = requestAnimationFrame(paint);
  }

  function handleResize() {
    width = window.innerWidth;
    height = window.innerHeight;
    x = Math.min(x, width);
    y = Math.min(y, height);
    alignGrid();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else if (!animationFrame) {
      animationFrame = requestAnimationFrame(paint);
    }
  }

  alignGrid();
  animationFrame = requestAnimationFrame(paint);
  window.addEventListener('resize', handleResize, {passive: true});
  window.addEventListener('scroll', alignGrid, {passive: true});
  document.addEventListener('visibilitychange', handleVisibilityChange);
})();
