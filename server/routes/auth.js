import { Router } from 'express';
import passport from 'passport';
import { hasOAuth } from '../auth.js';
import db from '../db.js';

const router = Router();

if (hasOAuth) {
  router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
  }));

  router.get('/google/callback', passport.authenticate('google', {
    failureRedirect: '/#/login',
  }), (req, res) => {
    res.redirect('/#/dashboard');
  });
} else {
  router.get('/google', (req, res) => {
    res.redirect('/api/auth/dev-login?role=student');
  });

  router.get('/dev-login', (req, res) => {
    const role = req.query.role === 'admin' ? 'admin' : 'student';
    const name = role === 'admin' ? 'Dev Admin' : 'Dev Student';
    const email = role === 'admin' ? 'admin@dev.local' : 'student@dev.local';
    const googleId = `dev-${role}`;

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user) {
      const result = db.prepare(`
        INSERT INTO users (google_id, email, name, avatar_url, role)
        VALUES (?, ?, ?, NULL, ?)
      `).run(googleId, email, name, role);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else {
      db.prepare("UPDATE users SET last_login = datetime('now'), role = ? WHERE id = ?").run(role, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed' });
      res.redirect('/#/dashboard');
    });
  });
}

router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { google_id, ...user } = req.user;
  res.json(user);
});

router.post('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

export default router;
