import { api } from './api.js';
import { setState } from './state.js';
import { route, startRouter, navigate } from './router.js';
import { loginView } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { topicSelectView } from './views/topicSelect.js';
import { quizView } from './views/quiz.js';
import { resultsView } from './views/results.js';
import { adminView } from './views/admin.js';
import { adminStudentView } from './views/adminStudent.js';
import { adminRoundView } from './views/adminRound.js';
import { classroomView } from './views/classroom.js';

route('/login', () => loginView());
route('/dashboard', () => dashboardView());
route('/quiz', (params) => {
  if (params.length > 0) return quizView(params);
  topicSelectView();
});
route('/results', () => resultsView());
route('/admin', (params) => {
  if (params.length > 0) return adminStudentView(params);
  adminView();
});
route('/round', (params) => adminRoundView(params));
route('/classroom', (params) => classroomView(params));

async function init() {
  try {
    const user = await api.getMe();
    setState({ user, loading: false });
    const hash = window.location.hash;
    if (!hash || hash === '#/' || hash === '#/login' || hash === '#/dashboard') {
      history.replaceState(null, '', user.role === 'admin' ? '#/admin' : '#/dashboard');
    }
  } catch {
    setState({ user: null, loading: false });
    history.replaceState(null, '', '#/login');
  }
  startRouter();
}

init();
