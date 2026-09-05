/* ----------------------------------------------------------------------
   HELPERS (pure logic, same engine as the prototype)
------------------------------------------------------------------------*/
function normalize(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ");
}

function germanAnswerFor(word) {
  return word.article ? `${word.article} ${word.de}` : word.de;
}

function checkTypedAnswer(direction, word, input) {
  const norm = normalize(input);
  if (!norm) return false;
  if (direction === "de-en") {
    return word.en.some((e) => normalize(e) === norm || normalize(e.replace(/^to /, "")) === norm);
  } else {
    return norm === normalize(germanAnswerFor(word)) || norm === normalize(word.de);
  }
}

function initProgress() {
  return { score: 0, seen: 0, correct: 0, incorrect: 0, lastSeen: 0 };
}

function updateScore(prog, correct, mode, settings) {
  const p = { ...prog };
  p.seen += 1;
  p.lastSeen = Date.now();
  if (correct) {
    p.correct += 1;
    const gain = mode === "mc" ? settings.correctMcGain : settings.correctTypeGain;
    const factor = (100 - p.score) / 100;
    const inc = Math.max(2, gain * factor);
    p.score = Math.min(100, p.score + inc);
  } else {
    p.incorrect += 1;
    p.score = Math.max(0, p.score - settings.incorrectPenalty);
  }
  return p;
}

function pickWeighted(pool, progress, recentIds) {
  const candidates = pool.filter((id) => !recentIds.includes(id));
  const usable = candidates.length > 0 ? candidates : pool;
  const weights = usable.map((id) => Math.pow(105 - (progress[id]?.score ?? 0), 2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < usable.length; i++) {
    r -= weights[i];
    if (r <= 0) return usable[i];
  }
  return usable[usable.length - 1];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeQuestion(learnedIds, progress, recentIds, settings) {
  const id = pickWeighted(learnedIds, progress, recentIds);
  const word = WORD_BY_ID[id];
  const direction =
    settings.direction === "both" ? (Math.random() < 0.5 ? "de-en" : "en-de") : settings.direction;
  const mode = settings.answerMode === "both" ? (Math.random() < 0.5 ? "type" : "mc") : settings.answerMode;

  let options = null;
  if (mode === "mc") {
    const others = shuffle(WORDS.filter((w) => w.id !== id)).slice(0, 3);
    const correctText = direction === "de-en" ? word.en[0] : germanAnswerFor(word);
    const optTexts = others.map((o) => (direction === "de-en" ? o.en[0] : germanAnswerFor(o)));
    options = shuffle([correctText, ...optTexts]);
  }
  return { id, word, direction, mode, options };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ----------------------------------------------------------------------
   PRONUNCIATION
------------------------------------------------------------------------*/
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "de-DE";
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  } catch (e) {}
}

const SPEAKER_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

function speakerButtonHtml(text, size) {
  const sz = size || 15;
  return `<button type="button" class="speaker-btn" data-speak="${escapeHtml(text)}" aria-label="Pronounce ${escapeHtml(text)}" style="border:none;background:transparent;cursor:pointer;padding:0.2rem;line-height:0;color:inherit;">${SPEAKER_ICON.replace('width="15" height="15"', `width="${sz}" height="${sz}"`)}</button>`;
}

function wireSpeakerButtons(root) {
  (root || document).querySelectorAll("[data-speak]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      speak(btn.getAttribute("data-speak"));
    };
  });
}

// Rough English-reader-friendly phonetic respelling. Not IPA, not exact —
// a reading aid to sit alongside the audio button, which is the authoritative source.
function approxPronounce(phrase) {
  return phrase.split(/\s+/).map(transliterateWord).join(" ");
}

function transliterateWord(word) {
  let s = word.toLowerCase();
  if (s.startsWith("sp")) s = "shp" + s.slice(2);
  else if (s.startsWith("st")) s = "sht" + s.slice(2);
  else if (/^s[aeiouäöüy]/.test(s)) s = "\u0000" + s.slice(1); // word-initial s before a vowel is voiced, like English z

  const rules = [
    [/tsch/g, "\u0001"],
    [/sch/g, "\u0002"],
    [/chs/g, "ks"],
    [/ck/g, "k"],
    [/ph/g, "f"],
    [/qu/g, "kv"],
    [/ß/g, "ss"],
    [/v/g, "f"],
    [/w/g, "v"],
    [/z/g, "ts"],
    [/j/g, "y"],
    [/ie/g, "ee"],
    [/ei/g, "eye"],
    [/ai/g, "eye"],
    [/äu/g, "oy"],
    [/eu/g, "oy"],
    [/au/g, "ow"],
    [/ch/g, "kh"],
    [/ä/g, "eh"],
    [/ö/g, "ur"],
    [/ü/g, "ew"],
  ];
  rules.forEach(([pattern, replacement]) => {
    s = s.replace(pattern, replacement);
  });
  s = s.replace(/ig$/, "ikh");
  s = s.replace(/\u0000/g, "z").replace(/\u0001/g, "tch").replace(/\u0002/g, "sh");
  return s;
}

/* ----------------------------------------------------------------------
   STORAGE (localStorage — persists on-device, including as an installed
   Home Screen app on iOS, which is exempt from Safari's 7-day cap)
------------------------------------------------------------------------*/
const DEFAULT_SETTINGS = {
  newWordsPerSession: 8,
  direction: "both",
  answerMode: "both",
  categories: Object.keys(CAT_LABELS),
  masteryThreshold: 80,
  sessionLength: 0,
  correctTypeGain: 13,
  correctMcGain: 6,
  incorrectPenalty: 18,
};

const SORTED_CATEGORY_ENTRIES = Object.entries(CAT_LABELS).sort((a, b) => a[1].localeCompare(b[1]));

const APP_VERSION = "7";

const LS_PROGRESS = "gvt_progress_v1";
const LS_SETTINGS = "gvt_settings_v1";

function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_PROGRESS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // If this app version introduced new categories since settings were saved,
    // include them by default rather than silently hiding new content.
    const allCats = Object.keys(CAT_LABELS);
    const known = new Set(settings.categories || []);
    const missing = allCats.filter((c) => !known.has(c));
    if (missing.length) settings.categories = [...(settings.categories || []), ...missing];
    return settings;
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveProgress(progress) {
  try {
    localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
  } catch (e) {}
}
function saveSettings(settings) {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  } catch (e) {}
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wortschatz-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.progress) {
        state.progress = data.progress;
        saveProgress(state.progress);
      }
      if (data.settings) {
        state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
        saveSettings(state.settings);
      }
      render();
      alert("Progress imported.");
    } catch (e) {
      alert("Couldn't read that file — is it a Wortschatz backup JSON?");
    }
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------------------
   STATE
------------------------------------------------------------------------*/
const state = {
  screen: "dashboard", // dashboard | learn | test | summary | browse
  progress: {},
  settings: { ...DEFAULT_SETTINGS },
  showSettings: false,
  settingsDirty: false,
  confirmingReset: false,
  pendingSettings: null,

  learnBatch: [],
  learnIndex: 0,
  learnFlipped: false,

  testRecentIds: [],
  testQuestion: null,
  testTypedInput: "",
  testFeedback: null,
  testStats: { asked: 0, correct: 0 },

  lastStats: null,

  browseCategory: "all",
  browseMaxProficiency: 80,
  browseShowUnlearned: false,
};

/* ----------------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------------*/
function renderDashboard() {
  const learnedIds = Object.keys(state.progress);
  const totalWords = WORDS.length;
  const learnedCount = learnedIds.length;
  const avgScore = learnedCount
    ? Math.round(learnedIds.reduce((s, id) => s + state.progress[id].score, 0) / learnedCount)
    : 0;
  const mastered = learnedIds.filter((id) => state.progress[id].score >= state.settings.masteryThreshold).length;
  const weakest = [...learnedIds]
    .sort((a, b) => state.progress[a].score - state.progress[b].score)
    .slice(0, 10)
    .map((id) => WORD_BY_ID[id])
    .filter(Boolean);

  const activeCategories = state.settings.categories || [];
  const learnedInScope = learnedIds.filter((id) => activeCategories.includes(WORD_BY_ID[id]?.cat));
  const newAvailableInScope = WORDS.filter((w) => !state.progress[w.id] && activeCategories.includes(w.cat)).length;
  const noCategoriesSelected = activeCategories.length === 0;

  const learnLabel = noCategoriesSelected
    ? "No categories selected"
    : newAvailableInScope === 0
    ? "All words learned"
    : `Learn ${Math.min(state.settings.newWordsPerSession, newAvailableInScope)} new words`;
  const testLabel = noCategoriesSelected
    ? "No categories selected"
    : learnedInScope.length === 0
    ? "Learn some words first"
    : `Test yourself on ${learnedInScope.length} words`;

  const weakestHtml = weakest.length
    ? `<div style="margin-bottom:1rem;">
        <h2 style="margin-bottom:0.75rem;">Needs the most practice</h2>
        <div class="panel">
          ${weakest
            .map(
              (w) => `
            <div class="weak-row">
              <div style="min-width:0; flex:1 1 auto;">
                <div>${escapeHtml(w.article ? `${w.article} ${w.de}` : w.de)}</div>
                <div class="small" style="font-style:italic; display:flex; align-items:center; gap:0.25rem;">
                  /${escapeHtml(approxPronounce(germanAnswerFor(w)))}/
                  ${speakerButtonHtml(germanAnswerFor(w), 13)}
                </div>
                <div class="word-cat">${escapeHtml(w.en[0])}</div>
              </div>
              <div class="weak-bar" style="flex-shrink:0;"><div class="bar-track"><div class="bar-fill" style="width:${state.progress[w.id].score}%"></div></div></div>
            </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  const html = `
    <div class="wrap">
      <div style="margin-bottom:2rem;">
        <h1>Wortschatz <span class="small" style="font-weight:400;">v${APP_VERSION}</span></h1>
        <p class="small" style="margin-top:0.25rem;">German vocabulary trainer &middot; ${totalWords} words available</p>
      </div>

      <div class="stat-grid">
        <div class="panel stat-card"><div class="stat-num">${learnedCount}</div><div class="stat-label">words learning</div></div>
        <div class="panel stat-card"><div class="stat-num">${avgScore}</div><div class="stat-label">avg. confidence</div></div>
        <div class="panel stat-card"><div class="stat-num">${mastered}</div><div class="stat-label">mastered</div></div>
      </div>

      <div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:2rem;">
        <button class="btn btn-primary" id="btn-learn" ${noCategoriesSelected || newAvailableInScope === 0 ? "disabled" : ""}>${learnLabel}</button>
        <button class="btn btn-outline" id="btn-test" ${noCategoriesSelected || learnedInScope.length === 0 ? "disabled" : ""}>${testLabel}</button>
      </div>

      ${weakestHtml}

      <button class="btn btn-ghost" id="btn-browse" style="margin-bottom:2rem; padding-left:0;">See full word list →</button>

      <div class="rule" style="padding-top:1.25rem;">
        <button class="btn btn-ghost" id="btn-toggle-settings">${state.showSettings ? "Hide settings" : "Settings"}</button>
        <div id="settings-panel"></div>
      </div>
    </div>
  `;
  return html;
}

function renderSettingsPanel() {
  if (!state.showSettings) return "";
  const ps = state.pendingSettings;
  const dirRadio = (val, label) => `
    <label class="radio-row">
      <input type="radio" name="direction" value="${val}" ${ps.direction === val ? "checked" : ""} />
      ${label}
    </label>`;
  const modeRadio = (val, label) => `
    <label class="radio-row">
      <input type="radio" name="answerMode" value="${val}" ${ps.answerMode === val ? "checked" : ""} />
      ${label}
    </label>`;
  const catCheckbox = (key, label) => `
    <label class="check-row">
      <input type="checkbox" class="cat-checkbox" value="${key}" ${ps.categories.includes(key) ? "checked" : ""} />
      ${label}
    </label>`;

  return `
    <div style="margin-top:1rem;">
      <div class="settings-block">
        <label class="settings-label">New words per learning session</label>
        <input type="number" id="set-newwords" min="1" max="30" value="${ps.newWordsPerSession}" style="width:6rem;" />
      </div>

      <div class="settings-block">
        <label class="settings-label">Test direction</label>
        ${dirRadio("both", "Both directions, mixed")}
        ${dirRadio("de-en", "German → English only")}
        ${dirRadio("en-de", "English → German only")}
      </div>

      <div class="settings-block">
        <label class="settings-label">Answer format</label>
        ${modeRadio("both", "Type answers and multiple choice, mixed")}
        ${modeRadio("type", "Type the answer only")}
        ${modeRadio("mc", "Multiple choice only")}
      </div>

      <div class="settings-block">
        <div class="settings-header">
          <label class="settings-label" style="margin:0;">Categories included</label>
          <div style="display:flex; gap:0.75rem;">
            <button class="link-btn" id="cat-all">All</button>
            <button class="link-btn" id="cat-none">None</button>
          </div>
        </div>
        <div class="cat-grid">
          ${SORTED_CATEGORY_ENTRIES.map(([k, l]) => catCheckbox(k, l)).join("")}
        </div>
      </div>

      <div class="settings-block">
        <label class="settings-label">Mastery threshold (score to count as mastered)</label>
        <input type="number" id="set-mastery" min="1" max="100" value="${ps.masteryThreshold}" style="width:6rem;" />
      </div>

      <div class="settings-block">
        <label class="settings-label">Questions per test session (0 = unlimited)</label>
        <input type="number" id="set-sessionlen" min="0" max="200" value="${ps.sessionLength}" style="width:6rem;" />
      </div>

      <div class="settings-block">
        <label class="settings-label">Scoring — how much each answer moves a word's proficiency</label>
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          <div class="row-between">
            <span class="small">Correct (typed) gain</span>
            <input type="number" id="set-type-gain" min="1" max="50" value="${ps.correctTypeGain}" style="width:5rem;" />
          </div>
          <div class="row-between">
            <span class="small">Correct (multiple choice) gain</span>
            <input type="number" id="set-mc-gain" min="1" max="50" value="${ps.correctMcGain}" style="width:5rem;" />
          </div>
          <div class="row-between">
            <span class="small">Incorrect penalty</span>
            <input type="number" id="set-penalty" min="1" max="50" value="${ps.incorrectPenalty}" style="width:5rem;" />
          </div>
        </div>
        <p class="small" style="margin-top:0.5rem;">Gains scale down as a word nears 100, so it takes proportionally more right answers to master a word than to knock it down.</p>
      </div>

      <button
        class="${state.settingsDirty ? "btn btn-primary" : "btn btn-outline"} btn-block"
        id="btn-save-settings"
        ${state.settingsDirty ? "" : 'style="color:var(--gold); border-color:var(--gold); cursor:default;"'}
        ${state.settingsDirty ? "" : "disabled"}
      >${state.settingsDirty ? "Save settings" : "✓ All changes saved"}</button>

      <div class="rule" style="margin-top:1.25rem; padding-top:1rem;">
        <label class="settings-label">Backup</label>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          <button class="btn btn-outline" id="btn-export">Export progress</button>
          <button class="btn btn-outline" id="btn-import">Import progress</button>
          <input type="file" id="import-file" accept="application/json" style="display:none;" />
        </div>
      </div>

      <div class="rule" style="margin-top:1.25rem; padding-top:1rem;">
        ${
          state.confirmingReset
            ? `
          <div class="panel" style="padding:0.75rem; border-color:var(--brick);">
            <p class="small" style="margin-bottom:0.6rem;">This permanently erases all learning progress for every word. This can't be undone.</p>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn" id="btn-reset-confirm" style="background:var(--brick); color:#fff;">Yes, reset everything</button>
              <button class="btn btn-outline" id="btn-reset-cancel">Cancel</button>
            </div>
          </div>`
            : `<button class="btn btn-ghost" id="btn-reset" style="color:var(--brick);">Reset all progress</button>`
        }
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------------------
   LEARN SESSION
------------------------------------------------------------------------*/
function renderLearn() {
  const words = state.learnBatch;
  const word = words[state.learnIndex];
  const isLast = state.learnIndex === words.length - 1;
  const alt = word.en.length > 1 ? `<div style="margin-top:0.75rem; opacity:0.9; font-size:1.1rem;">also: ${escapeHtml(word.en.slice(1).join(", "))}</div>` : "";

  return `
    <div class="wrap">
      <div class="row-between" style="margin-bottom:1.5rem;">
        <button class="btn btn-ghost" id="btn-learn-cancel">Cancel</button>
        <div class="small">${state.learnIndex + 1} / ${words.length}</div>
      </div>

      <div class="flip-card" id="flip-card">
        <div class="flip-inner ${state.learnFlipped ? "flipped" : ""}">
          <div class="flip-face flip-front">
            <div style="font-size:2.6rem; line-height:1.2; font-family:var(--font-display);">
              ${escapeHtml(word.article ? `${word.article} ${word.de}` : word.de)}
            </div>
            <div style="margin-top:0.75rem; font-size:1.25rem; font-style:italic; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
              /${escapeHtml(approxPronounce(germanAnswerFor(word)))}/
              ${speakerButtonHtml(germanAnswerFor(word), 22)}
            </div>
            <div style="margin-top:1.25rem; font-size:1rem; color:var(--ink-soft);">tap to reveal</div>
          </div>
          <div class="flip-face flip-back">
            <div style="font-size:2.2rem; line-height:1.2; font-family:var(--font-display);">${escapeHtml(word.en[0])}</div>
            ${alt}
          </div>
        </div>
      </div>

      <div style="display:flex; gap:0.75rem;">
        <button class="btn btn-outline" id="btn-learn-back" style="flex:1; font-size:1.1rem; padding:0.9rem 1rem;" ${state.learnIndex === 0 ? "disabled" : ""}>Back</button>
        ${isLast
          ? `<button class="btn btn-primary" id="btn-learn-finish" style="flex:1; font-size:1.1rem; padding:0.9rem 1rem;">Start reviewing these words</button>`
          : `<button class="btn btn-primary" id="btn-learn-next" style="flex:1; font-size:1.1rem; padding:0.9rem 1rem;">Next</button>`}
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------------------
   TEST SESSION
------------------------------------------------------------------------*/
function testLearnedIdsInScope() {
  const active = state.settings.categories || [];
  return Object.keys(state.progress).filter((id) => active.includes(WORD_BY_ID[id]?.cat));
}

function renderTest() {
  const q = state.testQuestion;
  const limit = state.settings.sessionLength > 0 ? state.settings.sessionLength : null;
  const promptText =
    q.direction === "de-en" ? (q.word.article ? `${q.word.article} ${q.word.de}` : q.word.de) : q.word.en[0];
  const promptLabel = q.direction === "de-en" ? "What does this mean in English?" : "How do you say this in German?";

  const header = `
    <div class="row-between" style="margin-bottom:1.5rem;">
      <button class="btn btn-ghost" id="btn-end-session">End session</button>
      <div class="small">${limit ? `${state.testStats.asked} / ${limit} asked` : `${state.testStats.asked} asked`} &middot; ${state.testStats.asked ? Math.round((state.testStats.correct / state.testStats.asked) * 100) : 0}% correct</div>
    </div>
    <div class="panel" style="padding:1.5rem; margin-bottom:1.25rem;">
      <div style="margin-bottom:0.6rem; font-size:1.05rem; color:var(--ink-soft);">${promptLabel}</div>
      <div style="font-size:2.6rem; line-height:1.25; font-family:var(--font-display);">${escapeHtml(promptText)}</div>
    </div>
  `;

  let body;
  if (q.mode === "type") {
    const fb = state.testFeedback;
    body = `
      <div>
        <input type="text" id="type-input" placeholder="${q.direction === "en-de" ? "include der / die / das" : "type the English word"}" value="${escapeHtml(state.testTypedInput)}" ${fb ? "disabled" : ""} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-size:1.4rem; padding:0.9rem 1rem;" />
        ${
          fb
            ? `<div class="feedback-panel ${fb.correct ? "feedback-correct" : "feedback-incorrect"}" style="font-size:1.15rem;">${
                fb.correct ? "Correct." : `Not quite — correct answer: ${escapeHtml(fb.correctAnswer)}`
              }</div>`
            : ""
        }
        <button class="btn btn-primary btn-block" id="btn-check" style="margin-top:0.6rem; font-size:1.15rem; padding:0.9rem 1rem;">${fb ? "Next" : "Check"}</button>
      </div>
    `;
  } else {
    const fb = state.testFeedback;
    const correctText = q.direction === "de-en" ? q.word.en[0] : germanAnswerFor(q.word);
    body = `
      <div>
        ${q.options
          .map((opt) => {
            let cls = "choice-btn";
            if (fb) {
              if (normalize(opt) === normalize(correctText)) cls += " choice-correct";
              else if (opt === fb.chosen) cls += " choice-incorrect";
            }
            return `<button class="${cls}" data-choice="${escapeHtml(opt)}" ${fb ? "disabled" : ""} style="font-size:1.15rem; padding:0.9rem 1rem;">${escapeHtml(opt)}</button>`;
          })
          .join("")}
        ${fb ? `<button class="btn btn-primary btn-block" id="btn-mc-next" style="margin-top:0.4rem; font-size:1.15rem; padding:0.9rem 1rem;">Next</button>` : ""}
      </div>
    `;
  }

  return `<div class="wrap">${header}${body}</div>`;
}

/* ----------------------------------------------------------------------
   SUMMARY
------------------------------------------------------------------------*/
function renderSummary() {
  const s = state.lastStats;
  const pct = s.asked ? Math.round((s.correct / s.asked) * 100) : 0;
  return `
    <div class="wrap center-pad">
      <h2 style="margin-bottom:0.75rem; font-size:1.8rem;">Session complete</h2>
      <p style="font-size:1.25rem; color:var(--ink-soft);">${s.correct} of ${s.asked} correct (${pct}%)</p>
      <button class="btn btn-primary" id="btn-summary-done" style="margin-top:1.5rem; font-size:1.1rem; padding:0.9rem 1.3rem;">Back to dashboard</button>
    </div>
  `;
}

/* ----------------------------------------------------------------------
   BROWSE / WORD LIST
------------------------------------------------------------------------*/
function wordRowHtml(w, progress) {
  const score = progress[w.id]?.score ?? 0;
  return `
    <div class="weak-row" style="gap:0.75rem;">
      <div style="min-width:0; flex:1 1 auto;">
        <div>${escapeHtml(w.article ? `${w.article} ${w.de}` : w.de)}</div>
        <div class="small" style="font-style:italic; display:flex; align-items:center; gap:0.25rem;">
          /${escapeHtml(approxPronounce(germanAnswerFor(w)))}/
          ${speakerButtonHtml(germanAnswerFor(w), 13)}
        </div>
        <div class="word-cat">${escapeHtml(w.en[0])}</div>
      </div>
      <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
        <div class="bar-track" style="width:2.5rem;"><div class="bar-fill" style="width:${score}%"></div></div>
        <input type="number" min="0" max="100" value="${score}" class="word-score-input" data-word-id="${w.id}" style="width:2.8rem; padding:0.25rem 0.3rem; border:1px solid var(--line); border-radius:4px; font-size:0.8rem;" />
      </div>
    </div>
  `;
}

function renderBrowse() {
  const cats = state.browseCategory === "all" ? SORTED_CATEGORY_ENTRIES.map(([k]) => k) : [state.browseCategory];
  const groups = cats
    .map((cat) => {
      let words = WORDS.filter((w) => w.cat === cat).filter((w) => {
        const p = state.progress[w.id];
        if (p) return p.score < state.browseMaxProficiency;
        return state.browseShowUnlearned;
      });
      words.sort((a, b) => {
        const pa = state.progress[a.id], pb = state.progress[b.id];
        if (pa && pb) return pa.score - pb.score;
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;
        return 0;
      });
      return { cat, words };
    })
    .filter((g) => g.words.length > 0);

  const body =
    groups.length === 0
      ? `<p class="small">Nothing matches these filters.</p>`
      : groups
          .map(
            ({ cat, words }) => `
        <div style="margin-bottom:1.5rem;">
          <h2 style="margin-bottom:0.5rem;">${escapeHtml(CAT_LABELS[cat])} <span class="small">(${words.length})</span></h2>
          <div class="panel">${words.map((w) => wordRowHtml(w, state.progress)).join("")}</div>
        </div>
      `
          )
          .join("");

  return `
    <div class="wrap">
      <div class="row-between" style="margin-bottom:1.5rem;">
        <button class="btn btn-ghost" id="btn-browse-back">Back</button>
        <h1 style="font-size:1.3rem;">Word list</h1>
        <div style="width:3rem;"></div>
      </div>

      <div style="margin-bottom:1rem;">
        <select id="browse-category-select">
          <option value="all" ${state.browseCategory === "all" ? "selected" : ""}>All categories</option>
          ${SORTED_CATEGORY_ENTRIES
            .map(([k, l]) => `<option value="${k}" ${state.browseCategory === k ? "selected" : ""}>${escapeHtml(l)}</option>`)
            .join("")}
        </select>
      </div>

      <div style="margin-bottom:0.75rem;">
        <label class="settings-label" id="browse-proficiency-label">Show proficiency below: ${state.browseMaxProficiency}</label>
        <input type="range" id="browse-proficiency-slider" min="0" max="100" value="${state.browseMaxProficiency}" style="width:100%;" />
      </div>

      <label class="check-row" style="margin-bottom:1.5rem;">
        <input type="checkbox" id="browse-unlearned-toggle" ${state.browseShowUnlearned ? "checked" : ""} />
        Show words not yet started
      </label>

      ${body}
    </div>
  `;
}

function wireBrowse() {
  document.getElementById("btn-browse-back").onclick = () => {
    state.screen = "dashboard";
    render();
  };
  const catSelect = document.getElementById("browse-category-select");
  if (catSelect) catSelect.onchange = (e) => {
    state.browseCategory = e.target.value;
    render();
  };
  const slider = document.getElementById("browse-proficiency-slider");
  if (slider) {
    slider.oninput = (e) => {
      state.browseMaxProficiency = Number(e.target.value);
      const label = document.getElementById("browse-proficiency-label");
      if (label) label.textContent = `Show proficiency below: ${state.browseMaxProficiency}`;
    };
    slider.onchange = () => render();
  }
  const unlearnedToggle = document.getElementById("browse-unlearned-toggle");
  if (unlearnedToggle) unlearnedToggle.onchange = (e) => {
    state.browseShowUnlearned = e.target.checked;
    render();
  };
  document.querySelectorAll(".word-score-input").forEach((input) => {
    input.onchange = (e) => {
      updateWordScore(input.getAttribute("data-word-id"), Number(e.target.value));
      render();
    };
  });
}

function updateWordScore(wordId, newScore) {
  const clamped = Math.max(0, Math.min(100, Math.round(newScore)));
  const existing = state.progress[wordId] || initProgress();
  state.progress = { ...state.progress, [wordId]: { ...existing, score: clamped } };
  saveProgress(state.progress);
}

/* ----------------------------------------------------------------------
   RENDER DISPATCH + EVENT WIRING
------------------------------------------------------------------------*/
function render() {
  const root = document.getElementById("app");
  let html;
  if (state.screen === "dashboard") html = renderDashboard();
  else if (state.screen === "learn") html = renderLearn();
  else if (state.screen === "test") html = renderTest();
  else if (state.screen === "browse") html = renderBrowse();
  else html = renderSummary();

  root.innerHTML = html;

  if (state.screen === "dashboard") {
    const settingsPanel = document.getElementById("settings-panel");
    if (settingsPanel) settingsPanel.innerHTML = renderSettingsPanel();
    wireDashboard();
  } else if (state.screen === "learn") {
    wireLearn();
  } else if (state.screen === "test") {
    wireTest();
  } else if (state.screen === "browse") {
    wireBrowse();
  } else {
    document.getElementById("btn-summary-done").onclick = () => {
      state.screen = "dashboard";
      render();
    };
  }
  wireSpeakerButtons(root);
}

function wireDashboard() {
  document.getElementById("btn-learn").onclick = startLearn;
  document.getElementById("btn-test").onclick = startTest;
  document.getElementById("btn-browse").onclick = () => {
    state.screen = "browse";
    render();
  };
  document.getElementById("btn-toggle-settings").onclick = () => {
    state.showSettings = !state.showSettings;
    if (state.showSettings) {
      state.pendingSettings = { ...state.settings, categories: [...state.settings.categories] };
      state.settingsDirty = false;
    }
    render();
  };

  if (!state.showSettings) return;

  // Patches the Save button in place (no full render) so edits to fields that
  // deliberately avoid re-rendering (to preserve cursor position while typing)
  // still immediately enable the button — otherwise a stale `disabled` attribute
  // in the DOM would silently block the click.
  function markSettingsDirty() {
    state.settingsDirty = true;
    const btn = document.getElementById("btn-save-settings");
    if (btn) {
      btn.className = "btn btn-primary btn-block";
      btn.removeAttribute("disabled");
      btn.removeAttribute("style");
      btn.textContent = "Save settings";
    }
  }

  const resetBtn = document.getElementById("btn-reset");
  if (resetBtn) resetBtn.onclick = () => {
    state.confirmingReset = true;
    render();
  };
  const resetConfirmBtn = document.getElementById("btn-reset-confirm");
  if (resetConfirmBtn) resetConfirmBtn.onclick = () => {
    state.progress = {};
    saveProgress(state.progress);
    state.confirmingReset = false;
    render();
  };
  const resetCancelBtn = document.getElementById("btn-reset-cancel");
  if (resetCancelBtn) resetCancelBtn.onclick = () => {
    state.confirmingReset = false;
    render();
  };

  document.getElementById("btn-export").onclick = exportData;
  const importInput = document.getElementById("import-file");
  document.getElementById("btn-import").onclick = () => importInput.click();
  importInput.onchange = (e) => {
    if (e.target.files[0]) importDataFromFile(e.target.files[0]);
  };

  document.getElementById("cat-all").onclick = () => {
    state.pendingSettings.categories = Object.keys(CAT_LABELS);
    markSettingsDirty();
    render();
  };
  document.getElementById("cat-none").onclick = () => {
    state.pendingSettings.categories = [];
    markSettingsDirty();
    render();
  };
  document.querySelectorAll(".cat-checkbox").forEach((cb) => {
    cb.onchange = () => {
      const key = cb.value;
      const has = state.pendingSettings.categories.includes(key);
      state.pendingSettings.categories = has
        ? state.pendingSettings.categories.filter((c) => c !== key)
        : [...state.pendingSettings.categories, key];
      markSettingsDirty();
    };
  });
  document.querySelectorAll('input[name="direction"]').forEach((r) => {
    r.onchange = () => {
      state.pendingSettings.direction = r.value;
      markSettingsDirty();
    };
  });
  document.querySelectorAll('input[name="answerMode"]').forEach((r) => {
    r.onchange = () => {
      state.pendingSettings.answerMode = r.value;
      markSettingsDirty();
    };
  });
  document.getElementById("set-newwords").oninput = (e) => {
    state.pendingSettings.newWordsPerSession = Math.max(1, Number(e.target.value) || 1);
    markSettingsDirty();
  };
  document.getElementById("set-mastery").oninput = (e) => {
    state.pendingSettings.masteryThreshold = Math.min(100, Math.max(1, Number(e.target.value) || 1));
    markSettingsDirty();
  };
  document.getElementById("set-sessionlen").oninput = (e) => {
    state.pendingSettings.sessionLength = Math.max(0, Number(e.target.value) || 0);
    markSettingsDirty();
  };
  document.getElementById("set-type-gain").oninput = (e) => {
    state.pendingSettings.correctTypeGain = Math.min(50, Math.max(1, Number(e.target.value) || 1));
    markSettingsDirty();
  };
  document.getElementById("set-mc-gain").oninput = (e) => {
    state.pendingSettings.correctMcGain = Math.min(50, Math.max(1, Number(e.target.value) || 1));
    markSettingsDirty();
  };
  document.getElementById("set-penalty").oninput = (e) => {
    state.pendingSettings.incorrectPenalty = Math.min(50, Math.max(1, Number(e.target.value) || 1));
    markSettingsDirty();
  };

  document.getElementById("btn-save-settings").onclick = () => {
    if (!state.settingsDirty) return;
    state.settings = { ...state.pendingSettings };
    saveSettings(state.settings);
    state.settingsDirty = false;
    render();
  };
}

function startLearn() {
  const learnedIds = new Set(Object.keys(state.progress));
  const available = WORDS.filter((w) => !learnedIds.has(w.id) && state.settings.categories.includes(w.cat));
  state.learnBatch = shuffle(available).slice(0, state.settings.newWordsPerSession);
  state.learnIndex = 0;
  state.learnFlipped = false;
  state.screen = "learn";
  render();
}

function wireLearn() {
  document.getElementById("flip-card").onclick = () => {
    state.learnFlipped = !state.learnFlipped;
    render();
  };
  document.getElementById("btn-learn-cancel").onclick = () => {
    state.screen = "dashboard";
    render();
  };
  const backBtn = document.getElementById("btn-learn-back");
  if (backBtn) backBtn.onclick = () => {
    if (state.learnIndex > 0) {
      state.learnIndex -= 1;
      state.learnFlipped = false;
      render();
    }
  };
  const nextBtn = document.getElementById("btn-learn-next");
  if (nextBtn) nextBtn.onclick = () => {
    state.learnIndex += 1;
    state.learnFlipped = false;
    render();
  };
  const finishBtn = document.getElementById("btn-learn-finish");
  if (finishBtn) finishBtn.onclick = () => {
    state.learnBatch.forEach((w) => {
      state.progress[w.id] = initProgress();
    });
    saveProgress(state.progress);
    startTest();
  };
}

function startTest() {
  const pool = testLearnedIdsInScope();
  if (pool.length === 0) return;
  state.testRecentIds = [];
  state.testQuestion = makeQuestion(pool, state.progress, [], state.settings);
  state.testTypedInput = "";
  state.testFeedback = null;
  state.testStats = { asked: 0, correct: 0 };
  state.screen = "test";
  render();
}

function endTest() {
  state.lastStats = state.testStats;
  state.screen = "summary";
  render();
}

function testSubmitAnswer(isCorrect, chosenText) {
  const q = state.testQuestion;
  const prog = state.progress[q.id] || initProgress();
  const updated = updateScore(prog, isCorrect, q.mode, state.settings);
  state.progress = { ...state.progress, [q.id]: updated };
  saveProgress(state.progress);
  state.testStats = { asked: state.testStats.asked + 1, correct: state.testStats.correct + (isCorrect ? 1 : 0) };
  const correctAnswer = q.direction === "de-en" ? q.word.en[0] : germanAnswerFor(q.word);
  state.testFeedback = { correct: isCorrect, correctAnswer, chosen: chosenText };
  render();
}

function testAdvance() {
  const limit = state.settings.sessionLength > 0 ? state.settings.sessionLength : null;
  if (limit && state.testStats.asked >= limit) {
    endTest();
    return;
  }
  const pool = testLearnedIdsInScope();
  const nextRecent = [state.testQuestion.id, ...state.testRecentIds].slice(0, 3);
  state.testRecentIds = nextRecent;
  state.testQuestion = makeQuestion(pool, state.progress, nextRecent, state.settings);
  state.testTypedInput = "";
  state.testFeedback = null;
  render();
}

function wireTest() {
  document.getElementById("btn-end-session").onclick = endTest;
  const q = state.testQuestion;

  if (q.mode === "type") {
    const input = document.getElementById("type-input");
    input.oninput = (e) => {
      state.testTypedInput = e.target.value;
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-check").click();
      }
    };
    if (!state.testFeedback) input.focus();

    document.getElementById("btn-check").onclick = () => {
      if (state.testFeedback) {
        testAdvance();
        return;
      }
      const isCorrect = checkTypedAnswer(q.direction, q.word, state.testTypedInput);
      testSubmitAnswer(isCorrect, state.testTypedInput);
    };
  } else {
    document.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.onclick = () => {
        if (state.testFeedback) return;
        const optText = btn.getAttribute("data-choice");
        const correctText = q.direction === "de-en" ? q.word.en[0] : germanAnswerFor(q.word);
        const isCorrect = normalize(optText) === normalize(correctText);
        testSubmitAnswer(isCorrect, optText);
      };
    });
    const nextBtn = document.getElementById("btn-mc-next");
    if (nextBtn) nextBtn.onclick = testAdvance;
  }
}

/* ----------------------------------------------------------------------
   INIT
------------------------------------------------------------------------*/
function init() {
  state.progress = loadProgress();
  state.settings = loadSettings();
  render();
}

init();
