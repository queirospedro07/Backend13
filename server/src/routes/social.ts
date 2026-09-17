import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/social/friends (Accepted friends & pending requests)
router.get('/friends', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Accepted friends (where user is either requester or addressee)
    const acceptedFriendships = queryAll<any>(
      `SELECT f.id as friendshipId, f.createdAt as friendsSince,
              CASE WHEN f.requesterId = ? THEN f.addresseeId ELSE f.requesterId END as friendId
       FROM friendships f
       WHERE (f.requesterId = ? OR f.addresseeId = ?) AND f.status = 'ACCEPTED'`,
      [userId, userId, userId]
    );

    const friends = acceptedFriendships.map(f => {
      const u = queryOne<any>(
        'SELECT id, name, username, avatarUrl, role, xp, level, bio FROM users WHERE id = ?',
        [f.friendId]
      );
      return {
        friendshipId: f.friendshipId,
        friendsSince: f.friendsSince,
        user: u,
      };
    }).filter(f => f.user);

    // Incoming pending requests (received)
    const incoming = queryAll<any>(
      `SELECT f.id as friendshipId, f.createdAt, u.id as user_id, u.name, u.username, u.avatarUrl, u.role, u.xp, u.level
       FROM friendships f
       JOIN users u ON f.requesterId = u.id
       WHERE f.addresseeId = ? AND f.status = 'PENDING'`,
      [userId]
    );

    // Outgoing pending requests (sent)
    const outgoing = queryAll<any>(
      `SELECT f.id as friendshipId, f.createdAt, u.id as user_id, u.name, u.username, u.avatarUrl, u.role, u.xp, u.level
       FROM friendships f
       JOIN users u ON f.addresseeId = u.id
       WHERE f.requesterId = ? AND f.status = 'PENDING'`,
      [userId]
    );

    return res.json({
      friends,
      incoming: incoming.map(r => ({
        friendshipId: r.friendshipId,
        createdAt: r.createdAt,
        user: { id: r.user_id, name: r.name, username: r.username, avatarUrl: r.avatarUrl, role: r.role, xp: r.xp, level: r.level },
      })),
      outgoing: outgoing.map(r => ({
        friendshipId: r.friendshipId,
        createdAt: r.createdAt,
        user: { id: r.user_id, name: r.name, username: r.username, avatarUrl: r.avatarUrl, role: r.role, xp: r.xp, level: r.level },
      })),
    });
  } catch (err) {
    console.error('Friends fetch error:', err);
    return res.status(500).json({ error: 'Falha ao obter lista de amigos' });
  }
});

// POST /api/social/friends/request/:targetUserId (Send friend request)
router.post('/friends/request/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requesterId = req.user!.id;
    const { targetUserId } = req.params;
    const now = new Date().toISOString();

    if (requesterId === targetUserId) {
      return res.status(400).json({ error: 'Não pode enviar pedido de amizade para si próprio' });
    }

    const targetUser = queryOne<any>('SELECT id, name FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    // Check existing friendship in either direction
    const existing = queryOne<any>(
      `SELECT * FROM friendships WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`,
      [requesterId, targetUserId, targetUserId, requesterId]
    );

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return res.json({ message: 'Já são amigos!', status: 'ACCEPTED' });
      }
      if (existing.status === 'PENDING') {
        // If the other person had sent a request, automatically accept it!
        if (existing.requesterId === targetUserId) {
          execute(`UPDATE friendships SET status = 'ACCEPTED', updatedAt = ? WHERE id = ?`, [now, existing.id]);
          return res.json({ message: 'Pedido de amizade aceite com sucesso!', status: 'ACCEPTED' });
        }
        return res.json({ message: 'Pedido de amizade já se encontra pendente', status: 'PENDING' });
      }
    }

    const friendshipId = `fr-${Date.now()}`;
    transaction(() => {
      execute(
        `INSERT INTO friendships (id, requesterId, addresseeId, status, createdAt, updatedAt) VALUES (?, ?, ?, 'PENDING', ?, ?)`,
        [friendshipId, requesterId, targetUserId, now, now]
      );

      execute(
        `INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt) VALUES (?, ?, 'social', ?, ?, '/messages', 0, ?)`,
        [
          `notif-${Date.now()}`,
          targetUserId,
          'Novo Pedido de Amizade',
          `${req.user!.username} enviou-lhe um pedido de amizade.`,
          now,
        ]
      );
    });

    return res.status(201).json({ message: 'Pedido de amizade enviado com sucesso!', friendshipId, status: 'PENDING' });
  } catch (err) {
    console.error('Friend request error:', err);
    return res.status(500).json({ error: 'Falha ao enviar pedido de amizade' });
  }
});

// POST /api/social/friends/accept/:friendshipId (Accept request)
router.post('/friends/accept/:friendshipId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const friendship = queryOne<any>('SELECT * FROM friendships WHERE id = ?', [friendshipId]);
    if (!friendship) {
      return res.status(404).json({ error: 'Pedido de amizade não encontrado' });
    }

    if (friendship.addresseeId !== userId && friendship.requesterId !== userId) {
      return res.status(403).json({ error: 'Não tem permissão para responder a este pedido' });
    }

    execute(`UPDATE friendships SET status = 'ACCEPTED', updatedAt = ? WHERE id = ?`, [now, friendshipId]);

    // Send notification to requester
    const otherUserId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
    execute(
      `INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt) VALUES (?, ?, 'social', ?, ?, '/messages', 0, ?)`,
      [
        `notif-${Date.now()}`,
        otherUserId,
        'Pedido de Amizade Aceite!',
        `${req.user!.username} aceitou o seu pedido de amizade. Agora podem trocar mensagens diretas.`,
        now,
      ]
    );

    return res.json({ message: 'Amizade aceite com sucesso!', status: 'ACCEPTED' });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao aceitar amizade' });
  }
});

// POST /api/social/friends/reject/:friendshipId (Reject/Cancel)
router.post('/friends/reject/:friendshipId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user!.id;

    const friendship = queryOne<any>('SELECT * FROM friendships WHERE id = ?', [friendshipId]);
    if (!friendship) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    if (friendship.addresseeId !== userId && friendship.requesterId !== userId) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    execute('DELETE FROM friendships WHERE id = ?', [friendshipId]);
    return res.json({ message: 'Pedido removido com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao rejeitar pedido' });
  }
});

// DELETE /api/social/friends/remove/:targetUserId (Remove friend)
router.delete('/friends/remove/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { targetUserId } = req.params;

    execute(
      `DELETE FROM friendships WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`,
      [userId, targetUserId, targetUserId, userId]
    );

    return res.json({ message: 'Amigo removido com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao remover amigo' });
  }
});

// POST /api/social/follow/:targetUserId (Follow user)
router.post('/follow/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const followerId = req.user!.id;
    const { targetUserId } = req.params;
    const now = new Date().toISOString();

    if (followerId === targetUserId) {
      return res.status(400).json({ error: 'Não pode seguir o seu próprio perfil' });
    }

    const existing = queryOne<any>(
      'SELECT id FROM follows WHERE followerId = ? AND followingId = ?',
      [followerId, targetUserId]
    );

    if (existing) {
      return res.json({ message: 'Já está a seguir este utilizador', isFollowing: true });
    }

    const followId = `fol-${Date.now()}`;
    transaction(() => {
      execute(
        'INSERT INTO follows (id, followerId, followingId, createdAt) VALUES (?, ?, ?, ?)',
        [followId, followerId, targetUserId, now]
      );

      execute(
        `INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt) VALUES (?, ?, 'social', ?, ?, ?, 0, ?)`,
        [
          `notif-${Date.now()}`,
          targetUserId,
          'Novo Seguidor',
          `${req.user!.username} começou a seguir o seu perfil.`,
          `/profile/${req.user!.username}`,
          now,
        ]
      );
    });

    return res.status(201).json({ message: 'A seguir utilizador!', isFollowing: true });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao seguir utilizador' });
  }
});

// POST /api/social/unfollow/:targetUserId (Unfollow user)
router.post('/unfollow/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const followerId = req.user!.id;
    const { targetUserId } = req.params;

    execute('DELETE FROM follows WHERE followerId = ? AND followingId = ?', [followerId, targetUserId]);
    return res.json({ message: 'Deixou de seguir o utilizador.', isFollowing: false });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao deixar de seguir' });
  }
});

// GET /api/social/followers/:userId
router.get('/followers/:userId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const followers = queryAll<any>(
      `SELECT u.id, u.name, u.username, u.avatarUrl, u.role, u.xp, u.level, u.bio, f.createdAt as followedAt
       FROM follows f
       JOIN users u ON f.followerId = u.id
       WHERE f.followingId = ?
       ORDER BY f.createdAt DESC`,
      [userId]
    );

    return res.json({
      followers,
      count: followers.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter seguidores' });
  }
});

// GET /api/social/following/:userId
router.get('/following/:userId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const following = queryAll<any>(
      `SELECT u.id, u.name, u.username, u.avatarUrl, u.role, u.xp, u.level, u.bio, f.createdAt as followedAt
       FROM follows f
       JOIN users u ON f.followingId = u.id
       WHERE f.followerId = ?
       ORDER BY f.createdAt DESC`,
      [userId]
    );

    return res.json({
      following,
      count: following.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter lista de a seguir' });
  }
});

// GET /api/social/status/:targetUserId
router.get('/status/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { targetUserId } = req.params;

    const follow = queryOne<any>(
      'SELECT id FROM follows WHERE followerId = ? AND followingId = ?',
      [userId, targetUserId]
    );

    const friendship = queryOne<any>(
      `SELECT * FROM friendships WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`,
      [userId, targetUserId, targetUserId, userId]
    );

    const followersCount = (queryOne<any>('SELECT COUNT(*) as c FROM follows WHERE followingId = ?', [targetUserId]) || {}).c || 0;
    const followingCount = (queryOne<any>('SELECT COUNT(*) as c FROM follows WHERE followerId = ?', [targetUserId]) || {}).c || 0;
    const friendsCount = (queryOne<any>(
      `SELECT COUNT(*) as c FROM friendships WHERE (requesterId = ? OR addresseeId = ?) AND status = 'ACCEPTED'`,
      [targetUserId, targetUserId]
    ) || {}).c || 0;

    return res.json({
      isFollowing: !!follow,
      friendshipStatus: friendship ? friendship.status : 'NONE', // NONE, PENDING, ACCEPTED
      isRequester: friendship ? friendship.requesterId === userId : false,
      friendshipId: friendship ? friendship.id : null,
      followersCount,
      followingCount,
      friendsCount,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao verificar estado social' });
  }
});

// GET /api/social/users/search (Search users)
router.get('/users/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;
    const userId = req.user!.id;

    if (!query || String(query).trim().length < 1) {
      // Return top active users excluding self
      const users = queryAll<any>(
        'SELECT id, name, username, avatarUrl, role, xp, level, bio FROM users WHERE id != ? AND isSuspended = 0 LIMIT 15',
        [userId]
      );
      return res.json(users);
    }

    const searchTerm = `%${String(query).trim()}%`;
    const users = queryAll<any>(
      `SELECT id, name, username, avatarUrl, role, xp, level, bio
       FROM users
       WHERE id != ? AND isSuspended = 0 AND (name LIKE ? OR username LIKE ?)
       LIMIT 20`,
      [userId, searchTerm, searchTerm]
    );

    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao pesquisar utilizadores' });
  }
});

// GET /api/social/dm/conversations (List 1-on-1 direct message conversations)
router.get('/dm/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Distinct peers who exchanged DMs with the current user
    const peers = queryAll<any>(
      `SELECT DISTINCT CASE WHEN senderId = ? THEN receiverId ELSE senderId END as peerId
       FROM direct_messages
       WHERE senderId = ? OR receiverId = ?`,
      [userId, userId, userId]
    );

    const conversations = peers.map(p => {
      const peer = queryOne<any>(
        'SELECT id, name, username, avatarUrl, role, xp, level, bio FROM users WHERE id = ?',
        [p.peerId]
      );

      const lastMessage = queryOne<any>(
        `SELECT * FROM direct_messages 
         WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
         ORDER BY createdAt DESC LIMIT 1`,
        [userId, p.peerId, p.peerId, userId]
      );

      const unreadCount = (queryOne<any>(
        `SELECT COUNT(*) as c FROM direct_messages WHERE senderId = ? AND receiverId = ? AND isRead = 0`,
        [p.peerId, userId]
      ) || {}).c || 0;

      return {
        peer,
        lastMessage,
        unreadCount,
      };
    }).filter(c => c.peer);

    // Sort conversations by last message timestamp
    conversations.sort((a, b) => {
      const tA = new Date(a.lastMessage?.createdAt || 0).getTime();
      const tB = new Date(b.lastMessage?.createdAt || 0).getTime();
      return tB - tA;
    });

    return res.json(conversations);
  } catch (err) {
    console.error('DM conversations error:', err);
    return res.status(500).json({ error: 'Falha ao obter conversas' });
  }
});

// GET /api/social/dm/messages/:targetUserId (Chat history)
router.get('/dm/messages/:targetUserId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { targetUserId } = req.params;

    // Mark messages as read
    execute(
      `UPDATE direct_messages SET isRead = 1 WHERE senderId = ? AND receiverId = ? AND isRead = 0`,
      [targetUserId, userId]
    );

    const messages = queryAll<any>(
      `SELECT m.*,
              u.id as user_id, u.name as user_name, u.username as user_username, u.avatarUrl as user_avatarUrl, u.role as user_role
       FROM direct_messages m
       JOIN users u ON m.senderId = u.id
       WHERE (m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?)
       ORDER BY m.createdAt ASC
       LIMIT 150`,
      [userId, targetUserId, targetUserId, userId]
    );

    const peer = queryOne<any>(
      'SELECT id, name, username, avatarUrl, role, xp, level, bio FROM users WHERE id = ?',
      [targetUserId]
    );

    const formatted = messages.map(m => ({
      id: m.id,
      senderId: m.senderId,
      receiverId: m.receiverId,
      content: m.content,
      isRead: m.isRead === 1,
      createdAt: m.createdAt,
      sender: {
        id: m.user_id,
        name: m.user_name,
        username: m.user_username,
        avatarUrl: m.user_avatarUrl,
        role: m.user_role,
      },
    }));

    return res.json({ peer, messages: formatted });
  } catch (err) {
    console.error('DM history error:', err);
    return res.status(500).json({ error: 'Falha ao obter histórico de mensagens' });
  }
});

// POST /api/social/dm/send
router.post('/dm/send', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const senderId = req.user!.id;
    const { receiverId, content } = req.body;
    const now = new Date().toISOString();

    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({ error: 'Destinatário e conteúdo são obrigatórios' });
    }

    const dmId = `dm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    execute(
      `INSERT INTO direct_messages (id, senderId, receiverId, content, isRead, createdAt) VALUES (?, ?, ?, ?, 0, ?)`,
      [dmId, senderId, receiverId, content.trim(), now]
    );

    const sender = queryOne<any>('SELECT id, name, username, avatarUrl, role FROM users WHERE id = ?', [senderId]);

    return res.status(201).json({
      id: dmId,
      senderId,
      receiverId,
      content: content.trim(),
      isRead: false,
      createdAt: now,
      sender,
    });
  } catch (err) {
    console.error('Send DM error:', err);
    return res.status(500).json({ error: 'Falha ao enviar mensagem direta' });
  }
});

export default router;
