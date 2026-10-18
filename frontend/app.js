const apiBase = "http://localhost:3001";
const sessionId = crypto.randomUUID();
const transcriptEl = document.getElementById("voice-transcript");
const startBtn = document.getElementById("voice-start");
const stopBtn = document.getElementById("voice-stop");
const sendBtn = document.getElementById("voice-send");
const textInput = document.getElementById("voice-text");
const widget = document.getElementById("voice-widget");
const toggleBtn = document.getElementById("voice-widget-toggle");
const closeBtn = document.getElementById("voice-widget-close");
const languageLabel = document.getElementById("voice-language");

let recognition;
let isListening = false;

function appendEntry(role, text) {
  const entry = document.createElement("div");
  entry.className = "entry";
  const label = document.createElement("strong");
  label.textContent = role;
  const content = document.createElement("span");
  content.textContent = text;
  entry.append(label, content);
  transcriptEl.appendChild(entry);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function setLanguageLabel(language) {
  const mapping = {
    es: "Español",
    en: "English",
    fr: "Français",
    pt: "Português"
  };
  languageLabel.textContent = `Idioma: ${mapping[language] ?? "automático"}`;
}

async function sendChat(text) {
  appendEntry("Usuario", text);
  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, text })
  });
  const data = await response.json();
  appendEntry("Agente", data.reply);
  setLanguageLabel(data.language);
  await playResponse(data.reply, data.language);
}

async function playResponse(text, language) {
  try {
    const response = await fetch(`${apiBase}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language })
    });
    const data = await response.json();

    if (data.audioBase64) {
      const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
      await audio.play();
      return;
    }
  } catch (error) {
    console.warn("TTS failed, falling back", error);
  }

  const utterance = new SpeechSynthesisUtterance(text);
  if (language) {
    utterance.lang = language;
  }
  speechSynthesis.speak(utterance);
}

function ensureRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("SpeechRecognition no está disponible en este navegador.");
    return null;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      const sttResponse = await fetch(`${apiBase}/api/stt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, sessionId })
      });
      const sttData = await sttResponse.json();
      await sendChat(sttData.text);
    };

    recognition.onerror = (event) => {
      console.error("STT error", event.error);
      stopListening();
    };

    recognition.onend = () => {
      stopListening();
    };
  }

  return recognition;
}

function startListening() {
  const recognizer = ensureRecognition();
  if (!recognizer) {
    return;
  }

  recognizer.lang = navigator.language || "es-ES";
  recognizer.start();
  isListening = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
  isListening = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startListening);
stopBtn.addEventListener("click", stopListening);

sendBtn.addEventListener("click", () => {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = "";
  sendChat(text);
});

textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendBtn.click();
  }
});

toggleBtn.addEventListener("click", () => {
  widget.classList.add("active");
});

closeBtn.addEventListener("click", () => {
  widget.classList.remove("active");
});
