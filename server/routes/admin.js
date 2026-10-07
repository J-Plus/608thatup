import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import db from '../db.js';
import { QUIZ_LENGTH } from './quiz.js';

const router = Router();
router.use(requireAdmin);

// Quote a CSV field and neutralize spreadsheet formula injection: a value
// beginning with = + - @ (or a control char) is prefixed with a single quote
// so Excel/Sheets treats it as text, not a live formula.
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/students', (req, res) => {
  const adminCohort = req.user.cohort;
  const cohortFilter = adminCohort ? 'AND u.cohort = ?' : '';
  const params = adminCohort ? [adminCohort] : [];

  const students = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.last_login, u.cohort, u.archived,
      (SELECT COUNT(*) FROM quiz_rounds WHERE user_id = u.id) as totalRounds,
      (SELECT SUM(is_perfect) FROM quiz_rounds WHERE user_id = u.id) as totalPerfects,
      (SELECT AVG(score) FROM quiz_rounds WHERE user_id = u.id AND is_retrain = 0) as avgScore,
      (SELECT COUNT(*) FROM rewards WHERE user_id = u.id) as rewardCount,
      (SELECT MAX(completed_at) FROM quiz_rounds WHERE user_id = u.id) as lastTestDate
    FROM users u WHERE u.role = 'student' ${cohortFilter}
    ORDER BY u.name COLLATE NOCASE ASC
  `).all(...params);

  res.json(students.map(s => ({
    ...s,
    avgScore: s.avgScore ? Math.round(s.avgScore * 10) / 10 : 0,
    totalPerfects: s.totalPerfects || 0,
    archived: !!s.archived,
  })));
});

router.get('/students/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid student ID' });

  const student = db.prepare('SELECT id, name, email, avatar_url, created_at, last_login, cohort, role, archived FROM users WHERE id = ?')
    .get(id);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  // Cohort-scoped admins may only view students in their own cohort.
  if (req.user.cohort && student.cohort !== req.user.cohort) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];

  const sections = [0, 1, 2, 3].map(topic => {
    const stats = db.prepare(`
      SELECT COUNT(*) as rounds, SUM(is_perfect) as perfects, AVG(score) as avgScore
      FROM quiz_rounds WHERE user_id = ? AND topic = ?
    `).get(student.id, topic);

    const rewards = db.prepare(`
      SELECT reward_type FROM rewards WHERE user_id = ? AND topic = ?
    `).all(student.id, topic).map(r => r.reward_type);

    const allRounds = db.prepare(`
      SELECT id, score, is_perfect, is_retrain, completed_at,
        (SELECT COUNT(*) FROM quiz_answers WHERE round_id = quiz_rounds.id) as total
      FROM quiz_rounds
      WHERE user_id = ? AND topic = ? ORDER BY completed_at DESC
    `).all(student.id, topic);

    return {
      topic,
      sectionName: SECTION_NAMES[topic],
      rounds: stats.rounds,
      perfects: stats.perfects || 0,
      avgScore: stats.avgScore ? Math.round(stats.avgScore * 10) / 10 : 0,
      rewards,
      recentRounds: allRounds.slice(0, 10),
      allRounds,
    };
  });

  const SECTION_MAP = ['Core', 'Type I', 'Type II', 'Type III'];

  // Questions the student has ever missed. Still-wrong sorted newest-miss first;
  // corrected (latest answer was right) pushed to the bottom.
  const wrongQuestions = db.prepare(`
    WITH user_answers AS (
      SELECT qa.id as qa_id, qa.question_id, qa.is_correct, qr.completed_at
      FROM quiz_answers qa
      JOIN quiz_rounds qr ON qr.id = qa.round_id
      WHERE qr.user_id = ?
    )
    SELECT q.id, q.question, q.topic, q.options, q.answer as correctIndex,
      (SELECT COUNT(*) FROM user_answers WHERE question_id = q.id AND is_correct = 0) as missCount,
      (SELECT is_correct FROM user_answers WHERE question_id = q.id
         ORDER BY completed_at DESC, qa_id DESC LIMIT 1) as latestCorrect,
      (SELECT completed_at FROM user_answers WHERE question_id = q.id
         ORDER BY completed_at DESC, qa_id DESC LIMIT 1) as latestAt
    FROM questions q
    WHERE q.id IN (SELECT question_id FROM user_answers WHERE is_correct = 0)
    ORDER BY latestCorrect ASC, latestAt DESC
  `).all(student.id).map(q => ({
    ...q,
    options: JSON.parse(q.options),
    sectionName: SECTION_MAP[q.topic] || 'Unknown',
    corrected: !!q.latestCorrect,
  }));

  res.json({
    student: { ...student, archived: !!student.archived },
    sections, quizLength: QUIZ_LENGTH, wrongQuestions,
  });
});

router.get('/overview', (req, res) => {
  const adminCohort = req.user.cohort;

  // Stats cover active (non-archived) students only, optionally scoped to the
  // admin's cohort.
  const studentIds = db.prepare(`
    SELECT id FROM users
    WHERE role = 'student' AND archived = 0 ${adminCohort ? 'AND cohort = ?' : ''}
  `).all(...(adminCohort ? [adminCohort] : [])).map(s => s.id);

  const totalStudents = studentIds.length;
  let totalRounds = 0, avgScore = null, totalRewards = 0, activeToday = 0;

  if (studentIds.length > 0) {
    const placeholders = studentIds.map(() => '?').join(',');
    totalRounds = db.prepare(`SELECT COUNT(*) as count FROM quiz_rounds WHERE user_id IN (${placeholders})`).get(...studentIds).count;
    avgScore = db.prepare(`SELECT AVG(score) as avg FROM quiz_rounds WHERE is_retrain = 0 AND user_id IN (${placeholders})`).get(...studentIds).avg;
    totalRewards = db.prepare(`SELECT COUNT(*) as count FROM rewards WHERE user_id IN (${placeholders})`).get(...studentIds).count;
    activeToday = db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM quiz_rounds WHERE completed_at >= datetime('now', '-1 day') AND user_id IN (${placeholders})`).get(...studentIds).count;
  }

  res.json({
    totalStudents, totalRounds,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : 0,
    quizLength: QUIZ_LENGTH, totalRewards, activeToday,
    ...(adminCohort ? { cohort: adminCohort } : {}),
  });
});

router.get('/rounds/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid round ID' });

  const round = db.prepare(`
    SELECT qr.id, qr.user_id, qr.topic, qr.score, qr.is_perfect, qr.completed_at,
      u.name as student_name, u.cohort as student_cohort
    FROM quiz_rounds qr JOIN users u ON u.id = qr.user_id
    WHERE qr.id = ?
  `).get(id);

  if (!round) return res.status(404).json({ error: 'Round not found' });

  // Cohort-scoped admins may only view rounds belonging to their own cohort.
  if (req.user.cohort && round.student_cohort !== req.user.cohort) {
    return res.status(404).json({ error: 'Round not found' });
  }

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
  const archivedFilter = req.query.archived === '1' ? '' : 'AND u.archived = 0';
  const params = adminCohort ? [adminCohort] : [];

  const students = db.prepare(`
    SELECT u.name, u.email, u.cohort, u.last_login, u.archived,
      (SELECT COUNT(*) FROM quiz_rounds WHERE user_id = u.id) as totalRounds,
      (SELECT SUM(is_perfect) FROM quiz_rounds WHERE user_id = u.id) as totalPerfects,
      (SELECT AVG(score) FROM quiz_rounds WHERE user_id = u.id AND is_retrain = 0) as avgScore,
      (SELECT COUNT(*) FROM rewards WHERE user_id = u.id) as rewardCount
    FROM users u WHERE u.role = 'student' ${cohortFilter} ${archivedFilter}
    ORDER BY u.name COLLATE NOCASE ASC
  `).all(...params);

  const header = 'Name,Email,Cohort,Total Rounds,Perfect Rounds,Avg Score,Rewards,Last Active,Archived';
  const rows = students.map(s => {
    const name = csvCell(s.name || '');
    const email = csvCell(s.email || '');
    const cohort = csvCell(s.cohort || '');
    const avg = s.avgScore ? Math.round(s.avgScore * 10) / 10 : 0;
    const lastActive = csvCell(s.last_login ? new Date(s.last_login).toLocaleDateString() : '');
    return `${name},${email},${cohort},${s.totalRounds},${s.totalPerfects || 0},${avg},${s.rewardCount},${lastActive},${s.archived ? 'Yes' : 'No'}`;
  });

  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="608thatup-scores.csv"');
  res.send(csv);
});

router.get('/cohorts', (req, res) => {
  // Active cohorts only: this feeds the cohort-assignment dropdowns.
  const cohorts = db.prepare('SELECT name FROM cohorts WHERE archived = 0 ORDER BY name COLLATE NOCASE ASC').all();
  res.json(cohorts.map(c => c.name));
});

// Full cohort list for the Manage Cohorts panel, including archived ones and
// legacy cohort tags that exist on students but not in the cohorts table.
router.get('/cohorts/manage', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can manage cohorts' });
  const rows = db.prepare(`
    WITH names AS (
      SELECT name FROM cohorts
      UNION
      SELECT DISTINCT cohort FROM users WHERE cohort IS NOT NULL AND cohort != '' AND role = 'student'
    )
    SELECT n.name,
      COALESCE(c.archived, 0) as archived,
      (SELECT COUNT(*) FROM users u WHERE u.cohort = n.name AND u.role = 'student') as studentCount
    FROM names n LEFT JOIN cohorts c ON c.name = n.name
    ORDER BY n.name COLLATE NOCASE ASC
  `).all();
  res.json(rows.map(r => ({ ...r, archived: !!r.archived })));
});

// Archive or unarchive a cohort AND every student tagged with it, atomically.
router.post('/cohorts/:name/archive', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can manage cohorts' });
  const name = req.params.name;
  const archived = req.body.archived === false ? 0 : 1;

  const result = db.transaction(() => {
    db.prepare(`
      INSERT INTO cohorts (name, archived) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET archived = excluded.archived
    `).run(name, archived);
    return db.prepare(`UPDATE users SET archived = ? WHERE cohort = ? AND role = 'student'`).run(archived, name);
  })();

  res.json({ ok: true, studentsUpdated: result.changes });
});

// Archive or unarchive a single student.
router.post('/students/:id/archive', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can archive students' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid student ID' });
  const archived = req.body.archived === false ? 0 : 1;

  const result = db.prepare(`UPDATE users SET archived = ? WHERE id = ? AND role = 'student'`).run(archived, id);
  if (result.changes === 0) return res.status(404).json({ error: 'Student not found' });
  res.json({ ok: true });
});

// Permanently delete a student and all their quiz history. For test and junk
// accounts; real students should be archived instead. Rows are removed
// child-first because foreign keys are enforced without ON DELETE CASCADE.
router.delete('/students/:id', (req, res) => {
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can delete students' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid student ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Student not found' });
  if (user.role !== 'student') return res.status(400).json({ error: 'Only student accounts can be deleted' });

  const counts = db.transaction(() => {
    const answers = db.prepare(`
      DELETE FROM quiz_answers WHERE round_id IN (SELECT id FROM quiz_rounds WHERE user_id = ?)
    `).run(id).changes;
    const rounds = db.prepare('DELETE FROM quiz_rounds WHERE user_id = ?').run(id).changes;
    const rewards = db.prepare('DELETE FROM rewards WHERE user_id = ?').run(id).changes;
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { answers, rounds, rewards };
  })();

  res.json({ ok: true, deleted: counts });
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
  // Promotion grants an unrestricted (super-)admin role, so only super-admins
  // may do it. Cohort-scoped admins must not be able to mint new admins.
  if (req.user.cohort) return res.status(403).json({ error: 'Only super-admins can promote users' });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', userId);
  res.json({ ok: true });
});

export default router;
