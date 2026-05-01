import { renderNavbar, bindNavbar } from '../components/navbar.js';

const SECTIONS = [
  { topic: 0, name: 'Core', desc: 'Universal certification — required for all technicians' },
  { topic: 1, name: 'Type I', desc: 'Small appliances — sealed systems with 5 lbs or less' },
  { topic: 2, name: 'Type II', desc: 'High-pressure equipment — residential & commercial A/C' },
  { topic: 3, name: 'Type III', desc: 'Low-pressure equipment — chillers & large systems' },
];

export function topicSelectView() {
  const app = document.getElementById('app');

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="page-header">
        <h1 class="page-title">Choose Your Section</h1>
        <p class="page-subtitle">5 random questions per round</p>
      </div>
      <div class="topic-grid">
        ${SECTIONS.map(s => `
          <div class="section-card glass glass--interactive" data-topic="${s.topic}">
            <h3 class="section-card__name">${s.name}</h3>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.9rem;">${s.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  bindNavbar();

  app.querySelectorAll('.section-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.hash = `#/quiz/${card.dataset.topic}`;
    });
  });
}
