"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const courses_js_1 = __importDefault(require("./routes/courses.js"));
const quizzes_js_1 = __importDefault(require("./routes/quizzes.js"));
const spaces_js_1 = __importDefault(require("./routes/spaces.js"));
const chat_js_1 = __importDefault(require("./routes/chat.js"));
const gamification_js_1 = __importDefault(require("./routes/gamification.js"));
const creator_js_1 = __importDefault(require("./routes/creator.js"));
const admin_js_1 = __importDefault(require("./routes/admin.js"));
const notes_js_1 = __importDefault(require("./routes/notes.js"));
const qa_js_1 = __importDefault(require("./routes/qa.js"));
const certificates_js_1 = __importDefault(require("./routes/certificates.js"));
const notifications_js_1 = __importDefault(require("./routes/notifications.js"));
const social_js_1 = __importDefault(require("./routes/social.js"));
const chatSocket_js_1 = require("./sockets/chatSocket.js");
const db_js_1 = require("./db.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
// 1. Production Security Headers with Helmet
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Allows flexible media streaming & inline assets in dev/prod
    crossOriginEmbedderPolicy: false,
}));
// 2. Strict CORS Configuration
const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map(url => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
}
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin or allowed origins or Vercel preview deploys
        if (!origin ||
            allowedOrigins.includes(origin) ||
            process.env.NODE_ENV !== 'production' ||
            (origin.endsWith('.vercel.app') && process.env.NODE_ENV === 'production')) {
            callback(null, true);
        }
        else {
            callback(new Error('Origem não autorizada por política de CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// 3. Rate Limiting Protection (Anti-Brute Force & DoS)
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitos pedidos realizados a partir deste endereço. Tente novamente mais tarde.' },
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100, // Limit auth attempts to 100 per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas tentativas de autenticação. Por favor, aguarde alguns minutos.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);
// 4. Request Parsers with strict size limits
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// 5. Socket.IO Setup
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
(0, chatSocket_js_1.setupSocketIO)(io);
// 6. Health Check Endpoint
app.get('/api/health', (req, res) => {
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
app.use('/api/auth', auth_js_1.default);
app.use('/api/courses', courses_js_1.default);
app.use('/api/quizzes', quizzes_js_1.default);
app.use('/api/spaces', spaces_js_1.default);
app.use('/api', chat_js_1.default); // /api/channels, /api/messages
app.use('/api/gamification', gamification_js_1.default);
app.use('/api/creator', creator_js_1.default);
app.use('/api/admin', admin_js_1.default);
app.use('/api/notes', notes_js_1.default);
app.use('/api/qa', qa_js_1.default);
app.use('/api/certificates', certificates_js_1.default);
app.use('/api/notifications', notifications_js_1.default);
app.use('/api/social', social_js_1.default);
// 8. Global Error Handler (Hides internal stack traces in production)
app.use((err, req, res, next) => {
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
        db_js_1.db.close();
        process.exit(0);
    });
});
server.listen(PORT, () => {
    console.log(`🚀 LearnSpace API em execução em http://localhost:${PORT}`);
    console.log(`🛡️  Segurança de produção ativada (Helmet, Rate Limiter, SQL Prepared Statements)`);
    console.log(`📡 Socket.IO em tempo real pronto`);
});
