import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import db from '../db.js';

const router = Router();
router.use(requireAuth);

const SECTION_NAMES = ['Core', 'Type I', 'Type II', 'Type III'];
export const QUIZ_LENGTH = 5;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.get('/questions', (req, res) => {
  const topic = parseInt(req.query.topic);
  if (isNaN(topic) || topic < 0 || topic > 3) {
    return res.status(400).json({ error: 'Invalid topic (0-3)' });
  }

  const allQuestions = db.prepare('SELECT * FROM questions WHERE topic = ?').all(topic);
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

  req.session.activeQuiz = { topic, questions: quizSessionData };

  // Check if show_answers debug mode is on
  const showAnswers = db.prepare("SELECT value FROM settings WHERE key = 'show_answers'").get();
  const debugMode = showAnswers && showAnswers.value === '1';

  res.json({
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

  const questionIds = wrongAnswers.map(w => w.question_id);
  const qPlaceholders = questionIds.map(() => '?').join(',');
  const dbQuestions = db.prepare(`SELECT * FROM questions WHERE id IN (${qPlaceholders})`).all(...questionIds);

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

  req.session.activeQuiz = { topic, retrain: true, questions: retrainSessionData };

  const showAnswers = db.prepare("SELECT value FROM settings WHERE key = 'show_answers'").get();
  const debugMode = showAnswers && showAnswers.value === '1';

  res.json({
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

router.post('/check', (req, res) => {
  const { questionIndex, selected } = req.body;
  const activeQuiz = req.session.activeQuiz;

  if (!activeQuiz) return res.status(400).json({ error: 'No active quiz' });
  if (typeof questionIndex !== 'number' || questionIndex < 0 || questionIndex >= activeQuiz.questions.length) {
    return res.status(400).json({ error: 'Invalid question index' });
  }
  if (typeof selected !== 'number') {
    return res.status(400).json({ error: 'Invalid selection' });
  }

  const correct = activeQuiz.questions[questionIndex].correctShuffledIndex;
  res.json({ correct, isCorrect: selected === correct });
});

router.post('/submit', (req, res) => {
  const { answers } = req.body;
  const activeQuiz = req.session.activeQuiz;

  if (!activeQuiz) return res.status(400).json({ error: 'No active quiz' });
  if (!answers || !Array.isArray(answers) || answers.length !== activeQuiz.questions.length) {
    return res.status(400).json({ error: 'Must answer all questions' });
  }

  const questionIds = activeQuiz.questions.map(q => q.id);
  const dbQuestions = questionIds.map(id =>
    db.prepare('SELECT * FROM questions WHERE id = ?').get(id)
  );

  // Check for questions deleted mid-quiz
  if (dbQuestions.some(q => !q)) {
    delete req.session.activeQuiz;
    return res.status(400).json({ error: 'Some questions are no longer available. Please start a new quiz.' });
  }

  let score = 0;
  const results = [];

  for (let i = 0; i < dbQuestions.length; i++) {
    const q = dbQuestions[i];
    const quizQ = activeQuiz.questions[i];
    const selected = answers[i];
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
  const isRetrain = !!activeQuiz.retrain;

  let perfectCount = 0;
  const newRewards = [];

  // Always record the round and answers
  const roundResult = db.prepare(`
    INSERT INTO quiz_rounds (user_id, topic, score, is_perfect, is_retrain)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, activeQuiz.topic, score, isRetrain ? 0 : (isPerfect ? 1 : 0), isRetrain ? 1 : 0);

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
      JSON.stringify(activeQuiz.questions[i].answerOrder)
    );
  }

  if (!isRetrain) {
    // Only check rewards for normal quizzes
    perfectCount = db.prepare(`
      SELECT COUNT(*) as count FROM quiz_rounds
      WHERE user_id = ? AND topic = ? AND is_perfect = 1 AND is_retrain = 0
    `).get(req.user.id, activeQuiz.topic).count;

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
      `).get(req.user.id, activeQuiz.topic, type);

      if (!existing) {
        db.prepare(`
          INSERT INTO rewards (user_id, topic, reward_type) VALUES (?, ?, ?)
        `).run(req.user.id, activeQuiz.topic, type);
        newRewards.push(type);
      }
    }
  }

  delete req.session.activeQuiz;

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

  const allQuestions = db.prepare('SELECT * FROM questions WHERE topic = ?').all(topic);
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

  req.session.activeQuiz = { topic, classroom: true, questions: quizSessionData };

  res.json({
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
