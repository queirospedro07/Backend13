import { Router, Response } from 'express';
import { queryAll, execute } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notifications = queryAll<any>(
      'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50',
      [userId]
    );

    return res.json(notifications.map(n => ({ ...n, isRead: n.isRead === 1 })));
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter notificações' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    execute('UPDATE notifications SET isRead = 1 WHERE userId = ?', [userId]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao atualizar notificações' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    execute('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [id, userId]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao marcar notificação como lida' });
  }
});

export default router;
