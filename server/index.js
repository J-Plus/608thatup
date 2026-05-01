import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import ConnectSQLite from 'connect-sqlite3';
import passport from 'passport';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { configurePassport } from './auth.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quiz.js';
import progressRoutes from './routes/progress.js';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const SQLiteStore = ConnectSQLite(session);

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: process.env.DATA_DIR || join(__dirname, '..') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isProduction,
  },
}));

await configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/admin', adminRoutes);

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
