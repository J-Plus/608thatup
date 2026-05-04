import { api } from '../api.js';
import { getState } from '../state.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { rewardSet } from '../components/rewardBadge.js';
import { progressBar } from '../components/progressBar.js';
import { navigate } from '../router.js';

export async function dashboardView() {
  const app = document.getElementById('app');
  const { user } = getState();

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="page-header">
        <h1 class="page-title">Welcome back, ${user.name.split(' ')[0]}</h1>
        <p class="page-subtitle">Choose a section to start studying</p>
      </div>
      <div class="spinner"></div>
    </div>
  `;
  bindNavbar();

  // Use event delegation on the container so clicks always work
  const container = app.querySelector('.container');
  container.addEventListener('click', (e) => {
    const quizBtn = e.target.closest('.quiz-start-btn');
    if (quizBtn) {
      e.stopPropagation();
      navigate(`/quiz/${quizBtn.dataset.topic}`);
      return;
    }
    const retrainBtn = e.target.closest('.retrain-btn');
    if (retrainBtn) {
      e.stopPropagation();
      navigate(`/quiz/retrain/${retrainBtn.dataset.retrainTopic}`);
      return;
    }
    const classroomBtn = e.target.closest('.classroom-btn');
    if (classroomBtn) {
      e.stopPropagation();
      navigate(`/classroom/${classroomBtn.dataset.topic}`);
      return;
    }
    const card = e.target.closest('.section-card');
    if (card) {
      navigate(`/quiz/${card.dataset.topic}`);
    }
  });

  try {
    const sections = await api.getSummary();

    // Check we're still on dashboard (user may have navigated away)
    if (!window.location.hash.includes('/dashboard')) return;

    const relTime = (iso) => {
      if (!iso) return '';
      const ms = Date.now() - new Date(iso + 'Z').getTime();
      const days = Math.floor(ms / 86_400_000);
      if (days === 0) return 'today';
      if (days === 1) return 'yesterday';
      if (days < 7) return `${days} days ago`;
      if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
      }
      if (days < 365) {
        const months = Math.floor(days / 30);
        return `${months} ${months === 1 ? 'month' : 'months'} ago`;
      }
      const years = Math.floor(days / 365);
      return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    };

    const cardsHtml = sections.map(s => `
      <div class="section-card glass glass--interactive" data-topic="${s.topic}">
        <div class="section-card__header">
          <h3 class="section-card__name">${s.sectionName}</h3>
          <span class="section-card__count">${s.questionCount} questions</span>
        </div>
        ${progressBar(s.perfects, 20)}
        <div class="section-card__stats">
          <span><strong>${s.rounds}</strong> rounds</span>
          <span><strong>${s.perfects}</strong> perfect</span>
          <span>Avg: <strong>${s.avgScore}/${s.quizLength}</strong></span>
        </div>
        ${s.lastScore !== null ? `<div class="section-card__last">Last Test: ${relTime(s.lastDate)} score (<strong>${s.lastScore}/${s.quizLength}</strong>)</div>` : ''}
        <div class="section-card__rewards">
          ${rewardSet(s.rewards)}
        </div>
        <button class="btn btn--primary quiz-start-btn" data-topic="${s.topic}" style="margin-top:0.75rem;width:100%;">Quiz It Up!</button>
        ${s.wrongCount > 0 ? `<button class="btn retrain-btn" data-retrain-topic="${s.topic}" style="margin-top:0.5rem;width:100%;font-size:0.85rem;background:rgba(0,0,0,0.7);color:#fff;border:none;">Retry Missed Questions (${s.wrongCount})</button>` : ''}
        <button class="btn classroom-btn" data-topic="${s.topic}" style="margin-top:0.5rem;width:100%;font-size:0.85rem;background:rgba(255,20,147,0.15);color:#FF1493;border:1px solid rgba(255,20,147,0.4);">🎓 Classroom Mode</button>
      </div>
    `).join('');

    const spinner = container.querySelector('.spinner');
    if (spinner) spinner.remove();
    container.insertAdjacentHTML('beforeend', `<div class="topic-grid">${cardsHtml}</div>`);
  } catch (e) {
    const spinner = container.querySelector('.spinner');
    if (spinner) spinner.outerHTML = `<p class="text-muted text-center">Failed to load dashboard</p>`;
  }
}
