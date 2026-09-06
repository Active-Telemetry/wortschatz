# Wortschatz PWA — Context Blueprint

## 1. Architectural Overview
- **Type**: Self-contained, offline-first Progressive Web App (PWA) with zero build steps or dependencies.
- **Frontend Stack**: Vanilla JS (ES6+), HTML5, CSS3, Web Speech API (`window.speechSynthesis`).
- **Persistence**: LocalStorage (`gvt_progress_v1`, `gvt_settings_v1`) + JSON export/import backup.
- **PWA / Caching**: Service worker (`service-worker.js`, Cache-First strategy) + Web App Manifest (`manifest.json`).

## 2. File Tree & Roles
- `index.html`: Viewport config (`interactive-widget=resizewisual`), app shell, asset links.
- `style.css`: Minimal CSS, custom properties, responsive card grid & flip animations.
- `words.js`: Raw vocabulary array `[de, article|null, pos, en, category, level(1-5)]`, slug/id generator.
- `app.js`: State manager, UI renderer, weighted question picker, TTS speaker, storage handler.
- `service-worker.js`: Service Worker cache shell (v8) and offline handler.
- `manifest.json`: Web app installability metadata & icons config.
- `icons/`: App icon PNGs (192, 512, apple-touch).

## 3. Global State & File Bridge Mechanics
- **Loading Sequence**: `words.js` executes first -> constructs global `WORDS` array & `WORD_BY_ID` dictionary. `app.js` runs `init()` -> loads settings & progress from `localStorage` -> dispatches initial DOM render to `#app`.
- **Global `state` Object**:
  ```javascript
  {
    screen: "dashboard" | "learn" | "test" | "browse" | "summary",
    progress: { [wordId]: { score: 0..100, seen, correct, incorrect, lastSeen } },
    settings: {
      newWordsPerSession, masteryThreshold, sessionLength,
      deEnMc, deEnType, enDeMc, enDeType,
      correctTypeGain, correctMcGain, incorrectPenalty, categories: []
    },
    showSettings: boolean, settingsDirty: boolean, pendingSettings: null | object,
    learnBatch: [], learnIndex: 0, learnFlipped: boolean,
    testRecentIds: [], testQuestion: null, testTypedInput: "", testFeedback: null,
    testStats: { asked: 0, correct: 0 }, lastStats: null,
    browseCategory: "all", browseMaxProficiency: 80, browseShowUnlearned: false
  }
  ```
- **Event Wiring Bridge**: Dynamic DOM innerHTML replacement via `render()`. Listener re-binding via `wireDashboard()`, `wireLearn()`, `wireTest()`, `wireBrowse()`, and declarative audio trigger binding via `wireSpeakerButtons(root)` through `data-speak` attributes.

## 4. Skeleton Reference (Core API Functions)

### `words.js`
- `slugify(s)`
- Globals exposed: `RAW`, `WORDS`, `WORD_BY_ID`, `CAT_LABELS`

### `app.js`
- **Helpers & Logic**: `normalize(str)`, `germanAnswerFor(word)`, `checkTypedAnswer(direction, word, input)`, `initProgress()`, `updateScore(prog, correct, mode, settings)`, `pickWeighted(pool, progress, recentIds)`, `shuffle(arr)`, `makeQuestion(learnedIds, progress, recentIds, settings)`, `escapeHtml(s)`
- **Audio & Pronunciation**: `speak(text)`, `speakerButtonHtml(text, size)`, `wireSpeakerButtons(root)`, `approxPronounce(phrase)`, `transliterateWord(word)`
- **Storage & Backup**: `loadProgress()`, `loadSettings()`, `saveProgress(progress)`, `saveSettings(settings)`, `exportData()`, `importDataFromFile(file)`
- **UI Renderers**: `renderDashboard()`, `renderSettingsPanel()`, `renderLearn()`, `renderTest()`, `renderSummary()`, `renderBrowse()`, `wordRowHtml(w, progress)`
- **Event Handlers & Session Drivers**: `render()`, `wireDashboard()`, `startLearn()`, `wireLearn()`, `testLearnedIdsInScope()`, `startTest()`, `endTest()`, `testSubmitAnswer(isCorrect, chosenText)`, `testAdvance()`, `wireTest()`, `wireBrowse()`, `updateWordScore(wordId, newScore)`, `init()`

### `service-worker.js`
- Event listeners: `"install"`, `"activate"`, `"fetch"`

## 5. Active Feature Roadmap & Recent Work
1. **Word Levels (1–5)**: Words ranked by usefulness; `startLearn()` sorts new batch by `level` ascending.
2. **Mobile Viewport Fix**: Safe-area padding and `interactive-widget=resizewisual` meta tag to prevent soft keyboard UI jump on iOS.
3. **Audio & Transliteration**: German transliteration (`approxPronounce`) & Web Speech API speaker button on Learn cards, Test cards, and Browse list.
4. **Flexible Test Modes**: Individual checkboxes in Settings for `deEnMc`, `deEnType`, `enDeMc`, and `enDeType`.

## 6. Maintenance & Versioning
- **Bumping App Version**: When deploying updates that include changes to static assets (JS, CSS, HTML), you MUST perform the following steps to ensure the Service Worker invalidates the old cache and fetches the new assets:
  1. **Update `app.js`**: Increment the `APP_VERSION` constant (e.g., `"8"` -> `"9"`).
  2. **Update `service-worker.js`**: Increment the `CACHE_NAME` constant (e.g., `wortschatz-v8` -> `wortschatz-v9`).
  3. **Verify**: Ensure the `APP_SHELL` array in `service-worker.js` contains all necessary files for the new version.
