"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// All admin routes require ADMIN role
router.use(auth_js_1.authenticate, (0, auth_js_1.requireRole)('ADMIN'));
// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = ((0, db_js_1.queryOne)('SELECT COUNT(*) as c FROM users') || {}).c || 0;
        const totalCourses = ((0, db_js_1.queryOne)('SELECT COUNT(*) as c FROM courses') || {}).c || 0;
        const totalSpaces = ((0, db_js_1.queryOne)('SELECT COUNT(*) as c FROM spaces') || {}).c || 0;
        const totalEnrollments = ((0, db_js_1.queryOne)('SELECT COUNT(*) as c FROM enrollments') || {}).c || 0;
        return res.json({
            totalUsers,
            activeUsers: Math.max(1, Math.round(totalUsers * 0.85)),
            totalCourses,
            totalSpaces,
            totalEnrollments,
            pendingReports: 0,
        });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao carregar estatísticas de administração' });
    }
});
// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const users = (0, db_js_1.queryAll)(`SELECT id, name, username, email, role, avatarUrl, isSuspended, xp, level, createdAt,
              (SELECT COUNT(*) FROM enrollments WHERE userId = users.id) as enrollmentsCount,
              (SELECT COUNT(*) FROM courses WHERE creatorId = users.id) as createdCoursesCount
       FROM users
       ORDER BY createdAt DESC`);
        return res.json(users.map(u => ({
            ...u,
            isSuspended: u.isSuspended === 1,
            _count: { enrollments: u.enrollmentsCount, createdCourses: u.createdCoursesCount },
        })));
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao carregar lista de utilizadores' });
    }
});
// PUT /api/admin/users/:id/suspend
router.put('/users/:id/suspend', async (req, res) => {
    try {
        const { id } = req.params;
        const user = (0, db_js_1.queryOne)('SELECT isSuspended FROM users WHERE id = ?', [id]);
        if (!user)
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        const newSuspended = user.isSuspended === 1 ? 0 : 1;
        (0, db_js_1.execute)('UPDATE users SET isSuspended = ? WHERE id = ?', [newSuspended, id]);
        return res.json({ isSuspended: newSuspended === 1 });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao alterar estado de suspensão' });
    }
});
// GET /api/admin/reports
router.get('/reports', async (req, res) => {
    return res.json([]);
});
exports.default = router;
