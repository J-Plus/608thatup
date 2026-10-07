import { api } from '../api.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { rewardSet } from '../components/rewardBadge.js';
import { progressBar } from '../components/progressBar.js';
import { renderWeakSpots, bindWeakSpots } from '../components/weakSpots.js';
import { escapeHtml } from '../util/escape.js';
import { getState } from '../state.js';

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

    const isSuperAdmin = !getState().user?.cohort;
    const container = app.querySelector('.container');
    container.querySelector('.spinner').remove();

    const headerHtml = `
      <div class="student-header">
        ${student.avatar_url ? `<img src="${escapeHtml(student.avatar_url)}" alt="" class="student-header__avatar" onerror="this.style.display='none'">` : ''}
        <div>
          <h1 class="student-header__name">${escapeHtml(student.name)}</h1>
          <p class="student-header__email">${escapeHtml(student.email)}</p>
          <p class="text-muted" style="font-size:0.8rem; margin-top:0.25rem;">
            Joined ${new Date(student.created_at).toLocaleDateString()} &middot;
            Last active ${new Date(student.last_login).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-bottom:1.5rem;">
        <a href="#/admin" class="btn btn--ghost">&larr; Back to students</a>
        ${isSuperAdmin && student.role === 'student' ? `
          <button id="archive-student-btn" class="btn btn--ghost">${student.archived ? 'Unarchive' : 'Archive'}</button>
          <button id="delete-student-btn" class="btn btn--ghost" style="color:var(--error);">Delete permanently</button>
        ` : ''}
        ${student.archived ? '<span class="history-tag">archived</span>' : ''}
      </div>
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

    document.getElementById('archive-student-btn')?.addEventListener('click', async () => {
      const archiving = !student.archived;
      const msg = archiving
        ? `Archive ${student.name}? They'll be hidden from the student list, stats and CSV. Their history is kept and you can unarchive later.`
        : `Unarchive ${student.name}?`;
      if (!confirm(msg)) return;
      try {
        await api.archiveStudent(student.id, archiving);
        adminStudentView(params);
      } catch (err) {
        alert(err.message || 'Failed to update student');
      }
    });

    document.getElementById('delete-student-btn')?.addEventListener('click', async () => {
      const typed = prompt(
        `Permanently delete ${student.name} (${student.email}) and ALL their quiz history?\n\n` +
        `This cannot be undone. For real students, use Archive instead.\n\n` +
        `Type DELETE to confirm:`
      );
      if (typed !== 'DELETE') return;
      try {
        await api.deleteStudent(student.id);
        window.location.hash = '#/admin';
      } catch (err) {
        alert(err.message || 'Failed to delete student');
      }
    });
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load student data</p>`;
  }
}
