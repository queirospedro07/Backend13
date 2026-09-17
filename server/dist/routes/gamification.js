"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/gamification/leaderboard
router.get('/leaderboard', auth_js_1.optionalAuth, async (req, res) => {
    try {
        const { spaceId } = req.query;
        let sql = `
      SELECT id, name, username, avatarUrl, role, xp, level, streakDays
      FROM users
      WHERE isSuspended = 0
    `;
        const params = [];
        if (spaceId && spaceId !== 'global') {
            sql += ` AND id IN (SELECT userId FROM memberships WHERE spaceId = ?)`;
            params.push(spaceId);
        }
        sql += ` ORDER BY xp DESC LIMIT 25`;
        const topUsers = (0, db_js_1.queryAll)(sql, params);
        const rankedUsers = topUsers.map((user, idx) => ({
            rank: idx + 1,
            ...user,
        }));
        let currentUserRank = null;
        if (req.user) {
            const found = rankedUsers.find(u => u.id === req.user.id);
            if (found) {
                currentUserRank = found;
            }
            else {
                const currentUser = (0, db_js_1.queryOne)('SELECT id, name, username, avatarUrl, role, xp, level, streakDays FROM users WHERE id = ?', [req.user.id]);
                if (currentUser) {
                    const ahead = (0, db_js_1.queryOne)('SELECT COUNT(*) as count FROM users WHERE xp > ? AND isSuspended = 0', [currentUser.xp]);
                    currentUserRank = { rank: (ahead?.count || 0) + 1, ...currentUser };
                }
            }
        }
        return res.json({
            leaderboard: rankedUsers,
            currentUserRank,
        });
    }
    catch (err) {
        console.error('Leaderboard error:', err);
        return res.status(500).json({ error: 'Falha ao carregar tabela de classificação' });
    }
});
// GET /api/gamification/achievements
router.get('/achievements', auth_js_1.optionalAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const allAchievements = (0, db_js_1.queryAll)('SELECT * FROM achievements ORDER BY xpReward ASC');
        let unlockedMap = {};
        if (userId) {
            const userAchievements = (0, db_js_1.queryAll)('SELECT achievementId, unlockedAt FROM user_achievements WHERE userId = ?', [userId]);
            unlockedMap = userAchievements.reduce((acc, ua) => {
                acc[ua.achievementId] = { unlockedAt: ua.unlockedAt };
                return acc;
            }, {});
        }
        const achievementsWithStatus = allAchievements.map(ach => ({
            ...ach,
            isUnlocked: !!unlockedMap[ach.id],
            unlockedAt: unlockedMap[ach.id]?.unlockedAt || null,
        }));
        return res.json(achievementsWithStatus);
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao carregar conquistas' });
    }
});
// GET /api/gamification/stats
router.get('/stats', auth_js_1.optionalAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Autenticação necessária' });
        }
        const user = (0, db_js_1.queryOne)('SELECT xp, level, streakDays, dailyGoalMinutes, minutesToday, totalMinutes FROM users WHERE id = ?', [userId]);
        const history = (0, db_js_1.queryAll)('SELECT * FROM xp_transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 10', [userId]);
        return res.json({
            ...user,
            recentXP: history,
        });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao obter estatísticas' });
    }
});
exports.default = router;
