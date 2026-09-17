"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/quizzes/lesson/:lessonId
router.get('/lesson/:lessonId', auth_js_1.authenticate, async (req, res) => {
    try {
        const { lessonId } = req.params;
        const quiz = (0, db_js_1.queryOne)('SELECT * FROM quizzes WHERE lessonId = ?', [lessonId]);
        if (!quiz) {
            return res.status(404).json({ error: 'Nenhum questionário associado a esta lição' });
        }
        const questions = (0, db_js_1.queryAll)('SELECT id, quizId, question, options, explanation, orderIndex FROM quiz_questions WHERE quizId = ? ORDER BY orderIndex ASC', [quiz.id]);
        const formattedQuestions = questions.map(q => {
            const optionsArray = JSON.parse(q.options || '[]');
            return {
                id: q.id,
                quizId: q.quizId,
                question: q.question,
                options: optionsArray.map((opt, idx) => ({ id: `opt-${idx}`, text: opt })),
                explanation: q.explanation,
                orderIndex: q.orderIndex,
            };
        });
        const attempts = (0, db_js_1.queryAll)('SELECT * FROM quiz_attempts WHERE quizId = ? AND userId = ? ORDER BY attemptedAt DESC LIMIT 3', [quiz.id, req.user.id]);
        return res.json({
            ...quiz,
            questions: formattedQuestions,
            attempts,
        });
    }
    catch (err) {
        console.error('Quiz fetch error:', err);
        return res.status(500).json({ error: 'Falha ao obter questionário' });
    }
});
// POST /api/quizzes/:quizId/submit
router.post('/:quizId/submit', auth_js_1.authenticate, async (req, res) => {
    try {
        const { quizId } = req.params;
        const { answers } = req.body; // Map of { [questionId: string]: string (optionId: "opt-0") }
        const userId = req.user.id;
        const now = new Date().toISOString();
        const quiz = (0, db_js_1.queryOne)('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        if (!quiz) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }
        const questions = (0, db_js_1.queryAll)('SELECT * FROM quiz_questions WHERE quizId = ? ORDER BY orderIndex ASC', [quiz.id]);
        let correctCount = 0;
        const results = [];
        for (const q of questions) {
            const selectedOptionId = answers[q.id];
            const correctOptionId = `opt-${q.correctOptionIndex}`;
            const isCorrect = selectedOptionId === correctOptionId;
            if (isCorrect)
                correctCount++;
            results.push({
                questionId: q.id,
                question: q.question,
                explanation: q.explanation,
                selectedOptionId,
                correctOptionId,
                isCorrect,
            });
        }
        const totalQuestions = questions.length;
        const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
        const passed = score >= quiz.passingScore;
        const xpEarned = passed ? quiz.xpReward : 10;
        (0, db_js_1.transaction)(() => {
            (0, db_js_1.execute)(`INSERT INTO quiz_attempts (id, quizId, userId, score, passed, attemptedAt) VALUES (?, ?, ?, ?, ?, ?)`, [`att-${Date.now()}`, quiz.id, userId, score, passed ? 1 : 0, now]);
            (0, db_js_1.execute)('UPDATE users SET xp = xp + ? WHERE id = ?', [xpEarned, userId]);
            (0, db_js_1.execute)(`INSERT INTO xp_transactions (id, userId, amount, action, description, createdAt) VALUES (?, ?, ?, 'quiz_complete', ?, ?)`, [`xp-${Date.now()}`, userId, xpEarned, `Questionário: ${quiz.title} (${score}%)`, now]);
        });
        return res.json({
            score,
            passed,
            xpEarned,
            results,
        });
    }
    catch (err) {
        console.error('Quiz submit error:', err);
        return res.status(500).json({ error: 'Falha ao submeter respostas do questionário' });
    }
});
exports.default = router;
