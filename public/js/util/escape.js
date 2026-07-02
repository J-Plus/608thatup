// Escape a value for safe interpolation into HTML text or double-quoted
// attributes. Use this on ANY value that could contain user-controlled data
// (names, emails, cohort names, avatar URLs, question text) before it goes
// into innerHTML. Without it, a crafted Google display name can inject script
// that runs in an admin's session.
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
