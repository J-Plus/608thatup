import { api } from '../api.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { rewardSet } from '../components/rewardBadge.js';
import { progressBar } from '../components/progressBar.js';

export async function adminStudentView(params) {
  const app = document.getElementById('app');
  const studentId = params[0];

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="spinner"></div>
    </div>
  `;
  bindNavbar();

  try {
    const data = await api.getStudent(studentId);
    const { student, sections, quizLength } = data;

    const container = app.querySelector('.container');
    container.querySelector('.spinner').remove();

    const headerHtml = `
      <div class="student-header">
        ${student.avatar_url ? `<img src="${student.avatar_url}" alt="" class="student-header__avatar" onerror="this.style.display='none'">` : ''}
        <div>
          <h1 class="student-header__name">${student.name}</h1>
          <p class="student-header__email">${student.email}</p>
          <p class="text-muted" style="font-size:0.8rem; margin-top:0.25rem;">
            Joined ${new Date(student.created_at).toLocaleDateString()} &middot;
            Last active ${new Date(student.last_login).toLocaleDateString()}
          </p>
        </div>
      </div>
      <a href="#/admin" class="btn btn--ghost" style="margin-bottom:1.5rem;">&larr; Back to students</a>
    `;

    const sectionsHtml = sections.map(s => `
      <div class="student-section glass">
        <div class="student-section__header">
          <h3 class="student-section__name">${s.sectionName}</h3>
          <div class="section-card__rewards">${rewardSet(s.rewards)}</div>
        </div>
        ${progressBar(s.perfects, 20)}
        <div class="student-section__stats">
          <span><strong>${s.rounds}</strong> rounds</span>
          <span><strong>${s.perfects}</strong> perfect</span>
          <span>Avg: <strong>${s.avgScore}/${quizLength}</strong></span>
        </div>
        ${s.recentRounds.length > 0 ? `
          <div class="round-history">
            ${s.recentRounds.map(r => `
              <a href="#/round/${r.id}" class="round-dot ${r.is_perfect ? 'round-dot--perfect' : ''} ${r.is_retrain ? 'round-dot--retrain' : ''}" title="${r.is_retrain ? 'Retrain: ' : ''}${r.score}/${r.is_retrain ? '?' : quizLength}" style="text-decoration:none;cursor:pointer;">${r.score}</a>
            `).join('')}
          </div>
        ` : '<p class="text-muted" style="margin-top:0.75rem; font-size:0.85rem;">No rounds yet</p>'}
      </div>
    `).join('');

    container.insertAdjacentHTML('beforeend', headerHtml + sectionsHtml);
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load student data</p>`;
  }
}
