# 608ThatUp — AI Code Audit

Audited codebase: `608thatupapp` (the live Fly deployment — confirmed by matching the deployed bundle hash `index-CCRQnwFk.js` to this folder's `dist/`).
Audit date: 2026-07-02
Framework: NextToken AI Code Audit Rubric, Passes 0–6.

## Remediation status — all findings fixed (2026-07-02)

Every finding below has been remediated in code. Summary of changes:

| ID | Fix |
|----|-----|
| C-1 | Added `public/js/util/escape.js`; `escapeHtml()` applied to all user/dynamic data across every view and component. |
| H-1 | `/admin/promote` now rejects cohort-scoped admins (super-admin only). |
| H-2 | `/admin/students/:id` and `/admin/rounds/:id` now verify cohort ownership (404 otherwise). |
| H-3 | `server/index.js` throws on startup if `SESSION_SECRET` is missing in production. |
| H-4 | Dev-login backdoor can no longer register when `NODE_ENV=production` (fails closed). |
| M-1 | `/quiz/check` locks the first selection server-side; `/quiz/submit` scores only locked answers — harvesting neutralized. |
| M-2 | Session-based CSRF token minted per session, required via `X-CSRF-Token` on all mutations (`server/middleware/csrf.js`). |
| M-3 | CSV export neutralizes spreadsheet formula injection (`csvCell`). |
| M-4 | Classroom "Play Again" removes its key handler before re-entry — no listener leak. |
| L-1 | Deleted dead `toast.js` / `glassPanel.js`; removed unused `origNavigate`. |
| L-2 | Migration `try/catch` narrowed to duplicate-column; other errors rethrow. |
| L-3 | `avatar_url` attribute values escaped. |
| L-4 | Active quizzes keyed by `quizId` in session (multi-tab safe). |
| L-5 | Added dependency-free rate limiter on `/api/auth` and `/quiz/check` (`server/middleware/rateLimit.js`). |
| L-6 | Question/option text escaped everywhere it's rendered. |

Verified: all 19 changed files pass `node --check`; 15 unit assertions pass (escaping, CSV neutralization, rate limiter, CSRF verification, and the answer-lock model). Full end-to-end run wasn't possible in-sandbox (native `better-sqlite3` is built for macOS) — a local `npm run dev` smoke test is recommended before shipping.

Original findings are preserved below for reference.

## Executive summary

This is a small, competently-built vanilla-JS + Express + SQLite app. Structurally it is in good shape: **every SQL query uses parameterized statements** (no injection surface), auth middleware is applied consistently at the router level, session cookies are configured sensibly, and secrets are kept out of git. It does **not** exhibit most of the classic AI-slop failure modes — no God modules, no duplicated logic sprawl, no hallucinated dependencies.

The real risks are concentrated in three places:

1. **Stored XSS** — user-controlled names/emails are injected into admin pages via `innerHTML` with no escaping. Because it fires in an admin's session, it doubles as a privilege-escalation vector. *(Critical)*
2. **Broken access control** — cohort-scoped admins can read students and rounds outside their cohort, and can promote arbitrary users to admin. The cohort guard that protects some endpoints is missing on others. *(High)*
3. **Answer-harvesting** — the `/quiz/check` endpoint hands back the correct answer for any question index without recording anything, so "perfect rounds" and the reward system can be gamed. *(Medium, integrity)*

Full findings below, ordered by severity.

---

## Critical

### C-1 · Stored XSS via unescaped user data in admin views
**Files:** `public/js/views/admin.js:194`, `public/js/views/adminStudent.js:30-31`, `public/js/views/adminRound.js:26`, `public/js/views/dashboard.js:17`

There is no HTML-escaping helper anywhere in the client. User-controlled fields are interpolated straight into `innerHTML`:

```js
// admin.js:194 — student list
<span>${s.name}</span>
// adminStudent.js:30-31 — student detail
<h1 class="student-header__name">${student.name}</h1>
<p class="student-header__email">${student.email}</p>
// adminRound.js:26
<h1 ...>${round.student_name} — ${round.sectionName}</h1>
```

`name` and `email` originate from the Google OAuth profile (`server/auth.js:21,33-34,40`). A user's Google display name is attacker-controllable. A student who sets their display name to `<img src=x onerror="fetch('/api/admin/promote',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:MY_ID})})">` gets that payload stored and rendered **in the admin's browser** the moment the admin opens the student roster — running with the admin's session. Given C-2/H-1 below, that chains straight to self-promotion to super-admin.

**Fix:** add an `escapeHtml()` utility and apply it to every interpolated value that isn't a trusted literal — names, emails, cohort names, and (defensively) question text. Consider a Content-Security-Policy header to blunt inline handlers.

---

## High

### H-1 · `/admin/promote` has no cohort guard — privilege escalation
**File:** `server/routes/admin.js:268-274`

```js
router.post('/promote', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', userId);
  res.json({ ok: true });
});
```

Every other privileged mutation — `set-cohort` (`:247`), `settings` (`:261`), `cohorts` POST/DELETE (`:223,:237`) — starts with `if (req.user.cohort) return res.status(403)...` to lock cohort-scoped admins out. `/promote` is missing that check. A cohort-limited admin can promote any user to `admin`; since `promote` never sets a cohort, the promoted account becomes an unrestricted **super-admin**. This is almost certainly an oversight (the pattern is established four times elsewhere).

**Fix:** add the same `if (req.user.cohort) return res.status(403)` guard, or gate promotion behind an explicit super-admin check.

### H-2 · IDOR — cohort admins can read any student / any round
**Files:** `server/routes/admin.js:32` (`/students/:id`), `server/routes/admin.js:145` (`/rounds/:id`)

The roster list (`/students`, `:9`) and overview (`:102`) are correctly cohort-filtered. But the drill-in endpoints are not:

```js
router.get('/students/:id', (req, res) => {
  const id = parseInt(req.params.id);       // any id, no cohort check
  ...
router.get('/rounds/:id', (req, res) => {   // any round, no cohort check
```

A cohort admin can enumerate sequential IDs and read the full profile, score history, missed-question detail, and email of students in **other cohorts** — the exact data the cohort scoping was meant to wall off. This is the IDOR pattern the rubric flags as the most common critical class in AI-generated code.

**Fix:** in both handlers, if `req.user.cohort` is set, verify the target student (or the round's owner) belongs to that cohort before returning data; otherwise 404.

### H-3 · Weak session-secret fallback if `SESSION_SECRET` is unset in prod
**File:** `server/index.js:30`

```js
secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
```

If the env var is ever missing in production, sessions are signed with a public, hard-coded string, letting anyone forge session cookies. This is presumably set via Fly secrets today, but the silent fallback means a deploy misconfiguration degrades to full auth bypass with no error.

**Fix:** fail fast — in production, throw on startup if `SESSION_SECRET` (and other required vars) are absent, rather than substituting a default. See Q-4.

### H-4 · Dev-login allows `role=admin` and is gated only by OAuth config
**File:** `server/routes/auth.js:23-46`

When `hasOAuth` is false, an unauthenticated `GET /api/auth/dev-login?role=admin` mints an admin session for anyone. It's correctly disabled when Google OAuth is configured, so production is fine today — but the safety of the entire auth model rests on one env var. Any deployment that boots without `GOOGLE_CLIENT_ID` set is instantly wide open.

**Fix:** additionally gate the dev-login branch on `NODE_ENV !== 'production'` so it can never register in a prod build regardless of OAuth config.

---

## Medium

### M-1 · Answer harvesting via `/quiz/check` — reward integrity
**File:** `server/routes/quiz.js:173-187`

`/check` returns `correctShuffledIndex` for any `questionIndex` in the active quiz and records nothing. A client can call it for all 25 indices to collect every answer, then submit a perfect round. Perfect rounds drive the reward ladder (`:263-291`) and admin stats, so the whole progress/reward signal is trivially spoofable. Not a security breach, but it undermines the app's core purpose (tracking genuine mastery).

**Fix:** either mark a question as "revealed" server-side when `/check` is called and exclude revealed questions from perfect/reward eligibility, or drop `/check` and only reveal correctness on final `/submit`.

### M-2 · No CSRF protection on state-changing requests
**Files:** all `POST`/`DELETE` routes; cookie config `server/index.js:33-37`

There are no CSRF tokens. The only defense is `sameSite: 'lax'`, which does block cross-site POSTs in modern browsers — so this is partially mitigated — but `lax` still permits top-level GET navigations, and `GET /api/admin/export-csv` (`:186`) triggers a data export/download. Relying solely on `sameSite` is fragile.

**Fix:** add CSRF tokens (e.g. `csurf` or a double-submit cookie) for mutations, and avoid side-effecting GETs.

### M-3 · CSV formula injection in scores export
**File:** `server/routes/admin.js:202-209`

Quotes are escaped, but values beginning with `=`, `+`, `-`, or `@` are not neutralized. A student whose Google name is `=HYPERLINK("http://evil","click")` becomes a live formula when an admin opens the exported CSV in Excel/Sheets.

**Fix:** prefix any cell starting with `= + - @` with a `'` (or wrap in a way that forces text).

### M-4 · Duplicate keyboard listener leak in Classroom "Play Again"
**File:** `public/js/views/classroom.js:220-222, 226-234`

`classroomView` registers a `keydown` handler and relies on a one-shot `hashchange` to remove it (`:234`). "Play Again" calls `classroomView(params)` directly — no navigation, no `hashchange` — so a **second** `keydown` handler is added while the first is never removed. Each replay stacks another listener; a single "1–4" keypress eventually fires multiple stale handlers against detached state. This is the orphan-listener / missing-teardown pattern from Pass 2.

**Fix:** remove the existing handler before re-entering, or refactor "Play Again" to reset state in place instead of re-invoking the whole view.

---

## Low / Informational

### L-1 · Dead code
- `public/js/components/toast.js` (`showToast`) and `public/js/components/glassPanel.js` (`glassPanel`) are never imported anywhere. *(Pass 1.1 orphan modules.)*
- `public/js/views/quiz.js:132` — `const origNavigate = navigate;` is assigned and never used.

Remove to reduce surface and confusion.

### L-2 · Broad `try/catch` swallow around migrations
**File:** `server/db.js:70-88` — each `ALTER TABLE` is wrapped in `try/catch {}` that discards *all* errors on the assumption "column already exists." A genuine migration failure (locked DB, disk error) would be silently ignored. Narrow the catch to the duplicate-column case, or log.

### L-3 · Unescaped attribute injection for `avatar_url`
**Files:** `admin.js:193`, `adminStudent.js:28`, `navbar.js:20` — `<img src="${avatar_url}">` is unescaped. The value comes from Google's photo URL (low controllability), but a `"` in the value would break out of the attribute. Escape alongside the C-1 fix.

### L-4 · Session `activeQuiz` is single-slot
**File:** `server/routes/quiz.js:59,154,341` — starting a second quiz (e.g. two tabs) overwrites `req.session.activeQuiz`, so a submit from the first tab validates against the second quiz's answer key. Edge case, but produces confusing wrong scores. Consider keying active quizzes by an id returned to the client.

### L-5 · No rate limiting
No endpoint is rate-limited. Low priority for an internal training tool, but `/check` (see M-1) and the OAuth callback are the ones worth protecting first.

### L-6 · Question text rendered unescaped (defense in depth)
Question/option text (`results.js:20-26`, `weakSpots.js:36`, `questionCard.js:27`, `adminRound.js:41`) is injected via `innerHTML`. The source is the admin-curated `parsedEPA608.json`, so this is trusted today — but escaping it too would make the app robust if question authoring ever opens up.

---

## What's solid (verified, not flagged)

- **SQL injection:** none. Every query across `db.js`, `quiz.js`, `progress.js`, `admin.js`, `auth.js` uses `better-sqlite3` prepared statements with `?` placeholders, including the dynamically-built `IN (...)` lists which correctly generate one `?` per value.
- **Auth enforcement:** `requireAuth` / `requireAdmin` are applied at router level (`router.use(...)`) so no individual route can forget them.
- **Secrets hygiene:** `.env` is gitignored; only `.env.example` (placeholders) is tracked. No hard-coded credentials in source.
- **Cookies:** `httpOnly` (default), `sameSite: 'lax'`, `secure` in production, 7-day maxAge — reasonable.
- **Dependencies:** all six runtime deps are real, current, and maintained; no hallucinated packages.
- **Cross-session integrity:** correct answers are kept server-side in the session, not sent to the client (except the intentional debug/`show_answers` toggle) — a genuinely good design choice that most of the client-side XSS risk doesn't undermine.

## Suggested remediation order

1. **C-1** escape helper on all user data (unblocks the worst chain).
2. **H-1** add cohort guard to `/promote`.
3. **H-2** cohort-scope `/students/:id` and `/rounds/:id`.
4. **H-3 / H-4** fail-fast on missing prod env vars; gate dev-login on `NODE_ENV`.
5. **M-1** close the `/check` answer-harvest hole.
6. Everything else as maintenance.
