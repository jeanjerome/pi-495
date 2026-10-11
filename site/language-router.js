'use strict';

(() => {
  const supportedLanguages = new Set(['fr', 'en']);
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  let savedLanguage;

  try {
    savedLanguage = localStorage.getItem('pi495-language');
  } catch {}

  const browserLanguage = navigator.languages?.[0] || navigator.language || 'en';
  const detectedLanguage = browserLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const language = supportedLanguages.has(requestedLanguage)
    ? requestedLanguage
    : supportedLanguages.has(savedLanguage) ? savedLanguage : detectedLanguage;

  window.location.replace(new URL(`${language}/`, window.location.href));
})();
