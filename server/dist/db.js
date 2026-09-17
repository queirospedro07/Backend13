"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.queryAll = queryAll;
exports.queryOne = queryOne;
exports.execute = execute;
exports.transaction = transaction;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const init_js_1 = require("./db/init.js");
dotenv_1.default.config();
const dbPath = process.env.DATABASE_PATH || path_1.default.resolve(process.cwd(), 'data/learnspace.db');
const dbDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(dbPath);
// Enable WAL mode & Foreign Keys for high concurrency and performance
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
exports.db.pragma('synchronous = NORMAL');
/**
 * Executes a SELECT query expecting multiple rows.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
function queryAll(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    return stmt.all(...params);
}
/**
 * Executes a SELECT query expecting a single row.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
function queryOne(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    return stmt.get(...params);
}
/**
 * Executes an INSERT, UPDATE, or DELETE statement.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
function execute(sql, params = []) {
    const stmt = exports.db.prepare(sql);
    return stmt.run(...params);
}
/**
 * Executes a callback within an ACID transaction.
 */
function transaction(fn) {
    const txn = exports.db.transaction(fn);
    return txn();
}
// Auto-initialize tables and seed data on startup
(0, init_js_1.initializeSchemaAndSeed)(exports.db);
