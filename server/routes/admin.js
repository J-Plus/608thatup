import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import db from '../db.js';
import { QUIZ_LENGTH } from './quiz.js';

const router = Router();
router.use(requireAdmin);

router.get('/students', (req, res) => {
  const adminCohort = req.user.cohort;
  const cohortFilter = adminCohort ? 'AND u.cohort = ?' : '';
  const params = adminCohort ? [adminCohort] : [];

  const students = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.last_login, u.cohort,
      (SELECT COUNT(*) FROM quiz_rounds WHERE user_id = u.id) as totalRounds,
      (SELECT SUM(is_perfect) FROM quiz_rounds WHERE user_id = u.id) as totalPerfects,
      (SELECT AVG(score) FROM quiz_rounds WHERE user_id = u.id AND is_retrain = 0) as avgScore,
      (SELECT COUNT(*) FROM rewards WHERE user_id = u.id) as rewardCount
    FROM users u WHERE u.role = 'student' ${cohortFilter}
    ORDER BY u.name COLLATE NOCASE ASC
  `).all(...params);

  res.json(students.map(s => ({
    ...s,
    avgScore: s.avgScore ? Math.round(s.avgScore * 10) / 10 : 0,
    totalPerfects: s.totalPerfects || 0,
  })));
});

router.get('/students/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid student ID' });

  const student = db.prepare('SELECT id, name, email, avatar_url, created_at, last_login FROM users WHERE id = ?')
    .get(id);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];

  const sections = [0, 1, 2, 3].map(topic => {
    const stats = db.prepare(`
      SELECT COUNT(*) as rounds, SUM(is_perfect) as perfects, AVG(score) as avgScore
      FROM quiz_rounds WHERE user_id = ? AND topic = ?
    `).get(student.id, topic);

    const rewards = db.prepare(`
      SELECT reward_type FROM rewards WHERE user_id = ? AND topic = ?
    `).all(student.id, topic).map(r => r.reward_type);

    const recentRounds = db.prepare(`
      SELECT id, score, is_perfect, is_retrain, completed_at FROM quiz_rounds
      WHERE user_id = ? AND topic = ? ORDER BY completed_at DESC LIMIT 10
    `).all(student.id, topic);

    return {
      topic,
      sectionName: SECTION_NAMES[topic],
      rounds: stats.rounds,
      perfects: stats.perfects || 0,
      avgScore: stats.avgScore ? Math.round(stats.avgScore * 10) / 10 : 0,
      rewards,
      recentRounds,
    };
  });

  const SECTION_MAP = ['Core', 'Type I', 'Type II', 'Type III'];

  // Lifetime wrong answers grouped by question, sorted by miss count desc
  const wrongQuestions = db.prepare(`
    SELECT q.id, q.question, q.topic,
      COUNT(*) as missCount,
      SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as correctCount
    FROM quiz_answers qa
    JOIN questions q ON q.id = qa.question_id
    JOIN quiz_rounds qr ON qr.id = qa.round_id
    WHERE qr.user_id = ? AND qa.is_correct = 0
    GROUP BY q.id
    ORDER BY missCount DESC
  `).all(student.id).map(q => ({
    ...q,
    sectionName: SECTION_MAP[q.topic] || 'Unknown',
  }));

  res.json({ student, sections, quizLength: QUIZ_LENGTH, wrongQuestions });
});

router.get('/overview', (req, res) => {
  const adminCohort = req.user.cohort;

  if (adminCohort) {
    // Scoped to cohort
    const studentIds = db.prepare('SELECT id FROM users WHERE role = ? AND cohort = ?').all('student', adminCohort).map(s => s.id);
    const placeholders = studentIds.length > 0 ? studentIds.map(() => '?').join(',') : 'NULL';

    const totalStudents = studentIds.length;
    const totalRounds = studentIds.length > 0
      ? db.prepare(`SELECT COUNT(*) as count FROM quiz_rounds WHERE user_id IN (${placeholders})`).get(...studentIds).count : 0;
    const avgScore = studentIds.length > 0
      ? db.prepare(`SELECT AVG(score) as avg FROM quiz_rounds WHERE is_retrain = 0 AND user_id IN (${placeholders})`).get(...studentIds).avg : null;
    const totalRewards = studentIds.length > 0
      ? db.prepare(`SELECT COUNT(*) as count FROM rewards WHERE user_id IN (${placeholders})`).get(...studentIds).count : 0;
    const activeToday = studentIds.length > 0
      ? db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM quiz_rounds WHERE completed_at >= datetime('now', '-1 day') AND user_id IN (${placeholders})`).get(...studentIds).count : 0;

    res.json({
      totalStudents, totalRounds,
      avgScore: avgScore ? Math.round(avgScore * 10) / 10 : 0,
      quizLength: QUIZ_LENGTH, totalRewards, activeToday,
      cohort: adminCohort,
    });
  } else {
    // Super-admin sees all
    const totalStudents = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('student').count;
    const totalRounds = db.prepare('SELECT COUNT(*) as count FROM quiz_rounds').get().count;
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM quiz_rounds WHERE is_retrain = 0').get().avg;
    const totalRewards = db.prepare('SELECT COUNT(*) as count FROM rewards').get().count;
    const activeToday = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM quiz_rounds
      WHERE completed_at >= datetime('now', '-1 day')
    `).get().count;

    res.json({
      totalStudents, totalRounds,
      avgScore: avgScore ? Math.round(avgScore * 10) / 10 : 0,
      quizLength: QUIZ_LENGTH, totalRewards, activeToday,
    });
  }
});

router.get('/rounds/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid round ID' });

  const round = db.prepare(`
    SELECT qr.id, qr.user_id, qr.topic, qr.score, qr.is_perfect, qr.completed_at, u.name as student_name
    FROM quiz_rounds qr JOIN users u ON u.id = qr.user_id
    WHERE qr.id = ?
  `).get(id);

  if (!round) return res.status(404).json({ error: 'Round not found' });

  const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];

  const answers = db.prepare(`
    SELECT qa.selected, qa.is_correct, qa.answer_order,
      q.question, q.options, q.answer as correct_index
    FROM quiz_answers qa JOIN questions q ON q.id = qa.question_id
    WHERE qa.round_id = ?
  `).all(id);

  res.json({
    round: {
      ...round,
      sectionName: SECTION_NAMES[round.topic],
    },
    answers: answers.map(a => {
      const options = JSON.parse(a.options);
      const order = JSON.parse(a.answer_order);
      return {
        question: a.question,
        options,
        order,
        selected: a.selected,
        correctIndex: a.correct_index,
        isCorrect: a.is_correct,
      };
    }),
  });
});

router.get('/export-csv', (req, res) => {
  const adminCohort = req.user.cohort;
  const cohortFilter = adminCohort ? 'AND u.cohort = ?' : '';
  const params = adminCohort ? [adminCohort] : [];

  const students = db.prepare(`
    SELECT u.name, u.email, u.cohort, u.last_login,
      (SELECT COUNT(*) FROM quiz_rounds WHERE user_id = u.id) as totalRounds,
      (SELECT SUM(is_perfect) FROM quiz_rounds WHERE user_id = u.id) as totalPerfects,
      (SELECT AVG(score) FROM quiz_rounds WHERE user_id = u.id AND is_retrain = 0) as avgScore,
      (SELECT COUNT(*) FROM rewards WHERE user_id = u.id) as rewardCount
    FROM users u WHERE u.role = 'student' ${cohortFilter}
    ORDER BY u.name COLLATE NOCASE ASC
  `).all(...params);

  const header = 'Name,Email,Cohort,Total Rounds,Perfect Rounds,Avg Score,Rewards,Last Active';
  const rows = students.map(s => {
    const name = `"${(s.name || '').replace(/"/g, '""')}"`;
    const email = `"${(s.email || '').replace(/"/g, '""')}"`;
    const cohort = `"${(s.cohort || '').replace(/"/g, '""')}"`;
    const avg = s.avgScore ? Math.round(s.avgScore * 10) / 10 : 0;
    const lastActive = s.last_login ? new Date(s.last_login).toLocaleDateString() : '';
    return `${name},${email},${cohort},${s.totalRounds},${s.totalPerfects || 0},${avg},${s.rewardCount},${lastActive}`;
  });

  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="608thatup-scores.csv"');
  res.send(csv);
});

router.get('/cohorts', (req, res) => {
  const cohorts = db.prepare('SELECT name FROM cohorts ORDER BY name COLLATE NOCASE ASC').all();
  res.json(cohorts.map(c => c.name));
});

router.post('/cohorts', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can manage cohorts' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cohort name required' });

  try {
    db.prepare('INSERT INTO cohorts (name) VALUES (?)').run(name.trim());
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Cohort already exists' });
    throw e;
  }
});

router.delete('/cohorts/:name', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can manage cohorts' });
  db.prepare('DELETE FROM cohorts WHERE name = ?').run(req.params.name);
  res.json({ ok: true });
});

router.post('/set-cohort', (req, res) => {
  const { userId, cohort } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  // Only super-admins (no cohort) can assign cohorts
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can assign cohorts' });

  db.prepare('UPDATE users SET cohort = ? WHERE id = ?').run(cohort || null, userId);
  res.json({ ok: true });
});

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.post('/settings', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can change settings' });
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ ok: true });
});

router.post('/promote', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', userId);
  res.json({ ok: true });
});

export default router;
