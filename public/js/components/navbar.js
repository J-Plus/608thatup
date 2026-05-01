import { getState } from '../state.js';
import { api } from '../api.js';
import { navigate } from '../router.js';

export function renderNavbar() {
  const { user } = getState();
  if (!user) return '';

  const adminLink = user.role === 'admin'
    ? `<a href="#/admin" class="navbar__link">Admin</a>`
    : '';

  return `
    <nav class="navbar">
      <a href="#/dashboard" class="navbar__brand">608<span>ThatUp</span></a>
      <div class="navbar__nav">
        <a href="#/dashboard" class="navbar__link">Dashboard</a>
        ${adminLink}
        <div class="navbar__user">
          ${user.avatar_url ? `<img src="${user.avatar_url}" alt="" class="navbar__avatar" onerror="this.style.display='none'">` : ''}
          <button class="navbar__link" id="logout-btn">Logout</button>
        </div>
      </div>
    </nav>
  `;
}

export function bindNavbar() {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await api.logout();
      navigate('/login');
      location.reload();
    });
  }
}
