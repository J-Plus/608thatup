import { api } from '../api.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { rewardSet } from '../components/rewardBadge.js';
import { progressBar } from '../components/progressBar.js';
import { renderWeakSpots, bindWeakSpots } from '../components/weakSpots.js';

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
    const { student, sections, quizLength, wrongQuestions = [] } = data;

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

    const fmtDateTime = (iso) => {
      if (!iso) return '—';
      const withZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
      return new Date(withZ).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    };

    const sectionsHtml = sections.map(s => {
      const allRounds = s.allRounds || s.recentRounds;
      const latest = allRounds && allRounds[0];
      return `
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
              <a href="#/round/${r.id}" class="round-dot ${r.is_perfect ? 'round-dot--perfect' : ''} ${r.is_retrain ? 'round-dot--retrain' : ''}" title="${r.is_retrain ? 'Retrain: ' : ''}${r.score}/${r.total ?? quizLength}" style="text-decoration:none;cursor:pointer;">${r.score}</a>
            `).join('')}
          </div>
          <details class="section-card__history" style="margin-top:0.75rem;">
            <summary>Last Test ${fmtDateTime(latest.completed_at)} &rsaquo; View all ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}</summary>
            <ul class="section-card__history-list">
              ${allRounds.map(r => {
                const dateTime = fmtDateTime(r.completed_at);
                const tag = r.is_retrain ? ' <span class="history-tag">retrain</span>' : (r.is_perfect ? ' <span class="history-tag history-tag--perfect">perfect</span>' : '');
                return `<li><a href="#/round/${r.id}" style="color:inherit;text-decoration:none;">${dateTime} &nbsp; Score: <strong>${r.score}/${r.total ?? quizLength}</strong>${tag}</a></li>`;
              }).join('')}
            </ul>
          </details>
        ` : '<p class="text-muted" style="margin-top:0.75rem; font-size:0.85rem;">No rounds yet</p>'}
      </div>
    `;
    }).join('');

    container.insertAdjacentHTML('beforeend', headerHtml + sectionsHtml + renderWeakSpots(wrongQuestions));
    bindWeakSpots(wrongQuestions);
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load student data</p>`;
  }
}
