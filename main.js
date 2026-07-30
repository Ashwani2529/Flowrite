/* ================= Flowrite — live voice to text ================= */

const editor = document.getElementById("converted_text");
const placeholder = document.getElementById("placeholder");
const startBtn = document.getElementById("start_button");
const stopBtn = document.getElementById("stop_button");
const copyBtn = document.getElementById("copy_button");
const downloadBtn = document.getElementById("download_button");
const clearBtn = document.getElementById("clear_button");
const langSelect = document.getElementById("lang_select");
const statusPill = document.getElementById("status_pill");
const statusText = document.getElementById("status_text");
const counter = document.getElementById("counter");
const toastEl = document.getElementById("toast");
const unsupported = document.getElementById("unsupported");

/* ---- Languages (Web Speech API BCP-47 codes) ---- */
const LANGUAGES = [
  { code: "en-US", label: "🇺🇸 English (US)" },
  { code: "en-GB", label: "🇬🇧 English (UK)" },
  { code: "en-IN", label: "🇮🇳 English (India)" },
  { code: "hi-IN", label: "🇮🇳 हिन्दी — Hindi" },
  { code: "bn-IN", label: "🇮🇳 বাংলা — Bengali" },
  { code: "ta-IN", label: "🇮🇳 தமிழ் — Tamil" },
  { code: "te-IN", label: "🇮🇳 తెలుగు — Telugu" },
  { code: "mr-IN", label: "🇮🇳 मराठी — Marathi" },
  { code: "gu-IN", label: "🇮🇳 ગુજરાતી — Gujarati" },
  { code: "kn-IN", label: "🇮🇳 ಕನ್ನಡ — Kannada" },
  { code: "ml-IN", label: "🇮🇳 മലയാളം — Malayalam" },
  { code: "pa-IN", label: "🇮🇳 ਪੰਜਾਬੀ — Punjabi" },
  { code: "ur-IN", label: "🇵🇰 اردو — Urdu" },
  { code: "ja-JP", label: "🇯🇵 日本語 — Japanese" },
  { code: "ko-KR", label: "🇰🇷 한국어 — Korean" },
  { code: "zh-CN", label: "🇨🇳 中文 (简体) — Chinese" },
  { code: "zh-TW", label: "🇹🇼 中文 (繁體) — Chinese" },
  { code: "es-ES", label: "🇪🇸 Español — Spanish" },
  { code: "es-MX", label: "🇲🇽 Español (México)" },
  { code: "fr-FR", label: "🇫🇷 Français — French" },
  { code: "de-DE", label: "🇩🇪 Deutsch — German" },
  { code: "it-IT", label: "🇮🇹 Italiano — Italian" },
  { code: "pt-BR", label: "🇧🇷 Português (Brasil)" },
  { code: "pt-PT", label: "🇵🇹 Português — Portuguese" },
  { code: "ru-RU", label: "🇷🇺 Русский — Russian" },
  { code: "ar-SA", label: "🇸🇦 العربية — Arabic" },
  { code: "tr-TR", label: "🇹🇷 Türkçe — Turkish" },
  { code: "nl-NL", label: "🇳🇱 Nederlands — Dutch" },
  { code: "pl-PL", label: "🇵🇱 Polski — Polish" },
  { code: "id-ID", label: "🇮🇩 Bahasa Indonesia" },
  { code: "th-TH", label: "🇹🇭 ไทย — Thai" },
  { code: "vi-VN", label: "🇻🇳 Tiếng Việt — Vietnamese" },
  { code: "uk-UA", label: "🇺🇦 Українська — Ukrainian" },
  { code: "sv-SE", label: "🇸🇪 Svenska — Swedish" },
  { code: "he-IL", label: "🇮🇱 עברית — Hebrew" },
];

LANGUAGES.forEach((l) => {
  const opt = document.createElement("option");
  opt.value = l.code;
  opt.textContent = l.label;
  langSelect.appendChild(opt);
});

/* Pick the closest match to the user's browser language as default */
(function setDefaultLang() {
  const nav = (navigator.language || "en-US").toLowerCase();
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === nav);
  const partial = LANGUAGES.find((l) => l.code.toLowerCase().startsWith(nav.split("-")[0]));
  langSelect.value = (exact || partial || LANGUAGES[0]).code;
})();

/* ---- State ---- */
let recognition = null;
let isListening = false;
let manualStop = false;
let finalText = "";
let interimText = "";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  unsupported.hidden = false;
  startBtn.disabled = true;
}

/* ---- Rendering ---- */
function render() {
  editor.innerHTML = "";
  if (finalText) editor.appendChild(document.createTextNode(finalText));
  if (interimText) {
    const span = document.createElement("span");
    span.className = "interim";
    span.textContent = interimText;
    editor.appendChild(span);
  }
  if (isListening) {
    const caret = document.createElement("span");
    caret.className = "caret";
    editor.appendChild(caret);
  }
  editor.scrollTop = editor.scrollHeight;
  updateMeta();
}

function updateMeta() {
  const text = (finalText + interimText).trim();
  placeholder.classList.toggle("hidden", text.length > 0 || isListening);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  counter.textContent = `${words} word${words === 1 ? "" : "s"} · ${text.length} chars`;
}

function setStatus(state) {
  statusPill.classList.remove("idle", "recording");
  if (state === "recording") {
    statusPill.classList.add("recording");
    statusText.textContent = "Listening…";
  } else {
    statusPill.classList.add("idle");
    statusText.textContent = "Idle";
  }
}

/* ---- Recognition control ---- */
function startRecognition() {
  if (!SpeechRecognition || isListening) return;

  recognition = new SpeechRecognition();
  recognition.lang = langSelect.value;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        let t = r[0].transcript.trim();
        if (t) {
          if (finalText && !/\s$/.test(finalText)) finalText += " ";
          finalText += t;
        }
      } else {
        interim += r[0].transcript;
      }
    }
    interimText = interim;
    render();
  });

  recognition.addEventListener("error", (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showToast("🎙️ Microphone access blocked. Allow it in your browser.");
      manualStop = true;
      stopUI();
    } else if (e.error === "no-speech") {
      // ignore; onend will auto-restart
    }
  });

  recognition.addEventListener("end", () => {
    // Chrome ends the session periodically — restart unless the user stopped.
    if (isListening && !manualStop) {
      try {
        recognition.start();
      } catch (_) {
        /* already starting */
      }
    } else {
      stopUI();
    }
  });

  manualStop = false;
  isListening = true;
  try {
    recognition.start();
  } catch (_) {}

  startBtn.classList.add("is-recording");
  startBtn.setAttribute("aria-label", "Pause recording");
  stopBtn.disabled = false;
  langSelect.disabled = true;
  setStatus("recording");
  editor.setAttribute("contenteditable", "false");
  render();
}

function stopRecognition() {
  manualStop = true;
  isListening = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch (_) {}
  }
  stopUI();
}

function stopUI() {
  isListening = false;
  // fold any pending interim text into the final transcript
  if (interimText.trim()) {
    if (finalText && !/\s$/.test(finalText)) finalText += " ";
    finalText += interimText.trim();
    interimText = "";
  }
  startBtn.classList.remove("is-recording");
  startBtn.setAttribute("aria-label", "Start recording");
  stopBtn.disabled = true;
  langSelect.disabled = false;
  setStatus("idle");
  editor.setAttribute("contenteditable", "true");
  render();
}

/* ---- Toast ---- */
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/* ---- Events ---- */
startBtn.addEventListener("click", () => {
  if (isListening) stopRecognition();
  else startRecognition();
});

stopBtn.addEventListener("click", stopRecognition);

copyBtn.addEventListener("click", () => {
  const text = finalText.trim();
  if (!text) return showToast("Nothing to copy yet.");
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("✅ Copied to clipboard"))
    .catch(() => showToast("Couldn't copy — try selecting manually."));
});

downloadBtn.addEventListener("click", () => {
  const text = finalText.trim();
  if (!text) return showToast("Nothing to save yet.");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "flowrite-transcript.txt";
  a.click();
  URL.revokeObjectURL(url);
  showToast("💾 Saved as flowrite-transcript.txt");
});

clearBtn.addEventListener("click", () => {
  if (!finalText && !interimText) return;
  finalText = "";
  interimText = "";
  render();
  showToast("🧹 Cleared");
  editor.focus();
});

/* Keep finalText in sync when the user edits manually (only when idle) */
editor.addEventListener("input", () => {
  if (isListening) return;
  finalText = editor.innerText;
  updateMeta();
});

/* Ctrl/Cmd + Space toggles recording */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
    e.preventDefault();
    if (isListening) stopRecognition();
    else startRecognition();
  }
});

/* ---- Init ---- */
render();
