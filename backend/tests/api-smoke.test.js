'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, buildQualityScores, evaluateModuleFormula, canonicalOperationalUnit, normalizeEntry, canAccessModule, authorizeRequestedModules } = require('../server');

test('operational units stay canonical without rewriting historical rows', () => {
  assert.equal(canonicalOperationalUnit('black_bag', 'black_bag_large', 'ใบ'), 'kg');
  assert.equal(canonicalOperationalUnit('consumable', 'seat_cleaner', 'ขวด'), 'แกลลอน');
  assert.equal(canonicalOperationalUnit('tissue', 'tissue_roll', 'ม้วน'), 'ม้วน');
  assert.equal(canonicalOperationalUnit('tissue', 'tissue_hand', 'แผ่น'), 'แพ็ค');
  assert.equal(canonicalOperationalUnit('tissue', 'tissue_popup', 'แพ็ค'), 'แพ็ค');
  assert.equal(normalizeEntry({ module:'black_bag', category_code:'black_bag_large', entry_date:'2026-05-01', quantity:3, unit:'ใบ' }).unit, 'kg');
});

test('Supabase uses an explicit WebSocket transport compatible with Render Node 20', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /safeRequire\('ws'\)/);
  assert.match(source, /realtime:\s*\{\s*transport:\s*WebSocket\s*\}/);
});

test('backend authentication prefers the service role key over a possibly stale anon key', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /supabaseServiceKey \|\| supabaseAnonKey/);
  assert.doesNotMatch(source, /createClient\(supabaseUrl, supabaseAnonKey \|\| supabaseServiceKey/);
});

test('consumable queries include canonical and legacy module codes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /module === 'consumable' \|\| module === 'cleaning_liquid'/);
  assert.match(source, /\['consumable', 'cleaning_liquid'\]/);
  assert.match(source, /databaseModulesFor\(module\)/);
});

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('health endpoint returns JSON and production version', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.status, 'ok');
  });
});

test('unauthenticated me fails closed without leaking a token', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/me`);
    const body = await response.json();
    assert.equal(body.role, 'blocked');
    assert.deepEqual(body.permissions, []);
    assert.equal(Object.hasOwn(body, 'token'), false);
  });
});

test('logout clears both authentication cookies', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /ckap_access_token=/);
    assert.match(cookie, /Max-Age=0/);
  });
});

test('module permissions fail closed and report denied module names', () => {
  const user = { role: 'viewer', permissions: ['modules.rdf.read'] };
  assert.equal(canAccessModule(user, 'rdf', 'read'), true);
  assert.equal(canAccessModule(user, 'recycle', 'read'), false);
  let status = null;
  let payload = null;
  const res = { status(code) { status = code; return this; }, json(value) { payload = value; return value; } };
  const result = authorizeRequestedModules({ user }, res, ['rdf', 'recycle'], 'read');
  assert.equal(result, null);
  assert.equal(status, 403);
  assert.deepEqual(payload.denied_modules, ['recycle']);
});

test('metadata formula and quality engines support calculated and custom modules', () => {
  const rows = [
    { module: 'dog_food', weight_kg: 10, entry_date: '2026-07-01' },
    { module: 'pig_feed', weight_kg: 15, entry_date: '2026-07-01' },
    { module: 'water', quantity: 120, entry_date: '2026-07-01' }
  ];
  assert.equal(evaluateModuleFormula({ formula_type: 'sum_modules', definition: { modules: ['dog_food','pig_feed'], metric: 'weight_kg' } }, rows), 25);
  const scores = buildQualityScores(rows, '2026-07', [{ code:'water', name_th:'น้ำ', input_mode:'monthly', primary_metric:'quantity', active:true }]);
  assert.equal(scores[0].module, 'water');
  assert.equal(scores[0].score, 100);
});
