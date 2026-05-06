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
              <a href="#/round/${r.id}" class="round-dot ${r.is_perfect ? 'round-dot--perfect' : ''} ${r.is_retrain ? 'round-dot--retrain' : ''}" title="${r.is_retrain ? 'Retrain: ' : ''}${r.score}/${r.is_retrain ? '?' : quizLength}" style="text-decoration:none;cursor:pointer;">${r.score}</a>
            `).join('')}
          </div>
          <details class="section-card__history" style="margin-top:0.75rem;">
            <summary>Last Test ${fmtDateTime(latest.completed_at)} &rsaquo; View all ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}</summary>
            <ul class="section-card__history-list">
              ${allRounds.map(r => {
                const dateTime = fmtDateTime(r.completed_at);
                const tag = r.is_retrain ? ' <span class="history-tag">retrain</span>' : (r.is_perfect ? ' <span class="history-tag history-tag--perfect">perfect</span>' : '');
                return `<li><a href="#/round/${r.id}" style="color:inherit;text-decoration:none;">${dateTime} &nbsp; Score: <strong>${r.score}/${quizLength}</strong>${tag}</a></li>`;
              }).join('')}
            </ul>
          </details>
        ` : '<p class="text-muted" style="margin-top:0.75rem; font-size:0.85rem;">No rounds yet</p>'}
      </div>
    `;
    }).join('');

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
                <tr class="weak-spot-row" data-idx="${i}" style="border-bottom:1px solid rgba(0,0,0,0.05);background:${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'};cursor:pointer;" onmouseover="this.style.background='rgba(255,20,147,0.06)'" onmouseout="this.style.background='${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'}'">
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

    // Practice modal
    function openPracticeModal(q) {
      const existing = document.getElementById('practice-modal');
      if (existing) existing.remove();

      const tile1 = `--tile-1`; // CSS vars
      const tileColors = ['var(--tile-1)', 'var(--tile-2)', 'var(--tile-3)', 'var(--tile-4)'];

      // Shuffle options, track correct
      const indices = [0, 1, 2, 3];
      const shuffled = [...indices].sort(() => Math.random() - 0.5);
      const shuffledOptions = shuffled.map(i => q.options[i]);
      const correctShuffledIdx = shuffled.indexOf(q.correctIndex);

      const tilesHtml = shuffledOptions.map((opt, i) => {
        const len = opt.length;
        const sizeClass = len > 60 ? 'option-btn--text-sm' : len > 25 ? 'option-btn--text-md' : '';
        return `<button class="option-btn ${sizeClass}" data-index="${i}" style="background:${tileColors[i]};">
          <span class="option-btn__num">${i + 1}</span>
          ${opt}
        </button>`;
      }).join('');

      const modal = document.createElement('div');
      modal.id = 'practice-modal';
      modal.innerHTML = `
        <div class="practice-backdrop"></div>
        <div class="practice-modal">
          <div class="practice-modal__meta">${q.sectionName} · missed ${q.missCount}×</div>
          <div class="question-banner" style="margin-bottom:1.25rem;">
            <p class="question-banner__text">${q.question}</p>
          </div>
          <div class="option-tiles" style="margin-bottom:1.5rem;">${tilesHtml}</div>
          <div id="practice-result" style="min-height:2rem;text-align:center;"></div>
          <button class="btn btn--ghost practice-modal__back" style="display:block;margin:1rem auto 0;">← Back to Weak Spots</button>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { modal.remove(); };
      modal.querySelector('.practice-backdrop').addEventListener('click', close);
      modal.querySelector('.practice-modal__back').addEventListener('click', close);

      modal.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const selected = parseInt(btn.dataset.index);
          modal.querySelectorAll('.option-btn').forEach(b => {
            b.disabled = true;
            const idx = parseInt(b.dataset.index);
            if (idx === correctShuffledIdx) {
              b.classList.add('option-btn--correct');
            } else if (idx === selected && selected !== correctShuffledIdx) {
              b.classList.add('option-btn--wrong');
            } else {
              b.classList.add('option-btn--dimmed');
            }
          });
          const result = modal.querySelector('#practice-result');
          if (selected === correctShuffledIdx) {
            result.innerHTML = `<span style="color:var(--success);font-weight:700;font-size:1.1rem;">★ Correct!</span>`;
          } else {
            result.innerHTML = `<span style="color:var(--error);font-weight:700;font-size:1.1rem;">✗ Wrong — correct answer highlighted above</span>`;
          }
        });
      });
    }

    // Bind row clicks in weak spots table
    document.querySelectorAll('.weak-spot-row').forEach(row => {
      const idx = parseInt(row.dataset.idx);
      row.addEventListener('click', () => openPracticeModal(wrongQuestions[idx]));
    });
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load student data</p>`;
  }
}
