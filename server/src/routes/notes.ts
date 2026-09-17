import { Router, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/notes/:lessonId
router.get('/:lessonId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user!.id;

    const note = queryOne<any>(
      'SELECT * FROM notes WHERE userId = ? AND lessonId = ?',
      [userId, lessonId]
    );

    return res.json(note || { content: '' });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter anotação' });
  }
});

// POST /api/notes/:lessonId
router.post('/:lessonId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { lessonId } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const existing = queryOne<any>(
      'SELECT id FROM notes WHERE userId = ? AND lessonId = ?',
      [userId, lessonId]
    );

    if (existing) {
      execute('UPDATE notes SET content = ?, updatedAt = ? WHERE id = ?', [content || '', now, existing.id]);
    } else {
      execute(
        'INSERT INTO notes (id, userId, lessonId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [`note-${Date.now()}`, userId, lessonId, content || '', now, now]
      );
    }

    const note = queryOne<any>('SELECT * FROM notes WHERE userId = ? AND lessonId = ?', [userId, lessonId]);
    return res.json(note);
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao guardar anotação' });
  }
});

// GET /api/notes (All user notes)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notes = queryAll<any>(
      `SELECT n.*, l.title as lesson_title, m.title as module_title, c.title as course_title, c.id as course_id
       FROM notes n
       JOIN lessons l ON n.lessonId = l.id
       JOIN course_modules m ON l.moduleId = m.id
       JOIN courses c ON m.courseId = c.id
       WHERE n.userId = ?
       ORDER BY n.updatedAt DESC`,
      [userId]
    );

    return res.json(
      notes.map(n => ({
        id: n.id,
        content: n.content,
        updatedAt: n.updatedAt,
        lesson: {
          id: n.lessonId,
          title: n.lesson_title,
          module: {
            title: n.module_title,
            course: { id: n.course_id, title: n.course_title },
          },
        },
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter anotações' });
  }
});

export default router;
