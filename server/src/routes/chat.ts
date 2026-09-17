import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/channels/:channelId/messages
router.get('/channels/:channelId/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { channelId } = req.params;

    const messages = queryAll<any>(
      `SELECT m.*,
              u.id as user_id, u.name as user_name, u.username as user_username, u.avatarUrl as user_avatarUrl, u.role as user_role
       FROM messages m
       JOIN users u ON m.userId = u.id
       WHERE m.channelId = ?
       ORDER BY m.createdAt ASC
       LIMIT 100`,
      [channelId]
    );

    const formatted = messages.map(m => {
      const reactions = queryAll<any>(
        `SELECT r.*, u.username FROM reactions r JOIN users u ON r.userId = u.id WHERE r.messageId = ?`,
        [m.id]
      );

      let replyTo = null;
      if (m.parentId) {
        const parent = queryOne<any>(
          `SELECT m.id, m.content, u.username FROM messages m JOIN users u ON m.userId = u.id WHERE m.id = ?`,
          [m.parentId]
        );
        if (parent) {
          replyTo = { id: parent.id, content: parent.content, sender: { username: parent.username } };
        }
      }

      return {
        id: m.id,
        channelId: m.channelId,
        senderId: m.userId,
        content: m.content,
        parentId: m.parentId,
        attachments: m.attachments ? JSON.parse(m.attachments) : [],
        isPinned: m.isPinned === 1,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        sender: {
          id: m.user_id,
          name: m.user_name,
          username: m.user_username,
          avatarUrl: m.user_avatarUrl,
          role: m.user_role,
        },
        reactions,
        replyTo,
      };
    });

    return res.json(formatted);
  } catch (err) {
    console.error('Messages error:', err);
    return res.status(500).json({ error: 'Falha ao obter mensagens' });
  }
});

// POST /api/channels/:channelId/messages
router.post('/channels/:channelId/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { content, replyToId, attachments } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'O conteúdo da mensagem não pode estar vazio' });
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const attachStr = attachments ? JSON.stringify(attachments) : null;

    execute(
      `INSERT INTO messages (id, channelId, userId, content, parentId, attachments, isPinned, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [messageId, channelId, userId, content.trim(), replyToId || null, attachStr, now, now]
    );

    const user = queryOne<any>('SELECT id, name, username, avatarUrl, role FROM users WHERE id = ?', [userId]);

    return res.status(201).json({
      id: messageId,
      channelId,
      senderId: userId,
      content: content.trim(),
      parentId: replyToId || null,
      attachments: attachments || [],
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      sender: user,
      reactions: [],
    });
  } catch (err) {
    console.error('Post message error:', err);
    return res.status(500).json({ error: 'Falha ao enviar mensagem' });
  }
});

// POST /api/messages/:messageId/reactions
router.post('/messages/:messageId/reactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.id;

    if (!emoji) {
      return res.status(400).json({ error: 'O emoji é obrigatório' });
    }

    const existing = queryOne<any>(
      'SELECT id FROM reactions WHERE messageId = ? AND userId = ? AND emoji = ?',
      [messageId, userId, emoji]
    );

    if (existing) {
      execute('DELETE FROM reactions WHERE id = ?', [existing.id]);
      return res.json({ removed: true, emoji });
    } else {
      const reactionId = `react-${Date.now()}`;
      execute(
        'INSERT INTO reactions (id, messageId, userId, emoji) VALUES (?, ?, ?, ?)',
        [reactionId, messageId, userId, emoji]
      );
      return res.status(201).json({ added: true, emoji });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao processar reação' });
  }
});

export default router;
