import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, execute, transaction } from '../db.js';
import { AuthRequest, authenticate } from '../middleware/auth.js';
import { signJwtToken } from '../config/jwt.js';

const router = Router();

function generateToken(user: { id: string; email: string; username: string; role: string }) {
  return signJwtToken(user);
}

// POST /api/auth/register
router.post('/register', async (req, res: Response) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    // Check existing user with direct parameterized query
    const existing = queryOne(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [cleanEmail, cleanUsername]
    );

    if (existing) {
      return res.status(400).json({ error: 'Já existe uma conta com este e-mail ou nome de utilizador' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;

    // Execute atomic transaction for user + profile + notification
    transaction(() => {
      execute(
        `INSERT INTO users (id, email, username, passwordHash, name, role, avatarUrl, bio, location, streakDays, dailyGoalMinutes, minutesToday, totalMinutes, xp, level, isSuspended, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'STUDENT', ?, '', '', 1, 45, 0, 0, 100, 1, 0, ?, ?)`,
        [userId, cleanEmail, cleanUsername, passwordHash, name, avatarUrl, now, now]
      );

      execute(
        `INSERT INTO profiles (id, userId, headline, isPublic, showStreak, showLeaderboard, themePreference)
         VALUES (?, ?, 'Novo Estudante LearnSpace', 1, 1, 1, 'light')`,
        [`prof-${userId}`, userId]
      );

      execute(
        `INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt)
         VALUES (?, ?, 'achievement', 'Bem-vindo ao LearnSpace!', 'Explore o catálogo de cursos e junte-se aos espaços da comunidade.', '/explore', 0, ?)`,
        [`notif-${Date.now()}`, userId, now]
      );
    });

    const user = {
      id: userId,
      name,
      username: cleanUsername,
      email: cleanEmail,
      role: 'STUDENT',
      avatarUrl,
      xp: 100,
      level: 1,
      streakDays: 1,
    };

    const token = generateToken(user);

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Falha ao criar conta no servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res: Response) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Nome de utilizador/Email e palavra-passe são obrigatórios' });
    }

    const cleanLogin = login.toLowerCase().trim();

    // Query user with direct parameterized query
    const user = queryOne<any>(
      `SELECT u.*, p.headline, p.website, p.github, p.twitter, p.linkedin, p.themePreference
       FROM users u
       LEFT JOIN profiles p ON u.id = p.userId
       WHERE u.email = ? OR u.username = ?`,
      [cleanLogin, cleanLogin]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'Esta conta foi suspensa pela administração.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken(user);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        xp: user.xp,
        level: user.level,
        streakDays: user.streakDays,
        dailyGoalMinutes: user.dailyGoalMinutes,
        minutesToday: user.minutesToday,
        profile: {
          headline: user.headline,
          website: user.website,
          github: user.github,
          twitter: user.twitter,
          linkedin: user.linkedin,
          themePreference: user.themePreference,
        },
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Falha na autenticação' });
  }
});

// GET /api/auth/demo/:role - Disabled in production for real user security
router.get('/demo/:role', async (req, res: Response) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_LOGIN !== 'true') {
    return res.status(403).json({ 
      error: 'Acesso de demonstração desativado por motivos de segurança. Por favor, autentique-se com credenciais reais.' 
    });
  }

  try {
    const { role } = req.params;
    let username = 'pedro';
    if (role === 'creator') username = 'sarah_dev';
    if (role === 'admin') username = 'alex_admin';

    const user = queryOne<any>(
      `SELECT u.*, p.headline, p.website, p.github, p.twitter, p.linkedin, p.themePreference
       FROM users u
       LEFT JOIN profiles p ON u.id = p.userId
       WHERE u.username = ?`,
      [username]
    );

    if (!user) {
      return res.status(404).json({ error: 'Conta de demonstração não encontrada' });
    }

    const token = generateToken(user);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        xp: user.xp,
        level: user.level,
        streakDays: user.streakDays,
        dailyGoalMinutes: user.dailyGoalMinutes,
        minutesToday: user.minutesToday,
        profile: {
          headline: user.headline,
          website: user.website,
          github: user.github,
          twitter: user.twitter,
          linkedin: user.linkedin,
          themePreference: user.themePreference,
        },
      },
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar conta de demonstração' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = queryOne<any>(
      `SELECT u.*, p.headline, p.website, p.github, p.twitter, p.linkedin, p.themePreference,
       (SELECT COUNT(*) FROM user_achievements WHERE userId = u.id) as achievementsCount
       FROM users u
       LEFT JOIN profiles p ON u.id = p.userId
       WHERE u.id = ?`,
      [req.user!.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    return res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      location: user.location,
      xp: user.xp,
      level: user.level,
      streakDays: user.streakDays,
      dailyGoalMinutes: user.dailyGoalMinutes,
      minutesToday: user.minutesToday,
      totalMinutes: user.totalMinutes,
      profile: {
        headline: user.headline,
        website: user.website,
        github: user.github,
        twitter: user.twitter,
        linkedin: user.linkedin,
        themePreference: user.themePreference,
      },
      achievementsCount: user.achievementsCount || 0,
      createdAt: user.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter perfil' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, location, avatarUrl, headline, github, twitter, linkedin, themePreference } = req.body;
    const now = new Date().toISOString();

    transaction(() => {
      execute(
        `UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), location = COALESCE(?, location), avatarUrl = COALESCE(?, avatarUrl), updatedAt = ? WHERE id = ?`,
        [name, bio, location, avatarUrl, now, req.user!.id]
      );

      const profileExists = queryOne('SELECT id FROM profiles WHERE userId = ?', [req.user!.id]);
      if (profileExists) {
        execute(
          `UPDATE profiles SET headline = COALESCE(?, headline), github = COALESCE(?, github), twitter = COALESCE(?, twitter), linkedin = COALESCE(?, linkedin), themePreference = COALESCE(?, themePreference) WHERE userId = ?`,
          [headline, github, twitter, linkedin, themePreference, req.user!.id]
        );
      } else {
        execute(
          `INSERT INTO profiles (id, userId, headline, github, twitter, linkedin, themePreference) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`prof-${req.user!.id}`, req.user!.id, headline, github, twitter, linkedin, themePreference || 'light']
        );
      }
    });

    const updated = queryOne<any>(
      `SELECT u.*, p.headline, p.website, p.github, p.twitter, p.linkedin, p.themePreference
       FROM users u
       LEFT JOIN profiles p ON u.id = p.userId
       WHERE u.id = ?`,
      [req.user!.id]
    );

    return res.json({ user: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao atualizar perfil' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res: Response) => {
  const { email } = req.body;
  return res.json({ message: `Ligação de recuperação enviada para ${email || 'o seu e-mail'}.` });
});

export default router;
