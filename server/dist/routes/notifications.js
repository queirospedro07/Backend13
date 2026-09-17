"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/notifications
router.get('/', auth_js_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = (0, db_js_1.queryAll)('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50', [userId]);
        return res.json(notifications.map(n => ({ ...n, isRead: n.isRead === 1 })));
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao obter notificações' });
    }
});
// PUT /api/notifications/read-all
router.put('/read-all', auth_js_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        (0, db_js_1.execute)('UPDATE notifications SET isRead = 1 WHERE userId = ?', [userId]);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao atualizar notificações' });
    }
});
// PUT /api/notifications/:id/read
router.put('/:id/read', auth_js_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        (0, db_js_1.execute)('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [id, userId]);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao marcar notificação como lida' });
    }
});
exports.default = router;
