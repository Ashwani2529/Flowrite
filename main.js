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

/* ---- State ----
   The transcript is kept as a list of segments, not one string, so a segment
   can be *revised* in place when the engine sends a better version of it.
     committedSegs : finalised in earlier recognition sessions + manual edits
     sessionSegs   : final segments of the CURRENT recognition session
     interimText   : live words, not final yet                               */
let recognition = null;
let isListening = false;
let manualStop = false;
let committedSegs = [];
let sessionSegs = [];
let interimText = "";
let restartTimer = null;
let restartBurst = 0;
let lastRestartAt = 0;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  unsupported.hidden = false;
  startBtn.disabled = true;
}

/* ---- Text helpers ---- */

/* Languages that don't put spaces between words */
const NO_SPACE_LANG = /^(zh|ja|ko|th|km|lo|my)/i;

function needsSpace(base) {
  return !!base && !/\s$/.test(base) && !NO_SPACE_LANG.test(langSelect.value);
}

function joinText(base, addition) {
  if (!addition) return base;
  if (!base) return addition;
  return needsSpace(base) ? base + " " + addition : base + addition;
}

/* Normalised word list. Case and punctuation are ignored so that an engine
   revising "okay" into "Okay, so…" is still seen as the same utterance. */
const PUNCT = /[.,!?;:…"'’`“”()\[\]{}<>\-–—_/\\|]+/g;

function tokenize(text) {
  return text.toLowerCase().replace(PUNCT, " ").split(/\s+/).filter(Boolean);
}

function makeSeg(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const tokens = tokenize(trimmed);
  if (!tokens.length) return null;
  return { text: trimmed, tokens };
}

/* Is token list a a prefix of token list b? */
function isPrefix(a, b) {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Append a segment, collapsing cumulative snapshots of the same utterance.

   Chrome revises a single result in place as you speak. Edge and the newer
   on-device engines instead push a NEW result for every update, each one a
   full snapshot of the utterance so far:
     "my" / "my name" / "my name is" / … / "my name is Ashwani Kumar Singh"
   Concatenating those is what produced
     "my my name my name is my name is … my name is Ashwani Kumar Singh".
   So a segment that extends (or merely repeats) the previous one replaces it
   instead of stacking on top of it. Genuinely new speech shares no prefix
   with what came before, so it still gets appended. */
function pushSeg(list, seg) {
  if (!seg) return list;
  const prev = list[list.length - 1];
  if (prev) {
    if (isPrefix(prev.tokens, seg.tokens)) {
      list[list.length - 1] = seg; // longer snapshot of the same utterance
      return list;
    }
    if (isPrefix(seg.tokens, prev.tokens)) return list; // stale, shorter snapshot
  }
  list.push(seg);
  return list;
}

function segsToText(list) {
  return list.reduce((acc, s) => joinText(acc, s.text), "");
}

/* Committed + current session, with snapshot collapsing across the boundary
   (a session restart can re-deliver the tail of the previous one). */
function allSegs() {
  const out = committedSegs.slice();
  sessionSegs.forEach((s) => pushSeg(out, s));
  return out;
}

/* What to paint: settled text, plus the live interim tail. If the interim is
   a longer snapshot of the last settled segment, that segment is replaced by
   it rather than shown twice. */
function textParts() {
  const segs = allSegs();
  let live = makeSeg(interimText);
  if (live) {
    const prev = segs[segs.length - 1];
    if (prev && isPrefix(prev.tokens, live.tokens)) segs.pop();
    else if (prev && isPrefix(live.tokens, prev.tokens)) live = null;
  }
  return { base: segsToText(segs), live: live ? live.text : "" };
}

function fullText() {
  const { base, live } = textParts();
  return joinText(base, live).trim();
}

/* ---- Rendering ---- */
function render() {
  const { base, live } = textParts();
  editor.innerHTML = "";
  if (base) editor.appendChild(document.createTextNode(base));
  if (live) {
    const span = document.createElement("span");
    span.className = "interim";
    span.textContent = (needsSpace(base) ? " " : "") + live;
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
  const text = fullText();
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

/* Fold the current session into committedSegs so the next session (after a
   pause) starts from a clean slate. */
function commitSession() {
  // Retire the instance: once its words are committed, a late "result" event
  // from it must not re-add them.
  if (recognition) recognition.closed = true;

  const merged = allSegs();
  pushSeg(merged, makeSeg(interimText));
  committedSegs = merged;
  sessionSegs = [];
  interimText = "";
}

/* Tokenising every result on every event would be O(n²) over a long
   dictation, so cache per result index and only redo it when the text moves. */
function segForResult(rec, i, raw) {
  const cache = rec.segCache || (rec.segCache = []);
  const hit = cache[i];
  if (hit && hit.raw === raw) return hit.seg;
  const seg = makeSeg(raw);
  cache[i] = { raw, seg };
  return seg;
}

function createRecognition() {
  const rec = new SpeechRecognition();
  rec.lang = langSelect.value;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.addEventListener("result", (e) => {
    if (rec !== recognition || rec.closed) return; // superseded or already committed

    /* Rebuild the session from the whole results list every time rather than
       appending from e.resultIndex: engines re-deliver results that are
       already final, and resultIndex doesn't always advance. Rebuilding is
       idempotent — a word can't be counted twice however often it's resent. */
    const finals = [];
    const interims = [];
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      const seg = segForResult(rec, i, r[0] ? r[0].transcript : "");
      if (!seg) continue;
      pushSeg(r.isFinal ? finals : interims, seg);
    }

    sessionSegs = finals;
    interimText = segsToText(interims);
    restartBurst = 0; // audio is flowing — reset the restart backoff
    render();
  });

  rec.addEventListener("error", (e) => {
    if (rec !== recognition) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showToast("🎙️ Microphone access blocked. Allow it in your browser.");
      manualStop = true;
    } else if (e.error === "audio-capture") {
      showToast("🎙️ No microphone found.");
      manualStop = true;
    }
    /* no-speech / aborted / network are normal during pauses —
       ignore them and let the "end" handler restart the session. */
  });

  rec.addEventListener("end", () => {
    if (rec !== recognition || rec.closed) return; // stopRecognition already committed
    commitSession();
    if (isListening && !manualStop) {
      // A pause (or the engine's periodic cutoff) must NOT end the listening
      // session — spin up a fresh instance and keep going.
      scheduleRestart();
      render();
    } else {
      stopUI();
    }
  });

  return rec;
}

function scheduleRestart(delay = 150) {
  clearTimeout(restartTimer);

  const now = Date.now();
  restartBurst = now - lastRestartAt < 800 ? restartBurst + 1 : 0;
  lastRestartAt = now;
  if (restartBurst > 12) {
    // The mic is failing to open, not just pausing — don't spin forever.
    showToast("🎙️ Mic keeps dropping — stopped listening.");
    manualStop = true;
    stopUI();
    return;
  }

  restartTimer = setTimeout(() => {
    if (!isListening || manualStop) return;
    recognition = createRecognition();
    try {
      recognition.start();
    } catch (_) {
      scheduleRestart(500);
    }
  }, delay);
}

function startRecognition() {
  if (!SpeechRecognition || isListening) return;

  manualStop = false;
  isListening = true;
  restartBurst = 0;
  sessionSegs = [];
  interimText = "";

  recognition = createRecognition();
  try {
    recognition.start();
  } catch (_) {
    scheduleRestart(300);
  }

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
  clearTimeout(restartTimer);
  if (recognition) {
    try {
      recognition.stop(); // stop(), not abort() — lets pending words finalise
    } catch (_) {}
  }
  stopUI();
}

function stopUI() {
  isListening = false;
  clearTimeout(restartTimer);
  commitSession();
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
  const text = fullText();
  if (!text) return showToast("Nothing to copy yet.");
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("✅ Copied to clipboard"))
    .catch(() => showToast("Couldn't copy — try selecting manually."));
});

downloadBtn.addEventListener("click", () => {
  const text = fullText();
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
  if (!fullText()) return;
  committedSegs = [];
  sessionSegs = [];
  interimText = "";
  render();
  showToast("🧹 Cleared");
  editor.focus();
});

/* Keep the transcript in sync when the user edits manually (only when idle) */
editor.addEventListener("input", () => {
  if (isListening) return;
  const seg = makeSeg(editor.innerText);
  committedSegs = seg ? [seg] : [];
  sessionSegs = [];
  interimText = "";
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
