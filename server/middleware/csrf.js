import crypto from 'crypto';

// Ensures every session has a CSRF token. The token is handed to the client
// via GET /api/auth/me and must be echoed back in the X-CSRF-Token header on
// every state-changing request (see verifyCsrf).
export function ensureCsrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
}

// Rejects state-changing requests (anything but safe methods) whose
// X-CSRF-Token header doesn't match the session token. Combined with a
// custom header, cross-site requests can't forge this without a CORS
// preflight the server never grants.
export function verifyCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const expected = req.session && req.session.csrfToken;
  const provided = req.get('X-CSRF-Token');
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}
