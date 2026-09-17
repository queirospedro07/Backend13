import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export function initializeSchemaAndSeed(db: Database.Database) {
  // 1. Create Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      avatarUrl TEXT,
      bio TEXT,
      location TEXT,
      streakDays INTEGER NOT NULL DEFAULT 0,
      lastActiveDate TEXT,
      dailyGoalMinutes INTEGER NOT NULL DEFAULT 45,
      minutesToday INTEGER NOT NULL DEFAULT 0,
      totalMinutes INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      isSuspended INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE NOT NULL,
      headline TEXT,
      website TEXT,
      github TEXT,
      twitter TEXT,
      linkedin TEXT,
      isPublic INTEGER NOT NULL DEFAULT 1,
      showStreak INTEGER NOT NULL DEFAULT 1,
      showLeaderboard INTEGER NOT NULL DEFAULT 1,
      themePreference TEXT NOT NULL DEFAULT 'light',
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'Intermediate',
      thumbnailUrl TEXT,
      bannerUrl TEXT,
      price REAL NOT NULL DEFAULT 0.0,
      isFree INTEGER NOT NULL DEFAULT 1,
      isPublished INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      durationHours REAL NOT NULL DEFAULT 10.0,
      language TEXT NOT NULL DEFAULT 'Português',
      creatorId TEXT NOT NULL,
      spaceId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(creatorId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_modules (
      id TEXT PRIMARY KEY,
      courseId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      moduleId TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'video',
      content TEXT,
      videoUrl TEXT,
      durationMin INTEGER NOT NULL DEFAULT 15,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      xpReward INTEGER NOT NULL DEFAULT 25,
      FOREIGN KEY(moduleId) REFERENCES course_modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      courseId TEXT NOT NULL,
      enrolledAt TEXT NOT NULL,
      completedAt TEXT,
      progressPercent REAL NOT NULL DEFAULT 0,
      lastLessonId TEXT,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(userId, courseId)
    );

    CREATE TABLE IF NOT EXISTS lesson_progress (
      id TEXT PRIMARY KEY,
      enrollmentId TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT,
      timeSpentSeconds INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(enrollmentId) REFERENCES enrollments(id) ON DELETE CASCADE,
      FOREIGN KEY(lessonId) REFERENCES lessons(id) ON DELETE CASCADE,
      UNIQUE(enrollmentId, lessonId)
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      iconUrl TEXT,
      bannerUrl TEXT,
      isPrivate INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      memberCount INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      spaceId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      topic TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      isVoice INTEGER NOT NULL DEFAULT 0,
      isLocked INTEGER NOT NULL DEFAULT 0,
      guidingQuestion TEXT,
      guidelines TEXT,
      FOREIGN KEY(spaceId) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      spaceId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      joinedAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(spaceId) REFERENCES spaces(id) ON DELETE CASCADE,
      UNIQUE(userId, spaceId)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      userId TEXT NOT NULL,
      content TEXT NOT NULL,
      parentId TEXT,
      attachments TEXT,
      isPinned INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      userId TEXT NOT NULL,
      emoji TEXT NOT NULL,
      FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(messageId, userId, emoji)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      lessonId TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      passingScore INTEGER NOT NULL DEFAULT 70,
      xpReward INTEGER NOT NULL DEFAULT 50,
      FOREIGN KEY(lessonId) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quizId TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      correctOptionIndex INTEGER NOT NULL,
      explanation TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(quizId) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quizId TEXT NOT NULL,
      userId TEXT NOT NULL,
      score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      attemptedAt TEXT NOT NULL,
      FOREIGN KEY(quizId) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      xpReward INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      achievementId TEXT NOT NULL,
      unlockedAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(achievementId) REFERENCES achievements(id) ON DELETE CASCADE,
      UNIQUE(userId, achievementId)
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      courseId TEXT NOT NULL,
      recipientName TEXT NOT NULL,
      courseTitle TEXT NOT NULL,
      credentialId TEXT UNIQUE NOT NULL,
      issuedAt TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 100,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(lessonId) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS qa_questions (
      id TEXT PRIMARY KEY,
      courseId TEXT NOT NULL,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      isAnswered INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS qa_answers (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      body TEXT NOT NULL,
      isAccepted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(questionId) REFERENCES qa_questions(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      link TEXT,
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requesterId TEXT NOT NULL,
      addresseeId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(requesterId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(addresseeId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(requesterId, addresseeId)
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      followerId TEXT NOT NULL,
      followingId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(followerId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(followingId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(followerId, followingId)
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      senderId TEXT NOT NULL,
      receiverId TEXT NOT NULL,
      content TEXT NOT NULL,
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(senderId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(receiverId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indices for high performance queries
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
    CREATE INDEX IF NOT EXISTS idx_courses_creator ON courses(creatorId);
    CREATE INDEX IF NOT EXISTS idx_modules_course ON course_modules(courseId);
    CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(moduleId);
    CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(userId);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(courseId);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channelId);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId);
    CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requesterId, addresseeId);
    CREATE INDEX IF NOT EXISTS idx_follows_users ON follows(followerId, followingId);
    CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(senderId, receiverId);
  `);

  // 2. Check if seeding is needed
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    seedData(db);
  }
}

function seedData(db: Database.Database) {
  const passwordHash = bcrypt.hashSync('password123', 10);
  const now = new Date().toISOString();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, username, passwordHash, name, role, avatarUrl, bio, location, streakDays, dailyGoalMinutes, minutesToday, totalMinutes, xp, level, isSuspended, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const insertProfile = db.prepare(`
    INSERT INTO profiles (id, userId, headline, website, github, twitter, linkedin, isPublic, showStreak, showLeaderboard, themePreference)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'light')
  `);

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, slug, description, icon)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, slug, description, category, difficulty, thumbnailUrl, bannerUrl, price, isFree, isPublished, featured, durationHours, language, creatorId, spaceId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertModule = db.prepare(`
    INSERT INTO course_modules (id, courseId, title, description, orderIndex)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertLesson = db.prepare(`
    INSERT INTO lessons (id, moduleId, title, type, content, videoUrl, durationMin, orderIndex, xpReward)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSpace = db.prepare(`
    INSERT INTO spaces (id, name, slug, description, iconUrl, bannerUrl, isPrivate, category, ownerId, memberCount, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, spaceId, name, type, topic, orderIndex, isVoice, isLocked, guidingQuestion, guidelines)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMembership = db.prepare(`
    INSERT INTO memberships (id, userId, spaceId, role, joinedAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEnrollment = db.prepare(`
    INSERT INTO enrollments (id, userId, courseId, enrolledAt, progressPercent, lastLessonId)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAchievement = db.prepare(`
    INSERT INTO achievements (id, slug, title, description, icon, category, rarity, xpReward)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertUserAchievement = db.prepare(`
    INSERT INTO user_achievements (id, userId, achievementId, unlockedAt)
    VALUES (?, ?, ?, ?)
  `);

  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, userId, type, title, content, link, isRead, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (id, lessonId, title, description, passingScore, xpReward)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertQuizQuestion = db.prepare(`
    INSERT INTO quiz_questions (id, quizId, question, options, correctOptionIndex, explanation, orderIndex)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    // 1. Users
    insertUser.run(
      'user-pedro',
      'pedro@learnspace.io',
      'pedro',
      passwordHash,
      'Pedro Silva',
      'STUDENT',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      'Estudante entusiasmado de engenharia de software e arquiteturas modernas.',
      'Lisboa, Portugal',
      12,
      60,
      42,
      1480,
      1450,
      4,
      now,
      now
    );
    insertProfile.run('prof-pedro', 'user-pedro', 'Estudante Full Stack & Aprendiz Contínuo', 'https://learnspace.io', 'https://github.com', '', '', );

    insertUser.run(
      'user-sarah',
      'sarah@learnspace.io',
      'sarah_dev',
      passwordHash,
      'Sarah Jenkins',
      'CREATOR',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      'Arquiteta Frontend e Criadora de Cursos Avançados de React & TypeScript.',
      'Porto, Portugal',
      45,
      90,
      85,
      8900,
      8900,
      15,
      now,
      now
    );
    insertProfile.run('prof-sarah', 'user-sarah', 'Arquiteta de Software & Criadora', 'https://sarahjenkins.dev', 'https://github.com', '', '', );

    insertUser.run(
      'user-alex',
      'alex@learnspace.io',
      'alex_admin',
      passwordHash,
      'Alex Vance',
      'ADMIN',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      'Administrador de infraestrutura e gestor sénior da plataforma LearnSpace.',
      'Braga, Portugal',
      120,
      120,
      120,
      25400,
      25400,
      32,
      now,
      now
    );
    insertProfile.run('prof-alex', 'user-alex', 'Administrador de Sistemas LearnSpace', '', 'https://github.com', '', '', );

    // 2. Categories
    insertCategory.run('cat-prog', 'Programação & Engenharia', 'programming', 'Desenvolvimento Web, APIs e Engenharia de Software', 'Code');
    insertCategory.run('cat-design', 'Design & UX/UI', 'design', 'Design Systems, Interfaces e Experiência de Utilizador', 'Palette');
    insertCategory.run('cat-ai', 'Inteligência Artificial & Dados', 'ai', 'Machine Learning, Modelos de Linguagem e Python', 'Cpu');
    insertCategory.run('cat-sec', 'Cibersegurança & Redes', 'cybersecurity', 'Segurança Ofensiva e Defensiva', 'ShieldCheck');

    // 3. Spaces
    insertSpace.run(
      'space-react',
      'Comunidade React & TypeScript Master',
      'react-masterclass',
      'Espaço de mentoria, partilha de projetos, dúvidas de código e salas ao vivo com partilha de ecrã.',
      'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=100&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&auto=format&fit=crop&q=80',
      0,
      'programming',
      'user-sarah',
      128,
      now
    );

    // 4. Channels for Space
    insertChannel.run('ch-general', 'space-react', 'geral', 'text', 'Discussões gerais sobre desenvolvimento e a comunidade', 0, 0, 0, 'Qual é o seu objetivo de aprendizagem este mês?', 'Seja respeitoso e ajude os colegas.');
    insertChannel.run('ch-qa', 'space-react', 'duvidas-exercicios', 'text', 'Canal para colocação de dúvidas de código e resolução coletiva', 1, 0, 0, 'Qual foi a mensagem de erro específica ou comportamento inesperado?', 'Inclua excertos de código formatados com sintaxe markdown.');
    insertChannel.run('ch-showcase', 'space-react', 'projetos-showcase', 'text', 'Partilhe os seus projetos e receba feedback detalhado', 2, 0, 0, 'Que desafio técnico superou na construção deste projeto?', 'Adicione links de pré-visualização e repositório.');
    insertChannel.run('ch-voice-1', 'space-react', 'Sala de Estudo 01 (Voz/Vídeo)', 'voice', 'Sala ao vivo com partilha de câmara e ecrã em direto', 3, 1, 0, 'Que tópico está a estudar em grupo neste momento?', 'Mantenha o microfone em silêncio quando não estiver a falar.');

    // 5. Memberships
    insertMembership.run('mem-1', 'user-sarah', 'space-react', 'OWNER', now);
    insertMembership.run('mem-2', 'user-pedro', 'space-react', 'MEMBER', now);
    insertMembership.run('mem-3', 'user-alex', 'space-react', 'ADMIN', now);

    // 6. Courses
    insertCourse.run(
      'course-react-ts',
      'React 19 & TypeScript de Alta Performance',
      'react-19-typescript-alta-performance',
      'Domine os novos padrões do React 19, Server Components, Gestão de Estado Eficiente, Hooks Modernos e TypeScript Avançado com projetos práticos de produção.',
      'programming',
      'Intermédio',
      'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80',
      0.0,
      1,
      1,
      1,
      14.5,
      'Português',
      'user-sarah',
      'space-react',
      now,
      now
    );

    // 7. Course Modules & Lessons
    insertModule.run('mod-1', 'course-react-ts', 'Módulo 1: Fundamentos do React 19 & TypeScript', 'Conceitos essenciais, tipagem estrita e arquitetura moderna.', 0);
    insertLesson.run('les-1', 'mod-1', '1.1 Introdução e Configuração do Ambiente Moderno', 'video', 'Nesta lição configuramos o TypeScript com configurações estritas e Vite.', 'https://www.w3schools.com/html/mov_bbb.mp4', 12, 0, 30);
    insertLesson.run('les-2', 'mod-1', '1.2 Tipagem Avançada de Hooks & Props', 'video', 'Aprenda a tipar useState, useReducer, useRef e handlers de eventos com rigor.', 'https://www.w3schools.com/html/mov_bbb.mp4', 18, 1, 35);
    insertLesson.run('les-3', 'mod-1', '1.3 Questionário de Avaliação: Fundamentos', 'quiz', 'Avalie a sua compreensão sobre tipagem de componentes.', '', 10, 2, 50);

    insertModule.run('mod-2', 'course-react-ts', 'Módulo 2: Otimização & Performance', 'Técnicas de renderização, memoização e arquitetura de componentes escaláveis.', 1);
    insertLesson.run('les-4', 'mod-2', '2.1 Estratégias de Memoização Inteligente', 'video', 'Quando e como usar useMemo e useCallback sem prejudicar o ciclo de renderização.', 'https://www.w3schools.com/html/mov_bbb.mp4', 22, 0, 40);

    // 8. Quiz
    insertQuiz.run('quiz-1', 'les-3', 'Questionário: Fundamentos do React com TypeScript', 'Teste prático de 2 perguntas essenciais de arquitetura.', 70, 50);
    insertQuizQuestion.run('qq-1', 'quiz-1', 'Qual é a forma recomendada de tipar as propriedades de um componente React funcional?', JSON.stringify(['Usando interface ou type dedicado', 'Utilizando tipo "any"', 'Não definindo tipos', 'Utilizando a função Object']), 0, 'Interfaces e types dedicados garantem verificação em tempo de compilação.', 0);
    insertQuizQuestion.run('qq-2', 'quiz-1', 'Qual o benefício principal do modo estrito do TypeScript no React?', JSON.stringify(['Reduzir bugs e detetar referências nulas', 'Aumentar a velocidade da internet', 'Adicionar animações CSS automáticas', 'Ignorar erros de sintaxe']), 0, 'O modo estrito previne erros comuns como acesso a propriedades nulas ou indefinidas.', 1);

    // 9. Enrollment
    insertEnrollment.run('enr-pedro-1', 'user-pedro', 'course-react-ts', now, 50.0, 'les-2');

    // 10. Achievements
    insertAchievement.run('ach-first-step', 'primeiro-passo', 'Primeiro Passo', 'Concluiu a sua primeira lição na plataforma LearnSpace.', 'CheckCircle2', 'learning', 'Comum', 100);
    insertAchievement.run('ach-quiz-master', 'mestre-quizzes', 'Mestre dos Questionários', 'Acertou 100% num questionário de avaliação técnica.', 'Award', 'quiz', 'Raro', 250);
    insertAchievement.run('ach-streak-7', 'consistencia-7', 'Foco de Aço (7 Dias)', 'Manteve uma sequência ativa de estudo durante 7 dias consecutivos.', 'Flame', 'streak', 'Épico', 500);

    insertUserAchievement.run('uach-1', 'user-pedro', 'ach-first-step', now);

    // 11. Welcome Notification
    insertNotification.run('notif-1', 'user-pedro', 'achievement', 'Bem-vindo ao LearnSpace!', 'Aceda aos seus cursos e participe nas salas de estudo ao vivo.', '/explore', 0, now);
  });

  txn();
}
