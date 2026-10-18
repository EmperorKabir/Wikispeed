# Wikispeed game design

Date: 2026-10-17. Source requirements: the user's brief in chat plus the two shared Claude and Gemini conversations.

## Goal
A browser game: race from one Wikipedia article to another by clicking article links only. Solo or multiplayer, scored by time or by fewest clicks, played together or at different times. Simple, uncluttered interface. Zero running cost: Firebase Spark plan, Wikipedia public APIs.

## User flow
1. Home: choose Solo or Multiplayer. Also: Join with a code, Sign in with Google, History.
2. Setup: choose Timed or Fewest clicks. Choose start article and finish article, each typed (with suggestions) or Random. Toggle Hide start / Hide finish until the session starts. Create.
3. Session page (`#/s/CODE`): shows mode, scoring, route (masked parts hidden), the shareable code and link, the live leaderboard. Multiplayer host sees Start session; players wait. Once open, every player sees Play. The page stays available after everyone has finished.
4. Play (`#/play/CODE`): the article rendered in-app, a slim bar with clicks, elapsed time (timed mode) and the target. Clicking a link loads the next article. Reaching the target ends the run and returns to the session page.
5. History (`#/history`): every session the signed-in account has played, newest first, each linking back to its session page.

## Accounts
- Every visitor is signed in anonymously on first load, so Firestore rules can require authentication and multiplayer works without a Google account.
- Sign in with Google links the anonymous account (`linkWithPopup`). If that Google account already exists, sign in with it directly instead.
- Display name: Google display name, else a nickname asked for once and kept in `localStorage`.
- History is stored per account; it is complete for Google accounts and persists for anonymous accounts only on the same browser.

## Data model (Cloud Firestore, minimal)
- `sessions/{code}`: `mode` (`solo`|`multi`), `scoring` (`time`|`clicks`), `start` and `target` (each `{key, title}` or `null` when hidden), `hideStart`, `hideTarget`, `host` (uid), `status` (`lobby`|`open`), `createdAt`, `startedAt`.
- `sessions/{code}/private/route`: `{start:{key,title}, target:{key,title}}`. Readable by the host always, by others only once `status == open`. This keeps hidden articles hidden without server code.
- `sessions/{code}/runs/{uid}`: `name`, `clicks`, `ms`, `path` (array of page keys, capped at 500), `done`, `startedAt`, `finishedAt`. One run per player per session.
- `users/{uid}/history/{code}`: `mode`, `scoring`, `start`, `target` (titles), `clicks`, `ms`, `done`, `at`. Written by the player when a run ends, so history needs no composite index.
- Nothing is deleted automatically. Documents are a few hundred bytes each.

## Session code
Six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I). Created in a transaction that fails if the code exists.

## Wikipedia integration
- Headers: `Api-User-Agent: Wikispeed/<version> (https://wikispeed-game.web.app; bhasin.kabir@gmail.com)` on every request (browsers cannot set `User-Agent`; Wikimedia accepts this header and lists it in CORS allow-headers).
- Random article: `GET https://en.wikipedia.org/api/rest_v1/page/random/summary`, retried until `type == "standard"` (max 6 tries).
- Resolve a typed title: `GET /api/rest_v1/page/summary/{title}` gives `titles.canonical` (redirects resolved) and `type`; 404 means no such page; disambiguation pages are rejected for start and target.
- Suggestions: `GET /w/rest.php/v1/search/title?q=&limit=5`.
- Article HTML: `GET https://en.wikipedia.org/w/rest.php/v1/page/{key}/html`. The server answers redirects with 307 to the canonical page; `fetch` follows it and `response.url` yields the canonical key, which is what the target check compares.
- Rendering: parse with `DOMParser`; drop `script`, `style`, `link`, `meta`, `.mw-editsection`, `.navbox`, `.mw-references-wrap` is kept; images keep protocol-relative `//upload.wikimedia.org` sources with `loading=lazy`. Only `a[href^="./"]` links in the main namespace are clickable; namespace-prefixed links (`File:`, `Category:`, `Help:`, `Wikipedia:`, `Template:`, `Special:`, `Portal:`, `Talk:`, `User:`, `Draft:`, `Module:`, `MediaWiki:`, `Book:`, `TimedText:`, `Gadget:`, `Template_talk:` and all `_talk:` variants) and external links are rendered as plain text. There is no search box.
- Attribution: footer states content is from Wikipedia under CC BY-SA 4.0 with a link to the live article.

## Timer and scoring
- Elapsed time counts only while an article is displayed; it pauses from click until the next article has rendered.
- A click counts when a permitted article link is activated.
- Leaderboard order: timed mode by `ms` ascending; fewest-clicks mode by `clicks` ascending, then `ms`. Unfinished runs are listed last as "playing".

## Security rules (summary)
- All access requires `request.auth != null`.
- `sessions/{code}` create: any user, must set `host == uid`, valid enums, `status` is `open` for solo or `lobby` for multi. Update: host only, only `status` (lobby to open) and `startedAt`. No delete.
- `private/route`: create by host at session creation; read by host or when parent `status == open`; no update or delete.
- `runs/{uid}`: read by any signed-in user; create and update by that uid only; `path.size() <= 500`; `clicks` and `ms` are non-negative numbers; `name` is 1-32 chars.
- `users/{uid}/history/{code}`: owner only.

## Interface
- One HTML page, hash routing, no framework. Views are small modules returning DOM.
- Each view has one primary action. No decorative content. Short labels.
- Responsive from 320px to desktop; dark and light; safe-area aware; dual-screen posture handled via viewport-segments media queries; 44px minimum tap targets; keyboard-operable; `aria-live` status updates.

## Errors
- Network and Wikipedia failures show a one-line message with a Retry control; the timer stays paused.
- A missing or malformed session code shows "No session with that code".
- Opening a session's play page before it is open redirects to the session page.

## Testing
- Vitest unit tests (happy-dom) for: session code generation, page-key parsing from URLs, link filtering and HTML sanitising, leaderboard ordering, the pausing timer.
- Manual browser verification of each view at phone and desktop widths via Claude in Chrome, and of the live site after deploy.

## Out of scope (explicitly, by the user)
Nothing the user listed is excluded. Not built because not requested: other-language Wikipedias, team play, chat, password-protected sessions, score deletion.

## Changes since first implementation (17 October 2026)
- Product name is Wixpert; hosted at wixpert.web.app and wikispeed-game.web.app. Sign-in uses whichever address serves the page.
- Join-by-code lives on the Multiplayer page, not Home.
- Every attempt is stored as its own run document (`runs/{uid}-{n}`) with `uid` and `attempt` fields. Players may retry without limit. The leaderboard ranks each player's best finished attempt and lists all attempts with routes; routes are visible in multiplayer only once the viewer has attempted. History stores the best result and the attempt count.
- Rules verify results: reported time cannot exceed server-measured elapsed time, clicks must equal route length minus one, attempts start at zero and can be closed once.
- Hidden articles are revealed on the session page only after the viewing player has started an attempt.
- Give up is recorded (`quit`) and listed as "gave up"; abandoned attempts show as "unfinished".
- Template styles inside articles are kept so pages look like Wikipedia; Wikipedia's own stylesheet modules are loaded on the play page. Red links and edit links are inert.
- Privacy and Terms pages exist at `#/privacy` and `#/terms`.

## Changes on 18 October 2026
- Multiplayer is room-first: Create a room gives a code at once; the host configures rounds (1 to 10), per-round scoring, the overall system (podium points, most rounds won, fewest clicks in total, fastest time in total, none), who chooses each round (host, take turns in join order, previous winner, previous loser, current leader, current last), whether the chooser also picks the scoring, split choosing (start and finish by different players), and how rounds start (play whenever, or start together with a six-second countdown). Rounds close automatically when every joined player has finished or given up; the host can close early; anyone can close a round after 24 hours. Join order is fixed at first entry.
- Live progress: each click writes clicks, current article and accumulated loading time; viewers tick the elapsed clock locally.
- Daily challenge: eight challenges per UTC day (Easy, Medium, Hard, Anything by Timed and Fewest clicks), created by the first visitor in a transaction, articles hidden until Play, one global leaderboard each ranked by first attempt only; later attempts are practice. A countdown to the UTC reset is shown in local time.
- Random tiers are four disjoint pools: Easy (vital levels 1 to 3, weighted), Medium (level 4 only), Hard (level 5 only), Anything (never a vital article). Descriptions state this.
- The finish article is prefetched when a run starts; slow Wikipedia responses show a message; 429 responses pause and retry once.
- Article pickers are shared (src/views/picker.js); the secret option appears only for random picks.
