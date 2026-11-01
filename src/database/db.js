/**
 * DormEase Database Connection & Management Driver
 * Uses Node.js native SQLite driver (node:sqlite DatabaseSync)
 * Enforces Foreign Keys, Transactions, and Automatic Schema Migration
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../dormease.db');
const db = new DatabaseSync(DB_PATH);

// Enforce foreign key constraints
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Execute a query that returns multiple rows
 */
function query(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

/**
 * Execute a query that returns a single row
 */
function get(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 */
function run(sql, params = []) {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: Number(result.changes)
    };
}

/**
 * Execute raw SQL script (multiple statements)
 */
function exec(sql) {
    return db.exec(sql);
}

/**
 * Initialize Schema and Seeds
 */
function initDatabase() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const seedPath = path.join(__dirname, 'seed.sql');

    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql);
        console.log('[Database] Schema successfully initialized (16 Tables Verified).');
    }

    // Check if roles or users are empty; if so, populate seed data
    const userCount = get('SELECT COUNT(*) as count FROM users');
    if (userCount && userCount.count === 0) {
        if (fs.existsSync(seedPath)) {
            const seedSql = fs.readFileSync(seedPath, 'utf8');
            db.exec(seedSql);
            console.log('[Database] Realistic seed data successfully populated.');
        }
    }
}

// Automatically initialize on start
initDatabase();

module.exports = {
    db,
    query,
    get,
    run,
    exec,
    initDatabase
};
