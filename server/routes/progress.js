import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import db from '../db.js';
import { QUIZ_LENGTH } from './quiz.js';

const router = Router();
router.use(requireAuth);

const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];

router.get('/summary', (req, res) => {
  const sections = [0, 1, 2, 3].map(topic => {
    const stats = db.prepare(`
      SELECT COUNT(*) as rounds, SUM(is_perfect) as perfects, AVG(score) as avgScore
      FROM quiz_rounds WHERE user_id = ? AND topic = ?
    `).get(req.user.id, topic);

    const lastRound = db.prepare(`
      SELECT score, completed_at FROM quiz_rounds
      WHERE user_id = ? AND topic = ?
      ORDER BY completed_at DESC LIMIT 1
    `).get(req.user.id, topic);

    const rewards = db.prepare(`
      SELECT reward_type FROM rewards WHERE user_id = ? AND topic = ?
    `).all(req.user.id, topic).map(r => r.reward_type);

    const questionCount = db.prepare(`
      SELECT COUNT(*) as count FROM questions WHERE topic = ? AND is_active = 1
    `).get(topic).count;

    // Count wrong answers from last 10 rounds for retrain button visibility
    let wrongCount = 0;
    const recentRounds = db.prepare(`
      SELECT id FROM quiz_rounds WHERE user_id = ? AND topic = ?
      ORDER BY completed_at DESC LIMIT 10
    `).all(req.user.id, topic);

    if (recentRounds.length > 0) {
      const roundIds = recentRounds.map(r => r.id);
      const placeholders = roundIds.map(() => '?').join(',');
      // Only count questions whose most recent answer was wrong
      wrongCount = db.prepare(`
        SELECT COUNT(*) as count FROM (
          SELECT qa.question_id
          FROM quiz_answers qa
          JOIN quiz_rounds qr ON qr.id = qa.round_id
          WHERE qa.round_id IN (${placeholders})
          AND qa.is_correct = 0
          AND NOT EXISTS (
            SELECT 1 FROM quiz_answers qa2
            JOIN quiz_rounds qr2 ON qr2.id = qa2.round_id
            WHERE qa2.question_id = qa.question_id
            AND qa2.round_id IN (${placeholders})
            AND qa2.is_correct = 1
            AND qr2.completed_at > qr.completed_at
          )
          GROUP BY qa.question_id
        )
      `).get(...roundIds, ...roundIds).count;
    }

    return {
      topic,
      sectionName: SECTION_NAMES[topic],
      questionCount,
      quizLength: QUIZ_LENGTH,
      rounds: stats.rounds,
      perfects: stats.perfects || 0,
      avgScore: stats.avgScore ? Math.round(stats.avgScore * 10) / 10 : 0,
      rewards,
      wrongCount,
      lastScore: lastRound ? lastRound.score : null,
      lastDate: lastRound ? lastRound.completed_at : null,
    };
  });

  res.json(sections);
});

router.get('/history', (req, res) => {
  const topic = parseInt(req.query.topic);
  if (isNaN(topic) || topic < 0 || topic > 3) {
    return res.status(400).json({ error: 'Invalid topic' });
  }

  const rounds = db.prepare(`
    SELECT id, score, is_perfect, is_retrain, completed_at
    FROM quiz_rounds WHERE user_id = ? AND topic = ?
    ORDER BY completed_at DESC
  `).all(req.user.id, topic);

  res.json(rounds);
});

router.get('/rewards', (req, res) => {
  const rewards = db.prepare(`
    SELECT topic, reward_type, unlocked_at FROM rewards WHERE user_id = ?
    ORDER BY unlocked_at DESC
  `).all(req.user.id);

  res.json(rewards);
});

export default router;
