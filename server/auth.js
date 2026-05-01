import passport from 'passport';
import db from './db.js';

export const hasOAuth = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'placeholder';

export async function configurePassport() {
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user || false);
  });

  if (hasOAuth) {
    const { Strategy: GoogleStrategy } = (await import('passport-google-oauth20')).default;
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL || 'http://localhost:5173/api/auth/google/callback',
    }, (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
      const adminDomains = (process.env.ADMIN_DOMAINS || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
      const emailDomain = email.toLowerCase().split('@')[1];
      const isAdmin = adminEmails.includes(email.toLowerCase()) || adminDomains.includes(emailDomain);
      const role = isAdmin ? 'admin' : 'student';

      let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);

      if (user) {
        db.prepare(`
          UPDATE users SET name = ?, avatar_url = ?, last_login = datetime('now'), role = ?
          WHERE id = ?
        `).run(profile.displayName, profile.photos?.[0]?.value, role, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      } else {
        const result = db.prepare(`
          INSERT INTO users (google_id, email, name, avatar_url, role)
          VALUES (?, ?, ?, ?, ?)
        `).run(profile.id, email, profile.displayName, profile.photos?.[0]?.value, role);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      }

      done(null, user);
    }));
  } else {
    console.log('Google OAuth not configured — dev login enabled at /api/auth/dev-login');
  }
}
