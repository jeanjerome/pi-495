'use strict';

(() => {
  let savedTheme;

  try {
    savedTheme = localStorage.getItem('pi495-theme');
  } catch {}

  const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ece9e3' : '#141b24');
})();
