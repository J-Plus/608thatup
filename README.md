# 608ThatUp

EPA 608 Certification test prep app for the Stacks+Joules program.

## Stack

- **Frontend:** Vite + vanilla JS (hash-based SPA)
- **Backend:** Node/Express + SQLite (better-sqlite3)
- **Auth:** Google OAuth (passport-google-oauth20), session-based

## Setup

```bash
# Requires Node 22 (see .nvmrc)
nvm use 22

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Google OAuth credentials

# Seed the question database
npm run seed

# Start development servers
npm run dev
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Set authorized redirect URI to `http://localhost:5173/api/auth/google/callback`
6. Copy Client ID and Client Secret to `.env`

## Admin Access

Set `ADMIN_EMAILS` in `.env` to a comma-separated list of Google account emails that should have admin access. Users matching these emails are auto-promoted on login.

## Production Build

```bash
npm run build
npm start
```

## Reward System

Per section, students earn rewards for consecutive perfect rounds (5/5):

| Perfect Rounds | Reward |
|---|---|
| 3 | Gold Medal |
| 10 | Trophy |
| 25 | Gold Teeth |
