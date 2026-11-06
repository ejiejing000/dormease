const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const listing = execSync('node scripts/list-routes.js', { cwd: __dirname + '/..', encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((l) => /^(GET|POST|PATCH|PUT|DELETE) /.test(l))
  .map((l) => {
    const [method, url] = l.split(' ');
    return { method, parts: url.replace(/\/$/, '').split('/').filter(Boolean) };
  });

const collectionPath = path.join(__dirname, '..', '..', 'docs', 'dormease.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const requests = [];
const walk = (items, folder) => items.forEach((item) => {
  if (item.item) return walk(item.item, item.name);
  if (!item.request) return;
  requests.push({ folder, name: item.name, request: item.request });
});
walk(collection.item, '');

const matches = (route, segments) => route.parts.length === segments.length &&
  route.parts.every((seg, i) => seg.startsWith(':') || seg === segments[i]);

const problems = [];
// Requests in the Security checks folder deliberately target paths that must NOT exist.
const intentionallyAbsent = new Set(['/api/auth/register', '/api/does-not-exist']);
let checked = 0;
for (const { folder, name, request } of requests) {
  const raw = (request.url && request.url.raw) || '';
  if (!raw) { problems.push(`${folder} / ${name}: no url`); continue; }
  const withoutQuery = raw.split('?')[0]
    .replace('{{baseUrl}}', 'http://x/api')
    .replace(/\{\{[A-Za-z]+\}\}/g, '1');
  const url = new URL(withoutQuery);
  const segments = url.pathname.split('/').filter(Boolean);
  if (intentionallyAbsent.has(url.pathname)) { checked++; continue; }
  if (url.pathname === '/health') { checked++; continue; }
  const found = listing.filter((r) => r.method === request.method && matches(r, segments));
  checked++;
  if (!found.length) problems.push(`${folder} / ${name}: ${request.method} ${url.pathname} is not a mounted route`);
}
console.log(`checked ${checked} collection requests against ${listing.length} mounted routes`);
if (problems.length) { console.log('PROBLEMS:'); problems.forEach((p) => console.log(' - ' + p)); process.exit(1); }
console.log('every collection request maps to a real endpoint');
