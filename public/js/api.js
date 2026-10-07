const BASE = '/api';

let csrfToken = null;
export function setCsrfToken(token) {
  csrfToken = token;
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const csrfHeader = (csrfToken && method !== 'GET' && method !== 'HEAD')
    ? { 'X-CSRF-Token': csrfToken }
    : {};

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeader, ...options.headers },
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
  getMe: async () => {
    const user = await request('/auth/me');
    if (user && user.csrfToken) setCsrfToken(user.csrfToken);
    return user;
  },
  logout: () => request('/auth/logout', { method: 'POST' }),
  getQuestions: (topic) => request(`/quiz/questions?topic=${topic}`),
  getRetrain: (topic) => request(`/quiz/retrain?topic=${topic}`),
  getClassroom: (topic) => request(`/quiz/classroom?topic=${topic}`),
  checkAnswer: (quizId, questionIndex, selected) => request('/quiz/check', {
    method: 'POST',
    body: JSON.stringify({ quizId, questionIndex, selected }),
  }),
  submitQuiz: (quizId) => request('/quiz/submit', {
    method: 'POST',
    body: JSON.stringify({ quizId }),
  }),
  getSummary: () => request('/progress/summary'),
  getHistory: (topic) => request(`/progress/history?topic=${topic}`),
  getRewards: () => request('/progress/rewards'),
  getWeakSpots: () => request('/progress/weak-spots'),
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
  getCohortsManage: () => request('/admin/cohorts/manage'),
  archiveCohort: (name, archived = true) => request(`/admin/cohorts/${encodeURIComponent(name)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ archived }),
  }),
  archiveStudent: (id, archived = true) => request(`/admin/students/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ archived }),
  }),
  deleteStudent: (id) => request(`/admin/students/${id}`, { method: 'DELETE' }),
  bulkStudents: (ids, action) => request('/admin/students/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, action }),
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
