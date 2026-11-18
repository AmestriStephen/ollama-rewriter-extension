const OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_MODEL = "gemma4:12b"; // <-- Cambia qui con il tuo modello locale
const IDLE_TIMEOUT_MS = 90000; // nessun byte ricevuto per tanto tempo -> errore

function buildPrompt({ text, mode, customPrompt }) {
  const instruction =
    mode === "rephrase"
      ? "Riformula il seguente testo (parola o frase) cambiandone la forma ma mantenendo esattamente lo stesso senso e la stessa lingua. Restituisci SOLO il testo riformulato, senza virgolette, introduzioni o commenti."
      : `Applica questa istruzione al testo fornito: "${customPrompt}". Mantieni la lingua originale del testo. Restituisci SOLO il testo modificato, senza virgolette, introduzioni o commenti.`;
  return `${instruction}\n\nTesto originale:\n${text}`;
}

function httpError(status) {
  if (status === 404) return `Modello "${DEFAULT_MODEL}" non trovato. Eseguire: ollama pull ${DEFAULT_MODEL}`;
  if (status === 403) return "Ollama ha rifiutato la richiesta (403). Imposta OLLAMA_ORIGINS='*' e riavvia Ollama.";
  return `Errore HTTP ${status} da Ollama.`;
}

// Streaming via port: il popup mostra il testo man mano e può annullare (disconnect).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ollama") return;

  port.onMessage.addListener(async (request) => {
    const ctrl = new AbortController();
    let timedOut = false;
    let idle;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { timedOut = true; ctrl.abort(); }, IDLE_TIMEOUT_MS);
    };
    const send = (msg) => { try { port.postMessage(msg); } catch {} };
    port.onDisconnect.addListener(() => ctrl.abort());
    // keepalive: evita che il service worker venga terminato durante il caricamento del modello
    const keepAlive = setInterval(() => send({ ping: true }), 20000);

    try {
      arm();
      const res = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          prompt: buildPrompt(request),
          stream: true,
          think: false, // niente ragionamento nascosto: riscrivere non ne ha bisogno
          options: { temperature: 0.35, num_predict: 1024 }
        })
      });
      if (!res.ok) throw new Error(httpError(res.status));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line);
          if (obj.error) throw new Error(obj.error);
          if (obj.response) send({ chunk: obj.response });
        }
      }
      send({ done: true });
    } catch (err) {
      if (ctrl.signal.aborted && !timedOut) return; // annullato dall'utente
      let error = err.message;
      if (timedOut) error = `Nessuna risposta da Ollama per ${IDLE_TIMEOUT_MS / 1000}s.`;
      else if (err instanceof TypeError) error = "Impossibile contattare Ollama. Verifica che sia avviato e che OLLAMA_ORIGINS='*' sia impostato.";
      send({ error });
    } finally {
      clearTimeout(idle);
      clearInterval(keepAlive);
    }
  });
});
