export function glassPanel(content, { className = '', interactive = false } = {}) {
  const classes = ['glass', className, interactive ? 'glass--interactive' : ''].filter(Boolean).join(' ');
  return `<div class="${classes}">${content}</div>`;
}
