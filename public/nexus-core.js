/* nexus-core.js — utilitários compartilhados entre as páginas do site.

   1) Fix do bug "clicar e arrastar texto fecha a janela": os overlays de
      modal usavam onclick="if(event.target===this)fechar()". Ao selecionar
      texto dentro do modal (mousedown em cima do texto, arrasta, solta o
      mouse fora — em cima do overlay), o navegador dispara um evento
      "click" no overlay, fechando o modal sem querer.
      A solução: só fechar se o mousedown E o click tiverem começado e
      terminado no próprio overlay (não em um filho, não em um "arrasto").

   2) Aviso de "sair sem salvar": marca formulários/modais como "sujos"
      quando o usuário edita algo, e avisa antes de fechar a aba/janela
      (beforeunload) ou de fechar o modal enquanto há alterações não salvas.
*/
(function () {
  'use strict';

  // ── 1) Overlay click guard ─────────────────────────────────────────
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

  // ── 2) Alterações não salvas ───────────────────────────────────────
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
  window.nexusWatchForm = function (containerId, key) {
    var el = document.getElementById(containerId);
    if (!el) return;
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
})();
