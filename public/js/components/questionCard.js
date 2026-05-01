export function questionCard(question, selectedIndex, revealed = false, correctAnswer = null, missCount = 0, preReveal = false) {
  const optionsHtml = question.options.map((opt, i) => {
    let classes = 'option-btn';
    if (revealed) {
      if (i === correctAnswer) classes += ' option-btn--correct';
      else if (i === selectedIndex && i !== correctAnswer) classes += ' option-btn--wrong';
      else classes += ' option-btn--dimmed';
    } else if (preReveal && correctAnswer !== null && i === correctAnswer) {
      classes += ' option-btn--debug';
    }

    const len = opt.length;
    const sizeClass = len > 60 ? ' option-btn--text-sm' : len > 25 ? ' option-btn--text-md' : '';

    return `<button class="${classes}${sizeClass}" data-index="${i}" ${revealed ? 'disabled' : ''}>
      <span class="option-btn__num">${i + 1}</span>
      ${opt}
    </button>`;
  }).join('');

  const missHtml = missCount > 0
    ? `<span class="question-banner__miss">missed ${missCount}x</span>`
    : '';

  return `
    <div class="question-banner">
      <p class="question-banner__text">${question.question}</p>
      ${missHtml}
    </div>
    <div class="option-tiles">${optionsHtml}</div>
  `;
}
