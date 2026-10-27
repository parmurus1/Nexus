/* nexus-core.js — utilitários compartilhados entre as páginas do site.
   Carregado no <head> de todas as páginas (antes do conteúdo), então tudo
   que é exposto em window.* já está disponível para os scripts inline.

   1) Ícones: biblioteca de ícones SVG em traço (estilo Lucide). Use
      <i data-icon="calendar"></i> no HTML ou nexusIcon('calendar') em
      templates JS. Substitui todos os emojis do site.

   2) Config do site (/api/config) buscada uma única vez por página e
      compartilhada (nav, venom.js, home...).

   3) Navegação: menu mobile, link ativo e aba Rifa (controlada pelo admin).

   4) Fix do bug "clicar e arrastar texto fecha a janela": só fecha o modal
      se o mousedown E o click tiverem acontecido no próprio overlay.

   5) Aviso de "sair sem salvar" em formulários/modais.

   6) Toast, escape de HTML e lightbox de imagens reutilizável.
*/
(function () {
  'use strict';

  // ── 1) Ícones ──────────────────────────────────────────────────────
  var ICONS = {
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'x': '<path d="M18 6 6 18M6 6l12 12"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'plus': '<path d="M5 12h14M12 5v14"/>',
    'minus': '<path d="M5 12h14"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'calendar': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    'ticket': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    'image': '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    'images': '<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.3-1.3a2.41 2.41 0 0 0-3.4 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
    'video': '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
    'play': '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none"/>',
    'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    'mic': '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    'guitar': '<path d="m11.9 12.1 4.51-4.51"/><path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.11 1.11A2 2 0 0 0 17 4.83v1.34a2 2 0 0 1-.59 1.41A2 2 0 0 1 17.83 7h1.34a2 2 0 0 0 1.41-.59L21.7 5.3a1 1 0 0 0 0-1.4Z"/><path d="m6 16 2 2"/><path d="M8.2 9.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.8 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4 2 2 0 0 0 1.8-1.2Z"/>',
    'drum': '<path d="m2 2 8 8M22 2l-8 8"/><ellipse cx="12" cy="9" rx="10" ry="5"/><path d="M7 13.4v7.9M12 14v8M17 13.4v7.9M2 9v8a10 5 0 0 0 20 0V9"/>',
    'piano': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 5v8h2V5M11 5v8h2V5M16 5v8h2V5M7 13v6M12 13v6M17 13v6"/>',
    'speaker': '<path d="M3 6h18l-3.5 12h-11Z"/><circle cx="12" cy="11.5" r="2.5"/>',
    'plug': '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    'cart': '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    'shirt': '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/>',
    'key': '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    'pin': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z"/>',
    'sticker': '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4M8 13h.01M16 13h.01M10 16s.8 1 2 1c1.3 0 2-1 2-1"/>',
    'gift': '<rect width="18" height="4" x="3" y="8" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    'truck': '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'message': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
    'external-link': '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/>',
    'pencil': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    'trash': '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'chart': '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    'sliders': '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    'dice': '<rect width="12" height="12" x="2" y="10" rx="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6M6 18h.01M10 14h.01M15 6h.01M18 9h.01"/>',
    'grip': '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
    'grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    'hourglass': '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    'zap': '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
    'contrast': '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12Z"/>',
    'timer-reset': '<path d="M10 2h4M12 14v-4M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6"/><path d="M9 17H4v5"/>',
    'instagram': '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z"/><path d="M17.5 6.5h.01"/>',
    'tiktok': '<path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z" fill="currentColor" stroke="none"/>',
    'spotify': '<circle cx="12" cy="12" r="10"/><path d="M7.5 9c3.2-1 6.9-.7 9.8 1M8 12c2.7-.8 5.6-.6 8 .8M8.5 15c2.1-.6 4.3-.4 6.2.6"/>',
    'headphones': '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    'send': '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11Z"/><path d="m21.85 2.15-10.94 10.94"/>',
    'file-edit': '<path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/>',
    'youtube': '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>'
  };

  window.nexusIcon = function (name, cls) {
    var body = ICONS[name] || ICONS.info;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  };

  // Troca todos os <i data-icon="nome"> dentro de root pelo SVG correspondente.
  window.nexusHydrateIcons = function (root) {
    (root || document).querySelectorAll('i[data-icon]').forEach(function (el) {
      var tmp = document.createElement('span');
      tmp.innerHTML = window.nexusIcon(el.getAttribute('data-icon'), el.className);
      el.replaceWith(tmp.firstChild);
    });
  };

  // ── 2) Config compartilhada ────────────────────────────────────────
  var _configPromise = null;
  window.nexusGetConfig = function () {
    if (!_configPromise) {
      _configPromise = fetch('/api/config')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    }
    return _configPromise;
  };
  window.nexusFlag = function (v) { return v === true || v === 'true'; };

  // ── 3) Navegação ───────────────────────────────────────────────────
  function initNav() {
    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('navLinks');
    if (toggle && links) {
      var fechar = function () {
        links.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      };
      toggle.addEventListener('click', function () {
        var aberto = links.classList.toggle('open');
        toggle.classList.toggle('open', aberto);
        toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      });
      links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', fechar); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    }

    // Marca o link da página atual (funciona com e sem ".html" na URL)
    var atual = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
      if (href === atual) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
    });

    window.nexusGetConfig().then(function (cfg) {
      // Elementos marcados com data-rifa só aparecem se a rifa estiver ativa no admin
      if (window.nexusFlag(cfg.rifa_nav_visivel)) {
        document.querySelectorAll('[data-rifa]').forEach(function (el) { el.hidden = false; });
      }
      aplicarLinks(cfg);
    });

    // Cliques em links/botões marcados com data-track viram eventos no Analytics
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-track]');
      if (el) window.nexusTrack(el.getAttribute('data-track'));
    });
  }

  // ── Links e contatos editáveis pelo painel (Conteúdo do site) ──────
  // <a data-link="instagram"> recebe o href configurado; se a rede não tiver
  // link configurado e o elemento tiver data-link-opcional, ele fica oculto.
  var LINKS_PADRAO = {
    instagram: 'https://instagram.com/nexus.bandbr',
    tiktok: 'https://tiktok.com/@nexus.bandbr',
    youtube: '',
    spotify: '',
    email: 'mailto:bandanexus01@gmail.com',
    whatsapp: 'https://wa.me/5511942477432'
  };
  window.nexusLinks = function (cfg) {
    cfg = cfg || {};
    var whats = String(cfg.contato_whatsapp || '').replace(/\D/g, '');
    return {
      instagram: cfg.link_instagram || LINKS_PADRAO.instagram,
      tiktok: cfg.link_tiktok || LINKS_PADRAO.tiktok,
      youtube: cfg.link_youtube || LINKS_PADRAO.youtube,
      spotify: cfg.link_spotify || LINKS_PADRAO.spotify,
      email: cfg.contato_email ? 'mailto:' + cfg.contato_email : LINKS_PADRAO.email,
      whatsapp: whats ? 'https://wa.me/' + (whats.length <= 11 ? '55' + whats : whats) : LINKS_PADRAO.whatsapp
    };
  };
  function aplicarLinks(cfg) {
    var links = window.nexusLinks(cfg);
    document.querySelectorAll('[data-link]').forEach(function (el) {
      var url = links[el.getAttribute('data-link')];
      if (url) { el.href = url; el.hidden = false; }
      else if (el.hasAttribute('data-link-opcional')) el.hidden = true;
    });
  }

  // Lê um JSON guardado na config (conteúdo editável); devolve o padrão se vazio/inválido.
  window.nexusConteudo = function (cfg, chave, padrao) {
    var v = cfg && cfg[chave];
    if (!v) return padrao;
    try { var obj = JSON.parse(v); return obj == null ? padrao : obj; } catch (e) { return padrao; }
  };

  // ── Analytics: eventos personalizados (Vercel Web Analytics) ───────
  // Os eventos ficam numa fila até o script do Vercel carregar. Observação:
  // eventos personalizados só aparecem no painel da Vercel nos planos pagos.
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.nexusTrack = function (nome, dados) {
    try { window.va('event', { name: nome, data: dados }); } catch (e) {}
  };

  // Imagens com loading="lazy" ficam invisíveis até carregar e então surgem
  // suavemente (CSS em nexus.css). Captura no document pega todas as imagens,
  // inclusive as inseridas depois via JS.
  function marcarCarregada(e) {
    if (e.target && e.target.tagName === 'IMG') e.target.classList.add('is-loaded');
  }
  document.addEventListener('load', marcarCarregada, true);
  document.addEventListener('error', marcarCarregada, true);

  // Cards, títulos e itens de lista surgem em cascata ao entrar na tela.
  // Vale também para o que é montado depois via JS (produtos, shows, fotos...).
  var SELETOR_REVEAL = [
    'main .card', 'main .foto-card', 'main .show-item', 'main .passado',
    'main .sec-eyebrow', 'main .sec-title', 'main .sec-note', 'main .link-arrow',
    'main .state', '[data-reveal]'
  ].join(',');
  var revealObs = null, cascata = 0, cascataTimer = null;

  // Atraso em cascata para itens que aparecem juntos (máx. 6 degraus)
  function proximoAtraso() {
    var atraso = Math.min(cascata, 6) * 0.07;
    cascata++;
    clearTimeout(cascataTimer);
    cascataTimer = setTimeout(function () { cascata = 0; }, 120);
    return atraso + 's';
  }

  function candidatos(raiz) {
    var lista = [];
    if (raiz.nodeType !== 1) return lista;
    if (raiz.matches && raiz.matches(SELETOR_REVEAL)) lista.push(raiz);
    raiz.querySelectorAll && raiz.querySelectorAll(SELETOR_REVEAL).forEach(function (el) { lista.push(el); });
    // Nada dentro do topo (já tem animação própria), de modais ou de outro item animado
    return lista.filter(function (el) {
      return !el.closest('.hero, .page-hero, .modal-ov, .lightbox') && !el.parentElement.closest('.reveal, .reveal-now');
    });
  }

  function prepararReveal(el, inicial) {
    if (el.classList.contains('reveal') || el.classList.contains('reveal-now') || el.dataset.semReveal != null) return;
    var r = el.getBoundingClientRect();
    var visivel = r.top < window.innerHeight * 0.95 && r.bottom > 0;
    if (visivel) {
      // Conteúdo estático já visível ao abrir a página não anima (evita "piscar");
      // conteúdo que acabou de ser montado via JS entra em cascata.
      if (inicial) return;
      el.style.setProperty('--reveal-delay', proximoAtraso());
      el.classList.add('reveal-now');
    } else {
      el.classList.add('reveal');
      revealObs.observe(el);
    }
  }

  function initReveal() {
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    revealObs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.style.setProperty('--reveal-delay', proximoAtraso());
        en.target.classList.add('in');
        revealObs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });

    var main = document.querySelector('main');
    // O painel admin re-renderiza tabelas o tempo todo: sem animação de entrada lá
    if (!main || main.classList.contains('adm-main')) return;
    candidatos(main).forEach(function (el) { prepararReveal(el, true); });
    // Conteúdo inserido depois (fetch da API) — o callback roda antes da pintura,
    // então os itens novos já nascem invisíveis e entram animados, sem piscar.
    new MutationObserver(function (mudancas) {
      mudancas.forEach(function (m) {
        m.addedNodes.forEach(function (n) { candidatos(n).forEach(function (el) { prepararReveal(el, false); }); });
      });
    }).observe(main, { childList: true, subtree: true });
  }

  // Cadastro de fãs no rodapé ("receba aviso dos próximos shows")
  function initAvisos() {
    var form = document.getElementById('formAvisos');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var campo = form.querySelector('input[name="contato"]');
      var contato = campo.value.trim();
      var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato);
      var tel = contato.replace(/\D/g, '').length >= 10;
      if (!email && !tel) { window.toast('Digite um e-mail ou WhatsApp com DDD.', 'err'); campo.focus(); return; }
      var btn = form.querySelector('button');
      btn.disabled = true;
      fetch('/api/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contato: contato, site: (form.querySelector('input[name="site"]') || {}).value || '', origem: location.pathname })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.erro || 'Não foi possível cadastrar agora.');
          window.nexusTrack('cadastro_fa');
          form.querySelector('.linha').outerHTML = '<p class="ok">' + window.nexusIcon('check-circle') + 'Pronto! Você vai receber os avisos de shows.</p>';
        })
        .catch(function (err) { window.toast(err.message, 'err'); btn.disabled = false; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.nexusHydrateIcons();
    initNav();
    initAvisos();
    initReveal();
  });

  // ── 4) Overlay click guard ─────────────────────────────────────────
  // Uso no HTML:
  //   <div class="modal-ov" onmousedown="nexusOverlayDown(event)"
  //        onclick="nexusOverlayClick(event, fecharModal)">
  var _overlayMouseDownOnSelf = null;

  window.nexusOverlayDown = function (ev) {
    _overlayMouseDownOnSelf = (ev.target === ev.currentTarget);
  };

  window.nexusOverlayClick = function (ev, fn) {
    var startedOnSelf = _overlayMouseDownOnSelf;
    _overlayMouseDownOnSelf = null;
    if (startedOnSelf && ev.target === ev.currentTarget) {
      fn();
    }
  };

  // ── 5) Alterações não salvas ───────────────────────────────────────
  var dirtyForms = new Set();

  window.nexusMarkDirty = function (key) {
    dirtyForms.add(key);
  };
  window.nexusMarkClean = function (key) {
    dirtyForms.delete(key);
  };
  window.nexusIsDirty = function (key) {
    return key ? dirtyForms.has(key) : dirtyForms.size > 0;
  };
  window.nexusClearAllDirty = function () {
    dirtyForms.clear();
  };

  // Antes de fechar a aba/recarregar com alterações pendentes.
  window.addEventListener('beforeunload', function (ev) {
    if (dirtyForms.size > 0) {
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    }
  });

  // Liga "dirty tracking" automático a um formulário/modal: qualquer input,
  // textarea ou select dentro do container marca como alterado.
  // Só registra os listeners uma vez por container.
  window.nexusWatchForm = function (containerId, key) {
    var el = document.getElementById(containerId);
    if (!el || el.dataset.nexusWatch === key) return;
    el.dataset.nexusWatch = key;
    var handler = function () { window.nexusMarkDirty(key); };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  };

  // Confirma com o usuário antes de fechar um modal/formulário sujo.
  // Retorna true se pode fechar (não sujo, ou usuário confirmou).
  window.nexusConfirmClose = function (key) {
    if (!window.nexusIsDirty(key)) return true;
    return confirm('Você tem alterações não salvas. Deseja sair mesmo assim?');
  };

  // ── 6) Toast, escape e formatação ──────────────────────────────────
  // Requer <div class="toast" id="toast" role="status" aria-live="polite"></div> na página.
  window.toast = function (msg, tipo) {
    var t = document.getElementById('toast');
    if (!t) return;
    var icone = tipo === 'ok' ? 'check-circle' : (tipo === 'err' ? 'alert' : 'info');
    t.innerHTML = window.nexusIcon(icone) + '<span></span>';
    t.lastChild.textContent = msg;
    t.className = 'toast ' + (tipo || '') + ' show';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 4000);
  };

  // Escapa texto antes de inserir via innerHTML (nomes de compradores, títulos etc.)
  window.nexusEsc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  window.nexusMoeda = function (v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  };

  // Ícones disponíveis para produtos sem foto (campo "emoji" no banco guarda o nome
  // do ícone). Produtos antigos cadastrados com emoji são convertidos aqui.
  window.NEXUS_ICONES_PRODUTO = {
    shirt: 'Camiseta / vestuário', guitar: 'Palheta / guitarra', drum: 'Baqueta / bateria',
    key: 'Chaveiro', pin: 'Pin / broche', sticker: 'Adesivo', music: 'Música / CD',
    mic: 'Microfone', ticket: 'Ingresso', gift: 'Kit / presente', package: 'Outro'
  };
  var EMOJI_PARA_ICONE = {
    '\uD83D\uDC55': 'shirt', '\uD83C\uDFB8': 'guitar', '\uD83D\uDD11': 'key', '\uD83D\uDCCC': 'pin',
    '\uD83C\uDFA8': 'sticker', '\uD83E\uDD41': 'drum', '\uD83C\uDFB5': 'music', '\uD83C\uDFA4': 'mic',
    '\uD83C\uDF9F': 'ticket', '\uD83C\uDF81': 'gift', '\uD83D\uDCE6': 'package'
  };
  window.nexusIconeProduto = function (p) {
    var e = String((p && p.emoji) || '').replace(/\uFE0F/g, '').trim();
    if (window.NEXUS_ICONES_PRODUTO[e]) return e;
    return EMOJI_PARA_ICONE[e] || 'package';
  };

  // ── 7) Lightbox de imagens reutilizável ────────────────────────────
  // nexusLightbox([{src, cap}], indiceInicial) — cria o overlay sob demanda,
  // com navegação por teclado (setas/Esc), swipe e contador.
  var lb = null;
  function montarLightbox() {
    if (lb) return lb;
    var el = document.createElement('div');
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Visualizador de imagens');
    el.innerHTML =
      '<span class="lightbox-count"></span>' +
      '<button class="btn btn-icon lightbox-x" type="button" aria-label="Fechar">' + window.nexusIcon('x') + '</button>' +
      '<button class="btn btn-icon lightbox-nav lightbox-prev" type="button" aria-label="Anterior">' + window.nexusIcon('chevron-left') + '</button>' +
      '<figure class="lightbox-figure"><img alt=""/><figcaption class="lightbox-cap"></figcaption></figure>' +
      '<button class="btn btn-icon lightbox-nav lightbox-next" type="button" aria-label="Próxima">' + window.nexusIcon('chevron-right') + '</button>';
    document.body.appendChild(el);

    lb = { el: el, itens: [], i: 0, img: el.querySelector('img'), cap: el.querySelector('.lightbox-cap'), count: el.querySelector('.lightbox-count') };

    lb.render = function () {
      var it = lb.itens[lb.i];
      if (!it) return;
      lb.img.style.opacity = '0';
      var img = new Image();
      img.onload = img.onerror = function () { lb.img.src = it.src; lb.img.alt = it.cap || ''; lb.img.style.opacity = '1'; };
      img.src = it.src;
      lb.cap.textContent = it.cap || '';
      var multi = lb.itens.length > 1;
      lb.count.textContent = multi ? (lb.i + 1) + ' / ' + lb.itens.length : '';
      el.querySelectorAll('.lightbox-nav').forEach(function (b) { b.hidden = !multi; });
      // Pré-carrega a próxima imagem para a navegação ficar instantânea
      if (multi) { var prox = lb.itens[(lb.i + 1) % lb.itens.length]; if (prox) new Image().src = prox.src; }
    };
    lb.ir = function (d) { if (lb.itens.length < 2) return; lb.i = (lb.i + d + lb.itens.length) % lb.itens.length; lb.render(); };
    lb.fechar = function () { el.classList.remove('open'); document.body.style.overflow = ''; if (lb.foco) lb.foco.focus(); };

    el.querySelector('.lightbox-x').addEventListener('click', lb.fechar);
    el.querySelector('.lightbox-prev').addEventListener('click', function () { lb.ir(-1); });
    el.querySelector('.lightbox-next').addEventListener('click', function () { lb.ir(1); });
    el.addEventListener('mousedown', window.nexusOverlayDown);
    el.addEventListener('click', function (ev) {
      // fecha ao clicar no fundo (fora da imagem e dos botões)
      if (ev.target === el || ev.target.classList.contains('lightbox-figure')) {
        if (ev.target === el) window.nexusOverlayClick(ev, lb.fechar); else lb.fechar();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (!el.classList.contains('open')) return;
      if (e.key === 'Escape') lb.fechar();
      if (e.key === 'ArrowLeft') lb.ir(-1);
      if (e.key === 'ArrowRight') lb.ir(1);
    });
    var x0 = 0, y0 = 0;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) lb.ir(dx < 0 ? 1 : -1);
    }, { passive: true });
    return lb;
  }

  window.nexusLightbox = function (itens, inicio) {
    var l = montarLightbox();
    l.itens = itens || [];
    l.i = inicio || 0;
    l.foco = document.activeElement;
    l.render();
    l.el.classList.add('open');
    document.body.style.overflow = 'hidden';
    l.el.querySelector('.lightbox-x').focus({ preventScroll: true });
  };
})();
