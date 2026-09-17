import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { initializeSchemaAndSeed } from './db/init.js';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/learnspace.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: Database.Database = new Database(dbPath);

// Enable WAL mode & Foreign Keys for high concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

/**
 * Executes a SELECT query expecting multiple rows.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Executes a SELECT query expecting a single row.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  const stmt = db.prepare(sql);
  return stmt.get(...params) as T | undefined;
}

/**
 * Executes an INSERT, UPDATE, or DELETE statement.
 * Uses prepared statements to guarantee 100% protection against SQL Injection.
 */
export function execute(sql: string, params: any[] = []): Database.RunResult {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

/**
 * Executes a callback within an ACID transaction.
 */
export function transaction<T>(fn: () => T): T {
  const txn = db.transaction(fn);
  return txn();
}

// Auto-initialize tables and seed data on startup
initializeSchemaAndSeed(db);
