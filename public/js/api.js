const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    window.location.hash = '#/login';
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getQuestions: (topic) => request(`/quiz/questions?topic=${topic}`),
  getRetrain: (topic) => request(`/quiz/retrain?topic=${topic}`),
  getClassroom: (topic) => request(`/quiz/classroom?topic=${topic}`),
  checkAnswer: (questionIndex, selected) => request('/quiz/check', {
    method: 'POST',
    body: JSON.stringify({ questionIndex, selected }),
  }),
  submitQuiz: (answers) => request('/quiz/submit', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }),
  getSummary: () => request('/progress/summary'),
  getHistory: (topic) => request(`/progress/history?topic=${topic}`),
  getRewards: () => request('/progress/rewards'),
  getStudents: () => request('/admin/students'),
  getStudent: (id) => request(`/admin/students/${id}`),
  getOverview: () => request('/admin/overview'),
  getRound: (id) => request(`/admin/rounds/${id}`),
  getSettings: () => request('/admin/settings'),
  setSetting: (key, value) => request('/admin/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  }),
  getCohorts: () => request('/admin/cohorts'),
  createCohort: (name) => request('/admin/cohorts', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  deleteCohort: (name) => request(`/admin/cohorts/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  }),
  setCohort: (userId, cohort) => request('/admin/set-cohort', {
    method: 'POST',
    body: JSON.stringify({ userId, cohort }),
  }),
  promote: (userId) => request('/admin/promote', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  }),
};
