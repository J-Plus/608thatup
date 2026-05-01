import { getState } from '../state.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { REWARD_TIERS } from '../components/rewardBadge.js';
import { navigate } from '../router.js';

export function resultsView() {
  const app = document.getElementById('app');
  const { lastResults: results, lastTopic: topic, lastSectionName: sectionName } = getState();

  if (!results) {
    navigate('/dashboard');
    return;
  }

  const scoreClass = results.isPerfect ? 'results-score__number--perfect' : '';

  const reviewHtml = results.results.map(r => `
    <div class="results-review__item glass">
      <span class="results-review__icon">${r.isCorrect ? '\u2705' : '\u274C'}</span>
      <div>
        <p class="results-review__question">${r.question}</p>
        <p class="results-review__answer">
          Your answer: ${r.options[r.selected]}
          ${!r.isCorrect ? `<br><strong>Correct: ${r.options[r.correctAnswer]}</strong>` : ''}
        </p>
      </div>
    </div>
  `).join('');

  const latestReward = results.newRewards.length > 0
    ? REWARD_TIERS.find(r => r.type === results.newRewards[results.newRewards.length - 1])
    : null;

  const newRewardsHtml = latestReward ? `
    <div class="results-rewards reward-unlock" style="text-align:center;margin-top:1.5rem;">
      <span style="font-size:4rem;display:inline-block;animation:rewardPop 600ms var(--ease-spring);">${latestReward.icon}</span>
      <p class="text-gold mt-md" style="font-weight:700; font-size:1.1rem;">${latestReward.label} unlocked!</p>
    </div>
  ` : '';

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="results-score glass ${results.newRewards.length > 0 ? 'reward-unlock' : ''}">
        <div class="results-score__number ${scoreClass}">${results.score}/${results.total}</div>
        <p class="results-score__label">
          ${results.retrain ? 'Retrain: ' : ''}${results.isPerfect ? 'Perfect round!' : results.score >= results.total - 1 ? 'Almost there!' : results.score >= results.total * 0.6 ? 'Good effort!' : 'Keep studying!'}
          &middot; ${sectionName}
        </p>
        ${!results.retrain ? `<p class="text-muted mt-md" style="font-size:0.85rem;">
          ${results.perfectCount} perfect round${results.perfectCount !== 1 ? 's' : ''} in this section
        </p>` : ''}
        ${newRewardsHtml}
      </div>

      <div class="results-review">
        <h2 style="font-weight:700; margin-bottom:1rem;">Review</h2>
        ${reviewHtml}
      </div>

      <div class="results-actions">
        ${!results.retrain ? '<button class="btn btn--primary" id="retry-btn">Try Again</button>' : ''}
        <button class="btn ${results.retrain ? 'btn--primary' : 'btn--ghost'}" id="back-btn">Dashboard</button>
      </div>
    </div>
  `;
  bindNavbar();

  document.getElementById('retry-btn')?.addEventListener('click', () => {
    navigate(`/quiz/${topic}`);
  });
  document.getElementById('back-btn').addEventListener('click', () => {
    navigate('/dashboard');
  });
}
