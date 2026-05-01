import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'parsedEPA608.json');

const questions = JSON.parse(readFileSync(dataPath, 'utf-8'));

const insert = db.prepare(`
  INSERT OR REPLACE INTO questions (id, question, options, answer, topic, section_name)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((items) => {
  for (const q of items) {
    insert.run(q.id, q.question, JSON.stringify(q.options), q.answer, q.topic, q.sectionName);
  }
});

insertMany(questions);
console.log(`Seeded ${questions.length} questions into database.`);
