import { api } from '../api.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { questionCard } from '../components/questionCard.js';
import { navigate } from '../router.js';
import { setState } from '../state.js';

export async function quizView(params) {
  const app = document.getElementById('app');
  const isRetrain = params[0] === 'retrain';
  const topic = parseInt(isRetrain ? params[1] : params[0]);

  if (isNaN(topic) || topic < 0 || topic > 3) {
    navigate('/quiz');
    return;
  }

  app.innerHTML = `
    ${renderNavbar()}
    <div id="quiz-root">
      <div class="container page"><div class="spinner"></div></div>
    </div>
  `;
  bindNavbar();

  let quizData;
  try {
    quizData = isRetrain ? await api.getRetrain(topic) : await api.getQuestions(topic);
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load questions</p>`;
    return;
  }

  if (quizData.empty) {
    app.querySelector('#quiz-root').innerHTML = `
      <div class="container page">
        <div class="glass" style="padding:2rem;text-align:center;">
          <h2>No wrong answers to retrain!</h2>
          <p class="text-muted" style="margin:1rem 0;">You've been getting everything right in your recent rounds.</p>
          <a href="#/dashboard" class="btn btn--primary">Back to Dashboard</a>
        </div>
      </div>
    `;
    return;
  }

  const totalQuestions = quizData.questions.length;
  const answers = new Array(totalQuestions).fill(-1);
  let currentQ = 0;
  let submitting = false;

  async function submit() {
    if (submitting) return;
    submitting = true;
    app.querySelector('#quiz-root').innerHTML = `
      <div class="container page" style="padding-top:80px;"><div class="spinner"></div></div>
    `;
    try {
      const results = await api.submitQuiz(answers);
      setState({ lastResults: { ...results, retrain: isRetrain }, lastTopic: topic, lastSectionName: quizData.sectionName });
      navigate('/results');
    } catch (e) {
      submitting = false;
      render();
    }
  }

  function render() {
    const q = quizData.questions[currentQ];
    const pct = Math.round((currentQ / totalQuestions) * 100);
    const label = `${isRetrain ? 'Retrain · ' : ''}${quizData.sectionName} · Q ${currentQ + 1} / ${totalQuestions}`;

    const root = app.querySelector('#quiz-root');
    root.innerHTML = `
      <div class="quiz-page">
        <div class="quiz-progress">
          <div class="quiz-progress__bar">
            <div class="quiz-progress__bar-fill" style="width: ${pct}%"></div>
          </div>
          <span class="quiz-progress__pill">${label}</span>
        </div>
        ${questionCard(q, answers[currentQ], false, q.correctAnswer ?? null, q.missCount || 0, true)}
      </div>
    `;

    root.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const selected = parseInt(btn.dataset.index);
        answers[currentQ] = selected;

        // Disable all buttons immediately
        root.querySelectorAll('.option-btn').forEach(b => { b.disabled = true; });

        // Check answer server-side
        try {
          const result = await api.checkAnswer(currentQ, selected);
          const correct = result.correct;

          root.querySelectorAll('.option-btn').forEach(b => {
            const idx = parseInt(b.dataset.index);
            if (idx === correct) b.classList.add('option-btn--correct');
            else if (idx === selected && selected !== correct) b.classList.add('option-btn--wrong');
            else b.classList.add('option-btn--dimmed');
          });

          setTimeout(() => {
            if (currentQ < totalQuestions - 1) {
              currentQ++;
              render();
            } else {
              submit();
            }
          }, 900);
        } catch (e) {
          // Re-enable on error so they can retry
          root.querySelectorAll('.option-btn').forEach(b => { b.disabled = false; });
        }
      });
    });
  }

  // Keyboard 1-4 → click corresponding tile
  const keyHandler = (e) => {
    const n = parseInt(e.key);
    if (n >= 1 && n <= 4) {
      const btn = app.querySelector(`#quiz-root .option-btn[data-index="${n - 1}"]`);
      if (btn && !btn.disabled) btn.click();
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Clean up on navigate away
  const origNavigate = navigate;
  const cleanup = () => document.removeEventListener('keydown', keyHandler);
  window.addEventListener('hashchange', cleanup, { once: true });

  render();
}
