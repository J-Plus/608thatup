import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'parsedEPA608.json');

const questions = JSON.parse(readFileSync(dataPath, 'utf-8'));

const insert = db.prepare(`
  INSERT OR REPLACE INTO questions (id, question, options, answer, topic, section_name, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);

const insertMany = db.transaction((items) => {
  for (const q of items) {
    insert.run(q.id, q.question, JSON.stringify(q.options), q.answer, q.topic, q.sectionName);
  }
});

insertMany(questions);

// Soft-delete: questions in the DB but no longer in the JSON get marked inactive
// (we don't hard-delete because quiz_answers FK-references question_id, so removing
// would break historical round reviews). Inactive questions are filtered out of new
// quizzes but stay readable for past-round drill-in.
const jsonIds = new Set(questions.map(q => q.id));
const dbIds = db.prepare('SELECT id FROM questions').all().map(r => r.id);
const orphans = dbIds.filter(id => !jsonIds.has(id));
if (orphans.length > 0) {
  const placeholders = orphans.map(() => '?').join(',');
  db.prepare(`UPDATE questions SET is_active = 0 WHERE id IN (${placeholders})`).run(...orphans);
}

console.log(`Seeded ${questions.length} active questions; deactivated ${orphans.length} orphan(s).`);
