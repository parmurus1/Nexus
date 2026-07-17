/* venom.js — "Modo Venom": tema preto e branco com partículas simbiontes
   escorrendo pela tela (drips + specks flutuantes).
   Ativado/desativado pelo painel admin (config: venom_mode). Incluído em
   todas as páginas públicas; não faz nada se o modo estiver desligado. */
(function () {
  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'venom-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML =
      '<div class="venom-vignette"></div>' +
      '<div class="venom-drips" id="venomDrips"></div>' +
      '<div class="venom-specks" id="venomSpecks"></div>';

    document.body.appendChild(overlay);

    var dripsWrap = overlay.querySelector('#venomDrips');
    var dripCount = window.innerWidth < 640 ? 14 : 26;
    for (var i = 0; i < dripCount; i++) {
      var d = document.createElement('div');
      d.className = 'venom-drip';
      var left = Math.random() * 100;
      var dur = 2.6 + Math.random() * 5;
      var delay = Math.random() * 6;
      var height = 50 + Math.random() * 120;
      var width = 1 + Math.random() * 2.2;
      d.style.left = left + 'vw';
      d.style.animationDuration = dur.toFixed(2) + 's';
      d.style.animationDelay = delay.toFixed(2) + 's';
      d.style.height = height.toFixed(0) + 'px';
      d.style.width = width.toFixed(1) + 'px';
      dripsWrap.appendChild(d);
    }

    var specksWrap = overlay.querySelector('#venomSpecks');
    var speckCount = window.innerWidth < 640 ? 10 : 20;
    for (var j = 0; j < speckCount; j++) {
      var s = document.createElement('div');
      s.className = 'venom-speck';
      var sLeft = Math.random() * 100;
      var sDur = 6 + Math.random() * 8;
      var sDelay = Math.random() * 10;
      var sSize = 2 + Math.random() * 4;
      var sDrift = (Math.random() * 60 - 30).toFixed(0);
      s.style.left = sLeft + 'vw';
      s.style.width = sSize.toFixed(1) + 'px';
      s.style.height = sSize.toFixed(1) + 'px';
      s.style.animationDuration = sDur.toFixed(2) + 's';
      s.style.animationDelay = sDelay.toFixed(2) + 's';
      s.style.setProperty('--drift', sDrift + 'px');
      specksWrap.appendChild(s);
    }
  }

  function injectStyle() {
    var css =
      'html.venom-mode{filter:grayscale(1) contrast(1.12) brightness(0.97);}' +
      'body.venom-mode{' +
        '--red:#f2f2f2;--red-dim:#c9c9c9;--red-glow:rgba(255,255,255,0.22);--red-mid:rgba(255,255,255,0.08);' +
        '--bg:#000000;--bg2:#0a0a0a;--bg3:#131313;--bg4:#1c1c1c;' +
        '--border:rgba(255,255,255,0.10);--border-s:rgba(255,255,255,0.2);' +
        '--text:#f5f5f5;--text2:#b4b4b4;--text3:#8a8a8a;--glass:rgba(0,0,0,0.94);' +
      '}' +
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
      '.venom-drips{position:absolute;top:0;left:0;width:100%;height:100%;}' +
      '.venom-drip{position:absolute;top:-120px;background:linear-gradient(to bottom,rgba(245,245,245,0.65),rgba(245,245,245,0.15) 70%,rgba(245,245,245,0));border-radius:0 0 3px 3px;animation-name:venomDrip;animation-timing-function:linear;animation-iteration-count:infinite;filter:drop-shadow(0 0 3px rgba(255,255,255,0.25));}' +
      '.venom-drip::after{content:"";position:absolute;left:50%;bottom:0;width:5px;height:5px;background:rgba(245,245,245,0.7);border-radius:50%;transform:translateX(-50%);filter:blur(0.5px);}' +
      '.venom-specks{position:absolute;inset:0;}' +
      '.venom-speck{position:absolute;top:-10px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.85),rgba(255,255,255,0.1) 70%);animation-name:venomSpeck;animation-timing-function:ease-in;animation-iteration-count:infinite;}' +
      '@keyframes venomPulse{0%,100%{opacity:0.55;}50%{opacity:0.9;}}' +
      '@keyframes venomDrip{0%{transform:translateY(-120px);opacity:0;}10%{opacity:0.9;}85%{opacity:0.4;}100%{transform:translateY(115vh);opacity:0;}}' +
      '@keyframes venomSpeck{0%{transform:translate(0,-10px);opacity:0;}8%{opacity:0.9;}92%{opacity:0.5;}100%{transform:translate(var(--drift,0),115vh);opacity:0;}}' +
      '@media(prefers-reduced-motion:reduce){.venom-vignette,.venom-drip,.venom-speck{animation:none!important;opacity:1!important;}}';

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

  (async function init() {
    try {
      var res = await fetch('/api/config');
      if (!res.ok) return;
      var d = await res.json();
      if (d.venom_mode === 'true' || d.venom_mode === true) activateVenomMode();
    } catch (e) {}
  })();
})();
