export function progressBar(value, max) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
    <div class="progress-bar">
      <div class="progress-bar__fill" style="width: ${pct}%"></div>
    </div>
  `;
}
