import { Router, Response } from 'express';
import { queryAll, queryOne } from '../db.js';
import { AuthRequest, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/gamification/leaderboard
router.get('/leaderboard', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { spaceId } = req.query;

    let sql = `
      SELECT id, name, username, avatarUrl, role, xp, level, streakDays
      FROM users
      WHERE isSuspended = 0
    `;
    const params: any[] = [];

    if (spaceId && spaceId !== 'global') {
      sql += ` AND id IN (SELECT userId FROM memberships WHERE spaceId = ?)`;
      params.push(spaceId);
    }

    sql += ` ORDER BY xp DESC LIMIT 25`;

    const topUsers = queryAll<any>(sql, params);

    const rankedUsers = topUsers.map((user, idx) => ({
      rank: idx + 1,
      ...user,
    }));

    let currentUserRank = null;
    if (req.user) {
      const found = rankedUsers.find(u => u.id === req.user!.id);
      if (found) {
        currentUserRank = found;
      } else {
        const currentUser = queryOne<any>(
          'SELECT id, name, username, avatarUrl, role, xp, level, streakDays FROM users WHERE id = ?',
          [req.user.id]
        );
        if (currentUser) {
          const ahead = queryOne<any>('SELECT COUNT(*) as count FROM users WHERE xp > ? AND isSuspended = 0', [currentUser.xp]);
          currentUserRank = { rank: (ahead?.count || 0) + 1, ...currentUser };
        }
      }
    }

    return res.json({
      leaderboard: rankedUsers,
      currentUserRank,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Falha ao carregar tabela de classificação' });
  }
});

// GET /api/gamification/achievements
router.get('/achievements', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const allAchievements = queryAll<any>(
      'SELECT * FROM achievements ORDER BY xpReward ASC'
    );

    let unlockedMap: Record<string, { unlockedAt: string }> = {};
    if (userId) {
      const userAchievements = queryAll<any>(
        'SELECT achievementId, unlockedAt FROM user_achievements WHERE userId = ?',
        [userId]
      );
      unlockedMap = userAchievements.reduce((acc, ua) => {
        acc[ua.achievementId] = { unlockedAt: ua.unlockedAt };
        return acc;
      }, {} as Record<string, { unlockedAt: string }>);
    }

    const achievementsWithStatus = allAchievements.map(ach => ({
      ...ach,
      isUnlocked: !!unlockedMap[ach.id],
      unlockedAt: unlockedMap[ach.id]?.unlockedAt || null,
    }));

    return res.json(achievementsWithStatus);
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar conquistas' });
  }
});

// GET /api/gamification/stats
router.get('/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }

    const user = queryOne<any>(
      'SELECT xp, level, streakDays, dailyGoalMinutes, minutesToday, totalMinutes FROM users WHERE id = ?',
      [userId]
    );

    const history = queryAll<any>(
      'SELECT * FROM xp_transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 10',
      [userId]
    );

    return res.json({
      ...user,
      recentXP: history,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter estatísticas' });
  }
});

export default router;
