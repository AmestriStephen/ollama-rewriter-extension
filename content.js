let hostElement = null;
let shadowRoot = null;
let selectedText = "";
let selectionRect = null;
let target = null; // dove scrivere il risultato: {el,start,end} (input/textarea) | {range,host} (contenteditable) | null
let cancelRun = null; // annulla la richiesta in corso
let userPos = null; // posizione scelta trascinando il popup (riusata alle aperture successive)

function initUI() {
  if (hostElement?.isConnected) return; // le SPA possono rimuovere il nodo dal DOM
  hostElement = document.createElement("div");
  hostElement.id = "ollama-rewriter-host";
  document.body.appendChild(hostElement);
  shadowRoot = hostElement.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    #floating-btn {
      position: fixed;
      z-index: 2147483647;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #18181b;
      color: #fff;
      border: 1px solid #3f3f46;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    #floating-btn:hover { transform: scale(1.1); background: #27272a; }

    #popup-card {
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #3f3f46;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.45);
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 10px;
      font-size: 13px;
      max-height: calc(100vh - 20px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: #a1a1aa;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: move;
      user-select: none;
      touch-action: none;
    }
    .close-btn {
      background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 16px; padding: 0 4px;
    }
    .close-btn:hover { color: #fff; }

    .btn-primary {
      width: 100%;
      padding: 8px 12px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .prompt-row {
      display: flex;
      gap: 6px;
    }
    input[type="text"] {
      flex: 1;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 7px 10px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    input[type="text"]:focus { border-color: #6366f1; }

    .btn-send {
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #fff;
      border-radius: 8px;
      padding: 0 12px;
      cursor: pointer;
      font-weight: 600;
    }
    .btn-send:hover { background: #3f3f46; }

    #result-box {
      display: none;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 10px;
      line-height: 1.45;
      max-height: 180px;
      overflow-y: auto;
      overscroll-behavior: contain;
      white-space: pre-wrap;
    }

    .actions-row {
      display: none;
      justify-content: flex-end;
      gap: 6px;
    }
    .btn-copy {
      background: #10b981;
      color: #064e3b;
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-copy:hover { background: #34d399; }

    .btn-replace { background: #6366f1; color: #fff; }
    .btn-replace:hover { background: #4f46e5; }

    .loader {
      display: none;
      justify-content: space-between;
      align-items: center;
      color: #a1a1aa;
      font-style: italic;
    }
    .loader button { padding: 4px 10px; font-size: 12px; }
  `;

  const container = document.createElement("div");
  container.innerHTML = `
    <button id="floating-btn" title="Modifica con Ollama">✨</button>

    <div id="popup-card">
      <div class="header">
        <span>Ollama Rewriter</span>
        <button class="close-btn" id="close-popup">&times;</button>
      </div>

      <button class="btn-primary" id="btn-rephrase">✨ Riformula (stesso senso)</button>

      <div class="prompt-row">
        <input type="text" id="custom-prompt" placeholder="Es: rendi più amichevole..." />
        <button class="btn-send" id="btn-custom">Vai</button>
      </div>

      <div class="loader" id="loader">
        <span>Generazione con Ollama...</span>
        <button class="btn-send" id="btn-cancel">Annulla</button>
      </div>
      <div id="result-box"></div>
      <div class="actions-row" id="actions-row">
        <button class="btn-copy btn-replace" id="btn-replace">Sostituisci</button>
        <button class="btn-copy" id="btn-copy">Copia testo</button>
      </div>
    </div>
  `;

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(container);
  bindEvents();
}

function bindEvents() {
  const floatingBtn = shadowRoot.getElementById("floating-btn");
  const popupCard = shadowRoot.getElementById("popup-card");
  const closeBtn = shadowRoot.getElementById("close-popup");
  const btnRephrase = shadowRoot.getElementById("btn-rephrase");
  const btnCustom = shadowRoot.getElementById("btn-custom");
  const customInput = shadowRoot.getElementById("custom-prompt");
  const loader = shadowRoot.getElementById("loader");
  const resultBox = shadowRoot.getElementById("result-box");
  const actionsRow = shadowRoot.getElementById("actions-row");
  const btnCopy = shadowRoot.getElementById("btn-copy");

  // Clic sull'iconcina -> apre il popup
  floatingBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    floatingBtn.style.display = "none";
    
    // Posiziona il popup evitando che esca dallo schermo
    const top = Math.min(selectionRect.bottom + 8, window.innerHeight - 280);
    const left = Math.min(Math.max(10, selectionRect.left), window.innerWidth - 340);
    
    popupCard.style.top = `${userPos?.top ?? top}px`;
    popupCard.style.left = `${userPos?.left ?? left}px`;
    popupCard.style.display = "flex";
    
    // Reset stato precedente
    resultBox.style.display = "none";
    actionsRow.style.display = "none";
    customInput.value = "";
    customInput.focus();
  });

  const btnCancel = shadowRoot.getElementById("btn-cancel");
  const btnReplace = shadowRoot.getElementById("btn-replace");

  // Il popup cresce mentre arriva il testo: riportalo nel viewport (fixed, non segue lo scroll)
  const clampPopup = () => {
    const maxTop = window.innerHeight - popupCard.offsetHeight - 10;
    popupCard.style.top = `${Math.max(10, Math.min(parseFloat(popupCard.style.top), maxTop))}px`;
  };

  closeBtn.addEventListener("click", () => {
    cancelRun?.();
    popupCard.style.display = "none";
  });

  const runOllama = (mode, retried = false) => {
    const promptVal = customInput.value.trim();
    if (mode === "custom" && !promptVal) return;

    loader.style.display = "flex";
    actionsRow.style.display = "none";
    resultBox.style.display = "block";
    resultBox.style.color = "#f4f4f5";
    resultBox.textContent = "";
    btnRephrase.disabled = true;
    btnCustom.disabled = true;

    const reset = () => {
      loader.style.display = "none";
      btnRephrase.disabled = false;
      btnCustom.disabled = false;
      cancelRun = null;
    };
    let port;
    try {
      port = chrome.runtime.connect({ name: "ollama" });
    } catch {
      // estensione ricaricata: questo content script è orfano
      resultBox.style.color = "#f87171";
      resultBox.textContent = "Estensione aggiornata: ricarica la pagina.";
      reset();
      return;
    }
    let out = "";
    let settled = false;
    const finish = () => {
      settled = true;
      reset();
      port.disconnect();
    };
    cancelRun = finish;

    // Il service worker può essere terminato a metà richiesta: un solo retry automatico
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      if (!retried) return runOllama(mode, true);
      resultBox.style.color = "#f87171";
      resultBox.textContent = "Connessione con l'estensione interrotta. Riprova.";
      reset();
    });

    port.onMessage.addListener((msg) => {
      if (msg.chunk) {
        out += msg.chunk;
        // autoscroll solo se l'utente è già in fondo, altrimenti non togliergli il controllo
        const atBottom = resultBox.scrollHeight - resultBox.scrollTop - resultBox.clientHeight < 24;
        resultBox.textContent = out.trimStart();
        if (atBottom) resultBox.scrollTop = resultBox.scrollHeight;
        clampPopup();
      } else if (msg.error) {
        resultBox.style.color = "#f87171";
        resultBox.textContent = msg.error;
        clampPopup();
        finish();
      } else if (msg.done) {
        resultBox.textContent = out.trim();
        btnCopy.textContent = "Copia testo";
        btnReplace.style.display = target ? "" : "none";
        actionsRow.style.display = "flex";
        clampPopup();
        finish();
      }
    });
    port.postMessage({ text: selectedText, mode, customPrompt: promptVal });
  };

  // Trascina il popup dall'header
  const header = shadowRoot.querySelector(".header");
  header.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".close-btn")) return;
    const r = popupCard.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    header.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - popupCard.offsetWidth);
      const top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - popupCard.offsetHeight);
      popupCard.style.left = `${left}px`;
      popupCard.style.top = `${top}px`;
      userPos = { top, left };
    };
    const up = () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", up);
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", up);
  });

  btnCancel.addEventListener("click", () => cancelRun?.());

  btnReplace.addEventListener("click", () => {
    const text = resultBox.textContent;
    if (target.el) {
      const { el, start, end } = target;
      el.focus();
      el.setRangeText(text, start, end, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      target.host?.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(target.range);
      document.execCommand("insertText", false, text);
    }
    popupCard.style.display = "none";
  });

  btnRephrase.addEventListener("click", () => runOllama("rephrase"));
  btnCustom.addEventListener("click", () => runOllama("custom"));
  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runOllama("custom");
  });

  btnCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(resultBox.textContent);
    btnCopy.textContent = "Copiato! ✓";
    setTimeout(() => { btnCopy.textContent = "Copia testo"; }, 1500);
  });

  // I tasti digitati nel popup non devono arrivare alla pagina: nello shadow DOM l'evento viene
  // ritargettato sull'host, quindi il sito non lo riconosce come campo di testo e scatta
  // le sue scorciatoie (es. "f" = schermo intero, "c" = sottotitoli su YouTube).
  for (const type of ["keydown", "keyup", "keypress"]) {
    popupCard.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "keydown" && e.key === "Escape") {
        cancelRun?.();
        popupCard.style.display = "none";
      }
    });
  }

  // Evita che clic dentro il popup chiudano tutto
  popupCard.addEventListener("mousedown", (e) => e.stopPropagation());
  floatingBtn.addEventListener("mousedown", (e) => e.stopPropagation());
}

// Rileva selezione del testo
function onSelectionEnd() {
  if (!document.body) return;
  initUI();
  const floatingBtn = shadowRoot.getElementById("floating-btn");
  const popupCard = shadowRoot.getElementById("popup-card");

  setTimeout(() => {
    if (popupCard.style.display === "flex") return;

    let text, rect, tgt = null;
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && el.selectionStart != null && el.selectionStart !== el.selectionEnd) {
      // In input/textarea la Selection API non dà un rect utile: uso quello dell'elemento
      text = el.value.slice(el.selectionStart, el.selectionEnd);
      rect = el.getBoundingClientRect();
      tgt = { el, start: el.selectionStart, end: el.selectionEnd };
    } else {
      const selection = window.getSelection();
      text = selection.toString();
      if (!text.trim()) return;
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
      const n = selection.anchorNode;
      const node = n?.nodeType === 1 ? n : n?.parentElement;
      if (node?.isContentEditable) tgt = { range: range.cloneRange(), host: el };
    }
    if (!text.trim()) return;

    selectedText = text.trim();
    selectionRect = rect;
    target = tgt;

    floatingBtn.style.top = `${Math.max(8, rect.top - 38)}px`;
    floatingBtn.style.left = `${Math.min(window.innerWidth - 40, rect.right)}px`;
    floatingBtn.style.display = "flex";
  }, 10);
}
// Capture: molti siti/editor fermano la propagazione di mouseup e il bottone non appariva
document.addEventListener("mouseup", onSelectionEnd, true);
// Selezione da tastiera (Shift+frecce, Ctrl+A)
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" || e.shiftKey || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a")) onSelectionEnd();
}, true);

// Cliccare altrove nasconde solo l'icona; il popup resta aperto (si chiude con × o Esc)
document.addEventListener("mousedown", () => {
  if (!shadowRoot) return;
  shadowRoot.getElementById("floating-btn").style.display = "none";
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !shadowRoot) return;
  cancelRun?.();
  shadowRoot.getElementById("popup-card").style.display = "none";
});