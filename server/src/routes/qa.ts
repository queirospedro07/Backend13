import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/qa/course/:courseId
router.get('/course/:courseId', async (req, res: Response) => {
  try {
    const { courseId } = req.params;

    const questions = queryAll<any>(
      `SELECT q.*, u.id as user_id, u.name as user_name, u.username as user_username, u.avatarUrl as user_avatarUrl, u.role as user_role,
              (SELECT COUNT(*) FROM qa_answers WHERE questionId = q.id) as answersCount
       FROM qa_questions q
       JOIN users u ON q.userId = u.id
       WHERE q.courseId = ?
       ORDER BY q.createdAt DESC`,
      [courseId]
    );

    const formatted = questions.map(q => {
      const answers = queryAll<any>(
        `SELECT a.*, u.id as user_id, u.name as user_name, u.username as user_username, u.avatarUrl as user_avatarUrl, u.role as user_role
         FROM qa_answers a
         JOIN users u ON a.userId = u.id
         WHERE a.questionId = ?
         ORDER BY a.isAccepted DESC, a.createdAt ASC`,
        [q.id]
      );

      return {
        id: q.id,
        courseId: q.courseId,
        title: q.title,
        content: q.body,
        isAnswered: q.isAnswered === 1,
        createdAt: q.createdAt,
        author: {
          id: q.user_id,
          name: q.user_name,
          username: q.user_username,
          avatarUrl: q.user_avatarUrl,
          role: q.user_role,
        },
        answers: answers.map(a => ({
          id: a.id,
          questionId: a.questionId,
          content: a.body,
          isAccepted: a.isAccepted === 1,
          createdAt: a.createdAt,
          author: {
            id: a.user_id,
            name: a.user_name,
            username: a.user_username,
            avatarUrl: a.user_avatarUrl,
            role: a.user_role,
          },
        })),
        _count: { answers: q.answersCount },
      };
    });

    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter perguntas' });
  }
});

// POST /api/qa/course/:courseId
router.post('/course/:courseId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const { title, content } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    if (!title || !content) {
      return res.status(400).json({ error: 'Título e detalhes são obrigatórios' });
    }

    const qId = `qa-q-${Date.now()}`;
    execute(
      `INSERT INTO qa_questions (id, courseId, userId, title, body, isAnswered, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [qId, courseId, userId, title, content, now]
    );

    const user = queryOne<any>('SELECT id, name, username, avatarUrl, role FROM users WHERE id = ?', [userId]);

    return res.status(201).json({
      id: qId,
      courseId,
      title,
      content,
      isAnswered: false,
      createdAt: now,
      author: user,
      answers: [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao publicar pergunta' });
  }
});

// POST /api/qa/questions/:questionId/answers
router.post('/questions/:questionId/answers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'A resposta não pode estar vazia' });
    }

    const aId = `qa-a-${Date.now()}`;
    transaction(() => {
      execute(
        `INSERT INTO qa_answers (id, questionId, userId, body, isAccepted, createdAt) VALUES (?, ?, ?, ?, 0, ?)`,
        [aId, questionId, userId, content.trim(), now]
      );

      execute('UPDATE qa_questions SET isAnswered = 1 WHERE id = ?', [questionId]);
      execute('UPDATE users SET xp = xp + 15 WHERE id = ?', [userId]);
    });

    const user = queryOne<any>('SELECT id, name, username, avatarUrl, role FROM users WHERE id = ?', [userId]);

    return res.status(201).json({
      id: aId,
      questionId,
      content: content.trim(),
      isAccepted: false,
      createdAt: now,
      author: user,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao publicar resposta' });
  }
});

export default router;
