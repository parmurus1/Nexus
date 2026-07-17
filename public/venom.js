/* venom.js — "Modo Venom": tema preto e branco com vinheta pulsante.
   Ativado/desativado pelo painel admin (config: venom_mode). Incluído em
   todas as páginas públicas; não faz nada se o modo estiver desligado. */
(function () {
  var CACHE_KEY = 'nexus_venom_mode';

  function buildOverlay() {
    if (document.querySelector('.venom-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'venom-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="venom-vignette"></div>';
    document.body.appendChild(overlay);
  }

  function injectStyle() {
    if (document.getElementById('venomStyle')) return;
    var css =
      /* Sem filtro grayscale na <html> inteira: aplicar filter em toda a
         árvore (com orbs animados e blur por baixo) é pesado e travava a
         página enquanto renderizava. O tema P&B vem das variáveis abaixo;
         só as fotos (que têm cor real) recebem grayscale, que é barato. */
      'body.venom-mode{' +
        '--red:#f2f2f2;--red-dim:#c9c9c9;--red-glow:rgba(255,255,255,0.22);--red-mid:rgba(255,255,255,0.08);' +
        '--bg:#000000;--bg2:#0a0a0a;--bg3:#131313;--bg4:#1c1c1c;' +
        '--border:rgba(255,255,255,0.10);--border-s:rgba(255,255,255,0.2);' +
        '--text:#f5f5f5;--text2:#b4b4b4;--text3:#8a8a8a;--glass:rgba(0,0,0,0.94);' +
      '}' +
      'body.venom-mode img{filter:grayscale(1) contrast(1.05);}' +
      /* botões/badges com fundo claro (var(--red) vira quase-branco no modo venom)
         tinham texto branco fixo no CSS de cada página, ficando ilegível — força preto. */
      'body.venom-mode .btn-primary,' +
      'body.venom-mode .btn-red,' +
      'body.venom-mode .btn-save,' +
      'body.venom-mode .btn-cfm,' +
      'body.venom-mode .btn,' +
      'body.venom-mode .cart-float,' +
      'body.venom-mode .badge-novo,' +
      'body.venom-mode .btn-add-cart,' +
      'body.venom-mode .sz.on,' +
      'body.venom-mode .btn-add,' +
      'body.venom-mode .btn-finalizar,' +
      'body.venom-mode .carr-qtd,' +
      'body.venom-mode .arr-btn:hover,' +
      'body.venom-mode .bilhete.sl,' +
      'body.venom-mode .req-badge,' +
      'body.venom-mode .btn-buy' +
      '{color:#000!important;}' +
      '.venom-overlay{position:fixed;inset:0;z-index:40;overflow:hidden;pointer-events:none;}' +
      '.venom-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.6) 100%);animation:venomPulse 6s ease-in-out infinite;}' +
      '@keyframes venomPulse{0%,100%{opacity:0.55;}50%{opacity:0.9;}}' +
      '@media(prefers-reduced-motion:reduce){.venom-vignette{animation:none!important;opacity:1!important;}}';

    var style = document.createElement('style');
    style.id = 'venomStyle';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function activateVenomMode() {
    if (document.documentElement.classList.contains('venom-mode')) return;
    injectStyle();
    document.documentElement.classList.add('venom-mode');
    document.body.classList.add('venom-mode');
    buildOverlay();
  }

  function deactivateVenomMode() {
    document.documentElement.classList.remove('venom-mode');
    if (document.body) document.body.classList.remove('venom-mode');
    var ov = document.querySelector('.venom-overlay');
    if (ov) ov.remove();
  }

  function readCache() {
    try { return sessionStorage.getItem(CACHE_KEY); } catch (e) { return null; }
  }

  function writeCache(on) {
    try { sessionStorage.setItem(CACHE_KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* Aplica de cara o último estado conhecido (sem esperar a API), pra não
     ter aquele delay em que o site carrega normal e só depois "pisca" pro
     modo venom. A checagem com o servidor roda em paralelo e corrige se
     algo mudou. */
  if (readCache() === '1') activateVenomMode();

  (async function init() {
    try {
      var res = await fetch('/api/config');
      if (!res.ok) return;
      var d = await res.json();
      var on = d.venom_mode === 'true' || d.venom_mode === true;
      writeCache(on);
      if (on) activateVenomMode();
      else deactivateVenomMode();
    } catch (e) {}
  })();
})();
