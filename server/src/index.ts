import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';

import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import quizRoutes from './routes/quizzes.js';
import spaceRoutes from './routes/spaces.js';
import chatRoutes from './routes/chat.js';
import gamificationRoutes from './routes/gamification.js';
import creatorRoutes from './routes/creator.js';
import adminRoutes from './routes/admin.js';
import notesRoutes from './routes/notes.js';
import qaRoutes from './routes/qa.js';
import certificateRoutes from './routes/certificates.js';
import notificationRoutes from './routes/notifications.js';
import socialRoutes from './routes/social.js';
import { setupSocketIO } from './sockets/chatSocket.js';
import { db } from './db.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// 1. Production Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows flexible media streaming & inline assets in dev/prod
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Strict CORS Configuration
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin or allowed origins or Vercel preview deploys
      if (
        !origin || 
        allowedOrigins.includes(origin) || 
        process.env.NODE_ENV !== 'production' || 
        (origin.endsWith('.vercel.app') && process.env.NODE_ENV === 'production')
      ) {
        callback(null, true);
      } else {
        callback(new Error('Origem não autorizada por política de CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Rate Limiting Protection (Anti-Brute Force & DoS)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos pedidos realizados a partir deste endereço. Tente novamente mais tarde.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Limit auth attempts to 100 per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de autenticação. Por favor, aguarde alguns minutos.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// 4. Request Parsers with strict size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

setupSocketIO(io);

// 6. Health Check Endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: 'LearnSpace',
    tagline: 'Aprender. Conectar. Evoluir.',
    environment: process.env.NODE_ENV || 'development',
    database: 'SQLite (Direct Prepared Queries - WAL Mode)',
    timestamp: new Date().toISOString(),
  });
});

// 7. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api', chatRoutes); // /api/channels, /api/messages
app.use('/api/gamification', gamificationRoutes);
app.use('/api/creator', creatorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/social', socialRoutes);

// 8. Global Error Handler (Hides internal stack traces in production)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Ocorreu um erro interno no servidor.' 
    : err.message || 'Erro no servidor';

  res.status(status).json({ error: message });
});

// 9. Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('Fechando servidor e conexões da base de dados...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 LearnSpace API em execução em http://localhost:${PORT}`);
  console.log(`🛡️  Segurança de produção ativada (Helmet, Rate Limiter, SQL Prepared Statements)`);
  console.log(`📡 Socket.IO em tempo real pronto`);
});
