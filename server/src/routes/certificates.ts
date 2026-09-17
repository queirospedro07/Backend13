import { Router, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.js';
import { AuthRequest, authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/certificates/verify/:certificateId (Public verification)
router.get('/verify/:certificateId', optionalAuth, async (req, res: Response) => {
  try {
    const { certificateId } = req.params;

    const cert = queryOne<any>(
      `SELECT c.*,
              u.id as user_id, u.name as user_name, u.username as user_username, u.avatarUrl as user_avatarUrl,
              co.id as course_id, co.title as course_title, co.slug as course_slug, co.durationHours as course_durationHours
       FROM certificates c
       JOIN users u ON c.userId = u.id
       JOIN courses co ON c.courseId = co.id
       WHERE c.id = ? OR c.credentialId = ?`,
      [certificateId, certificateId]
    );

    if (!cert) {
      return res.status(404).json({ error: 'Certificado não encontrado ou identificador inválido' });
    }

    return res.json({
      id: cert.id,
      recipientName: cert.recipientName,
      courseTitle: cert.courseTitle,
      credentialId: cert.credentialId,
      issuedAt: cert.issuedAt,
      score: cert.score,
      user: {
        id: cert.user_id,
        name: cert.user_name,
        username: cert.user_username,
        avatarUrl: cert.user_avatarUrl,
      },
      course: {
        id: cert.course_id,
        title: cert.course_title,
        slug: cert.course_slug,
        durationHours: cert.course_durationHours,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao verificar credencial de certificado' });
  }
});

// GET /api/certificates/my (User's certificates)
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const certs = queryAll<any>(
      `SELECT c.*, co.title as course_title, co.thumbnailUrl
       FROM certificates c
       JOIN courses co ON c.courseId = co.id
       WHERE c.userId = ?
       ORDER BY c.issuedAt DESC`,
      [userId]
    );

    return res.json(
      certs.map(c => ({
        ...c,
        course: { title: c.course_title, thumbnailUrl: c.thumbnailUrl },
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar certificados' });
  }
});

export default router;
