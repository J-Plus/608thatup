import { api } from '../api.js';
import { navigate } from '../router.js';

export async function classroomView(params) {
  const app = document.getElementById('app');
  const topic = parseInt(params[0]);

  if (isNaN(topic) || topic < 0 || topic > 3) {
    navigate('/dashboard');
    return;
  }

  app.innerHTML = `
    <div class="classroom">
      <div class="classroom__loading"><div class="spinner"></div></div>
    </div>
  `;

  let quizData;
  try {
    quizData = await api.getClassroom(topic);
  } catch (e) {
    app.innerHTML = `
      <div class="classroom" style="justify-content:center;align-items:center;">
        <p style="color:white;text-align:center;padding:2rem;">
          Failed to load questions.
          <a href="#/dashboard" style="color:#FF1493;display:block;margin-top:1rem;">Back to Dashboard</a>
        </p>
      </div>
    `;
    return;
  }

  const totalQuestions = quizData.questions.length;
  const scores = new Array(totalQuestions).fill(null); // null=unanswered, true=correct, false=wrong
  let currentQ = 0;
  let revealed = false;
  let selectedIdx = -1;
  let correctIdx = -1;

  function getScore() {
    return scores.filter(s => s === true).length;
  }

  function getPerfect5Groups() {
    const groups = [];
    const groupCount = Math.ceil(totalQuestions / 5);
    for (let g = 0; g < groupCount; g++) {
      const start = g * 5;
      const end = Math.min(start + 5, totalQuestions);
      const slice = scores.slice(start, end);
      const completed = slice.every(s => s !== null);
      const perfect = completed && slice.every(s => s === true);
      groups.push({ perfect, completed, start, end });
    }
    return groups;
  }

  function renderStars(groups) {
    return groups.map(g => {
      if (g.perfect) return `<span class="classroom__star classroom__star--earned" title="Q${g.start + 1}–${g.end}: Perfect!">★</span>`;
      if (g.completed) return `<span class="classroom__star classroom__star--missed" title="Q${g.start + 1}–${g.end}: Missed some">★</span>`;
      return `<span class="classroom__star classroom__star--pending" title="Q${g.start + 1}–${g.end}: Not yet">☆</span>`;
    }).join('');
  }

  function getTileSize(text) {
    const len = text.length;
    if (len > 60) return ' classroom-tile--sm';
    if (len > 25) return ' classroom-tile--md';
    return '';
  }

  function render() {
    const q = quizData.questions[currentQ];
    const groups = getPerfect5Groups();
    const score = getScore();
    const answeredCount = scores.filter(s => s !== null).length;
    const perfectCount = groups.filter(g => g.perfect).length;

    const optionsHtml = q.options.map((opt, i) => {
      let classes = 'classroom-tile';
      if (revealed) {
        if (i === correctIdx) classes += ' classroom-tile--correct';
        else if (i === selectedIdx && i !== correctIdx) classes += ' classroom-tile--wrong';
        else classes += ' classroom-tile--dimmed';
      }
      classes += getTileSize(opt);
      return `<button class="${classes}" data-index="${i}" ${revealed ? 'disabled' : ''}>
        <span class="classroom-tile__num">${i + 1}</span>
        ${opt}
      </button>`;
    }).join('');

    app.innerHTML = `
      <div class="classroom">
        <div class="classroom__header">
          <div class="classroom__meta">
            <span class="classroom__section">${quizData.sectionName}</span>
            <span class="classroom__qnum">Q ${currentQ + 1} / ${totalQuestions}</span>
          </div>
          <div class="classroom__scoreboard">
            <span class="classroom__score">${score} / ${answeredCount} correct</span>
            <div class="classroom__stars" title="${perfectCount} perfect 5${perfectCount !== 1 ? 's' : ''}">${renderStars(groups)}</div>
          </div>
          <a href="#/dashboard" class="classroom__exit">✕ Exit</a>
        </div>

        <div class="classroom__question">
          <p class="classroom__question-text">${q.question}</p>
        </div>

        <div class="classroom__tiles">
          ${optionsHtml}
        </div>

        <div class="classroom__controls">
          ${revealed
            ? `<button class="classroom__next-btn" id="classroom-next">
                ${currentQ < totalQuestions - 1 ? 'Next Question →' : 'See Results'}
               </button>`
            : `<p class="classroom__hint">Tap the class answer to reveal</p>`
          }
        </div>
      </div>
    `;

    if (!revealed) {
      app.querySelectorAll('.classroom-tile').forEach(btn => {
        btn.addEventListener('click', async () => {
          selectedIdx = parseInt(btn.dataset.index);
          app.querySelectorAll('.classroom-tile').forEach(b => { b.disabled = true; });
          try {
            const result = await api.checkAnswer(currentQ, selectedIdx);
            correctIdx = result.correct;
            scores[currentQ] = result.isCorrect;
            revealed = true;
            render();
          } catch (e) {
            app.querySelectorAll('.classroom-tile').forEach(b => { b.disabled = false; });
          }
        });
      });
    }

    const nextBtn = app.querySelector('#classroom-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentQ < totalQuestions - 1) {
          currentQ++;
          revealed = false;
          selectedIdx = -1;
          correctIdx = -1;
          render();
        } else {
          renderFinale();
        }
      });
    }
  }

  function renderFinale() {
    const groups = getPerfect5Groups();
    const score = getScore();
    const perfectCount = groups.filter(g => g.perfect).length;
    const groupCount = groups.length;

    const groupsHtml = groups.map(g => `
      <div class="classroom__finale-group ${g.perfect ? 'classroom__finale-group--perfect' : 'classroom__finale-group--done'}">
        <span class="classroom__finale-star">${g.perfect ? '★' : '☆'}</span>
        <span class="classroom__finale-label">Q${g.start + 1}–${g.end}</span>
      </div>
    `).join('');

    app.innerHTML = `
      <div class="classroom classroom--finale">
        <div class="classroom__finale">
          <h2 class="classroom__finale-title">Class Score</h2>
          <div class="classroom__finale-score">${score} / ${totalQuestions}</div>
          <p class="classroom__finale-subtitle">Perfect 5s: ${perfectCount} / ${groupCount}</p>
          <div class="classroom__finale-groups">${groupsHtml}</div>
          <div class="classroom__finale-actions">
            <button class="classroom__next-btn" id="play-again">Play Again</button>
            <a href="#/dashboard" class="classroom__exit-btn">Back to Dashboard</a>
          </div>
        </div>
      </div>
    `;

    app.querySelector('#play-again').addEventListener('click', () => {
      classroomView(params);
    });
  }

  render();
}
