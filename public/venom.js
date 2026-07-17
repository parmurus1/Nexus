/* venom.js — "Modo Venom": tema preto e branco com tentáculos animados.
   Ativado/desativado pelo painel admin (config: venom_mode). Incluído em
   todas as páginas públicas; não faz nada se o modo estiver desligado. */
(function () {
  var TENTACLE_PATH =
    'M62,320 C22,300 10,258 27,218 C42,180 14,150 30,110 ' +
    'C46,70 18,50 34,18 C41,6 50,0 58,0 C65,0 72,7 67,20 ' +
    'C80,52 57,74 68,110 C81,150 58,186 79,220 ' +
    'C94,254 84,296 101,318 C90,323 72,323 62,320 Z';

  var SPIKES = [
    'M28,230 C18,222 14,208 20,196 C26,206 32,214 34,224 Z',
    'M76,178 C88,172 96,160 92,146 C82,154 74,164 70,174 Z',
    'M32,120 C20,116 10,106 12,92 C24,98 32,108 36,118 Z',
    'M70,70 C82,64 90,52 84,40 C74,46 68,58 66,68 Z'
  ];

  function svgTentacle(extraClass) {
    var spikes = SPIKES.map(function (d) {
      return '<path d="' + d + '" fill="url(#venomSpikeGrad)"></path>';
    }).join('');
    return (
      '<svg class="venom-tentacle ' + extraClass + '" viewBox="0 0 120 324" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' +
          '<linearGradient id="venomBodyGrad" x1="0" y1="1" x2="0" y2="0">' +
            '<stop offset="0%" stop-color="#000000"></stop>' +
            '<stop offset="55%" stop-color="#0d0d0d"></stop>' +
            '<stop offset="100%" stop-color="#3a3a3a"></stop>' +
          '</linearGradient>' +
          '<linearGradient id="venomSpikeGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#111111"></stop>' +
            '<stop offset="100%" stop-color="#050505"></stop>' +
          '</linearGradient>' +
        '</defs>' +
        '<path d="' + TENTACLE_PATH + '" fill="url(#venomBodyGrad)" stroke="rgba(255,255,255,0.12)" stroke-width="1"></path>' +
        spikes +
      '</svg>'
    );
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'venom-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML =
      '<div class="venom-vignette"></div>' +
      '<div class="venom-drips" id="venomDrips"></div>' +
      svgTentacle('venom-tentacle--bl') +
      svgTentacle('venom-tentacle--br') +
      svgTentacle('venom-tentacle--tl') +
      svgTentacle('venom-tentacle--tr');

    document.body.appendChild(overlay);

    var dripsWrap = overlay.querySelector('#venomDrips');
    var count = window.innerWidth < 640 ? 6 : 12;
    for (var i = 0; i < count; i++) {
      var d = document.createElement('div');
      d.className = 'venom-drip';
      var left = Math.random() * 100;
      var dur = 3 + Math.random() * 3.5;
      var delay = Math.random() * 5;
      var height = 40 + Math.random() * 50;
      d.style.left = left + 'vw';
      d.style.animationDuration = dur.toFixed(2) + 's';
      d.style.animationDelay = delay.toFixed(2) + 's';
      d.style.height = height.toFixed(0) + 'px';
      dripsWrap.appendChild(d);
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
      '.venom-overlay{position:fixed;inset:0;z-index:40;overflow:hidden;pointer-events:none;}' +
      '.venom-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.6) 100%);animation:venomPulse 6s ease-in-out infinite;}' +
      '.venom-drips{position:absolute;top:0;left:0;width:100%;height:160px;}' +
      '.venom-drip{position:absolute;top:-60px;width:2px;background:linear-gradient(to bottom,rgba(245,245,245,0.55),rgba(245,245,245,0));border-radius:0 0 2px 2px;animation-name:venomDrip;animation-timing-function:linear;animation-iteration-count:infinite;}' +
      '.venom-tentacle{position:absolute;width:190px;height:auto;opacity:0;filter:drop-shadow(0 0 22px rgba(255,255,255,0.05));animation:venomEnter 1.4s ease forwards;}' +
      '.venom-tentacle--bl{left:-46px;bottom:-64px;transform-origin:88% 100%;animation-name:venomEnter,venomSwayL;animation-duration:1.4s,7.5s;animation-delay:0s,1.4s;animation-timing-function:ease,ease-in-out;animation-iteration-count:1,infinite;animation-fill-mode:forwards,none;}' +
      '.venom-tentacle--br{right:-46px;bottom:-64px;transform:scaleX(-1);transform-origin:12% 100%;animation-name:venomEnterR,venomSwayR;animation-duration:1.4s,8.4s;animation-delay:0.15s,1.55s;animation-timing-function:ease,ease-in-out;animation-iteration-count:1,infinite;animation-fill-mode:forwards,none;}' +
      '.venom-tentacle--tl{left:-56px;top:-70px;width:150px;transform:rotate(180deg);transform-origin:88% 0%;animation-name:venomEnterTop,venomSwayTopL;animation-duration:1.4s,9.2s;animation-delay:0.3s,1.7s;animation-timing-function:ease,ease-in-out;animation-iteration-count:1,infinite;animation-fill-mode:forwards,none;}' +
      '.venom-tentacle--tr{right:-56px;top:-70px;width:150px;transform:rotate(180deg) scaleX(-1);transform-origin:12% 0%;animation-name:venomEnterTop,venomSwayTopR;animation-duration:1.4s,6.8s;animation-delay:0.45s,1.85s;animation-timing-function:ease,ease-in-out;animation-iteration-count:1,infinite;animation-fill-mode:forwards,none;}' +
      '@keyframes venomEnter{0%{opacity:0;transform:translateY(40px) rotate(-12deg) scale(0.85);}100%{opacity:1;transform:translateY(0) rotate(-3deg) scale(1);}}' +
      '@keyframes venomEnterR{0%{opacity:0;transform:scaleX(-1) translateY(40px) rotate(-12deg) scale(0.85);}100%{opacity:1;transform:scaleX(-1) translateY(0) rotate(-3deg) scale(1);}}' +
      '@keyframes venomEnterTop{0%{opacity:0;transform:rotate(180deg) translateY(-40px) scale(0.85);}100%{opacity:1;transform:rotate(180deg) translateY(0) scale(1);}}' +
      '@keyframes venomSwayL{0%,100%{transform:rotate(-3deg) translateY(0);}50%{transform:rotate(7deg) translateY(-16px);}}' +
      '@keyframes venomSwayR{0%,100%{transform:scaleX(-1) rotate(-3deg) translateY(0);}50%{transform:scaleX(-1) rotate(7deg) translateY(-16px);}}' +
      '@keyframes venomSwayTopL{0%,100%{transform:rotate(180deg) rotate(0deg) translateY(0);}50%{transform:rotate(180deg) rotate(8deg) translateY(12px);}}' +
      '@keyframes venomSwayTopR{0%,100%{transform:rotate(180deg) scaleX(-1) rotate(0deg) translateY(0);}50%{transform:rotate(180deg) scaleX(-1) rotate(8deg) translateY(12px);}}' +
      '@keyframes venomPulse{0%,100%{opacity:0.55;}50%{opacity:0.9;}}' +
      '@keyframes venomDrip{0%{transform:translateY(-40px);opacity:0;}12%{opacity:0.85;}88%{opacity:0.35;}100%{transform:translateY(180px);opacity:0;}}' +
      '@media(max-width:640px){.venom-tentacle{width:120px;}.venom-tentacle--tl,.venom-tentacle--tr{width:100px;}}' +
      '@media(prefers-reduced-motion:reduce){.venom-tentacle,.venom-vignette,.venom-drip{animation:none!important;opacity:1!important;}}';

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
