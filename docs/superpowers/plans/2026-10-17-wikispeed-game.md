# Wikispeed Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Wikispeed game described in `docs/superpowers/specs/2026-10-17-wikispeed-game-design.md` on Firebase Hosting.

**Architecture:** Single-page vanilla JS app with hash routing. Pure modules (`code`, `wiki`, `score`, `timer`) are unit-tested with Vitest; thin view modules build DOM; `db.js` wraps Firestore; `auth.js` wraps Firebase Auth. Security rules enforce ownership and hidden routes.

**Tech Stack:** Vite 8, Firebase JS SDK 13 (Auth, Firestore), Vitest 5 + happy-dom, Firebase Hosting, Wikipedia REST APIs.

---

## File structure
- `src/code.js` — session code alphabet, `makeCode(random)`, `isValidCode(s)`.
- `src/wiki.js` — `WIKI_UA`, `keyFromUrl(url)`, `isArticleKey(key)`, `sanitiseArticle(html)` returning `{title, body}`, `fetchArticle(key)`, `resolveTitle(text)`, `randomArticle()`, `suggestTitles(q)`.
- `src/score.js` — `orderRuns(runs, scoring)`, `formatMs(ms)`.
- `src/timer.js` — `createTimer(now)` with `start/pause/resume/elapsed`.
- `src/auth.js` — `ensureSignedIn()`, `signInWithGoogle()`, `currentName()`, `setNickname()`.
- `src/db.js` — `createSession`, `openSession`, `watchSession`, `watchRuns`, `readRoute`, `saveRun`, `saveHistory`, `watchHistory`.
- `src/router.js` — hash router: `route(path, handler)`, `go(path)`, `start()`.
- `src/ui.js` — `el(tag, attrs, children)`, `button`, `field`, `notice`.
- `src/views/home.js`, `setup.js`, `session.js`, `play.js`, `history.js`.
- `src/main.js` — bootstrap: sign in, register routes, start router.
- `tests/code.test.js`, `tests/wiki.test.js`, `tests/score.test.js`, `tests/timer.test.js`.
- `firestore.rules` — rules from spec.

## Task 1: Test tooling
- [ ] Add `"test": "vitest run"` to `package.json` scripts and `test: { environment: 'happy-dom' }` to `vite.config.js`.
- [ ] Run `npm test`; expected: "No test files found" exit 1 (tooling works).
- [ ] Commit: `Add vitest`.

## Task 2: Session codes (`src/code.js`)
- [ ] Tests: alphabet excludes `0 O 1 I`; `makeCode(() => 0)` returns `AAAAAA`; length 6; `isValidCode` accepts `ABC234`, lowercases input, rejects `ABC12O` and length 5.
- [ ] Run, expect fail (module missing). Implement. Run, expect pass. Commit: `Add session code helpers`.

## Task 3: Wikipedia helpers (`src/wiki.js`)
- [ ] Tests: `keyFromUrl('https://en.wikipedia.org/w/rest.php/v1/page/United_Kingdom/html?redirect=no')` → `United_Kingdom`; `keyFromUrl` decodes `%C3%A9`; `isArticleKey('File:X.jpg')` false; `isArticleKey('Talk:X')` false; `isArticleKey('Help_talk:X')` false; `isArticleKey('Einstein')` true; `isArticleKey('AC/DC')` true; `sanitiseArticle` removes `script`, `style`, `link`, `.mw-editsection`; keeps `<a href="./England">` with `data-key="England"`; converts `./File:X` links and external links to `span`; strips `#fragment` from keys; returns `title` from `<title>`.
- [ ] Run, expect fail. Implement parsing with `DOMParser`. Run, expect pass. Commit: `Add Wikipedia parsing helpers`.
- [ ] Implement network functions (`fetchArticle`, `resolveTitle`, `randomArticle`, `suggestTitles`) with the `Api-User-Agent` header; not unit-tested (network); verified in browser in Task 10.

## Task 4: Scoring (`src/score.js`)
- [ ] Tests: timed order by `ms` asc with unfinished last; clicks order by `clicks` then `ms`; `formatMs(61500)` → `1:01.5`; `formatMs(500)` → `0:00.5`.
- [ ] Run, fail. Implement. Run, pass. Commit: `Add leaderboard ordering`.

## Task 5: Timer (`src/timer.js`)
- [ ] Tests with injected clock: elapsed 0 before start; counts while running; frozen while paused; resumes without the gap.
- [ ] Run, fail. Implement. Run, pass. Commit: `Add pausing timer`.

## Task 6: Firestore rules and database
- [ ] Write `firestore.rules` per spec. Create Firestore database (`firebase firestore:databases:create "(default)" --location europe-west2`) once the API is enabled. Deploy rules: `firebase deploy --only firestore`. Commit: `Add Firestore security rules`.

## Task 7: Auth, db, router, ui modules
- [ ] Implement `src/auth.js`, `src/db.js`, `src/router.js`, `src/ui.js` as in spec. Build passes (`npm run build`). Commit: `Add auth, data and routing modules`.

## Task 8: Views
- [ ] `home.js`: Solo, Multiplayer, Join code form, Sign in / name, History link.
- [ ] `setup.js`: scoring choice, start/finish pickers with suggestions and Random, hide toggles, Create → `createSession` → `#/s/CODE`.
- [ ] `session.js`: details, code + copy link, leaderboard (live), Start session (host, multi, lobby), Play (open), route masking.
- [ ] `play.js`: loads route, renders article, intercepts links, timer, clicks, target detection, saves run and history, returns to session.
- [ ] `history.js`: list from `users/{uid}/history` ordered by `at` desc.
- [ ] `main.js` wires routes. Build passes. Commit after each view.

## Task 9: Styles
- [ ] Extend `src/styles.css`: choice buttons, forms, leaderboard table, play bar, article typography, dark/light, phone to desktop. Commit: `Style game views`.

## Task 10: Verify and deploy
- [ ] `npm test` all green; `npm run build`; `firebase deploy`.
- [ ] In Chrome: home → solo → random/random → play one click chain → finish; create multi session; join by code in a second tab; leaderboard updates; history lists sessions. Phone width (400px) and desktop.
- [ ] Commit and push.
