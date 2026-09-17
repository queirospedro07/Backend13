import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/quizzes/lesson/:lessonId
router.get('/lesson/:lessonId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { lessonId } = req.params;

    const quiz = queryOne<any>(
      'SELECT * FROM quizzes WHERE lessonId = ?',
      [lessonId]
    );

    if (!quiz) {
      return res.status(404).json({ error: 'Nenhum questionário associado a esta lição' });
    }

    const questions = queryAll<any>(
      'SELECT id, quizId, question, options, explanation, orderIndex FROM quiz_questions WHERE quizId = ? ORDER BY orderIndex ASC',
      [quiz.id]
    );

    const formattedQuestions = questions.map(q => {
      const optionsArray: string[] = JSON.parse(q.options || '[]');
      return {
        id: q.id,
        quizId: q.quizId,
        question: q.question,
        options: optionsArray.map((opt, idx) => ({ id: `opt-${idx}`, text: opt })),
        explanation: q.explanation,
        orderIndex: q.orderIndex,
      };
    });

    const attempts = queryAll<any>(
      'SELECT * FROM quiz_attempts WHERE quizId = ? AND userId = ? ORDER BY attemptedAt DESC LIMIT 3',
      [quiz.id, req.user!.id]
    );

    return res.json({
      ...quiz,
      questions: formattedQuestions,
      attempts,
    });
  } catch (err) {
    console.error('Quiz fetch error:', err);
    return res.status(500).json({ error: 'Falha ao obter questionário' });
  }
});

// POST /api/quizzes/:quizId/submit
router.post('/:quizId/submit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const { answers } = req.body; // Map of { [questionId: string]: string (optionId: "opt-0") }
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const quiz = queryOne<any>('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Questionário não encontrado' });
    }

    const questions = queryAll<any>(
      'SELECT * FROM quiz_questions WHERE quizId = ? ORDER BY orderIndex ASC',
      [quiz.id]
    );

    let correctCount = 0;
    const results = [];

    for (const q of questions) {
      const selectedOptionId = answers[q.id];
      const correctOptionId = `opt-${q.correctOptionIndex}`;
      const isCorrect = selectedOptionId === correctOptionId;

      if (isCorrect) correctCount++;

      results.push({
        questionId: q.id,
        question: q.question,
        explanation: q.explanation,
        selectedOptionId,
        correctOptionId,
        isCorrect,
      });
    }

    const totalQuestions = questions.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
    const passed = score >= quiz.passingScore;
    const xpEarned = passed ? quiz.xpReward : 10;

    transaction(() => {
      execute(
        `INSERT INTO quiz_attempts (id, quizId, userId, score, passed, attemptedAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [`att-${Date.now()}`, quiz.id, userId, score, passed ? 1 : 0, now]
      );

      execute('UPDATE users SET xp = xp + ? WHERE id = ?', [xpEarned, userId]);

      execute(
        `INSERT INTO xp_transactions (id, userId, amount, action, description, createdAt) VALUES (?, ?, ?, 'quiz_complete', ?, ?)`,
        [`xp-${Date.now()}`, userId, xpEarned, `Questionário: ${quiz.title} (${score}%)`, now]
      );
    });

    return res.json({
      score,
      passed,
      xpEarned,
      results,
    });
  } catch (err) {
    console.error('Quiz submit error:', err);
    return res.status(500).json({ error: 'Falha ao submeter respostas do questionário' });
  }
});

export default router;
