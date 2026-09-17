"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/notes/:lessonId
router.get('/:lessonId', auth_js_1.authenticate, async (req, res) => {
    try {
        const { lessonId } = req.params;
        const userId = req.user.id;
        const note = (0, db_js_1.queryOne)('SELECT * FROM notes WHERE userId = ? AND lessonId = ?', [userId, lessonId]);
        return res.json(note || { content: '' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao obter anotação' });
    }
});
// POST /api/notes/:lessonId
router.post('/:lessonId', auth_js_1.authenticate, async (req, res) => {
    try {
        const { lessonId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;
        const now = new Date().toISOString();
        const existing = (0, db_js_1.queryOne)('SELECT id FROM notes WHERE userId = ? AND lessonId = ?', [userId, lessonId]);
        if (existing) {
            (0, db_js_1.execute)('UPDATE notes SET content = ?, updatedAt = ? WHERE id = ?', [content || '', now, existing.id]);
        }
        else {
            (0, db_js_1.execute)('INSERT INTO notes (id, userId, lessonId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', [`note-${Date.now()}`, userId, lessonId, content || '', now, now]);
        }
        const note = (0, db_js_1.queryOne)('SELECT * FROM notes WHERE userId = ? AND lessonId = ?', [userId, lessonId]);
        return res.json(note);
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao guardar anotação' });
    }
});
// GET /api/notes (All user notes)
router.get('/', auth_js_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const notes = (0, db_js_1.queryAll)(`SELECT n.*, l.title as lesson_title, m.title as module_title, c.title as course_title, c.id as course_id
       FROM notes n
       JOIN lessons l ON n.lessonId = l.id
       JOIN course_modules m ON l.moduleId = m.id
       JOIN courses c ON m.courseId = c.id
       WHERE n.userId = ?
       ORDER BY n.updatedAt DESC`, [userId]);
        return res.json(notes.map(n => ({
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
        })));
    }
    catch (err) {
        return res.status(500).json({ error: 'Falha ao obter anotações' });
    }
});
exports.default = router;
