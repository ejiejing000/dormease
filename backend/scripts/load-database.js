// Loads the member-owned SQL fragments in database/schema and database/seed through the app's
// own MySQL driver, so setup needs no mysql client on PATH and no password on the command line.
// Files are applied in filename order: 01..06 are the six members and 99 is the guarded
// integration file. A seed fragment whose tables have not merged yet is skipped with a message.
//
//   npm run db:setup                     -> target DB from DB_NAME in .env
//   npm run db:setup -- --db dormease_test
//   npm run db:setup -- --skip-seed      -> structure only
//   npm run db:setup -- --fresh          -> drop the target DB and rebuild it from scratch
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PROTECTED_DATABASES = ['mysql', 'information_schema', 'performance_schema', 'sys'];
const root = path.join(__dirname, '..', '..');
const schemaDir = path.join(root, 'database', 'schema');
const seedDir = path.join(root, 'database', 'seed');

const sqlFiles = (dir) => fs.readdirSync(dir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => path.join(dir, file));

// Tables a seed fragment reads or writes, used to skip a fragment whose owner has not merged yet
// instead of failing halfway through a partial branch. FROM/JOIN catches seeds that look a row up
// in another feature's table rather than hard-coding its id.
function referencedTables(sql) {
  const body = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*(?:--|#).*$/gm, ' ');
  const names = new Set();
  for (const match of body.matchAll(/\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?/gi)) names.add(match[1]);
  for (const match of body.matchAll(/\bUPDATE\s+`?(\w+)`?/gi)) names.add(match[1]);
  for (const match of body.matchAll(/\bDELETE\s+FROM\s+`?(\w+)`?/gi)) names.add(match[1]);
  for (const match of body.matchAll(/\b(?:FROM|JOIN)\s+`?(\w+)`?/gi)) {
    if (!['select', 'dual'].includes(match[1].toLowerCase())) names.add(match[1]);
  }
  return [...names];
}

// Foreign keys only require the two integer columns to agree on width and signedness, so those
// are the only parts worth comparing; comparing the raw text would flag harmless differences.
function keyType(type) {
  const match = String(type).match(/^(tinyint|smallint|mediumint|bigint|int(?:eger)?)\b\s*(unsigned)?/i);
  return match ? `${match[1].toLowerCase()} ${match[2] ? 'unsigned' : 'signed'}` : String(type).toLowerCase();
}

// The primary key column of every table the fragments declare, used to notice a database written
// against an older version of it. Inline foreign keys are only applied when a table is created,
// so a drifted key type otherwise surfaces mid-load as an "incompatible column" error that
// names neither the old table nor the fact that the database needs rebuilding.
function declaredKeyColumns(sql) {
  const columns = {};
  for (const statement of statements(sql)) {
    const table = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
    const column = statement.match(/^\s*`?(\w+)`?\s+([A-Za-z]\w*(?:\([^)]*\))?(?:\s+(?:UNSIGNED|SIGNED))?)[^,\n]*\bPRIMARY\s+KEY\b/im);
    if (table && column) columns[table[1]] = { col: column[1], type: column[2] };
  }
  return columns;
}

// Statement splitter that respects the client-side DELIMITER command, quoted strings,
// backslash escapes, and -- / # / block comments.
function statements(sql) {
  const result = [];
  let delimiter = ';';
  let buffer = '';
  const flush = () => {
    const text = buffer.trim();
    buffer = '';
    if (text && text !== delimiter && text.replace(/^(--|#).*$/gm, '').trim()) result.push(text);
  };
  for (const line of sql.split(/\r?\n/)) {
    const change = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (change) { flush(); delimiter = change[1]; continue; }
    buffer += `${line}\n`;
    const body = buffer.replace(/\s+$/, '');
    if (!body.endsWith(delimiter)) continue;
    const withoutDelimiter = body.slice(0, -delimiter.length);
    // Only a real statement end if we are not standing inside a quoted string.
    const quotes = (withoutDelimiter.match(/(?<!\\)['"]/g) || []).length;
    if (quotes % 2) continue;
    buffer = '';
    const text = withoutDelimiter.trim();
    // A chunk that is only comments (or only the delimiter) is not a statement.
    if (!text || text === delimiter) continue;
    if (!text.replace(/^(--|#)[^\n]*$/gm, '').trim()) continue;
    result.push(text);
  }
  flush();
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dbFlag = args.indexOf('--db');
  const database = dbFlag === -1 ? (process.env.DB_NAME || 'dormease') : args[dbFlag + 1];
  const skipSeed = args.includes('--skip-seed');
  const fresh = args.includes('--fresh');
  const schemaFiles = sqlFiles(schemaDir);
  const seedFiles = skipSeed ? [] : sqlFiles(seedDir);
  const target = database.replace(/`/g, '');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false
  });

  if (fresh) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('--fresh drops the target database and refuses to run with NODE_ENV=production');
    }
    if (PROTECTED_DATABASES.includes(target.toLowerCase())) {
      throw new Error(`--fresh will not drop the system database "${target}"`);
    }
    await connection.query(`DROP DATABASE IF EXISTS \`${target}\``);
  }

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${target}\``);

  const schemaSql = schemaFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const declared = declaredKeyColumns(schemaSql);
  const [liveKeys] = await connection.query(
    `SELECT tc.table_name AS t, kcu.column_name AS col, c.column_type AS type
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_schema = tc.constraint_schema
        AND kcu.table_name = tc.table_name AND kcu.constraint_name = tc.constraint_name
       JOIN information_schema.columns c
         ON c.table_schema = tc.table_schema
        AND c.table_name = tc.table_name AND c.column_name = kcu.column_name
      WHERE tc.constraint_schema = ? AND tc.constraint_type = 'PRIMARY KEY'`, [target]);
  // Only tables the fragments also create are compared, and only on the column its own primary key
  // uses, so an unrelated legacy table in the same database never blocks setup.
  const drifted = liveKeys.filter((row) => {
    const wanted = declared[row.t];
    return wanted && wanted.col === row.col && keyType(row.type) !== keyType(wanted.type);
  });

  if (drifted.length) {
    await connection.end();
    console.error(`\n${drifted.length} pre-existing table(s) in "${target}" use a primary key type that
the database/schema fragments no longer declare, so their foreign keys cannot be created:
${drifted.map((row) => `  - ${row.t}.${row.col}: ${row.type} in the database, ${declared[row.t].type.toLowerCase()} in the fragments`).join('\n')}

CREATE TABLE IF NOT EXISTS keeps those tables as they are, and the forward-migration step in
99_integration.sql only adds columns -- it cannot change the type of a key that other tables reference.
Rebuild the database (this deletes everything in it):
  npm run db:setup -- --fresh${dbFlag === -1 ? '' : ` --db ${database}`}`);
    process.exit(1);
  }

  let executed = 0;
  async function apply(file, sql) {
    for (const statement of statements(sql)) {
      // The scripts name the demo database; the connection already selects the target.
      if (/^(USE|CREATE DATABASE)\b/i.test(statement)) continue;
      try {
        await connection.query(statement);
        executed++;
      } catch (error) {
        console.error(`\n${path.basename(file)}: ${error.message}\n  -> ${statement.slice(0, 160).replace(/\s+/g, ' ')}`);
        throw error;
      }
    }
    console.log(`${path.basename(file)} applied`);
  }

  for (const file of schemaFiles) await apply(file, fs.readFileSync(file, 'utf8'));

  if (seedFiles.length) {
    const [rows] = await connection.query(
      'SELECT TABLE_NAME AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"', [target]);
    const present = new Set(rows.map((row) => row.t));
    for (const file of seedFiles) {
      const sql = fs.readFileSync(file, 'utf8');
      const missing = referencedTables(sql).filter((table) => !present.has(table));
      if (missing.length) {
        console.log(`${path.basename(file)} skipped: ${missing.join(', ')} not merged yet`);
        continue;
      }
      await apply(file, sql);
    }
  }

  const [[{ tables }]] = await connection.query(
    'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"', [database]);
  const [[{ views }]] = await connection.query(
    'SELECT COUNT(*) AS views FROM information_schema.views WHERE table_schema = ?', [database]);
  const [[{ routines }]] = await connection.query(
    'SELECT COUNT(*) AS routines FROM information_schema.routines WHERE routine_schema = ?', [database]);
  const [[{ triggers }]] = await connection.query(
    'SELECT COUNT(*) AS triggers FROM information_schema.triggers WHERE trigger_schema = ?', [database]);
  console.log(`${executed} statements -> ${database}: ${tables} tables, ${views} views, ${routines} routines, ${triggers} triggers`);
  await connection.end();
}

main().catch((error) => { console.error(error.message); process.exit(1); });
