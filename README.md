# Estensione per Chrome / Opera

Riformula o modifica il testo selezionato con un modello locale di Ollama.

## Come installarla (3 passaggi)

1. **Abilita CORS su Ollama**: assicurati che la variabile d'ambiente `OLLAMA_ORIGINS` sia impostata su `*` (altrimenti Ollama risponderà con errore 403 Forbidden alle richieste provenienti dall'estensione) e riavvia Ollama.

2. **Apri la pagina delle estensioni**:
   - **Chrome**: digita `chrome://extensions` nella barra degli indirizzi e premi Invio.
   - **Opera**: digita `opera://extensions` nella barra degli indirizzi e premi Invio.
   - (Anche Edge, Brave e gli altri browser Chromium funzionano: `edge://extensions`, `brave://extensions`.)

3. **Carica l'estensione**: attiva l'interruttore **Modalità sviluppatore** (in alto a destra), clicca su **Carica estensione non pacchettizzata** (Chrome: *Carica unpacked*) e seleziona la cartella `ollama-rewriter`.

Dopo ogni modifica al codice, clicca sull'icona di ricarica dell'estensione e aggiorna le pagine già aperte.

## Uso

- Seleziona del testo: compare l'icona ✨ vicino alla selezione.
- Nei campi di testo (`<textarea>`, `<input>`, `contenteditable`) puoi usare **Sostituisci** per scrivere il risultato al posto della selezione.
- Il popup si trascina dall'intestazione e si chiude con **×** o **Esc**.

## Modello

Il modello è impostato in `background.js` (`DEFAULT_MODEL`, predefinito `gemma4:12b`). Cambialo con uno dei modelli installati (`ollama list`).
