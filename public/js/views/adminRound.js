import { api } from '../api.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';

export async function adminRoundView(params) {
  const app = document.getElementById('app');
  const roundId = params[0];

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="spinner"></div>
    </div>
  `;
  bindNavbar();

  try {
    const data = await api.getRound(roundId);
    const { round, answers } = data;

    const container = app.querySelector('.container');
    container.querySelector('.spinner').remove();

    const headerHtml = `
      <a href="#/admin/${round.user_id}" class="btn btn--ghost" style="margin-bottom:1.5rem;">&larr; Back to ${round.student_name}</a>
      <div class="glass" style="padding:1.5rem; margin-bottom:1.5rem;">
        <h1 style="margin:0 0 0.5rem;">${round.student_name} — ${round.sectionName}</h1>
        <p class="text-muted" style="margin:0;">
          ${new Date(round.completed_at).toLocaleString()} &middot;
          Score: <strong>${round.score}/${answers.length}</strong>
          ${round.is_perfect ? ' ⭐ Perfect!' : ''}
        </p>
      </div>
    `;

    const answersHtml = answers.map((a, i) => {
      const shuffledOptions = a.order.map(idx => a.options[idx]);
      const correctShuffled = a.order.indexOf(a.correctIndex);

      return `
        <div class="glass" style="padding:1.25rem; margin-bottom:1rem;">
          <p style="margin:0 0 0.75rem; font-weight:600;">${i + 1}. ${a.question}</p>
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            ${shuffledOptions.map((opt, j) => {
              const isSelected = j === a.selected;
              const isCorrect = j === correctShuffled;
              let style = 'padding:0.5rem 0.75rem; border-radius:8px; font-size:0.9rem;';
              if (isSelected && a.isCorrect) {
                style += 'background:rgba(52,199,89,0.2); border:1px solid rgba(52,199,89,0.5);';
              } else if (isSelected && !a.isCorrect) {
                style += 'background:rgba(255,59,48,0.2); border:1px solid rgba(255,59,48,0.5);';
              } else if (isCorrect) {
                style += 'background:rgba(52,199,89,0.1); border:1px solid rgba(52,199,89,0.3);';
              } else {
                style += 'background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);';
              }
              return `<div style="${style}">${isSelected ? '→ ' : ''}${opt}${isCorrect && !a.isCorrect ? ' ✓' : ''}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.insertAdjacentHTML('beforeend', headerHtml + answersHtml);
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load round data</p>`;
  }
}
