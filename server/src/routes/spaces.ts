import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/spaces
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { category, search } = req.query;

    let sql = `
      SELECT s.*,
             u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl,
             (SELECT COUNT(*) FROM memberships WHERE spaceId = s.id) as membersCount,
             (SELECT COUNT(*) FROM channels WHERE spaceId = s.id) as channelsCount,
             (SELECT COUNT(*) FROM courses WHERE spaceId = s.id) as coursesCount
      FROM spaces s
      JOIN users u ON s.ownerId = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category && category !== 'all') {
      sql += ` AND s.category = ?`;
      params.push(category);
    }

    if (search) {
      sql += ` AND (s.name LIKE ? OR s.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY membersCount DESC`;

    const rows = queryAll<any>(sql, params);

    const enriched = rows.map(s => {
      let isMember = false;
      let memberRole = null;

      if (req.user) {
        const mem = queryOne<any>(
          'SELECT role FROM memberships WHERE spaceId = ? AND userId = ?',
          [s.id, req.user.id]
        );
        if (mem) {
          isMember = true;
          memberRole = mem.role;
        }
      }

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        bannerUrl: s.bannerUrl,
        iconUrl: s.iconUrl,
        category: s.category,
        owner: {
          id: s.owner_id,
          name: s.owner_name,
          username: s.owner_username,
          avatarUrl: s.owner_avatarUrl,
        },
        membersCount: s.membersCount,
        channelsCount: s.channelsCount,
        coursesCount: s.coursesCount,
        isMember,
        memberRole,
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error('Failed to fetch spaces:', err);
    return res.status(500).json({ error: 'Falha ao carregar comunidades' });
  }
});

// GET /api/spaces/:id
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    let space = queryOne<any>(
      `SELECT s.*,
              u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl, u.bio as owner_bio,
              (SELECT COUNT(*) FROM memberships WHERE spaceId = s.id) as membersCount,
              (SELECT COUNT(*) FROM channels WHERE spaceId = s.id) as channelsCount
       FROM spaces s
       JOIN users u ON s.ownerId = u.id
       WHERE s.id = ? OR s.slug = ?`,
      [id, id]
    );

    if (!space) {
      const courseRow = queryOne<any>(
        `SELECT c.*, u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl, u.bio as owner_bio
         FROM courses c
         JOIN users u ON c.creatorId = u.id
         WHERE c.id = ? OR c.slug = ?`,
        [id, id]
      );
      if (courseRow) {
        if (courseRow.spaceId) {
          space = queryOne<any>(
            `SELECT s.*,
                    u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl, u.bio as owner_bio,
                    (SELECT COUNT(*) FROM memberships WHERE spaceId = s.id) as membersCount,
                    (SELECT COUNT(*) FROM channels WHERE spaceId = s.id) as channelsCount
             FROM spaces s
             JOIN users u ON s.ownerId = u.id
             WHERE s.id = ?`,
            [courseRow.spaceId]
          );
        }
        if (!space) {
          space = {
            id: courseRow.id,
            name: courseRow.title,
            slug: courseRow.slug,
            description: courseRow.description,
            iconUrl: courseRow.thumbnailUrl,
            bannerUrl: courseRow.bannerUrl || courseRow.thumbnailUrl,
            category: courseRow.category,
            owner_id: courseRow.owner_id,
            owner_name: courseRow.owner_name,
            owner_username: courseRow.owner_username,
            owner_avatarUrl: courseRow.owner_avatarUrl,
            owner_bio: courseRow.owner_bio,
            membersCount: 1,
            channelsCount: 4,
            courseId: courseRow.id,
          };
        }
      }
    }

    if (!space) {
      return res.status(404).json({ error: 'Comunidade não encontrada' });
    }

    let channels = queryAll<any>(
      'SELECT * FROM channels WHERE spaceId = ? ORDER BY orderIndex ASC',
      [space.id]
    );

    if (channels.length === 0) {
      channels = [
        { id: `ch-gen-${space.id}`, spaceId: space.id, name: 'geral', type: 'text', topic: 'Boas-vindas e conversa geral.', isVoice: 0 },
        { id: `ch-qa-${space.id}`, spaceId: space.id, name: 'duvidas-aulas', type: 'text', topic: 'Tira-dúvidas sobre o conteúdo.', isVoice: 0 },
        { id: `ch-proj-${space.id}`, spaceId: space.id, name: 'projetos-showcase', type: 'text', topic: 'Partilha de projetos desenvolvidos.', isVoice: 0 },
        { id: `ch-voice-${space.id}`, spaceId: space.id, name: 'Sala de Mentoria & Ecrã', type: 'voice', topic: 'Mentoria em direto e partilha de ecrã.', isVoice: 1 },
      ];
    }

    const courses = queryAll<any>(
      'SELECT id, title, slug, thumbnailUrl, difficulty, durationHours, price, isFree FROM courses WHERE spaceId = ?',
      [space.id]
    );

    const members = queryAll<any>(
      `SELECT m.*, u.id as user_id, u.name, u.username, u.avatarUrl, u.role as user_role, u.xp, u.level
       FROM memberships m
       JOIN users u ON m.userId = u.id
       WHERE m.spaceId = ?
       LIMIT 30`,
      [space.id]
    );

    let isMember = false;
    let memberRole = null;

    if (req.user) {
      const mem = queryOne<any>(
        'SELECT role FROM memberships WHERE spaceId = ? AND userId = ?',
        [space.id, req.user.id]
      );
      if (mem) {
        isMember = true;
        memberRole = mem.role;
      }
    }

    return res.json({
      ...space,
      owner: {
        id: space.owner_id,
        name: space.owner_name,
        username: space.owner_username,
        avatarUrl: space.owner_avatarUrl,
        bio: space.owner_bio,
      },
      channels,
      courses,
      members: members.map(m => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user_id,
          name: m.name,
          username: m.username,
          avatarUrl: m.avatarUrl,
          role: m.user_role,
          xp: m.xp,
          level: m.level,
        },
      })),
      isMember,
      memberRole,
    });
  } catch (err) {
    console.error('Failed to load space details:', err);
    return res.status(500).json({ error: 'Falha ao carregar detalhes do espaço' });
  }
});

// POST /api/spaces/:id/join
router.post('/:id/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const space = queryOne<any>('SELECT id, name FROM spaces WHERE id = ? OR slug = ?', [id, id]);
    if (!space) {
      return res.status(404).json({ error: 'Comunidade não encontrada' });
    }

    const existing = queryOne('SELECT id FROM memberships WHERE spaceId = ? AND userId = ?', [space.id, userId]);
    if (!existing) {
      execute(
        `INSERT INTO memberships (id, userId, spaceId, role, joinedAt) VALUES (?, ?, ?, 'MEMBER', ?)`,
        [`mem-${Date.now()}`, userId, space.id, now]
      );
    }

    // Also auto-enroll in all courses linked to this space
    const linkedCourses = queryAll<any>('SELECT id FROM courses WHERE spaceId = ? OR id = ?', [space.id, space.id]);
    linkedCourses.forEach(c => {
      execute(
        `INSERT OR IGNORE INTO enrollments (id, userId, courseId, enrolledAt, progressPercent) VALUES (?, ?, ?, ?, 0)`,
        [`enr-${Date.now()}-${c.id}`, userId, c.id, now]
      );
    });

    return res.status(201).json({ message: 'Entrou na comunidade e no curso com sucesso!' });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao entrar na comunidade' });
  }
});

export default router;
