# 608ThatUp — Project Context

EPA 608 refrigeration certification test prep app built for **Stacks+Joules** (workforce development org, NYC). Students log in, take quizzes, track progress. Teachers run classroom sessions. Admins monitor cohorts.

**Prod:** https://608thatup.fly.dev (Fly app `608thatup`)  
**Staging:** https://stagethatup.fly.dev (Fly app `stagethatup`)  
**Repo:** https://github.com/J-Plus/608thatup  
**Local:** `/Users/jonathanspooner/Documents/Claude/code/608thatupapp`

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla JS SPA, Vite, hash-based routing |
| Backend | Node.js + Express (ESM) |
| Database | SQLite via better-sqlite3 |
| Auth | Google OAuth (passport-google-oauth20), session-based |
| Hosting | Fly.io (EWR region, 256MB RAM, auto-stop machines). Prod app `608thatup`, staging app `stagethatup`. |
| Deploy | `npm run ship` (prod) or `npm run ship:staging` (staging) — each runs `git push && npm run build && fly deploy [--config fly.staging.toml]` |
| Node version | 22 (see `.nvmrc`) — use `nvm use 22` |

---

## Dev Setup

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm install
cp .env.example .env  # fill in secrets
npm run dev           # runs Express server (3000) + Vite (5173) concurrently
```

`.env` keys read by the server:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth credentials
- `CALLBACK_URL` — full OAuth callback URL (e.g. `https://stagethatup.fly.dev/api/auth/google/callback`). **Read by `server/auth.js`.** Note: `.env.example` lists `BASE_URL` but the code reads `CALLBACK_URL`; treat `BASE_URL` as deprecated/ignored.
- `SESSION_SECRET` — express-session secret
- `ADMIN_EMAILS` (comma-separated), `ADMIN_DOMAINS` (comma-separated) — first-login admin promotion
- `PORT` — Express port (defaults to 3000)

Admin access granted to any email in `ADMIN_EMAILS` or any `@ADMIN_DOMAINS` domain on first login.

---

## File Structure

```
public/
  index.html              # single HTML entry, links all CSS
  css/
    variables.css         # design tokens (colors, spacing, radii, motion)
    reset.css
    layout.css            # container, page, glass panels
    components.css        # buttons, badges, spinners, stats
    quiz.css              # quiz page layout, answer tiles, results
    classroom.css         # classroom mode (projector view)
    admin.css             # admin table, cohort chips, practice modal
  js/
    app.js                # route registration + init
    router.js             # hash-based router (route/navigate/startRouter)
    api.js                # all fetch calls to /api/*
    state.js              # simple global state (user, lastResults)
    components/
      navbar.js           # top nav bar
      questionCard.js     # question banner + 4 answer tiles (quiz mode)
      progressBar.js      # section progress bar
      rewardBadge.js      # emoji reward badges
      glassPanel.js
      toast.js
    views/
      login.js            # Google OAuth login page
      dashboard.js        # section cards + cohort filter chips
      topicSelect.js      # choose a topic before quiz
      quiz.js             # main quiz flow (25 questions)
      results.js          # score + review after quiz
      classroom.js        # teacher-projected 25Q classroom mode
      admin.js            # admin dashboard (student table, cohort mgmt)
      adminStudent.js     # student detail + weak spots panel
      adminRound.js       # individual round review

server/
  index.js               # Express app setup, session, passport, route mounts
  db.js                  # SQLite init, schema, migrations
  auth.js                # Google OAuth passport config
  seed.js                # seed questions from data/parsedEPA608.json
  middleware/
    requireAuth.js
    requireAdmin.js
  routes/
    auth.js              # /api/auth/* (me, google, callback, logout)
    quiz.js              # /api/quiz/* (questions, retrain, classroom, check, submit)
    progress.js          # /api/progress/* (summary, history, rewards)
    admin.js             # /api/admin/* (students, overview, rounds, csv, cohorts, settings)

data/
  parsedEPA608.json      # source question bank
```

---

## Database Schema

```sql
users         (id, google_id, email, name, avatar_url, role, cohort, created_at, last_login)
questions     (id, question, options JSON, answer int, topic int, section_name)
quiz_rounds   (id, user_id, topic, score, is_perfect, is_retrain, completed_at)
quiz_answers  (id, round_id, question_id, selected, is_correct, answer_order JSON)
rewards       (id, user_id, topic, reward_type, unlocked_at)
settings      (key, value)
cohorts       (id, name, created_at)
```

Topics: `0=Core, 1=Type I, 2=Type II, 3=Type III`

---

## Key Constants (server/routes/quiz.js)

```js
QUIZ_LENGTH = 25        // regular quiz
RETRAIN_LENGTH = 10     // missed questions retrain (worst misses first)
CLASSROOM_LENGTH = 25   // classroom mode
```

---

## Routes

### Frontend (hash routes)
| Hash | View |
|------|------|
| `#/login` | loginView |
| `#/dashboard` | dashboardView |
| `#/quiz/:topic` | quizView (topic 0-3) |
| `#/quiz/retrain/:topic` | quizView retrain mode |
| `#/results` | resultsView |
| `#/classroom/:topic` | classroomView |
| `#/admin` | adminView |
| `#/admin/:studentId` | adminStudentView |
| `#/round/:roundId` | adminRoundView |

### API
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | current user |
| GET | `/api/auth/google` | OAuth start |
| GET | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/auth/logout` | logout |
| GET | `/api/quiz/questions?topic=N` | 25 questions, stores session |
| GET | `/api/quiz/retrain?topic=N` | 10 worst missed, stores session |
| GET | `/api/quiz/classroom?topic=N` | 25 questions for classroom |
| POST | `/api/quiz/check` | `{questionIndex, selected}` → `{correct, isCorrect}` |
| POST | `/api/quiz/submit` | `{answers[]}` → score + results + rewards |
| GET | `/api/progress/summary` | per-section stats for dashboard |
| GET | `/api/progress/history?topic=N` | round history |
| GET | `/api/admin/students` | all students (cohort-scoped for non-super-admin) |
| GET | `/api/admin/students/:id` | student detail + sections + wrongQuestions |
| GET | `/api/admin/overview` | aggregate stats |
| GET | `/api/admin/rounds/:id` | round detail |
| GET | `/api/admin/export-csv` | CSV download |
| GET | `/api/admin/cohorts` | list cohorts |
| POST | `/api/admin/cohorts` | create cohort |
| DELETE | `/api/admin/cohorts/:name` | delete cohort |
| POST | `/api/admin/set-cohort` | assign student to cohort |
| GET | `/api/admin/settings` | app settings |
| POST | `/api/admin/settings` | set setting (e.g. show_answers) |
| POST | `/api/admin/promote` | promote student to admin |

---

## Design System

**Brand palette (variables.css):**
- Background: deep maroon `#2D0820` → `#5A1540`
- Accent: S+J hot pink `#FF1493`
- Tile 1 (magenta): `#E820A8`
- Tile 2 (green): `#3DAD5A`
- Tile 3 (gold): `#E8A82E`
- Tile 4 (sky): `#72D0E0`
- Correct: `#3DC940` | Wrong: `#DC3030`

**Fonts:** Montagu Slab (headings), Inter (body)

**Quiz UI:** Quizizz-style — 4 colored tiles in a grid, dark maroon bg, progress bar + pill, correct tile turns green with ★ prefix, wrong tile turns red, others dim to 15% opacity.

---

## Key Behaviors

**Quiz flow:**
1. Student picks topic → GET /quiz/questions (server stores correct answers in session)
2. Student clicks tile → POST /quiz/check → reveal correct/wrong → 900ms delay → next question
3. After last question → POST /quiz/submit → navigate to /results
4. Keyboard shortcuts: press 1/2/3/4 to select answer

**Retrain mode:** Shows only questions missed in last 10 rounds. Excludes any later corrected. Sorted by miss count desc, capped at 10.

**Classroom mode:** Teacher-projected. 25 questions. Teacher taps class answer → reveals correct/wrong. Tracks score X/25 + "perfect 5" badges (groups of 5 consecutive all-correct). Finale screen shows group breakdown.

**Rewards:** 20 emoji rewards per topic, earned one per perfect round (donut → crown progression).

**Admin roles:**
- Super-admin (no cohort): sees all students, manages cohorts, can set show_answers
- Cohort-admin (has cohort): sees only their cohort's students

**Debug mode (show_answers):** Admin toggle → API includes `correctAnswer` index in question payload → ★ shows on correct tile BEFORE user answers (tile keeps original color).

**Weak Spots panel (adminStudent):** Lists all lifetime wrong answers grouped by question, sorted by miss count desc. Includes correct answer count. Each row clickable → practice modal with shuffled tiles → reveal correct/wrong → close modal.

---

## Deployment

Two Fly apps share one repo, deployed via separate `fly.toml` files:

```bash
npm run ship           # → prod (608thatup.fly.dev)        uses fly.toml
npm run ship:staging   # → staging (stagethatup.fly.dev)   uses fly.staging.toml
```

Each runs `git push && npm run build && fly deploy [--config fly.staging.toml]`. Recommended flow: ship to staging → eyeball → ship to prod.

The Dockerfile auto-runs `npm run seed && npm start` so a fresh volume populates the question bank from `data/parsedEPA608.json` on first boot. (That file is checked into git — required for boot.)

**Fly secrets per app** (set via `fly secrets set ... --app <name>`):
- Both: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS`, `ADMIN_DOMAINS`, `CALLBACK_URL`
- Each app's `CALLBACK_URL` points to its own domain. The same Google OAuth client is shared; both callback URIs are registered in Google Cloud Console.

**Volumes (separate SQLite DBs):**
- Prod: `vol_493jd5z6y1ymd064` (1GB, EWR) → `/data/app.db`
- Staging: `vol_rnzyn6zdw7gzqe1r` (1GB, EWR) → `/data/app.db`

Daily snapshots auto-taken, 5-day retention. Restore: `fly volumes snapshots restore <snapshot-id> --app <app>`.
