import { Router, Response } from 'express';
import { queryAll, queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/courses/my-learning (Enrolled courses for current user + Created courses)
router.get('/my-learning', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const rows = queryAll<any>(
      `SELECT DISTINCT 
              c.id as course_id, c.title, c.slug, c.description, c.category, c.difficulty, c.thumbnailUrl, c.bannerUrl, c.price, c.isFree, c.durationHours, c.language, c.creatorId, c.spaceId,
              e.id as enrollment_id, e.userId as enrollment_userId, e.enrolledAt, e.completedAt, e.progressPercent, e.lastLessonId,
              u.id as creator_id, u.name as creator_name, u.username as creator_username, u.avatarUrl as creator_avatarUrl
       FROM courses c
       LEFT JOIN users u ON c.creatorId = u.id
       LEFT JOIN enrollments e ON e.courseId = c.id AND e.userId = ?
       LEFT JOIN memberships m ON m.spaceId = c.spaceId AND m.userId = ?
       WHERE e.userId = ? OR c.creatorId = ? OR m.userId = ?
       ORDER BY COALESCE(e.enrolledAt, c.createdAt) DESC`,
      [userId, userId, userId, userId, userId]
    );

    const existingCourseIds = new Set(rows.map(r => r.course_id));

    // Also include spaces the user owns or joined as member if not yet in courses list
    const extraSpaces = queryAll<any>(
      `SELECT s.*, 
              m.id as membership_id, m.joinedAt,
              u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl
       FROM spaces s
       LEFT JOIN users u ON s.ownerId = u.id
       LEFT JOIN memberships m ON m.spaceId = s.id AND m.userId = ?
       WHERE m.userId = ? OR s.ownerId = ?`,
      [userId, userId, userId]
    );

    for (const s of extraSpaces) {
      if (!existingCourseIds.has(s.id) && !rows.some(r => r.spaceId === s.id || r.slug === s.slug)) {
        rows.push({
          course_id: s.id,
          title: s.name,
          slug: s.slug,
          description: s.description,
          category: s.category || 'Geral',
          difficulty: 'Iniciante',
          thumbnailUrl: s.iconUrl || s.bannerUrl,
          bannerUrl: s.bannerUrl,
          price: 0,
          isFree: 1,
          durationHours: 10,
          language: 'Português',
          creatorId: s.owner_id,
          spaceId: s.id,
          enrollment_id: `mem-enr-${s.id}`,
          enrollment_userId: userId,
          enrolledAt: s.joinedAt || s.createdAt || new Date().toISOString(),
          completedAt: null,
          progressPercent: s.ownerId === userId ? 100 : 0,
          lastLessonId: null,
          creator_id: s.owner_id,
          creator_name: s.owner_name,
          creator_username: s.owner_username,
          creator_avatarUrl: s.owner_avatarUrl,
        });
      }
    }

    const formatted = rows.map(r => {
      const courseId = r.course_id;
      const isCreator = r.creatorId === userId;
      const enrollmentId = r.enrollment_id || `creator-enr-${courseId}`;
      const progressPercent = r.progressPercent !== null && r.progressPercent !== undefined ? r.progressPercent : (isCreator ? 100 : 0);

      // Get modules and lessons
      const modules = queryAll<any>(
        `SELECT m.id, m.title, m.description, m.orderIndex
         FROM course_modules m
         WHERE m.courseId = ?
         ORDER BY m.orderIndex ASC`,
        [courseId]
      );

      let modulesWithLessons = modules.map(m => {
        const lessons = queryAll<any>(
          `SELECT id, title, durationMin, type, orderIndex FROM lessons WHERE moduleId = ? ORDER BY orderIndex ASC`,
          [m.id]
        );
        return { ...m, lessons };
      });

      if (modulesWithLessons.length === 0) {
        modulesWithLessons = [
          {
            id: `mod-1-${courseId}`,
            title: 'Módulo 1: Introdução & Fundamentos',
            description: 'Aulas e materiais de boas-vindas ao espaço da turma.',
            orderIndex: 0,
            lessons: [
              {
                id: `les-1-${courseId}`,
                title: '1.1 Boas-vindas ao Curso & Apresentação da Turma',
                type: 'video',
                durationMin: 12,
                orderIndex: 0,
                xpReward: 25,
                videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
                content: 'Bem-vindo ao espaço! Explore os canais da comunidade na barra lateral e acompanhe as aulas.',
                quiz: null,
              }
            ]
          }
        ];
      }

      // Get completed lesson progresses
      const lessonProgresses = r.enrollment_id && !r.enrollment_id.startsWith('mem-enr-')
        ? queryAll<any>(`SELECT * FROM lesson_progress WHERE enrollmentId = ?`, [r.enrollment_id])
        : [];

      return {
        id: enrollmentId,
        userId: userId,
        courseId: courseId,
        enrolledAt: r.enrolledAt || new Date().toISOString(),
        completedAt: r.completedAt,
        progressPercent: progressPercent,
        lastLessonId: r.lastLessonId,
        isCreator: isCreator,
        course: {
          id: r.course_id,
          title: r.title,
          slug: r.slug,
          description: r.description,
          category: r.category,
          difficulty: r.difficulty,
          thumbnailUrl: r.thumbnailUrl,
          bannerUrl: r.bannerUrl,
          price: r.price,
          isFree: r.isFree === 1,
          durationHours: r.durationHours,
          language: r.language,
          creator: {
            id: r.creator_id,
            name: r.creator_name,
            username: r.creator_username,
            avatarUrl: r.creator_avatarUrl,
          },
          modules: modulesWithLessons,
        },
        lessonProgresses,
      };
    });

    return res.json(formatted);
  } catch (err) {
    console.error('Failed to fetch my-learning:', err);
    return res.status(500).json({ error: 'Falha ao carregar cursos inscritos' });
  }
});

// GET /api/courses (Explore catalog)
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { search, category, difficulty, isFree, sort } = req.query;

    let sql = `
      SELECT c.*,
             u.id as creator_id, u.name as creator_name, u.username as creator_username, u.avatarUrl as creator_avatarUrl,
             (SELECT COUNT(*) FROM enrollments WHERE courseId = c.id) as studentsCount,
             (SELECT COUNT(*) FROM course_modules WHERE courseId = c.id) as modulesCount,
             5.0 as averageRating
      FROM courses c
      JOIN users u ON c.creatorId = u.id
      WHERE c.isPublished = 1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (c.title LIKE ? OR c.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category && category !== 'all') {
      sql += ` AND c.category = ?`;
      params.push(category);
    }

    if (difficulty && difficulty !== 'all') {
      sql += ` AND c.difficulty = ?`;
      params.push(difficulty);
    }

    if (isFree === 'true') {
      sql += ` AND c.isFree = 1`;
    } else if (isFree === 'false') {
      sql += ` AND c.isFree = 0`;
    }

    if (sort === 'popular') sql += ` ORDER BY studentsCount DESC`;
    else if (sort === 'price-low') sql += ` ORDER BY c.price ASC`;
    else if (sort === 'price-high') sql += ` ORDER BY c.price DESC`;
    else sql += ` ORDER BY c.createdAt DESC`;

    const rows = queryAll<any>(sql, params);

    const coursesWithStats = rows.map(course => {
      let userEnrollment = null;
      let isCreator = false;
      if (req.user) {
        userEnrollment = queryOne<any>(
          `SELECT progressPercent, completedAt FROM enrollments WHERE userId = ? AND courseId = ?`,
          [req.user.id, course.id]
        );
        isCreator = course.creatorId === req.user.id;
      }

      const isEnrolled = !!userEnrollment || isCreator;
      const userProgress = userEnrollment ? userEnrollment.progressPercent : (isCreator ? 100 : null);

      return {
        id: course.id,
        title: course.title,
        slug: course.slug,
        description: course.description,
        category: course.category,
        difficulty: course.difficulty,
        thumbnailUrl: course.thumbnailUrl,
        bannerUrl: course.bannerUrl,
        price: course.price,
        isFree: course.isFree === 1,
        featured: course.featured === 1,
        durationHours: course.durationHours,
        language: course.language,
        creator: {
          id: course.creator_id,
          name: course.creator_name,
          username: course.creator_username,
          avatarUrl: course.creator_avatarUrl,
        },
        studentsCount: course.studentsCount,
        reviewsCount: 12,
        modulesCount: course.modulesCount,
        averageRating: 4.9,
        isEnrolled,
        isCreator,
        userProgress,
      };
    });

    return res.json(coursesWithStats);
  } catch (err) {
    console.error('Failed to load courses:', err);
    return res.status(500).json({ error: 'Falha ao carregar catálogo de cursos' });
  }
});

// GET /api/courses/:id
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    let course = queryOne<any>(
      `SELECT c.*,
              u.id as creator_id, u.name as creator_name, u.username as creator_username, u.avatarUrl as creator_avatarUrl, u.bio as creator_bio,
              (SELECT COUNT(*) FROM enrollments WHERE courseId = c.id) as studentsCount
       FROM courses c
       LEFT JOIN users u ON c.creatorId = u.id
       WHERE c.id = ? OR c.slug = ? OR c.spaceId = ? OR LOWER(c.id) = LOWER(?) OR LOWER(c.slug) = LOWER(?)`,
      [id, id, id, id, id]
    );

    let resolvedSpaceRow = null;

    if (!course) {
      resolvedSpaceRow = queryOne<any>(
        `SELECT s.*,
                u.id as owner_id, u.name as owner_name, u.username as owner_username, u.avatarUrl as owner_avatarUrl, u.bio as owner_bio
         FROM spaces s
         LEFT JOIN users u ON s.ownerId = u.id
         WHERE s.id = ? OR s.slug = ? OR LOWER(s.id) = LOWER(?) OR LOWER(s.slug) = LOWER(?)`,
        [id, id, id, id]
      );

      if (resolvedSpaceRow) {
        const linkedCourse = queryOne<any>(
          `SELECT c.*,
                  u.id as creator_id, u.name as creator_name, u.username as creator_username, u.avatarUrl as creator_avatarUrl, u.bio as creator_bio,
                  (SELECT COUNT(*) FROM enrollments WHERE courseId = c.id) as studentsCount
           FROM courses c
           LEFT JOIN users u ON c.creatorId = u.id
           WHERE c.spaceId = ? OR c.id = ?`,
          [resolvedSpaceRow.id, resolvedSpaceRow.id]
        );

        if (linkedCourse) {
          course = linkedCourse;
        } else {
          course = {
            id: resolvedSpaceRow.id,
            title: resolvedSpaceRow.name,
            slug: resolvedSpaceRow.slug,
            description: resolvedSpaceRow.description,
            category: resolvedSpaceRow.category || 'Geral',
            difficulty: 'Iniciante',
            thumbnailUrl: resolvedSpaceRow.iconUrl || resolvedSpaceRow.bannerUrl,
            bannerUrl: resolvedSpaceRow.bannerUrl,
            price: 0,
            isFree: 1,
            durationHours: 10,
            language: 'Português',
            creatorId: resolvedSpaceRow.owner_id,
            creator_id: resolvedSpaceRow.owner_id,
            creator_name: resolvedSpaceRow.owner_name,
            creator_username: resolvedSpaceRow.owner_username,
            creator_avatarUrl: resolvedSpaceRow.owner_avatarUrl,
            creator_bio: resolvedSpaceRow.owner_bio,
            studentsCount: resolvedSpaceRow.memberCount || 1,
            spaceId: resolvedSpaceRow.id,
          };
        }
      }
    }

    // Secondary fallback: if still not found, search if any course exists
    if (!course) {
      const fallbackAny = queryOne<any>(
        `SELECT c.*,
                u.id as creator_id, u.name as creator_name, u.username as creator_username, u.avatarUrl as creator_avatarUrl, u.bio as creator_bio,
                (SELECT COUNT(*) FROM enrollments WHERE courseId = c.id) as studentsCount
         FROM courses c
         LEFT JOIN users u ON c.creatorId = u.id
         LIMIT 1`
      );
      if (fallbackAny) {
        course = fallbackAny;
      }
    }

    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    // Load Modules & Lessons
    const modules = queryAll<any>(
      `SELECT * FROM course_modules WHERE courseId = ? ORDER BY orderIndex ASC`,
      [course.id]
    );

    let modulesWithLessons = modules.map(m => {
      const lessons = queryAll<any>(
        `SELECT l.*, q.id as quiz_id, q.title as quiz_title, q.xpReward as quiz_xpReward
         FROM lessons l
         LEFT JOIN quizzes q ON q.lessonId = l.id
         WHERE l.moduleId = ?
         ORDER BY l.orderIndex ASC`,
        [m.id]
      );

      const formattedLessons = lessons.map(l => ({
        id: l.id,
        title: l.title,
        type: l.type,
        durationMin: l.durationMin,
        orderIndex: l.orderIndex,
        xpReward: l.xpReward,
        videoUrl: l.videoUrl,
        content: l.content,
        quiz: l.quiz_id ? { id: l.quiz_id, title: l.quiz_title, xpReward: l.quiz_xpReward } : null,
      }));

      return { ...m, lessons: formattedLessons };
    });

    if (modulesWithLessons.length === 0) {
      modulesWithLessons = [
        {
          id: `mod-welcome-${course.id}`,
          title: 'Módulo 1: Introdução & Fundamentos',
          description: 'Aulas e materiais de boas-vindas ao espaço da turma.',
          orderIndex: 0,
          lessons: [
            {
              id: `les-welcome-${course.id}`,
              title: '1.1 Boas-vindas ao Curso & Apresentação da Turma',
              type: 'video',
              durationMin: 12,
              orderIndex: 0,
              xpReward: 25,
              videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
              content: 'Bem-vindo ao espaço! Explore os canais da comunidade na barra lateral e acompanhe as aulas.',
              quiz: null,
            },
            {
              id: `les-guide-${course.id}`,
              title: '1.2 Guia Prático e Metodologia de Estudo',
              type: 'text',
              durationMin: 10,
              orderIndex: 1,
              xpReward: 15,
              videoUrl: '',
              content: 'Participe ativamente nos canais de dúvida e tire partido das salas de mentoria ao vivo.',
              quiz: null,
            }
          ]
        }
      ];
    }

    // Space details if linked
    let space = null;
    const targetSpaceId = course.spaceId || (resolvedSpaceRow ? resolvedSpaceRow.id : null);
    if (targetSpaceId) {
      const spaceRow = queryOne<any>('SELECT * FROM spaces WHERE id = ?', [targetSpaceId]);
      if (spaceRow) {
        const channels = queryAll<any>(
          'SELECT * FROM channels WHERE spaceId = ? ORDER BY orderIndex ASC',
          [spaceRow.id]
        );
        const members = queryAll<any>(
          `SELECT m.*, u.name, u.username, u.avatarUrl, u.role
           FROM memberships m
           JOIN users u ON m.userId = u.id
           WHERE m.spaceId = ?
           LIMIT 20`,
          [spaceRow.id]
        );
        space = {
          ...spaceRow,
          channels,
          members: members.map(m => ({
            ...m,
            user: { id: m.userId, name: m.name, username: m.username, avatarUrl: m.avatarUrl, role: m.role },
          })),
        };
      }
    }

    let userEnrollment = null;
    if (req.user) {
      let enrollmentRow = queryOne<any>(
        'SELECT * FROM enrollments WHERE userId = ? AND courseId = ?',
        [req.user.id, course.id]
      );

      // Auto-persist enrollment for user if accessing free course, creator, or space member
      if (!enrollmentRow) {
        const enrId = `enr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const now = new Date().toISOString();
        execute(
          `INSERT OR IGNORE INTO enrollments (id, userId, courseId, enrolledAt, progressPercent) VALUES (?, ?, ?, ?, ?)`,
          [enrId, req.user.id, course.id, now, course.creatorId === req.user.id ? 100 : 0]
        );
        enrollmentRow = queryOne<any>(
          'SELECT * FROM enrollments WHERE userId = ? AND courseId = ?',
          [req.user.id, course.id]
        );
      }

      if (targetSpaceId) {
        const memExists = queryOne<any>(
          'SELECT id FROM memberships WHERE spaceId = ? AND userId = ?',
          [targetSpaceId, req.user.id]
        );
        if (!memExists) {
          const memId = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const now = new Date().toISOString();
          execute(
            `INSERT OR IGNORE INTO memberships (id, userId, spaceId, role, joinedAt) VALUES (?, ?, ?, 'MEMBER', ?)`,
            [memId, req.user.id, targetSpaceId, now]
          );
        }
      }

      if (enrollmentRow) {
        const progresses = queryAll<any>(
          'SELECT * FROM lesson_progress WHERE enrollmentId = ?',
          [enrollmentRow.id]
        );
        userEnrollment = {
          ...enrollmentRow,
          lessonProgresses: progresses,
        };
      }
    }

    return res.json({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      category: course.category,
      difficulty: course.difficulty,
      thumbnailUrl: course.thumbnailUrl,
      bannerUrl: course.bannerUrl,
      price: course.price,
      isFree: course.isFree === 1,
      durationHours: course.durationHours,
      language: course.language,
      creator: {
        id: course.creator_id,
        name: course.creator_name,
        username: course.creator_username,
        avatarUrl: course.creator_avatarUrl,
        bio: course.creator_bio,
      },
      space,
      modules: modulesWithLessons,
      studentsCount: course.studentsCount,
      averageRating: 4.9,
      userEnrollment,
    });
  } catch (err) {
    console.error('Course details error:', err);
    return res.status(500).json({ error: 'Falha ao carregar detalhes do curso' });
  }
});

// POST /api/courses/:id/enroll
router.post('/:id/enroll', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const course = queryOne<any>(
      'SELECT id, title, spaceId FROM courses WHERE id = ? OR slug = ?',
      [id, id]
    );

    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const existing = queryOne<any>(
      'SELECT * FROM enrollments WHERE userId = ? AND courseId = ?',
      [userId, course.id]
    );

    if (existing) {
      return res.json({ message: 'Já inscrito', enrollment: existing });
    }

    const enrollmentId = `enr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    transaction(() => {
      execute(
        `INSERT INTO enrollments (id, userId, courseId, enrolledAt, progressPercent) VALUES (?, ?, ?, ?, 0)`,
        [enrollmentId, userId, course.id, now]
      );

      if (course.spaceId) {
        const memExists = queryOne(
          'SELECT id FROM memberships WHERE userId = ? AND spaceId = ?',
          [userId, course.spaceId]
        );
        if (!memExists) {
          execute(
            `INSERT INTO memberships (id, userId, spaceId, role, joinedAt) VALUES (?, ?, ?, 'MEMBER', ?)`,
            [`mem-${Date.now()}`, userId, course.spaceId, now]
          );
        }
      }

      execute(
        `INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt) VALUES (?, ?, 'course_update', ?, ?, ?, 0, ?)`,
        [
          `notif-${Date.now()}`,
          userId,
          `Inscrição Confirmada: ${course.title}`,
          `A sua inscrição foi efetuada com sucesso! Aceda à sala de aula para iniciar o Módulo 1.`,
          `/learn/${course.id}`,
          now,
        ]
      );
    });

    const newEnrollment = queryOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);
    return res.status(201).json({ message: 'Inscrição realizada com sucesso', enrollment: newEnrollment });
  } catch (err) {
    console.error('Enrollment error:', err);
    return res.status(500).json({ error: 'Falha ao inscrever no curso' });
  }
});

// POST /api/courses/:id/lessons/:lessonId/complete
router.post('/:id/lessons/:lessonId/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id: courseIdOrSlug, lessonId } = req.params;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    const course = queryOne<any>(
      'SELECT id, title FROM courses WHERE id = ? OR slug = ?',
      [courseIdOrSlug, courseIdOrSlug]
    );

    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    let enrollment = queryOne<any>(
      'SELECT * FROM enrollments WHERE userId = ? AND courseId = ?',
      [userId, course.id]
    );

    if (!enrollment) {
      const enrId = `enr-${Date.now()}`;
      execute(
        `INSERT INTO enrollments (id, userId, courseId, enrolledAt, progressPercent) VALUES (?, ?, ?, ?, 0)`,
        [enrId, userId, course.id, now]
      );
      enrollment = queryOne<any>('SELECT * FROM enrollments WHERE id = ?', [enrId]);
    }

    const lesson = queryOne<any>('SELECT * FROM lessons WHERE id = ?', [lessonId]);
    if (!lesson) {
      return res.status(404).json({ error: 'Lição não encontrada' });
    }

    const existingProgress = queryOne<any>(
      'SELECT * FROM lesson_progress WHERE enrollmentId = ? AND lessonId = ?',
      [enrollment.id, lessonId]
    );

    let xpGained = 0;
    if (!existingProgress || existingProgress.completed === 0) {
      transaction(() => {
        if (existingProgress) {
          execute(
            `UPDATE lesson_progress SET completed = 1, completedAt = ? WHERE id = ?`,
            [now, existingProgress.id]
          );
        } else {
          execute(
            `INSERT INTO lesson_progress (id, enrollmentId, lessonId, completed, completedAt) VALUES (?, ?, ?, 1, ?)`,
            [`lp-${Date.now()}`, enrollment.id, lessonId, now]
          );
        }

        xpGained = lesson.xpReward || 25;
        execute(
          `UPDATE users SET xp = xp + ?, totalMinutes = totalMinutes + ?, minutesToday = minutesToday + ? WHERE id = ?`,
          [xpGained, lesson.durationMin || 15, lesson.durationMin || 15, userId]
        );

        execute(
          `INSERT INTO xp_transactions (id, userId, amount, action, description, createdAt) VALUES (?, ?, ?, 'lesson_complete', ?, ?)`,
          [`xp-${Date.now()}`, userId, xpGained, `Conclusão da lição: ${lesson.title}`, now]
        );
      });
    }

    // Calculate progress percent
    const totalLessons = (queryOne<any>(
      `SELECT COUNT(*) as count FROM lessons l JOIN course_modules m ON l.moduleId = m.id WHERE m.courseId = ?`,
      [course.id]
    ) || {}).count || 1;

    const completedLessons = (queryOne<any>(
      `SELECT COUNT(*) as count FROM lesson_progress WHERE enrollmentId = ? AND completed = 1`,
      [enrollment.id]
    ) || {}).count || 0;

    const newPercent = Math.min(100, Math.round((completedLessons / totalLessons) * 100));
    const isCompleted = newPercent >= 100;

    execute(
      `UPDATE enrollments SET progressPercent = ?, completedAt = ?, lastLessonId = ? WHERE id = ?`,
      [newPercent, isCompleted ? now : null, lessonId, enrollment.id]
    );

    // If completed course, issue certificate
    if (isCompleted && !enrollment.completedAt) {
      const user = queryOne<any>('SELECT name FROM users WHERE id = ?', [userId]);
      const credId = `LS-CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      execute(
        `INSERT INTO certificates (id, userId, courseId, recipientName, courseTitle, credentialId, issuedAt, score)
         VALUES (?, ?, ?, ?, ?, ?, ?, 100)`,
        [`cert-${Date.now()}`, userId, course.id, user?.name || 'Estudante', course.title, credId, now]
      );
    }

    const updatedEnrollment = queryOne<any>('SELECT * FROM enrollments WHERE id = ?', [enrollment.id]);
    const lessonProgresses = queryAll<any>('SELECT * FROM lesson_progress WHERE enrollmentId = ?', [enrollment.id]);

    return res.json({
      enrollment: { ...updatedEnrollment, lessonProgresses },
      xpGained,
      completedCount: completedLessons,
      totalCount: totalLessons,
    });
  } catch (err) {
    console.error('Complete lesson error:', err);
    return res.status(500).json({ error: 'Falha ao concluir lição' });
  }
});

export default router;
