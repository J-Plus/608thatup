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

    const weakSpotsHtml = wrongQuestions.length === 0 ? '' : `
      <div class="glass weak-spots" style="margin-top:1.5rem;">
        <div class="weak-spots__header" id="weak-spots-toggle" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:1.25rem 1.25rem 0;">
          <h3 style="margin:0;font-family:var(--font-heading);font-weight:600;color:var(--card-text);">
            ⚠️ Weak Spots
            <span style="font-size:0.8rem;font-weight:400;color:var(--card-text-secondary);margin-left:0.5rem;">${wrongQuestions.length} questions missed</span>
          </h3>
          <span id="weak-spots-chevron" style="color:var(--card-text-secondary);font-size:1rem;">▼</span>
        </div>
        <div id="weak-spots-body" style="padding:1rem 1.25rem 1.25rem;">
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead>
              <tr style="border-bottom:2px solid rgba(0,0,0,0.08);">
                <th style="text-align:left;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Question</th>
                <th style="text-align:left;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Section</th>
                <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Missed</th>
                <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Also Got Right</th>
              </tr>
            </thead>
            <tbody>
              ${wrongQuestions.map((q, i) => `
                <tr style="border-bottom:1px solid rgba(0,0,0,0.05);background:${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'};">
                  <td style="padding:0.6rem 0.75rem;color:var(--card-text);line-height:1.4;max-width:480px;">${q.question}</td>
                  <td style="padding:0.6rem 0.75rem;white-space:nowrap;">
                    <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(0,0,0,0.06);color:var(--card-text-secondary);">${q.sectionName}</span>
                  </td>
                  <td style="padding:0.6rem 0.75rem;text-align:center;">
                    <span style="display:inline-block;min-width:28px;padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:700;background:rgba(220,48,48,0.12);color:#dc3030;">${q.missCount}×</span>
                  </td>
                  <td style="padding:0.6rem 0.75rem;text-align:center;color:${q.correctCount > 0 ? '#30a850' : 'var(--card-text-secondary)'};">
                    ${q.correctCount > 0 ? `<span style="font-weight:600;">${q.correctCount}×</span>` : '—'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', headerHtml + sectionsHtml + weakSpotsHtml);

    // Toggle weak spots panel
    document.getElementById('weak-spots-toggle')?.addEventListener('click', () => {
      const body = document.getElementById('weak-spots-body');
      const chevron = document.getElementById('weak-spots-chevron');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      chevron.textContent = hidden ? '▼' : '▶';
    });
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load student data</p>`;
  }
}
