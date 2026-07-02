import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import db from '../db.js';

const router = Router();
router.use(requireAuth);

const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];
export const QUIZ_LENGTH = 25;
const RETRAIN_LENGTH = 10;
const MAX_ACTIVE_QUIZZES = 5;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Active quizzes are keyed by a random quizId in the session (rather than a
// single `activeQuiz` slot) so two tabs don't clobber each other's answer key.
// `answered` records the FIRST selection made for each question via /check,
// which locks the answer and neutralizes answer-harvesting: you cannot learn a
// correct answer without committing a guess that /submit will score.
function storeQuiz(req, quiz) {
  if (!req.session.quizzes) req.session.quizzes = {};
  const quizId = crypto.randomBytes(16).toString('hex');
  req.session.quizzes[quizId] = { ...quiz, answered: {} };

  // Bound session growth: keep only the most recent few quizzes (insertion
  // order is preserved for string keys).
  const ids = Object.keys(req.session.quizzes);
  while (ids.length > MAX_ACTIVE_QUIZZES) {
    delete req.session.quizzes[ids.shift()];
  }
  return quizId;
}

function getQuiz(req, quizId) {
  return req.session.quizzes && req.session.quizzes[quizId];
}

router.get('/questions', (req, res) => {
  const topic = parseInt(req.query.topic);
  if (isNaN(topic) || topic < 0 || topic > 3) {
    return res.status(400).json({ error: 'Invalid topic (0-3)' });
  }

  const allQuestions = db.prepare('SELECT * FROM questions WHERE topic = ? AND is_active = 1').all(topic);
  const selected = shuffleArray(allQuestions).slice(0, QUIZ_LENGTH);

  const quizQuestions = selected.map(q => {
    const options = JSON.parse(q.options);
    const indices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(indices);
    const shuffledOptions = shuffledIndices.map(i => options[i]);

    return {
      id: q.id,
      question: q.question,
      options: shuffledOptions,
      answerOrder: shuffledIndices,
    };
  });

  const dbQuestionsForAnswers = quizQuestions.map(q =>
    db.prepare('SELECT answer FROM questions WHERE id = ?').get(q.id)
  );

  // Store correct answers server-side only
  const quizSessionData = quizQuestions.map((q, i) => {
    const correctOriginalIndex = dbQuestionsForAnswers[i].answer;
    const correctShuffledIndex = q.answerOrder.indexOf(correctOriginalIndex);
    return {
      id: q.id,
      answerOrder: q.answerOrder,
      correctShuffledIndex,
    };
  });

  const quizId = storeQuiz(req, { topic, questions: quizSessionData });

  // Check if show_answers debug mode is on
  const showAnswers = db.prepare("SELECT value FROM settings WHERE key = 'show_answers'").get();
  const debugMode = showAnswers && showAnswers.value === '1';

  res.json({
    quizId,
    topic,
    sectionName: SECTION_NAMES[topic],
    questions: quizQuestions.map((q, i) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      ...(debugMode ? { correctAnswer: quizSessionData[i].correctShuffledIndex } : {}),
    })),
  });
});

router.get('/retrain', (req, res) => {
  const topic = parseInt(req.query.topic);
  if (isNaN(topic) || topic < 0 || topic > 3) {
    return res.status(400).json({ error: 'Invalid topic (0-3)' });
  }

  // Get last 10 round IDs for this user+topic
  const recentRounds = db.prepare(`
    SELECT id FROM quiz_rounds WHERE user_id = ? AND topic = ?
    ORDER BY completed_at DESC LIMIT 10
  `).all(req.user.id, topic);

  if (recentRounds.length === 0) {
    return res.json({ empty: true, topic, sectionName: SECTION_NAMES[topic] });
  }

  const roundIds = recentRounds.map(r => r.id);
  const placeholders = roundIds.map(() => '?').join(',');

  // Get wrong answers grouped by question_id with miss count
  // Exclude questions that were answered correctly in a later round
  const wrongAnswers = db.prepare(`
    SELECT qa.question_id, COUNT(*) as missCount
    FROM quiz_answers qa
    JOIN quiz_rounds qr ON qr.id = qa.round_id
    WHERE qr.id IN (${placeholders}) AND qa.is_correct = 0
    AND NOT EXISTS (
      SELECT 1 FROM quiz_answers qa2
      JOIN quiz_rounds qr2 ON qr2.id = qa2.round_id
      WHERE qa2.question_id = qa.question_id
      AND qa2.round_id IN (${placeholders})
      AND qa2.is_correct = 1
      AND qr2.completed_at > qr.completed_at
    )
    GROUP BY qa.question_id
    ORDER BY missCount DESC
  `).all(...roundIds, ...roundIds);

  if (wrongAnswers.length === 0) {
    return res.json({ empty: true, topic, sectionName: SECTION_NAMES[topic] });
  }

  // Build quiz from missed questions
  const missMap = {};
  wrongAnswers.forEach(w => { missMap[w.question_id] = w.missCount; });

  // Cap at RETRAIN_LENGTH — already sorted by missCount desc so worst ones come first
  const questionIds = wrongAnswers.slice(0, RETRAIN_LENGTH).map(w => w.question_id);
  const qPlaceholders = questionIds.map(() => '?').join(',');
  const dbQuestions = db.prepare(`SELECT * FROM questions WHERE id IN (${qPlaceholders}) AND is_active = 1`).all(...questionIds);

  const quizQuestions = dbQuestions.map(q => {
    const options = JSON.parse(q.options);
    const indices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(indices);
    const shuffledOptions = shuffledIndices.map(i => options[i]);

    return {
      id: q.id,
      question: q.question,
      options: shuffledOptions,
      answerOrder: shuffledIndices,
      missCount: missMap[q.id],
    };
  });

  // Store correct answers server-side only
  const retrainSessionData = quizQuestions.map(q => {
    const correctOriginalIndex = dbQuestions.find(d => d.id === q.id).answer;
    const correctShuffledIndex = q.answerOrder.indexOf(correctOriginalIndex);
    return {
      id: q.id,
      answerOrder: q.answerOrder,
      correctShuffledIndex,
    };
  });

  const quizId = storeQuiz(req, { topic, retrain: true, questions: retrainSessionData });

  const showAnswers = db.prepare("SELECT value FROM settings WHERE key = 'show_answers'").get();
  const debugMode = showAnswers && showAnswers.value === '1';

  res.json({
    quizId,
    topic,
    sectionName: SECTION_NAMES[topic],
    retrain: true,
    questions: quizQuestions.map((q, i) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      missCount: q.missCount,
      ...(debugMode ? { correctAnswer: retrainSessionData[i].correctShuffledIndex } : {}),
    })),
  });
});

router.post('/check', rateLimit({ windowMs: 10 * 1000, max: 60 }), (req, res) => {
  const { quizId, questionIndex, selected } = req.body;
  const quiz = getQuiz(req, quizId);

  if (!quiz) return res.status(400).json({ error: 'No active quiz' });
  if (typeof questionIndex !== 'number' || questionIndex < 0 || questionIndex >= quiz.questions.length) {
    return res.status(400).json({ error: 'Invalid question index' });
  }
  if (typeof selected !== 'number') {
    return res.status(400).json({ error: 'Invalid selection' });
  }

  const correct = quiz.questions[questionIndex].correctShuffledIndex;

  // Lock the first selection for this question. Subsequent /check calls return
  // the locked answer's result, so you can't probe for the right answer.
  if (!(questionIndex in quiz.answered)) {
    quiz.answered[questionIndex] = selected;
  }
  const locked = quiz.answered[questionIndex];

  res.json({ correct, isCorrect: locked === correct, selected: locked });
});

router.post('/submit', (req, res) => {
  const { quizId } = req.body;
  const quiz = getQuiz(req, quizId);

  if (!quiz) return res.status(400).json({ error: 'No active quiz' });

  // Scoring uses only the answers locked in server-side via /check, so the
  // client can't submit a different (or perfect) answer set than it committed.
  const numQuestions = quiz.questions.length;
  for (let i = 0; i < numQuestions; i++) {
    if (!(i in quiz.answered)) {
      return res.status(400).json({ error: 'Must answer all questions' });
    }
  }

  const questionIds = quiz.questions.map(q => q.id);
  const dbQuestions = questionIds.map(id =>
    db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
  );

  // Check for questions deleted mid-quiz
  if (dbQuestions.some(q => !q)) {
    delete req.session.quizzes[quizId];
    return res.status(400).json({ error: 'Some questions are no longer available. Please start a new quiz.' });
  }

  let score = 0;
  const results = [];

  for (let i = 0; i < dbQuestions.length; i++) {
    const q = dbQuestions[i];
    const quizQ = quiz.questions[i];
    const selected = quiz.answered[i];
    const correctShuffledIndex = quizQ.correctShuffledIndex;
    const isCorrect = selected === correctShuffledIndex;
    if (isCorrect) score++;

    const options = JSON.parse(q.options);

    results.push({
      questionId: q.id,
      question: q.question,
      options: quizQ.answerOrder.map(idx => options[idx]),
      selected,
      correctAnswer: correctShuffledIndex,
      isCorrect,
    });
  }

  const total = dbQuestions.length;
  const isPerfect = score === total;
  const isRetrain = !!quiz.retrain;

  let perfectCount = 0;
  const newRewards = [];

  // Always record the round and answers
  const roundResult = db.prepare(`
    INSERT INTO quiz_rounds (user_id, topic, score, is_perfect, is_retrain)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, quiz.topic, score, isRetrain ? 0 : (isPerfect ? 1 : 0), isRetrain ? 1 : 0);

  const roundId = roundResult.lastInsertRowid;

  const insertAnswer = db.prepare(`
    INSERT INTO quiz_answers (round_id, question_id, selected, is_correct, answer_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    insertAnswer.run(
      roundId,
      r.questionId,
      r.selected,
      r.isCorrect ? 1 : 0,
      JSON.stringify(quiz.questions[i].answerOrder)
    );
  }

  if (!isRetrain) {
    // Only check rewards for normal quizzes
    perfectCount = db.prepare(`
      SELECT COUNT(*) as count FROM quiz_rounds
      WHERE user_id = ? AND topic = ? AND is_perfect = 1 AND is_retrain = 0
    `).get(req.user.id, quiz.topic).count;

    const REWARD_TYPES = [
      'donut', 'cookie', 'lollipop', 'cupcake', 'cake',
      'chocolate_bar', 'honey_pot', 'bubbly', 'present', 'balloon',
      'party_popper', 'trophy', 'gold_medal', 'gem', 'ring',
      'gold_coin', 'bank', 'rocket', 'star', 'crown',
    ];

    // Each perfect round earns the next reward (1st perfect = donut, 2nd = cookie, etc.)
    for (let i = 0; i < Math.min(perfectCount, REWARD_TYPES.length); i++) {
      const type = REWARD_TYPES[i];
      const existing = db.prepare(`
        SELECT id FROM rewards WHERE user_id = ? AND topic = ? AND reward_type = ?
      `).get(req.user.id, quiz.topic, type);

      if (!existing) {
        db.prepare(`
          INSERT INTO rewards (user_id, topic, reward_type) VALUES (?, ?, ?)
        `).run(req.user.id, quiz.topic, type);
        newRewards.push(type);
      }
    }
  }

  delete req.session.quizzes[quizId];

  res.json({
    score,
    total,
    isPerfect,
    perfectCount,
    retrain: isRetrain,
    results,
    newRewards,
  });
});

const CLASSROOM_LENGTH = 25;

router.get('/classroom', (req, res) => {
  const topic = parseInt(req.query.topic);
  if (isNaN(topic) || topic < 0 || topic > 3) {
    return res.status(400).json({ error: 'Invalid topic (0-3)' });
  }

  const allQuestions = db.prepare('SELECT * FROM questions WHERE topic = ? AND is_active = 1').all(topic);
  const count = Math.min(CLASSROOM_LENGTH, allQuestions.length);
  const selected = shuffleArray(allQuestions).slice(0, count);

  const quizQuestions = selected.map(q => {
    const options = JSON.parse(q.options);
    const indices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(indices);
    const shuffledOptions = shuffledIndices.map(i => options[i]);
    return {
      id: q.id,
      question: q.question,
      options: shuffledOptions,
      answerOrder: shuffledIndices,
    };
  });

  const quizSessionData = quizQuestions.map(q => {
    const dbQ = db.prepare('SELECT answer FROM questions WHERE id = ?').get(q.id);
    const correctShuffledIndex = q.answerOrder.indexOf(dbQ.answer);
    return {
      id: q.id,
      answerOrder: q.answerOrder,
      correctShuffledIndex,
    };
  });

  const quizId = storeQuiz(req, { topic, classroom: true, questions: quizSessionData });

  res.json({
    quizId,
    topic,
    sectionName: SECTION_NAMES[topic],
    questions: quizQuestions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
    })),
  });
});

export default router;
