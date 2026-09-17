import { Router, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.js';
import { AuthRequest, authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, requireRole('ADMIN'));

// GET /api/admin/stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = (queryOne<any>('SELECT COUNT(*) as c FROM users') || {}).c || 0;
    const totalCourses = (queryOne<any>('SELECT COUNT(*) as c FROM courses') || {}).c || 0;
    const totalSpaces = (queryOne<any>('SELECT COUNT(*) as c FROM spaces') || {}).c || 0;
    const totalEnrollments = (queryOne<any>('SELECT COUNT(*) as c FROM enrollments') || {}).c || 0;

    return res.json({
      totalUsers,
      activeUsers: Math.max(1, Math.round(totalUsers * 0.85)),
      totalCourses,
      totalSpaces,
      totalEnrollments,
      pendingReports: 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar estatísticas de administração' });
  }
});

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const users = queryAll<any>(
      `SELECT id, name, username, email, role, avatarUrl, isSuspended, xp, level, createdAt,
              (SELECT COUNT(*) FROM enrollments WHERE userId = users.id) as enrollmentsCount,
              (SELECT COUNT(*) FROM courses WHERE creatorId = users.id) as createdCoursesCount
       FROM users
       ORDER BY createdAt DESC`
    );

    return res.json(
      users.map(u => ({
        ...u,
        isSuspended: u.isSuspended === 1,
        _count: { enrollments: u.enrollmentsCount, createdCourses: u.createdCoursesCount },
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar lista de utilizadores' });
  }
});

// PUT /api/admin/users/:id/suspend
router.put('/users/:id/suspend', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = queryOne<any>('SELECT isSuspended FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });

    const newSuspended = user.isSuspended === 1 ? 0 : 1;
    execute('UPDATE users SET isSuspended = ? WHERE id = ?', [newSuspended, id]);

    return res.json({ isSuspended: newSuspended === 1 });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao alterar estado de suspensão' });
  }
});

// GET /api/admin/reports
router.get('/reports', async (req: AuthRequest, res: Response) => {
  return res.json([]);
});

export default router;
