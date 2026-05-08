// Weak Spots widget — collapsible table of questions the user has missed,
// with click-to-practice modal and sortable column headers. Used on admin
// student detail and student dashboard.

let widgetSeq = 0;

const SORT_MODES = {
  question: { label: 'Question', cmp: (a, b) => cmpDate(b.latestAt, a.latestAt) },
  section:  { label: 'Section',  cmp: (a, b) => (a.topic - b.topic) || cmpDate(b.latestAt, a.latestAt) },
  missed:   { label: 'Missed',   cmp: (a, b) => (b.missCount - a.missCount) || cmpDate(b.latestAt, a.latestAt) },
};

function cmpDate(a, b) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function sortQuestions(qs, mode) {
  const cmp = SORT_MODES[mode].cmp;
  const wrong = qs.filter(q => !q.corrected).sort(cmp);
  const correct = qs.filter(q => q.corrected).sort(cmp);
  return [...wrong, ...correct];
}

function renderHeader(mode, activeMode) {
  const isActive = mode === activeMode;
  const arrow = isActive ? ' <span style="font-size:0.7em;">▾</span>' : '';
  const align = mode === 'question' ? 'left' : (mode === 'section' ? 'left' : 'center');
  const color = isActive ? 'var(--card-text)' : 'var(--card-text-secondary)';
  return `<th data-sort="${mode}" style="text-align:${align};padding:0.5rem 0.75rem;color:${color};font-weight:600;cursor:pointer;user-select:none;">${SORT_MODES[mode].label}${arrow}</th>`;
}

function renderRows(qs) {
  return qs.map((q, i) => `
    <tr class="weak-spot-row" data-idx="${i}" style="border-bottom:1px solid rgba(0,0,0,0.05);background:${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'};cursor:pointer;" onmouseover="this.style.background='rgba(255,20,147,0.06)'" onmouseout="this.style.background='${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'}'">
      <td style="padding:0.6rem 0.75rem;color:var(--card-text);line-height:1.4;max-width:480px;">${q.question}</td>
      <td style="padding:0.6rem 0.75rem;white-space:nowrap;">
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(0,0,0,0.06);color:var(--card-text-secondary);">${q.sectionName}</span>
      </td>
      <td style="padding:0.6rem 0.75rem;text-align:center;">
        <span style="display:inline-block;min-width:28px;padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:700;background:rgba(220,48,48,0.12);color:#dc3030;">${q.missCount}×</span>
      </td>
      <td style="padding:0.6rem 0.75rem;text-align:center;color:${q.corrected ? '#30a850' : 'var(--card-text-secondary)'};">
        ${q.corrected ? '<span style="font-weight:700;font-size:1.1rem;">✓</span>' : '—'}
      </td>
    </tr>
  `).join('');
}

export function renderWeakSpots(wrongQuestions) {
  if (!wrongQuestions || wrongQuestions.length === 0) return '';
  const id = ++widgetSeq;
  const sorted = sortQuestions(wrongQuestions, 'question');

  return `
    <div class="glass weak-spots" data-weak-spots="${id}" style="margin-top:1.5rem;">
      <div class="weak-spots__header" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:1.25rem 1.25rem 0;">
        <h3 style="margin:0;font-family:var(--font-heading);font-weight:600;color:var(--card-text);">
          ⚠️ Weak Spots
          <span style="font-size:0.8rem;font-weight:400;color:var(--card-text-secondary);margin-left:0.5rem;">${wrongQuestions.length} questions missed</span>
        </h3>
        <span class="weak-spots__chevron" style="color:var(--card-text-secondary);font-size:1rem;">▼</span>
      </div>
      <div class="weak-spots__body" style="padding:1rem 1.25rem 1.25rem;">
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead>
            <tr style="border-bottom:2px solid rgba(0,0,0,0.08);">
              ${renderHeader('question', 'question')}
              ${renderHeader('section', 'question')}
              ${renderHeader('missed', 'question')}
              <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Corrected</th>
            </tr>
          </thead>
          <tbody>${renderRows(sorted)}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindWeakSpots(wrongQuestions) {
  if (!wrongQuestions || wrongQuestions.length === 0) return;

  document.querySelectorAll('.weak-spots').forEach(widget => {
    if (widget.dataset.bound) return;
    widget.dataset.bound = '1';

    const header = widget.querySelector('.weak-spots__header');
    const body = widget.querySelector('.weak-spots__body');
    const chevron = widget.querySelector('.weak-spots__chevron');
    const tbody = widget.querySelector('tbody');
    const thead = widget.querySelector('thead tr');

    let sortMode = 'question';
    let sorted = sortQuestions(wrongQuestions, sortMode);

    header.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      chevron.textContent = hidden ? '▼' : '▶';
    });

    thead.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      sortMode = th.dataset.sort;
      sorted = sortQuestions(wrongQuestions, sortMode);
      tbody.innerHTML = renderRows(sorted);
      thead.innerHTML = `
        ${renderHeader('question', sortMode)}
        ${renderHeader('section', sortMode)}
        ${renderHeader('missed', sortMode)}
        <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--card-text-secondary);font-weight:600;">Corrected</th>
      `;
    });

    widget.addEventListener('click', e => {
      const row = e.target.closest('.weak-spot-row');
      if (!row || !widget.contains(row)) return;
      const idx = parseInt(row.dataset.idx);
      openPracticeModal(sorted[idx]);
    });
  });
}

function openPracticeModal(q) {
  const existing = document.getElementById('practice-modal');
  if (existing) existing.remove();

  const tileColors = ['var(--tile-1)', 'var(--tile-2)', 'var(--tile-3)', 'var(--tile-4)'];

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
