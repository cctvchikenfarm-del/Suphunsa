function safeRequire(packageName) {
  try {
    return require(packageName);
  } catch (error) {
    const isDirectMissingDependency = error && error.code === 'MODULE_NOT_FOUND' && String(error.message || '').includes(packageName);
    if (isDirectMissingDependency) {
      console.error('\nMissing backend dependency: ' + packageName);
      console.error('Run these commands from the project directory:');
      console.error('  cd backend');
      console.error('  npm ci');
      console.error('  npm start\n');
      process.exit(1);
    }
    throw error;
  }
}

const majorNodeVersion = Number(process.versions.node.split('.')[0]);
if (majorNodeVersion >= 22) {
  console.warn('Warning: local Node.js ' + process.version + ' detected. Render is pinned to Node 20.18.0. If npm install fails locally, install Node 20 LTS.');
}

const express = safeRequire('express');
const cors = safeRequire('cors');
const helmet = safeRequire('helmet');
const { z } = safeRequire('zod');
const { createClient } = safeRequire('@supabase/supabase-js');
const WebSocket = safeRequire('ws');
const pptxgen = safeRequire('pptxgenjs');
safeRequire('dotenv').config();

const multer = safeRequire('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { fetchAllPages } = require('./pagination');
const { aggregateChartRows, parseSeriesToken, isDailyAverageEntry, metricValue } = require('./chart-builder');
const { buildMetadataInsights, buildSafeAiPayload } = require('./metadata-insight');
const { parseHygieneWorkbook } = require('./hygiene-import');
const { parseTissueWorkbook } = require('./tissue-import');
const { parseMultiSheetWorkbook, SOURCE_SYSTEM: MULTI_SHEET_SOURCE } = require('./multi-sheet-import');
const { buildMonthlyImagePreview } = require('./monthly-image-import');
const {
  tokenFromRequest,
  refreshTokenFromRequest,
  authCookies,
  clearAuthCookies,
  createRateLimiter
} = require('./security-utils');
const { thailandDate, thailandMonth } = require('./time-utils');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const VERSION = '3.5.13';
const RELEASE_ID = 'CKAP_v3.5.13_STATION_SUMMARY_REPORT_STUDIO';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);
const supabaseClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket }
};
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseServiceKey, supabaseClientOptions) : null;
// Authentication runs on the trusted backend. Prefer the service key so a stale or
// cross-project SUPABASE_ANON_KEY cannot make valid credentials fail with 401.
const authSupabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, supabaseClientOptions)
  : null;

function loginErrorResponse(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (message.includes('email not confirmed') || code === 'email_not_confirmed') {
    return { status: 403, error: 'อีเมลนี้ยังไม่ได้ยืนยัน กรุณายืนยันอีเมลหรือติดต่อ Owner' };
  }
  if (message.includes('invalid api key') || message.includes('api key') || code === 'invalid_api_key') {
    return { status: 503, error: 'การตั้งค่า Supabase ของเซิร์ฟเวอร์ไม่ถูกต้อง กรุณาตรวจ SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY' };
  }
  if (message.includes('user is banned') || code === 'user_banned') {
    return { status: 403, error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ Owner' };
  }
  return { status: 401, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
}

app.use(helmet({ crossOriginResourcePolicy: false }));
const allowedOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(String(origin).replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!origin || allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: 'Origin is not allowed' });
});

const MODULES = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  wet_waste: 'ขยะเปียก',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'น้ำยาต่างๆ'
};

const MODULE_ORDER = ['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'consumable'];
const ALL_PERMISSIONS = [
  'dashboard.read',
  'entries.read', 'entries.create', 'entries.edit', 'entries.delete', 'entries.import', 'entries.export',
  'quality.read',
  'insights.read',
  'fmhy.import',
  'charts.read', 'charts.export',
  'reports.preview', 'reports.export', 'reports.presets.manage',
  'users.read', 'users.manage',
  'roles.read', 'roles.manage',
  'audit.read',
  'automation.read', 'automation.manage', 'automation.run',
  'settings.manage'
];
const ROLE_KEYS = ['owner', 'admin', 'editor', 'viewer'];

function canAssignRole(actor, role) {
  return ROLE_KEYS.includes(role) && (role !== 'owner' || actor?.role === 'owner');
}

async function isLastActiveOwner(profileId) {
  const target = await supabase.from('profiles').select('id,role,active').eq('id', profileId).maybeSingle();
  if (!target.data || target.data.role !== 'owner' || !target.data.active) return false;
  const owners = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('active', true);
  if (owners.error) throw owners.error;
  return Number(owners.count || 0) <= 1;
}

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase is not configured',
      details: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.'
    });
  }
  return next();
}

function monthStart(value) {
  if (!value || !/^\d{4}-\d{2}/.test(value)) return null;
  return `${value.slice(0, 7)}-01`;
}

function cleanDate(value) {
  if (!value) return thailandDate();
  return String(value).slice(0, 10);
}

function toNumberOrNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits });
}

function canonicalOperationalUnit(module, categoryCode, fallback = 'kg') {
  const canonicalModule = module === 'cleaning_liquid' ? 'consumable' : module;
  if (canonicalModule === 'black_bag') return 'kg';
  if (canonicalModule === 'consumable') return 'แกลลอน';
  if (canonicalModule === 'tissue') return categoryCode === 'tissue_roll' ? 'ม้วน' : 'แพ็ค';
  return fallback || 'kg';
}

function normalizeEntry(input) {
  const entryDate = cleanDate(input.entry_date || input.date || monthStart(input.month));
  const periodMonth = monthStart(input.period_month || input.month || entryDate);
  const weight = toNumberOrNull(input.weight_kg);
  const quantity = toNumberOrNull(input.quantity);
  const unitPrice = toNumberOrNull(input.unit_price);
  const explicitAmount = toNumberOrNull(input.amount);
  const computedAmount = weight !== null && unitPrice !== null ? weight * unitPrice : explicitAmount;

  return {
    module: input.module,
    category_code: input.category_code || null,
    entry_date: entryDate,
    period_month: periodMonth,
    material_name: input.material_name || input.material || null,
    weight_kg: weight,
    quantity,
    unit: canonicalOperationalUnit(input.module, input.category_code, input.unit),
    unit_price: unitPrice,
    amount: Number.isFinite(computedAmount) ? Number(computedAmount.toFixed(2)) : null,
    notes: input.notes || null,
    metadata: input.metadata || {}
  };
}

const entrySchemaBase = z.object({
  module: z.string().regex(/^[a-z][a-z0-9_]*$/),
  category_code: z.string().optional().nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-\d{2}(?:-01)?$/).optional(),
  period_month: z.string().regex(/^\d{4}-\d{2}(?:-01)?$/).optional(),
  material_name: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  weight_kg: z.union([z.number(), z.string()]).optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  unit: z.string().optional(),
  unit_price: z.union([z.number(), z.string()]).optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional()
});
const validateEntryFields = (value, ctx) => {
  for (const field of ['weight_kg', 'quantity', 'unit_price', 'amount']) {
    const raw = value[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const number = Number(raw);
    if (!Number.isFinite(number)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must be numeric` });
    else if (number < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must not be negative` });
  }
  const entryDate = value.entry_date || value.date;
  const period = value.period_month || value.month;
  if (entryDate && period && String(entryDate).slice(0, 7) !== String(period).slice(0, 7)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entry_date'], message: 'entry_date must belong to period_month' });
  }
};
const entrySchema = entrySchemaBase.superRefine(validateEntryFields);

async function validateEntryDefinition(entry) {
  const moduleResult = await supabase.from('master_modules').select('code,active,input_mode').eq('code', entry.module).maybeSingle();
  if (moduleResult.error) throw moduleResult.error;
  if (!moduleResult.data || !moduleResult.data.active) return { ok: false, error: 'ไม่พบโมดูลที่เปิดใช้งาน' };
  if (moduleResult.data.input_mode === 'calculated') return { ok: false, error: 'โมดูลคำนวณอัตโนมัติไม่รับการบันทึกโดยตรง' };
  const fieldsResult = await supabase.from('module_fields').select('*').eq('module_code', entry.module).eq('active', true);
  if (fieldsResult.error) throw fieldsResult.error;
  for (const field of fieldsResult.data || []) {
    if (field.data_type === 'calculated') continue;
    const value = entry[field.field_key] ?? entry.metadata?.dynamic_fields?.[field.field_key];
    const missing = value === undefined || value === null || value === '';
    if (field.required && missing) return { ok: false, error: `กรุณากรอก${field.label_th}` };
    if (missing) continue;
    if (['integer', 'decimal'].includes(field.data_type)) {
      const number = Number(value);
      if (!Number.isFinite(number)) return { ok: false, error: `${field.label_th} ต้องเป็นตัวเลข` };
      if (field.data_type === 'integer' && !Number.isInteger(number)) return { ok: false, error: `${field.label_th} ต้องเป็นจำนวนเต็ม` };
      if (field.validation?.min !== undefined && number < Number(field.validation.min)) return { ok: false, error: `${field.label_th} ต่ำกว่าค่าต่ำสุด` };
      if (field.validation?.max !== undefined && number > Number(field.validation.max)) return { ok: false, error: `${field.label_th} สูงกว่าค่าสูงสุด` };
    }
    if (field.data_type === 'select' && Array.isArray(field.options) && field.options.length) {
      const allowed = field.options.map(option => typeof option === 'string' ? option : option.value);
      if (!allowed.includes(value)) return { ok: false, error: `${field.label_th} ไม่อยู่ในตัวเลือกที่กำหนด` };
    }
  }
  return { ok: true };
}

async function getRolePermissions(role) {
  if (!supabase) return ALL_PERMISSIONS;
  if (role === 'owner') return ALL_PERMISSIONS;
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_key', role)
    .eq('allowed', true);
  if (error) {
    if (String(error.message || '').includes('role_permissions')) return [];
    throw error;
  }
  return (data || []).map(row => row.permission_key);
}

async function getUserOverrides(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('user_permission_overrides')
    .select('permission_key, allowed')
    .eq('user_id', userId);
  if (error) {
    if (String(error.message || '').includes('user_permission_overrides')) return [];
    throw error;
  }
  return data || [];
}

async function hydrateUserPermissions(user) {
  const rolePermissions = await getRolePermissions(user.role || 'viewer');
  const permissionSet = new Set(rolePermissions);
  for (const override of await getUserOverrides(user.id)) {
    if (override.allowed) permissionSet.add(override.permission_key);
    else permissionSet.delete(override.permission_key);
  }
  return { ...user, permissions: Array.from(permissionSet) };
}

async function resolveUser(req) {
  const token = tokenFromRequest(req);
  if (!token || !supabase) return { id: null, display_name: 'Unauthenticated', role: 'blocked', permissions: [] };
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return { id: null, display_name: 'Invalid session', role: 'blocked', permissions: [] };
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  if (profileError || !profile || !profile.active) {
    return { id: authData.user.id, email: authData.user.email, display_name: 'Profile unavailable', role: 'blocked', permissions: [], profileExists: false };
  }
  const hydrated = await hydrateUserPermissions(profile);
  return { ...hydrated, profileExists: true };
}

app.use(async (req, res, next) => {
  try {
    req.user = await resolveUser(req);
    next();
  } catch (error) {
    res.status(500).json({ error: 'Permission bootstrap failed', details: error.message });
  }
});

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = new Set(req.user?.permissions || []);
    if (req.user?.role === 'owner' || permissions.has(permission)) return next();
    return res.status(403).json({ error: 'Permission denied', required_permission: permission });
  };
}

function modulePermissionKey(moduleCode, action = 'read') {
  return `modules.${moduleCode}.${action}`;
}

function canAccessModule(user, moduleCode, action = 'read') {
  if (user?.role === 'owner') return true;
  return new Set(user?.permissions || []).has(modulePermissionKey(moduleCode, action));
}

function allowedModuleCodes(user, action = 'read') {
  if (user?.role === 'owner') return null;
  const suffix = `.${action}`;
  return (user?.permissions || [])
    .filter(key => key.startsWith('modules.') && key.endsWith(suffix))
    .map(key => key.slice('modules.'.length, -suffix.length));
}

function authorizeRequestedModules(req, res, requestedModules, action = 'read') {
  const requested = Array.from(new Set((requestedModules || []).filter(Boolean)));
  const denied = requested.filter(code => !canAccessModule(req.user, code, action));
  if (denied.length) {
    res.status(403).json({ error: 'Permission denied for requested modules', denied_modules: denied });
    return null;
  }
  return requested;
}

function requireModuleAccess(moduleCode, req, res, action = 'read') {
  if (moduleCode && canAccessModule(req.user, moduleCode, action)) return true;
  res.status(403).json({ error: 'Permission denied for module', required_permission: modulePermissionKey(moduleCode || 'unknown', action) });
  return false;
}

async function audit(req, action, tableName, recordId, oldData, newData) {
  if (!supabase) return;
  try {
    await supabase.from('audit_logs').insert({
      actor_id: (req.user?.profileExists && req.user?.id) ? req.user.id : null,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData || null,
      new_data: newData || null,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null
    });
  } catch (error) {
    console.warn('Audit log skipped:', error.message);
  }
}

async function getEntriesForMonth(month, modules = MODULE_ORDER) {
  let query = supabase.from('data_entries').select('*').eq('period_month', monthStart(month));
  const normalizedModules = Array.isArray(modules) && modules.length ? modules : MODULE_ORDER;
  const expandedModules = normalizedModules.includes('wet_waste')
    ? Array.from(new Set([...normalizedModules.filter(m => m !== 'wet_waste'), 'dog_food', 'pig_feed']))
    : normalizedModules;
  query = query.in('module', expandedModules).order('module').order('entry_date', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function summarizeRows(rows) {
  const byModule = {};
  for (const row of rows) {
    const monthlyWeight = metricValue(row, 'weight_kg', 'monthly');
    if (!byModule[row.module]) byModule[row.module] = { module: row.module, label: MODULES[row.module] || row.module, weight_kg: 0, quantity: 0, amount: 0, count: 0 };
    byModule[row.module].weight_kg += monthlyWeight;
    byModule[row.module].quantity += Number(row.quantity || 0);
    byModule[row.module].amount += Number(row.amount || 0);
    byModule[row.module].count += 1;
  }
  const wetWeight = (byModule.dog_food?.weight_kg || 0) + (byModule.pig_feed?.weight_kg || 0);
  const wetCount = (byModule.dog_food?.count || 0) + (byModule.pig_feed?.count || 0);
  byModule.wet_waste = { module: 'wet_waste', label: MODULES.wet_waste, weight_kg: wetWeight, quantity: 0, amount: 0, count: wetCount };
  return {
    totals: {
      total_weight_kg: Object.values(byModule).filter(row => row.module !== 'wet_waste').reduce((sum, row) => sum + row.weight_kg, 0),
      total_amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      entry_count: rows.length,
      wet_waste_weight_kg: wetWeight
    },
    modules: MODULE_ORDER.map(module => byModule[module] || { module, label: MODULES[module], weight_kg: 0, quantity: 0, amount: 0, count: 0 })
  };
}

function evaluateModuleFormula(formula, rows) {
  const definition = formula?.definition || {};
  if (formula?.formula_type === 'sum_modules') {
    const modules = Array.isArray(definition.modules) ? definition.modules : [];
    const metric = definition.metric || 'quantity';
    return rows.filter(row => modules.includes(row.module)).reduce((sum, row) => sum + Number(row[metric] ?? row.metadata?.dynamic_fields?.[metric] ?? 0), 0);
  }
  if (formula?.formula_type === 'multiply') {
    const [left, right] = definition.fields || [];
    return rows.filter(row => row.module === formula.module_code).reduce((sum, row) => sum + Number(row[left] ?? row.metadata?.dynamic_fields?.[left] ?? 0) * Number(row[right] ?? row.metadata?.dynamic_fields?.[right] ?? 0), 0);
  }
  if (formula?.formula_type === 'divide') {
    const [numerator, denominator] = definition.fields || [];
    const moduleRows = rows.filter(row => row.module === formula.module_code);
    const top = moduleRows.reduce((sum, row) => sum + Number(row[numerator] ?? row.metadata?.dynamic_fields?.[numerator] ?? 0), 0);
    const bottom = moduleRows.reduce((sum, row) => sum + Number(row[denominator] ?? row.metadata?.dynamic_fields?.[denominator] ?? 0), 0);
    return bottom ? top / bottom : 0;
  }
  return 0;
}


function previousMonth(value) {
  const base = monthStart(value || thailandMonth());
  const date = new Date(`${base}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function percentChange(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!p && !c) return 0;
  if (!p && c) return 100;
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(1));
}

function buildQualityScores(rows, month, definitions = []) {
  const targetMonth = monthStart(month || thailandMonth());
  const moduleDefinitions = definitions.length
    ? definitions.filter(item => item.active !== false && item.input_mode !== 'calculated')
    : ['rdf', 'dog_food', 'pig_feed', 'recycle', 'tissue', 'black_bag', 'consumable'].map(code => ({ code, name_th: MODULES[code], input_mode: ['pig_feed','black_bag','consumable'].includes(code) ? 'monthly' : 'daily', primary_metric: code === 'tissue' || code === 'black_bag' || code === 'consumable' ? 'quantity' : 'weight_kg' }));
  const daysInMonth = new Date(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)), 0).getDate();
  return moduleDefinitions.map(definition => {
    const module = definition.code;
    const moduleRows = rows.filter(row => row.module === module);
    const uniqueDays = new Set(moduleRows.map(row => String(row.entry_date || '').slice(0, 10))).size;
    const expected = ['monthly', 'daily_average'].includes(definition.input_mode) ? 1 : daysInMonth;
    const metric = definition.primary_metric || 'quantity';
    const completedRows = moduleRows.filter(row => row[metric] !== null && row[metric] !== undefined || row.metadata?.dynamic_fields?.[metric] !== null && row.metadata?.dynamic_fields?.[metric] !== undefined).length;
    const completeness = moduleRows.length ? completedRows / moduleRows.length : 0;
    const coverage = Math.min(uniqueDays / expected, 1);
    const score = Math.round((coverage * 70) + (completeness * 30));
    return { module, label: definition.name_th || MODULES[module] || module, score, entries: moduleRows.length, covered_days: uniqueDays, expected_days: expected };
  });
}

function buildAdvancedInsights({ month, rows, previousRows }) {
  const currentSummary = summarizeRows(rows || []);
  const previousSummary = summarizeRows(previousRows || []);
  const qualityScores = buildQualityScores(rows || [], month);
  const trends = MODULE_ORDER.map(module => {
    const current = currentSummary.modules.find(item => item.module === module) || { weight_kg: 0, amount: 0, count: 0 };
    const previous = previousSummary.modules.find(item => item.module === module) || { weight_kg: 0, amount: 0, count: 0 };
    const changePercent = percentChange(current.weight_kg, previous.weight_kg);
    const direction = changePercent > 15 ? 'up' : changePercent < -15 ? 'down' : 'stable';
    const message = direction === 'up'
      ? `${MODULES[module]} เพิ่มขึ้น ${Math.abs(changePercent)}% จากเดือนก่อน`
      : direction === 'down'
        ? `${MODULES[module]} ลดลง ${Math.abs(changePercent)}% จากเดือนก่อน`
        : `${MODULES[module]} ใกล้เคียงเดือนก่อน`;
    return {
      module,
      label: MODULES[module],
      current_weight_kg: Number((current.weight_kg || 0).toFixed(2)),
      previous_weight_kg: Number((previous.weight_kg || 0).toFixed(2)),
      change_percent: changePercent,
      direction,
      current_amount: Number((current.amount || 0).toFixed(2)),
      count: current.count || 0,
      message
    };
  });

  const anomalies = [];
  for (const row of rows || []) {
    const label = MODULES[row.module] || row.module;
    const date = String(row.entry_date || '').slice(0, 10);
    if (Number(row.weight_kg || 0) < 0 || Number(row.quantity || 0) < 0 || Number(row.amount || 0) < 0) {
      anomalies.push({ severity: 'high', module: row.module, label, date, title: 'พบค่าติดลบ', details: 'ควรตรวจสอบน้ำหนัก/จำนวน/ยอดเงิน เพราะเป็นค่าติดลบ', metric_value: row.weight_kg || row.quantity || row.amount });
    }
    if (row.module === 'recycle' && row.weight_kg !== null && row.unit_price !== null && row.amount !== null) {
      const expectedAmount = Number(row.weight_kg || 0) * Number(row.unit_price || 0);
      if (Math.abs(expectedAmount - Number(row.amount || 0)) > 1) {
        anomalies.push({ severity: 'medium', module: row.module, label, date, title: 'ยอดเงินไม่ตรงกับน้ำหนัก x ราคา/กก.', details: `ยอดที่คำนวณได้ ${formatNumber(expectedAmount)} บาท แต่บันทึกไว้ ${formatNumber(row.amount)} บาท`, metric_value: row.amount });
      }
    }
    if (Number(row.weight_kg || 0) === 0 && Number(row.quantity || 0) === 0 && Number(row.amount || 0) === 0) {
      anomalies.push({ severity: 'low', module: row.module, label, date, title: 'รายการไม่มีตัวเลขหลัก', details: 'รายการนี้ยังไม่มีน้ำหนัก จำนวน หรือยอดเงิน', metric_value: 0 });
    }
  }

  for (const module of ['rdf', 'dog_food', 'pig_feed', 'recycle']) {
    const values = (rows || []).filter(row => row.module === module).map(row => Number(row.weight_kg || 0)).filter(value => value > 0);
    if (values.length >= 5) {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
      const sd = Math.sqrt(variance);
      const threshold = avg + (sd * 2);
      const spikeRows = (rows || []).filter(row => row.module === module && Number(row.weight_kg || 0) > threshold && Number(row.weight_kg || 0) > avg * 1.7).slice(0, 3);
      for (const row of spikeRows) {
        anomalies.push({ severity: 'medium', module, label: MODULES[module], date: String(row.entry_date || '').slice(0, 10), title: 'น้ำหนักสูงกว่าค่าปกติ', details: `สูงกว่าค่าเฉลี่ยของเดือน (${formatNumber(avg)} kg) อย่างชัดเจน`, metric_value: row.weight_kg });
      }
    }
  }

  for (const score of qualityScores) {
    if (score.score < 55) {
      anomalies.push({ severity: 'medium', module: score.module, label: score.label, title: 'ข้อมูลยังไม่ครบตามรอบกรอก', details: `ครอบคลุม ${score.covered_days}/${score.expected_days} วัน คะแนน ${score.score}%`, metric_value: score.score });
    }
  }

  const recommendations = [];
  const lowQuality = qualityScores.filter(item => item.score < 70).slice(0, 3);
  if (lowQuality.length) {
    recommendations.push({ priority: 'high', title: 'เติมข้อมูลให้ครบก่อนทำรายงานทางการ', details: `ควรตรวจ ${lowQuality.map(item => item.label).join(', ')} เพราะคะแนนความครบถ้วนต่ำกว่า 70%` });
  }
  const rising = trends.filter(item => item.direction === 'up' && item.change_percent >= 30 && item.current_weight_kg > 0).sort((a, b) => b.change_percent - a.change_percent)[0];
  if (rising) {
    recommendations.push({ priority: 'medium', title: `ตรวจสอบสาเหตุ ${rising.label} เพิ่มขึ้น`, details: `${rising.label} เพิ่มขึ้น ${rising.change_percent}% จากเดือนก่อน ควรดูวันที่/แหล่งที่ทำให้ยอดสูง` });
  }
  const falling = trends.filter(item => item.direction === 'down' && item.previous_weight_kg > 0 && item.current_weight_kg > 0).sort((a, b) => a.change_percent - b.change_percent)[0];
  if (falling) {
    recommendations.push({ priority: 'medium', title: `ติดตาม ${falling.label} ที่ลดลง`, details: `${falling.label} ลดลง ${Math.abs(falling.change_percent)}% อาจเป็นผลจากการคัดแยกดีขึ้น หรือข้อมูลยังกรอกไม่ครบ` });
  }
  const recycle = currentSummary.modules.find(item => item.module === 'recycle') || { weight_kg: 0, amount: 0 };
  if (recycle.weight_kg > 0 && recycle.amount <= 0) {
    recommendations.push({ priority: 'medium', title: 'เพิ่มข้อมูลราคารีไซเคิล', details: 'มีน้ำหนักรีไซเคิลแล้ว แต่ยอดเงินยังเป็นศูนย์ ทำให้รายงานรายได้ไม่สมบูรณ์' });
  }
  if (!recommendations.length) {
    recommendations.push({ priority: 'normal', title: 'ข้อมูลอยู่ในเกณฑ์พร้อมใช้งาน', details: 'ยังไม่พบความผิดปกติสำคัญ สามารถใช้ข้อมูลเพื่อพรีวิวรายงานและสร้าง PowerPoint ได้' });
  }

  const averageQuality = qualityScores.length ? Math.round(qualityScores.reduce((sum, item) => sum + item.score, 0) / qualityScores.length) : 0;
  const highCount = anomalies.filter(item => item.severity === 'high').length;
  const mediumCount = anomalies.filter(item => item.severity === 'medium').length;
  const insightScore = Math.max(0, Math.min(100, averageQuality - (highCount * 15) - (mediumCount * 5)));
  const topWeight = currentSummary.modules.filter(item => item.module !== 'wet_waste').sort((a, b) => b.weight_kg - a.weight_kg)[0];
  const headline = topWeight && topWeight.weight_kg > 0
    ? `เดือนนี้ ${topWeight.label} มีน้ำหนักสูงสุด ${formatNumber(topWeight.weight_kg)} kg และคะแนนความพร้อมข้อมูลอยู่ที่ ${insightScore}%`
    : `เดือนนี้ยังมีข้อมูลไม่มากพอสำหรับวิเคราะห์เชิงลึก คะแนนความพร้อมข้อมูล ${insightScore}%`;

  const powerpointBullets = [
    headline,
    anomalies.length ? `พบประเด็นที่ควรตรวจสอบ ${anomalies.length} จุด` : 'ไม่พบความผิดปกติสำคัญในข้อมูลเดือนนี้',
    recommendations[0]?.details || recommendations[0]?.title || 'ใช้ข้อมูลนี้ประกอบสรุปรายงานได้',
    rising ? `${rising.label} เป็นหมวดที่เพิ่มขึ้นเด่นที่สุดเมื่อเทียบกับเดือนก่อน` : 'แนวโน้มโดยรวมยังไม่เปลี่ยนแปลงรุนแรง'
  ].filter(Boolean);

  return {
    month: monthStart(month),
    generated_at: new Date().toISOString(),
    engine: 'CKAP local analytical insight engine',
    score: insightScore,
    headline,
    trends,
    anomalies: anomalies.slice(0, 12),
    recommendations: recommendations.slice(0, 6),
    quality_scores: qualityScores,
    powerpoint_bullets: powerpointBullets
  };
}

async function requestAiInsightExplanation(numericInsight, settings) {
  const endpoint = String(process.env.AI_INSIGHT_API_URL || '').trim();
  const apiKey = String(process.env.AI_INSIGHT_API_KEY || '').trim();
  const model = String(process.env.AI_INSIGHT_MODEL || '').trim();
  if (!endpoint || !apiKey || !model || !numericInsight.enabled_modules?.length) return { status: 'local_only', provider: null };
  const safePayload = buildSafeAiPayload(numericInsight, settings);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You explain pre-calculated facility analytics in Thai. Never request or generate SQL, never modify data, never invent numbers, and never expose secrets. Return JSON only: {"headline":"...","recommendations":[{"title":"...","details":"..."}]}' },
        { role: 'user', content: JSON.stringify(safePayload) }
      ]
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || payload?.output_text || '';
  let parsed;
  try { parsed = JSON.parse(String(content).replace(/^```json\s*|\s*```$/g, '')); } catch { parsed = { headline: String(content).slice(0, 500), recommendations: [] }; }
  return {
    status: 'explained',
    provider: 'configured_api',
    headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 500) : null,
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5).map(item => ({ priority: 'normal', title: String(item.title || 'ข้อเสนอแนะจาก AI').slice(0, 160), details: String(item.details || '').slice(0, 700) })) : []
  };
}

async function buildMetadataAwareInsights(month, requestedModules, user) {
  const modulesResult = await supabase.from('master_modules').select('*').eq('active', true).order('sort_order');
  if (modulesResult.error) throw modulesResult.error;
  const visible = (modulesResult.data || []).filter(module => canAccessModule(user, module.code, 'read') && (!requestedModules?.length || requestedModules.includes(module.code)));
  const codes = visible.map(module => module.code);
  if (!codes.length) return buildMetadataInsights({ month, definitions: [], settings: [], currentRows: [], previousRows: [] });
  const settingsResult = await supabase.from('module_ai_settings').select('*').in('module_code', codes);
  if (settingsResult.error) throw settingsResult.error;
  const enabledCodes = (settingsResult.data || []).filter(item => item.enabled).map(item => item.module_code);
  if (!enabledCodes.length) return buildMetadataInsights({ month, definitions: visible, settings: settingsResult.data || [], currentRows: [], previousRows: [] });
  const [currentRows, previousRows] = await Promise.all([getEntriesForMonth(month, enabledCodes), getEntriesForMonth(previousMonth(month), enabledCodes)]);
  const numeric = buildMetadataInsights({ month, definitions: visible, settings: settingsResult.data || [], currentRows, previousRows });
  try {
    const ai = await requestAiInsightExplanation(numeric, settingsResult.data || []);
    return { ...numeric, ai, headline: ai.headline || numeric.headline, recommendations: ai.recommendations?.length ? ai.recommendations : numeric.recommendations, engine: ai.status === 'explained' ? 'CKAP metadata engine + AI explanation' : numeric.engine };
  } catch (error) {
    return { ...numeric, ai: { status: 'fallback', provider: 'configured_api', error: error.message }, engine: numeric.engine };
  }
}


function dayKey(value) {
  return String(value || '').slice(8, 10) || '01';
}

function sumBy(rows, keyFn, valueFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    const value = Number(valueFn(row) || 0);
    map.set(key, (map.get(key) || 0) + value);
  }
  return map;
}

function chartDataLabel(value, digits = 2) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits });
}

function buildChartPreview({ month, rows, modules = MODULE_ORDER }) {
  const selected = Array.isArray(modules) && modules.length ? modules : MODULE_ORDER;
  const summary = summarizeRows(rows || []);
  const charts = [];

  const comparisonData = summary.modules
    .filter(item => selected.includes(item.module) && item.module !== 'wet_waste')
    .map(item => ({ module: item.module, label: item.label, value: Number((item.weight_kg || 0).toFixed(2)), amount: Number((item.amount || 0).toFixed(2)), count: item.count || 0 }));

  charts.push({
    id: 'module-comparison',
    enabled: true,
    title: 'กราฟเปรียบเทียบน้ำหนักตามประเภท',
    subtitle: 'น้ำหนักรวมของแต่ละประเภทในเดือนที่เลือก',
    chart_type: 'bar',
    metric: 'weight_kg',
    unit: 'kg',
    data: comparisonData,
    takeaway: comparisonData.length ? `${comparisonData.sort((a, b) => b.value - a.value)[0].label} มีน้ำหนักสูงสุด` : 'ยังไม่มีข้อมูลสำหรับสร้างกราฟ'
  });

  const daysInMonth = new Date(Number(monthStart(month).slice(0, 4)), Number(monthStart(month).slice(5, 7)), 0).getDate();
  const dailyModules = selected.filter(module => ['rdf', 'dog_food', 'recycle', 'tissue', 'black_bag', 'consumable'].includes(module));
  const dailySeries = dailyModules.map(module => {
    const dailyMap = sumBy((rows || []).filter(row => row.module === module), row => dayKey(row.entry_date), row => row.weight_kg || row.quantity || row.amount || 0);
    return {
      module,
      name: MODULES[module] || module,
      data: Array.from({ length: daysInMonth }, (_, idx) => {
        const day = String(idx + 1).padStart(2, '0');
        return { day, value: Number((dailyMap.get(day) || 0).toFixed(2)) };
      })
    };
  });
  if (dailySeries.length) {
    charts.push({
      id: 'daily-trend',
      enabled: true,
      title: 'กราฟแนวโน้มรายวัน',
      subtitle: 'ดูความเคลื่อนไหวรายวันของแต่ละประเภท',
      chart_type: 'line',
      metric: 'daily_value',
      unit: 'หน่วยวัด',
      series: dailySeries,
      takeaway: 'ใช้ดูวันที่มียอดสูงหรือต่ำผิดปกติก่อนทำรายงาน'
    });
  }

  const dogFoodWeight = (rows || []).filter(row => row.module === 'dog_food').reduce((sum, row) => sum + Number(row.weight_kg || 0), 0);
  const pigFeedWeight = (rows || []).filter(row => row.module === 'pig_feed').reduce((sum, row) => sum + Number(row.weight_kg || 0), 0);
  const canSeeWetComponents = selected.includes('dog_food') && selected.includes('pig_feed');
  const wetData = canSeeWetComponents
    ? [
        { module: 'dog_food', label: MODULES.dog_food, value: Number(dogFoodWeight.toFixed(2)) },
        { module: 'pig_feed', label: MODULES.pig_feed, value: Number(pigFeedWeight.toFixed(2)) }
      ].filter(item => item.value > 0 || selected.includes(item.module))
    : selected.includes('wet_waste')
      ? [{ module: 'wet_waste', label: MODULES.wet_waste, value: Number((dogFoodWeight + pigFeedWeight).toFixed(2)) }]
      : [];
  if (wetData.length) {
    charts.push({
      id: 'wet-waste-composition',
      enabled: true,
      title: 'กราฟขยะเปียกรวม',
      subtitle: 'ขยะเปียก = อาหารหมา + อาหารหมู',
      chart_type: 'pie',
      metric: 'weight_kg',
      unit: 'kg',
      data: wetData,
      takeaway: `ขยะเปียกรวม ${chartDataLabel(wetData.reduce((sum, item) => sum + item.value, 0))} kg`
    });
  }

  const recycleRows = (rows || []).filter(row => row.module === 'recycle');
  if (selected.includes('recycle')) {
    const materialMap = new Map();
    for (const row of recycleRows) {
      const key = row.material_name || 'ไม่ระบุวัสดุ';
      const current = materialMap.get(key) || { label: key, value: 0, amount: 0, count: 0 };
      current.value += Number(row.weight_kg || 0);
      current.amount += Number(row.amount || 0);
      current.count += 1;
      materialMap.set(key, current);
    }
    const recycleData = Array.from(materialMap.values()).map(item => ({ ...item, value: Number(item.value.toFixed(2)), amount: Number(item.amount.toFixed(2)) })).sort((a, b) => b.amount - a.amount).slice(0, 8);
    charts.push({
      id: 'recycle-revenue',
      enabled: true,
      title: 'กราฟรายได้รีไซเคิลตามวัสดุ',
      subtitle: 'แยกตามประเภทวัสดุและยอดเงิน',
      chart_type: 'bar',
      metric: 'amount',
      unit: 'บาท',
      data: recycleData,
      takeaway: recycleData.length ? `${recycleData[0].label} สร้างรายได้สูงสุด` : 'ยังไม่มีข้อมูลรายได้รีไซเคิล'
    });
  }

  const quantityData = summary.modules
    .filter(item => selected.includes(item.module) && ['tissue', 'black_bag', 'consumable'].includes(item.module))
    .map(item => ({ module: item.module, label: item.label, value: Number((item.quantity || item.amount || item.weight_kg || 0).toFixed(2)), amount: Number((item.amount || 0).toFixed(2)), count: item.count || 0 }));
  if (quantityData.length) {
    charts.push({
      id: 'quantity-summary',
      enabled: true,
      title: 'กราฟจำนวนวัสดุสิ้นเปลือง',
      subtitle: 'กระดาษทิชชู่ ถุงดำ และของใช้สิ้นเปลือง',
      chart_type: 'bar',
      metric: 'quantity',
      unit: 'จำนวน',
      data: quantityData,
      takeaway: 'ใช้ติดตามวัสดุสิ้นเปลืองแบบรายเดือน'
    });
  }

  return { month: monthStart(month), generated_at: new Date().toISOString(), charts };
}

function getChartById(charts, id) {
  return (charts || []).find(chart => chart.id === id);
}

function buildReportOutline({ month, title, modules, summary, insights, charts }) {
  const selected = modules && modules.length ? modules : MODULE_ORDER;
  const outline = [
    { id: 'cover', enabled: true, title: title || 'รายงานขยะประจำเดือน', layout: 'cover', content_type: 'cover', note: `ประจำเดือน ${month}` },
    { id: 'kpi-summary', enabled: true, title: 'สรุปภาพรวมประจำเดือน', layout: 'kpi', content_type: 'summary', note: 'น้ำหนักรวม รายได้รวม จำนวนรายการ และขยะเปียกรวม' },
    { id: 'ai-insights', enabled: true, title: 'AI Insight และข้อเสนอแนะ', layout: 'insight-cards', content_type: 'insights', note: insights?.headline || 'สรุปแนวโน้ม ความผิดปกติ และคำแนะนำจากข้อมูลจริง' }
  ];
  for (const chart of (charts || []).filter(item => item.enabled !== false).slice(0, 4)) {
    outline.push({
      id: `chart-${chart.id}`,
      enabled: true,
      title: chart.title,
      layout: `${chart.chart_type}-chart`,
      content_type: 'chart',
      chart_id: chart.id,
      chart_type: chart.chart_type,
      note: chart.takeaway || chart.subtitle || 'พรีวิวกราฟก่อนสร้างรายงาน'
    });
  }
  for (const module of selected) {
    const item = summary.modules.find(row => row.module === module);
    outline.push({
      id: `module-${module}`,
      enabled: true,
      title: MODULES[module] || module,
      layout: module === 'recycle' ? 'table-kpi' : 'simple-kpi',
      content_type: 'module',
      module,
      note: `น้ำหนัก ${formatNumber(item?.weight_kg || 0)} kg / รายการ ${formatNumber(item?.count || 0, 0)}`
    });
  }
  outline.push({ id: 'closing', enabled: true, title: 'สรุปและข้อเสนอแนะ', layout: 'closing', content_type: 'closing', note: 'สรุปประเด็นที่ควรติดตามต่อ' });
  return outline;
}

async function createPowerPointBuffer({ month, title, outline, rows, summary, insights, charts }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Central Krabi Analytics Platform';
  pptx.company = 'Central Krabi';
  pptx.subject = `Monthly waste report ${month}`;
  pptx.title = title || 'รายงานขยะประจำเดือน';
  pptx.lang = 'th-TH';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'th-TH'
  };

  function titleBar(slide, text) {
    slide.background = { color: 'F8FAFC' };
    slide.addText(text, { x: 0.45, y: 0.35, w: 12.4, h: 0.45, fontSize: 22, bold: true, color: '0F172A', margin: 0.02 });
    slide.addShape(pptx.ShapeType.line, { x: 0.45, y: 0.9, w: 12.2, h: 0, line: { color: 'CBD5E1', width: 1 } });
  }

  function drawSimpleBarChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const data = (chart?.data || []).filter(item => Number(item.value ?? item.amount ?? 0) > 0).slice(0, 8);
    const metric = chart?.metric === 'amount' ? 'amount' : 'value';

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!data.length) {
      slide.addText('ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = data.map(item => String(item.label || item.module || '').slice(0, 12));
    const values = data.map(item => Number(item[metric] ?? item.value ?? 0));

    const chartData = [
      {
        name: chart.unit || (metric === 'amount' ? 'บาท' : 'kg'),
        labels: labels,
        values: values
      }
    ];

    slide.addChart(pptx.ChartType.bar, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      barDir: 'col',
      chartColors: ['2563EB'],
      showLegend: false,
      showValue: true,
      dataLabelColor: '1E293B',
      dataLabelFontSize: 8,
      valAxisLabelColor: '475569',
      catAxisLabelColor: '475569',
      valAxisLabelFontSize: 8,
      catAxisLabelFontSize: 8,
      valGridLine: { color: 'F1F5F9', width: 1 }
    });
  }

  function drawSimpleLineChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const series = (chart?.series || []).slice(0, 3);

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!series.length) {
      slide.addText('ยังไม่มีข้อมูลรายวันสำหรับแสดงกราฟ', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = (series[0]?.data || []).map(point => String(point.day));
    const chartColors = ['2563EB', '16A34A', 'D97706'];

    const chartData = series.map((serie, idx) => {
      return {
        name: serie.name,
        labels: labels,
        values: labels.map(day => {
          const found = (serie.data || []).find(point => point.day === day);
          return Number(found?.value || 0);
        }),
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 5
      };
    });

    slide.addChart(pptx.ChartType.line, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      chartColors: chartColors,
      showLegend: true,
      legendPos: 'b',
      showValue: false,
      valAxisLabelColor: '475569',
      catAxisLabelColor: '475569',
      valAxisLabelFontSize: 8,
      catAxisLabelFontSize: 8,
      valGridLine: { color: 'F1F5F9', width: 1 }
    });
  }

  function drawSimplePieChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const data = (chart?.data || []).filter(item => Number(item.value || 0) > 0).slice(0, 5);
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!total) {
      slide.addText('ยังไม่มีข้อมูลสำหรับแสดงสัดส่วน', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = data.map(item => String(item.label || item.module || ''));
    const values = data.map(item => Number(item.value || 0));

    const chartData = [
      {
        name: chart.title || 'สัดส่วน',
        labels: labels,
        values: values
      }
    ];

    slide.addChart(pptx.ChartType.pie, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      chartColors: ['2563EB', '16A34A', 'D97706', '9333EA', '0F766E'],
      showLegend: true,
      legendPos: 'r',
      showPercent: true,
      dataLabelColor: '1E293B',
      dataLabelFontSize: 8
    });
  }

  for (const item of (outline || []).filter(s => s.enabled !== false)) {
    const slide = pptx.addSlide();
    if (item.content_type === 'cover') {
      slide.background = { color: 'EFF6FF' };
      slide.addText(item.title || title, { x: 0.75, y: 1.45, w: 11.8, h: 0.75, fontSize: 31, bold: true, color: '1E3A8A', margin: 0.02 });
      slide.addText(`ประจำเดือน ${month}`, { x: 0.78, y: 2.25, w: 11.2, h: 0.35, fontSize: 16, color: '475569', margin: 0.02 });
      slide.addText('Central Krabi Analytics Platform v3.0.8', { x: 0.78, y: 6.55, w: 11.4, h: 0.28, fontSize: 12, color: '64748B', margin: 0.02 });
      continue;
    }

    if (item.content_type === 'summary') {
      titleBar(slide, item.title || 'สรุปภาพรวมประจำเดือน');
      const kpis = [
        ['น้ำหนักรวม', `${formatNumber(summary.totals.total_weight_kg)} kg`],
        ['รายได้รวม', `${formatNumber(summary.totals.total_amount)} บาท`],
        ['จำนวนรายการ', `${formatNumber(summary.totals.entry_count, 0)} รายการ`],
        ['ขยะเปียกรวม', `${formatNumber(summary.totals.wet_waste_weight_kg)} kg`]
      ];
      kpis.forEach((kpi, idx) => {
        const x = 0.7 + (idx % 2) * 6.15;
        const y = 1.35 + Math.floor(idx / 2) * 1.9;
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.55, h: 1.35, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.15 });
        slide.addText(kpi[0], { x: x + 0.24, y: y + 0.22, w: 5.1, h: 0.25, fontSize: 12, color: '475569', margin: 0.02 });
        slide.addText(kpi[1], { x: x + 0.24, y: y + 0.66, w: 5.1, h: 0.38, fontSize: 21, bold: true, color: '1D4ED8', margin: 0.02 });
      });
      continue;
    }


    if (item.content_type === 'insights') {
      titleBar(slide, item.title || 'AI Insight และข้อเสนอแนะ');
      const score = insights?.score ?? 0;
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.2, w: 3.2, h: 1.25, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.12 });
      slide.addText('คะแนนความพร้อมข้อมูล', { x: 0.88, y: 1.38, w: 2.7, h: 0.24, fontSize: 11, color: '64748B', margin: 0.02 });
      slide.addText(`${score}%`, { x: 0.88, y: 1.75, w: 2.7, h: 0.45, fontSize: 25, bold: true, color: score >= 70 ? '1D4ED8' : 'B45309', margin: 0.02 });
      slide.addShape(pptx.ShapeType.roundRect, { x: 4.1, y: 1.2, w: 8.15, h: 1.25, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.12 });
      slide.addText(insights?.headline || 'ยังไม่มีข้อมูล Insight', { x: 4.35, y: 1.5, w: 7.65, h: 0.62, fontSize: 15, bold: true, color: '0F172A', margin: 0.02, fit: 'shrink' });

      const bullets = (insights?.powerpoint_bullets || []).slice(0, 4).map(text => `• ${text}`).join('\n');
      slide.addText(bullets || '• ยังไม่มีประเด็นเพิ่มเติม', { x: 0.75, y: 2.85, w: 5.75, h: 2.8, fontSize: 13, color: '0F172A', margin: 0.04, fit: 'shrink' });

      const recs = (insights?.recommendations || []).slice(0, 3);
      recs.forEach((rec, idx) => {
        const y = 2.78 + idx * 1.05;
        slide.addShape(pptx.ShapeType.roundRect, { x: 6.85, y, w: 5.65, h: 0.82, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, radius: 0.12 });
        slide.addText(rec.title || 'ข้อเสนอแนะ', { x: 7.08, y: y + 0.12, w: 5.2, h: 0.2, fontSize: 10.5, bold: true, color: '1D4ED8', margin: 0.02 });
        slide.addText(rec.details || '', { x: 7.08, y: y + 0.36, w: 5.2, h: 0.25, fontSize: 8.8, color: '475569', margin: 0.02, fit: 'shrink' });
      });
      continue;
    }


    if (item.content_type === 'chart') {
      const chart = getChartById(charts, item.chart_id) || { title: item.title, chart_type: item.chart_type, data: [] };
      titleBar(slide, item.title || chart.title || 'กราฟรายงาน');
      slide.addText(chart.subtitle || item.note || '', { x: 0.65, y: 0.98, w: 11.9, h: 0.24, fontSize: 10.5, color: '64748B', margin: 0.02, fit: 'shrink' });
      if (chart.chart_type === 'line') drawSimpleLineChart(slide, chart);
      else if (chart.chart_type === 'pie') drawSimplePieChart(slide, chart);
      else drawSimpleBarChart(slide, chart);
      continue;
    }

    if (item.content_type === 'module') {
      const moduleRows = item.module === 'wet_waste'
        ? rows.filter(row => ['dog_food', 'pig_feed'].includes(row.module))
        : rows.filter(row => row.module === item.module);
      const moduleSummary = item.module === 'wet_waste'
        ? summary.modules.find(row => row.module === 'wet_waste')
        : summary.modules.find(row => row.module === item.module);
      titleBar(slide, item.title || MODULES[item.module] || item.module);
      const kpis = [
        ['น้ำหนัก', `${formatNumber(moduleSummary?.weight_kg || 0)} kg`],
        ['จำนวน', `${formatNumber(moduleSummary?.quantity || 0)} ${item.module === 'black_bag' ? 'kg' : ''}`],
        ['ยอดเงิน', `${formatNumber(moduleSummary?.amount || 0)} บาท`],
        ['รายการ', `${formatNumber(moduleSummary?.count || 0, 0)} รายการ`]
      ];
      kpis.forEach((kpi, idx) => {
        const x = 0.55 + idx * 3.15;
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.2, w: 2.85, h: 1.05, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
        slide.addText(kpi[0], { x: x + 0.17, y: 1.36, w: 2.5, h: 0.2, fontSize: 10, color: '64748B', margin: 0.02 });
        slide.addText(kpi[1], { x: x + 0.17, y: 1.72, w: 2.5, h: 0.28, fontSize: 15, bold: true, color: '0F172A', margin: 0.02 });
      });
      const tableRows = [['วันที่', 'ประเภท/วัสดุ', 'น้ำหนัก', 'จำนวน', 'ยอดเงิน']]
        .concat(moduleRows.slice(0, 12).map(row => [
          String(row.entry_date || '').slice(0, 10),
          row.material_name || MODULES[row.module] || row.module,
          formatNumber(row.weight_kg || 0),
          formatNumber(row.quantity || 0),
          formatNumber(row.amount || 0)
        ]));
      slide.addTable(tableRows, { x: 0.55, y: 2.65, w: 12.2, h: 3.75, fontSize: 9.5, border: { color: 'CBD5E1' }, color: '0F172A', fill: { color: 'FFFFFF' } });
      if (moduleRows.length > 12) {
        slide.addText(`แสดง 12 รายการแรกจากทั้งหมด ${moduleRows.length} รายการ`, { x: 0.55, y: 6.55, w: 12, h: 0.25, fontSize: 9, color: '64748B', margin: 0.02 });
      }
      continue;
    }

    titleBar(slide, item.title || 'สรุปและข้อเสนอแนะ');
    const topModule = [...summary.modules].filter(row => row.module !== 'wet_waste').sort((a, b) => b.weight_kg - a.weight_kg)[0];
    const lines = (insights?.powerpoint_bullets?.length ? insights.powerpoint_bullets : [
      `เดือนนี้มีข้อมูลรวม ${formatNumber(summary.totals.entry_count, 0)} รายการ`,
      `น้ำหนักรวม ${formatNumber(summary.totals.total_weight_kg)} kg`,
      `ขยะเปียกรวม ${formatNumber(summary.totals.wet_waste_weight_kg)} kg`,
      topModule ? `หมวดที่มีน้ำหนักสูงสุดคือ ${topModule.label} (${formatNumber(topModule.weight_kg)} kg)` : 'ยังไม่มีข้อมูลเพียงพอสำหรับสรุปหมวดสูงสุด'
    ]);
    slide.addText(lines.map(text => `• ${text}`).join('\n'), { x: 0.8, y: 1.35, w: 11.6, h: 3.2, fontSize: 16, color: '0F172A', breakLine: false, margin: 0.05, fit: 'shrink' });
  }

  return pptx.write({ outputType: 'nodebuffer' });
}

async function runAutomationJob(job, reqLike = {}) {
  const startedAt = new Date().toISOString();
  let status = 'success';
  let result = {};
  try {
    const month = job.config?.month || thailandMonth();
    if (job.action_type === 'data_quality_check') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      result = { month, entry_count: rows.length, message: rows.length ? 'พบข้อมูลสำหรับตรวจสอบ' : 'ยังไม่มีข้อมูลเดือนนี้' };
    } else if (job.action_type === 'monthly_summary') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      const summary = summarizeRows(rows);
      result = { month, totals: summary.totals };
    } else if (job.action_type === 'report_preview') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      const previousRows = await getEntriesForMonth(previousMonth(month), MODULE_ORDER);
      const summary = summarizeRows(rows);
      const insights = buildAdvancedInsights({ month, rows, previousRows });
      result = { month, outline: buildReportOutline({ month, title: 'รายงานอัตโนมัติ', modules: MODULE_ORDER, summary, insights }), insights };
    } else if (job.action_type === 'ai_insight_check') {
      result = await buildMetadataAwareInsights(month, [], { role: 'owner', permissions: [] });
    } else if (job.action_type === 'chart_preview') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      result = buildChartPreview({ month, rows, modules: MODULE_ORDER });
    } else {
      result = { message: 'Unknown action_type, no operation performed.' };
    }
  } catch (error) {
    status = 'failed';
    result = { error: error.message };
  }
  const finishedAt = new Date().toISOString();
  if (supabase) {
    await supabase.from('automation_runs').insert({
      job_id: job.id,
      status,
      result,
      started_at: startedAt,
      finished_at: finishedAt
    });
  }
  return { status, result, started_at: startedAt, finished_at: finishedAt };
}

async function automationTick(force = false) {
  if (!supabase || (!force && process.env.AUTOMATION_RUNNER_ENABLED !== 'true')) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('automation_jobs')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now)
    .limit(5);
  if (error || !data?.length) return;
  for (const job of data) {
    await runAutomationJob(job);
    const nextRunAt = new Date(Date.now() + Number(job.interval_minutes || 1440) * 60 * 1000).toISOString();
    await supabase.from('automation_jobs').update({ last_run_at: now, next_run_at: nextRunAt, updated_at: now }).eq('id', job.id);
  }
}

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyFromRequest: req => `${req.ip || req.socket?.remoteAddress || 'unknown'}|${String(req.body?.email || '').trim().toLowerCase()}`
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    loginRateLimiter.recordFailure(req);
    return res.status(400).json({ error: 'รูปแบบอีเมลหรือข้อมูลไม่ถูกต้อง', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    let userProfile = null;
    let authSession = null;

    // 1. Try Supabase Auth if configured
    if (authSupabase) {
      const { data: authData, error: authError } = await authSupabase.auth.signInWithPassword({
        email,
        password
      });

      if (!authError && authData?.user && authData?.session?.access_token && authData?.session?.refresh_token) {
        authSession = authData.session;
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile?.active) {
          userProfile = profile;
        } else if (!profile) {
          const safeProfile = {
            id: authData.user.id,
            email: authData.user.email,
            display_name: authData.user.user_metadata?.display_name || authData.user.email?.split('@')[0] || 'ผู้ใช้งาน',
            role: 'viewer',
            active: true
          };
          const created = await supabase.from('profiles').upsert(safeProfile, { onConflict: 'id' }).select('*').single();
          if (created.error) return res.status(500).json({ error: 'ไม่สามารถสร้างโปรไฟล์ผู้ใช้ได้' });
          userProfile = created.data;
        } else return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ Owner' });
      } else {
        const failure = loginErrorResponse(authError);
        if (failure.status === 401) loginRateLimiter.recordFailure(req);
        console.warn('[auth] login rejected', { email, code: authError?.code || null, status: authError?.status || null });
        await audit(req, 'login_failed', 'profiles', null, null, { email, auth_code: authError?.code || null });
        return res.status(failure.status).json({ error: failure.error });
      }
    } else return res.status(503).json({ error: 'Supabase is not configured' });

    if (!userProfile) {
      return res.status(401).json({ error: 'บัญชีนี้ถูกระงับการใช้งานหรือไม่มีในระบบ' });
    }

    // Hydrate permissions
    const userWithPerms = await hydrateUserPermissions(userProfile);
    loginRateLimiter.reset(req);

    await audit({ user: { ...userWithPerms, profileExists: true }, ip: req.ip, headers: req.headers }, 'login', 'profiles', userWithPerms.id, null, { email: userWithPerms.email });

    res.setHeader('Set-Cookie', authCookies(authSession, process.env.NODE_ENV === 'production'));
    res.json({
      user: {
        id: userWithPerms.id,
        email: userWithPerms.email,
        display_name: userWithPerms.display_name,
        role: userWithPerms.role,
        permissions: userWithPerms.permissions
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The anon key is designed to be public. Serving it with the project URL keeps
// password recovery on the exact same Supabase project as backend login.
app.get('/api/auth/config', (_req, res) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: 'Backend ยังไม่ได้ตั้งค่า SUPABASE_ANON_KEY' });
  }
  return res.json({ supabaseUrl, supabaseAnonKey });
});

const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyFromRequest: req => `${req.ip || req.socket?.remoteAddress || 'unknown'}|${String(req.body?.email || '').trim().toLowerCase()}`
});

app.post('/api/auth/password-reset', passwordResetRateLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  if (!authSupabase) return res.status(503).json({ error: 'Supabase is not configured' });
  const redirectTo = `${String(process.env.FRONTEND_URL || '').split(',')[0].replace(/\/$/, '')}/?set-password=1`;
  const { error } = await authSupabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  if (error) {
    const message = String(error.message || '');
    if (/rate limit/iu.test(message)) return res.status(429).json({ error: 'ส่งอีเมลถี่เกินไป กรุณารอแล้วลองใหม่' });
    console.warn('[auth] password reset rejected', { code: error.code || null, status: error.status || null });
    return res.status(400).json({ error: 'ไม่สามารถส่งลิงก์ตั้งรหัสผ่านได้' });
  }
  return res.json({ message: 'ส่งลิงก์ตั้งรหัสผ่านแล้ว กรุณาตรวจอีเมล' });
});

app.post('/api/auth/refresh', async (req, res) => {
  if (!authSupabase) return res.status(503).json({ error: 'Supabase is not configured' });
  const refreshToken = refreshTokenFromRequest(req);
  if (!refreshToken) return res.status(401).json({ error: 'Session expired' });
  const { data, error } = await authSupabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) {
    res.setHeader('Set-Cookie', clearAuthCookies(process.env.NODE_ENV === 'production'));
    return res.status(401).json({ error: 'Session expired' });
  }
  res.setHeader('Set-Cookie', authCookies(data.session, process.env.NODE_ENV === 'production'));
  return res.json({ ok: true });
});

app.post('/api/auth/logout', async (req, res) => {
  res.setHeader('Set-Cookie', clearAuthCookies(process.env.NODE_ENV === 'production'));
  return res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    release: RELEASE_ID,
    platform: 'Central Krabi Analytics Platform',
    supabase: isSupabaseConfigured ? 'configured' : 'missing-env',
    auth_key_source: supabaseServiceKey ? 'service-role' : (supabaseAnonKey ? 'anon-fallback' : 'missing'),
    dependencies: { ws: true, read_excel_file: true }
  });
});

app.get('/api/me', (req, res) => {
  res.json({
    id: req.user?.id || null,
    display_name: req.user?.display_name || 'Unauthenticated',
    email: req.user?.email || null,
    role: req.user?.role || 'blocked',
    permissions: req.user?.permissions || []
  });
});

app.get('/api/master-categories', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const module = req.query.module;
  let query = supabase.from('master_categories').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (module) query = query.eq('module', module);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const mapped = (data || []).map(item => ({ ...item, unit: canonicalOperationalUnit(item.module, item.code, item.unit), color: item.color_hex || item.color }));
  res.json(mapped);
});

function databaseModulesFor(module) {
  if (module === 'wet_waste') return ['dog_food', 'pig_feed'];
  if (module === 'consumable' || module === 'cleaning_liquid') return ['consumable', 'cleaning_liquid'];
  return [module];
}

function naturalEntryMode(metadata = {}) {
  if (metadata.value_type === 'daily_average' || metadata.entry_mode === 'daily_average') return 'daily_average';
  if (metadata.entry_mode === 'monthly') return 'monthly';
  return 'daily';
}

app.get('/api/entries', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const { module, month, startDate, endDate, category, search } = req.query;
  const moduleAction = req.query.forExport === 'true' ? 'export' : 'read';
  let allowed = null;
  if (module && module !== 'all') {
    if (!requireModuleAccess(module, req, res, moduleAction)) return;
  } else {
    allowed = allowedModuleCodes(req.user, moduleAction);
    if (allowed && !allowed.length) return res.json([]);
  }

  const safeSearch = search ? String(search).slice(0, 100).replace(/[,()%]/g, ' ').trim() : '';
  const buildQuery = () => {
    let query = supabase.from('data_entries').select('*')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (month) query = query.eq('period_month', monthStart(month));
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    if (category) query = query.eq('category_code', category);
    if (module && module !== 'all') {
      const databaseModules = databaseModulesFor(module);
      query = databaseModules.length > 1 ? query.in('module', databaseModules) : query.eq('module', databaseModules[0]);
    } else if (allowed) {
      query = query.in('module', allowed);
    }
    if (safeSearch) query = query.or(`notes.ilike.%${safeSearch}%,material_name.ilike.%${safeSearch}%`);
    return query;
  };

  try {
    res.json(await fetchAllPages(buildQuery));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calendarSource(row) {
  return row.source_system || row.metadata?.source_system || row.metadata?.import_source || 'manual';
}

app.get('/api/entries/calendar', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const { module, month } = req.query;
  if (!module || !monthStart(month)) return res.status(400).json({ error: 'module and month are required' });
  if (!requireModuleAccess(module, req, res, 'read')) return;
  const modules = databaseModulesFor(module);
  const { data, error } = await supabase.from('data_entries').select('*')
    .in('module', modules).eq('period_month', monthStart(month)).order('entry_date');
  if (error) return res.status(500).json({ error: error.message });
  const grouped = new Map();
  for (const row of data || []) {
    const date = String(row.entry_date).slice(0, 10);
    const day = grouped.get(date) || { date, count: 0, weight_kg: 0, quantity: 0, amount: 0, sources: new Set(), edited: false };
    day.count += 1;
    day.weight_kg += Number(row.weight_kg || 0);
    day.quantity += Number(row.quantity || 0);
    day.amount += Number(row.amount || 0);
    day.sources.add(calendarSource(row));
    day.edited ||= Boolean(row.updated_at && row.created_at && row.updated_at !== row.created_at);
    grouped.set(date, day);
  }
  res.json(Array.from(grouped.values()).map(day => ({ ...day, sources: Array.from(day.sources), status: day.count ? 'recorded' : 'missing' })));
});

app.get('/api/entries/day', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const { module, date } = req.query;
  if (!module || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'module and date are required' });
  if (!requireModuleAccess(module, req, res, 'read')) return;
  const modules = databaseModulesFor(module);
  const { data, error } = await supabase.from('data_entries').select('*').in('module', modules).eq('entry_date', date).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/entries/month-summary', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const { module, month } = req.query;
  if (!module || !monthStart(month)) return res.status(400).json({ error: 'module and month are required' });
  if (!requireModuleAccess(module, req, res, 'read')) return;
  const modules = databaseModulesFor(module);
  const { data, error } = await supabase.from('data_entries').select('*').in('module', modules).eq('period_month', monthStart(month));
  if (error) return res.status(500).json({ error: error.message });
  const rows = data || [];
  const activeDays = new Set(rows.map(row => String(row.entry_date).slice(0, 10))).size;
  const [year, monthNumber] = String(month).slice(0, 7).split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const monthlyMetric = (row, field) => metricValue(row, field, 'monthly');
  const hasDailyAverage = rows.some(isDailyAverageEntry);
  res.json({
    module, month: String(month).slice(0, 7), records: rows.length, active_days: activeDays,
    missing_days: hasDailyAverage ? 0 : Math.max(0, daysInMonth - activeDays), completion_percent: hasDailyAverage ? 100 : (daysInMonth ? Math.round(activeDays * 10000 / daysInMonth) / 100 : 0),
    weight_kg: rows.reduce((sum, row) => sum + monthlyMetric(row, 'weight_kg'), 0),
    quantity: rows.reduce((sum, row) => sum + monthlyMetric(row, 'quantity'), 0),
    amount: rows.reduce((sum, row) => sum + monthlyMetric(row, 'amount'), 0)
  });
});

app.get('/api/entries/:id/history', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const current = await supabase.from('data_entries').select('id,module').eq('id', req.params.id).maybeSingle();
  let moduleCode = current.data?.module;
  if (!moduleCode) {
    const lastLog = await supabase.from('audit_logs').select('old_data,new_data').eq('table_name', 'data_entries').eq('record_id', req.params.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    moduleCode = lastLog.data?.new_data?.module || lastLog.data?.old_data?.module;
  }
  if (!moduleCode) return res.status(404).json({ error: 'Entry history not found' });
  if (!requireModuleAccess(moduleCode, req, res, 'read')) return;
  const { data, error } = await supabase.from('audit_logs').select('*').eq('table_name', 'data_entries').eq('record_id', req.params.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/entries', requireSupabase, requirePermission('entries.create'), async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  if (!requireModuleAccess(parsed.data.module, req, res, 'read')) return;
  const payload = normalizeEntry(parsed.data);
  const definitionValidation = await validateEntryDefinition(payload);
  if (!definitionValidation.ok) return res.status(400).json({ error: definitionValidation.error });
  const entryMode = naturalEntryMode(payload.metadata);
  let duplicateQuery = supabase.from('data_entries').select('*')
    .in('module', databaseModulesFor(payload.module))
    .eq('entry_date', payload.entry_date);
  duplicateQuery = payload.category_code
    ? duplicateQuery.eq('category_code', payload.category_code)
    : duplicateQuery.is('category_code', null);
  const duplicateResult = await duplicateQuery;
  if (duplicateResult.error) return res.status(500).json({ error: duplicateResult.error.message });
  const duplicate = (duplicateResult.data || []).find(item => naturalEntryMode(item.metadata) === entryMode);
  if (duplicate) return res.status(200).json({ ...duplicate, duplicate_prevented: true });
  payload.created_by = (req.user?.profileExists && req.user?.id) ? req.user.id : null;
  const { data, error } = await supabase.from('data_entries').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'data_entries', data.id, null, data);
  res.status(201).json(data);
});

app.post('/api/entries/batch', requireSupabase, requirePermission('entries.import'), async (req, res) => {
  // Accept both the CSV shape ({ entries: [...] }) and the native editor shape ([...]).
  const rows = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.entries) ? req.body.entries : []);
  if (!rows.length) return res.status(400).json({ error: 'entries array is required' });
  if (rows.length > 2000) return res.status(413).json({ error: 'นำเข้าได้สูงสุดครั้งละ 2,000 รายการ' });
  const requestedIds = rows.map(row => row.id).filter(Boolean);
  const existingById = new Map();
  if (requestedIds.length) {
    if (!new Set(req.user?.permissions || []).has('entries.edit') && req.user?.role !== 'owner') return res.status(403).json({ error: 'CSV ที่มี ID เดิมต้องใช้สิทธิ์แก้ไขข้อมูล' });
    const existing = await supabase.from('data_entries').select('id,module').in('id', requestedIds);
    if (existing.error) return res.status(500).json({ error: existing.error.message });
    for (const item of existing.data || []) existingById.set(item.id, item);
  }
  const periods = [...new Set(rows.map(row => row.period_month).filter(Boolean))];
  const requestedModules = [...new Set(rows.flatMap(row => databaseModulesFor(row.module || '')))];
  const naturalExisting = new Map();
  if (periods.length && requestedModules.length) {
    const existing = await supabase.from('data_entries').select('*').in('period_month', periods).in('module', requestedModules);
    if (existing.error) return res.status(500).json({ error: existing.error.message });
    for (const item of existing.data || []) {
      const canonicalModule = item.module === 'cleaning_liquid' ? 'consumable' : item.module;
      const key = [canonicalModule, String(item.entry_date).slice(0, 10), item.category_code || '', naturalEntryMode(item.metadata)].join('|');
      naturalExisting.set(key, item);
    }
  }
  const payload = [];
  for (const row of rows) {
    const parsed = entrySchema.safeParse(row);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid entry in batch', details: parsed.error.flatten(), row });
    if (!requireModuleAccess(parsed.data.module, req, res, 'read')) return;
    if (row.id) {
      const existing = existingById.get(row.id);
      if (!existing) return res.status(400).json({ error: 'ไม่พบ ID เดิมที่ต้องการอัปเดต', id: row.id });
      if (existing.module !== parsed.data.module || !canAccessModule(req.user, existing.module, 'read')) return res.status(403).json({ error: 'ไม่สามารถย้ายข้อมูลข้ามโมดูลด้วย CSV' });
    }
    const normalized = { ...normalizeEntry(parsed.data), created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null };
    const definitionValidation = await validateEntryDefinition(normalized);
    if (!definitionValidation.ok) return res.status(400).json({ error: definitionValidation.error });
    if (row.id) normalized.id = row.id;
    else {
      const canonicalModule = normalized.module === 'cleaning_liquid' ? 'consumable' : normalized.module;
      const key = [canonicalModule, String(normalized.entry_date).slice(0, 10), normalized.category_code || '', naturalEntryMode(normalized.metadata)].join('|');
      const naturalMatch = naturalExisting.get(key);
      if (naturalMatch) {
        if (!new Set(req.user?.permissions || []).has('entries.edit') && req.user?.role !== 'owner') return res.status(403).json({ error: 'การแก้ไขรายการเดิมต้องใช้สิทธิ์แก้ไขข้อมูล' });
        normalized.id = naturalMatch.id;
      }
    }
    payload.push(normalized);
  }
  const { data, error } = await supabase.from('data_entries').upsert(payload).select('*');
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'import', 'data_entries', null, null, { inserted: data?.length || 0 });
  res.status(201).json({ inserted: data?.length || 0, data: data || [] });
});

app.put('/api/entries/:id', requireSupabase, requirePermission('entries.edit'), async (req, res) => {
  const oldRow = await supabase.from('data_entries').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Entry not found' });
  if (!requireModuleAccess(oldRow.data.module, req, res, 'read')) return;
  const changeReason = String(req.body?.change_reason || '').trim();
  if (changeReason.length < 3) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการแก้ไขอย่างน้อย 3 ตัวอักษร' });
  const parsed = entrySchemaBase.partial({ module: true }).superRefine(validateEntryFields).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  const payload = normalizeEntry({ ...oldRow.data, ...parsed.data, module: oldRow.data.module });
  const definitionValidation = await validateEntryDefinition({ ...payload, module: oldRow.data.module });
  if (!definitionValidation.ok) return res.status(400).json({ error: definitionValidation.error });
  delete payload.module;
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('data_entries').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'data_entries', data.id, oldRow.data || null, { ...data, _change_reason: changeReason });
  res.json(data);
});

app.delete('/api/entries/:id', requireSupabase, requirePermission('entries.delete'), async (req, res) => {
  const oldRow = await supabase.from('data_entries').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Entry not found' });
  if (!requireModuleAccess(oldRow.data.module, req, res, 'read')) return;
  const changeReason = String(req.body?.change_reason || '').trim();
  if (changeReason.length < 3) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการลบอย่างน้อย 3 ตัวอักษร' });
  const { error } = await supabase.from('data_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'delete', 'data_entries', req.params.id, { ...oldRow.data, _change_reason: changeReason }, null);
  res.json({ ok: true });
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const name = String(file.originalname || '').toLowerCase();
    const allowed = name.endsWith('.xlsx') && [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      'application/zip'
    ].includes(file.mimetype || 'application/octet-stream');
    callback(allowed ? null : new Error('รองรับเฉพาะไฟล์ Excel .xlsx'), allowed);
  }
});

async function existingImportSourceKeys(keys, sourceSystem = 'hygiene_enterprise') {
  const found = new Set();
  for (let offset = 0; offset < keys.length; offset += 150) {
    const chunk = keys.slice(offset, offset + 150);
    if (!chunk.length) continue;
    const result = await supabase.from('data_entries').select('source_key').eq('source_system', sourceSystem).in('source_key', chunk);
    if (result.error) throw result.error;
    for (const row of result.data || []) if (row.source_key) found.add(row.source_key);
  }
  return found;
}

function entryCompositeKey(entry) {
  return [entry.module, String(entry.entry_date || '').slice(0, 10), entry.category_code || ''].join('|');
}

async function existingEntryCompositeKeys(entries) {
  if (!entries.length) return new Set();
  const modules = [...new Set(entries.map(entry => entry.module))];
  const dates = entries.map(entry => String(entry.entry_date).slice(0, 10)).sort();
  const result = await supabase.from('data_entries').select('module,entry_date,category_code')
    .in('module', modules).gte('entry_date', dates[0]).lte('entry_date', dates[dates.length - 1]);
  if (result.error) throw result.error;
  return new Set((result.data || []).map(entryCompositeKey));
}

const MONTHLY_IMAGE_SOURCE = 'monthly_image_import';
const imageUpload = multer({
  storage:multer.memoryStorage(), limits:{fileSize:12*1024*1024,files:1},
  fileFilter(_req,file,callback){
    const allowed=['image/jpeg','image/png','image/webp'].includes(file.mimetype);
    callback(allowed?null:new Error('รองรับเฉพาะภาพ JPG, PNG หรือ WebP'),allowed);
  }
});

function parseAiJsonContent(payload) {
  const content=payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? '';
  const text=Array.isArray(content)?content.map(item=>item?.text||'').join(''):String(content);
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g,'').trim());
}

async function extractMonthlyImage(buffer,mimeType,month) {
  const endpoint=String(process.env.MONTHLY_OCR_API_URL||process.env.AI_INSIGHT_API_URL||'').trim();
  const apiKey=String(process.env.MONTHLY_OCR_API_KEY||process.env.AI_INSIGHT_API_KEY||'').trim();
  const model=String(process.env.MONTHLY_OCR_MODEL||process.env.AI_INSIGHT_MODEL||'').trim();
  if(!endpoint||!apiKey||!model) throw new Error('ยังไม่ได้ตั้งค่า OCR กรุณากำหนด MONTHLY_OCR_API_URL, MONTHLY_OCR_API_KEY และ MONTHLY_OCR_MODEL');
  const system='คุณอ่านเอกสารภาษาไทยเพื่อสร้าง Preview เท่านั้น ห้ามเดาตัวเลขที่ไม่ชัด คืน JSON ล้วน เอกสารมีสองแบบ: daily_vertical_sheet หรือ recycle_voucher. daily_vertical_sheet คืน {document_type,confidence,columns:[{key,label,confidence}],rows:[{day,confidence,values:{key:number|null}}]}. recycle_voucher คืน {document_type,confidence,rows:[{material_name,weight_kg,unit_price,amount,confidence}],net_total}. ไม่ต้องคืนเลขเอกสาร วันที่ ผู้รับเงิน บริษัท VAT หรือข้อมูลส่วนบุคคล ใช้ null เมื่อไม่แน่ใจ และคงชื่อหัวคอลัมน์/วัสดุตามภาพ';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:0,messages:[{role:'system',content:system},{role:'user',content:[{type:'text',text:`เดือนรายงานที่ผู้ใช้เลือกคือ ${month} อ่านตารางตามแถวและคอลัมน์ ห้ามเลื่อนค่าข้ามแถว`},{type:'image_url',image_url:{url:`data:${mimeType};base64,${buffer.toString('base64')}`,detail:'high'}}]}]}),signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error(`OCR provider returned ${response.status}`);
  return parseAiJsonContent(await response.json());
}

app.post('/api/imports/monthly-image/preview', requireSupabase, requirePermission('entries.import'), imageUpload.single('file'), async(req,res)=>{
  try{
    const month=String(req.body?.month||'');
    if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({error:'กรุณาเลือกเดือนรายงาน'});
    if(!req.file?.buffer) return res.status(400).json({error:'กรุณาเลือกภาพ'});
    const fileHash=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const extraction=await extractMonthlyImage(req.file.buffer,req.file.mimetype,month);
    const categoriesResult=await supabase.from('master_categories').select('*').eq('active',true);
    if(categoriesResult.error) throw categoriesResult.error;
    const preview=buildMonthlyImagePreview({extraction,categories:categoriesResult.data||[],month,fileHash,fileName:req.file.originalname});
    const ready=preview.rows.filter(row=>row.status==='ready');
    const [sourceDuplicates,entryDuplicates]=await Promise.all([existingImportSourceKeys(ready.map(row=>row.source_key),MONTHLY_IMAGE_SOURCE),existingEntryCompositeKeys(ready.map(row=>row.entry))]);
    for(const row of ready){
      if(!sourceDuplicates.has(row.source_key)&&!entryDuplicates.has(entryCompositeKey(row.entry))) continue;
      row.status='duplicate'; row.issues.push('รายการเดือนและประเภทนี้มีอยู่ในฐานข้อมูลแล้ว'); preview.summary.ready--; preview.summary.duplicate++;
    }
    await audit(req,'preview_monthly_image','import_batches',null,null,{file_name:req.file.originalname,file_hash:fileHash,document_type:preview.document_type,summary:preview.summary});
    return res.json(preview);
  }catch(error){ return res.status(400).json({error:error.message}); }
});

const monthlyImageCommitSchema=z.object({
  file_name:z.string().min(1).max(255),file_hash:z.string().regex(/^[a-f0-9]{64}$/),month:z.string().regex(/^\d{4}-\d{2}$/),document_type:z.enum(['daily_vertical_sheet','recycle_voucher']),
  rows:z.array(z.object({source_key:z.string().regex(/^[a-f0-9]{64}$/),entry:entrySchemaBase})).min(1).max(500),preview_summary:z.record(z.any()).optional()
});

app.post('/api/imports/monthly-image/commit',requireSupabase,requirePermission('entries.import'),async(req,res)=>{
  const parsed=monthlyImageCommitSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'ข้อมูลยืนยันไม่ถูกต้อง',details:parsed.error.flatten()});
  const modules=[...new Set(parsed.data.rows.map(row=>row.entry.module))];
  const denied=modules.filter(module=>!['tissue','black_bag','consumable','recycle'].includes(module)||!canAccessModule(req.user,module,'create'));
  if(denied.length)return res.status(403).json({error:'ไม่มีสิทธิ์หรือพบโมดูลที่ไม่รองรับ',denied_modules:denied});
  for(const row of parsed.data.rows){const checked=entrySchema.safeParse(row.entry);if(!checked.success)return res.status(400).json({error:`ข้อมูลไม่ครบหรือรูปแบบผิด: ${row.entry.material_name||row.entry.category_code}`});}
  let batchId=null;
  try{
    const sourceDuplicates=await existingImportSourceKeys(parsed.data.rows.map(row=>row.source_key),MONTHLY_IMAGE_SOURCE);
    const entryDuplicates=await existingEntryCompositeKeys(parsed.data.rows.map(row=>row.entry));
    const candidates=parsed.data.rows.filter(row=>!sourceDuplicates.has(row.source_key)&&!entryDuplicates.has(entryCompositeKey(row.entry)));
    const batch=await supabase.from('import_batches').insert({source_type:MONTHLY_IMAGE_SOURCE,file_name:parsed.data.file_name,file_sha256:parsed.data.file_hash,status:'committing',total_rows:parsed.data.rows.length,ready_rows:candidates.length,skipped_rows:parsed.data.rows.length-candidates.length,review_rows:Number(parsed.data.preview_summary?.review||0),summary:{...(parsed.data.preview_summary||{}),month:parsed.data.month,document_type:parsed.data.document_type},created_by:req.user?.profileExists?req.user.id:null}).select('*').single();
    if(batch.error)throw batch.error; batchId=batch.data.id;
    const payload=candidates.map(candidate=>({...normalizeEntry(candidate.entry),source_system:MONTHLY_IMAGE_SOURCE,source_key:candidate.source_key,import_batch_id:batchId,created_by:req.user?.profileExists?req.user.id:null}));
    const inserted=payload.length?await supabase.from('data_entries').insert(payload).select('id'):({data:[],error:null}); if(inserted.error)throw inserted.error;
    const completed=await supabase.from('import_batches').update({status:'committed',imported_rows:inserted.data?.length||0,committed_at:new Date().toISOString()}).eq('id',batchId).select('*').single(); if(completed.error)throw completed.error;
    await audit(req,'commit_monthly_image','import_batches',batchId,null,{imported_rows:inserted.data?.length||0,skipped:parsed.data.rows.length-candidates.length,modules});
    return res.status(201).json({batch:completed.data,imported:inserted.data?.length||0,skipped:parsed.data.rows.length-candidates.length});
  }catch(error){if(batchId){await supabase.from('data_entries').delete().eq('import_batch_id',batchId);await supabase.from('import_batches').update({status:'failed',summary:{error:error.message}}).eq('id',batchId);}return res.status(500).json({error:error.message,rolled_back:Boolean(batchId)});}
});

app.get('/api/imports/monthly-image/history',requireSupabase,requirePermission('entries.import'),async(_req,res)=>{const result=await supabase.from('import_batches').select('*').eq('source_type',MONTHLY_IMAGE_SOURCE).order('created_at',{ascending:false}).limit(30);if(result.error)return res.status(500).json({error:result.error.message});return res.json(result.data||[]);});

app.post('/api/imports/monthly-image/:id/rollback',requireSupabase,requirePermission('entries.delete'),async(req,res)=>{const batch=await supabase.from('import_batches').select('*').eq('id',req.params.id).eq('source_type',MONTHLY_IMAGE_SOURCE).maybeSingle();if(batch.error)return res.status(500).json({error:batch.error.message});if(!batch.data)return res.status(404).json({error:'ไม่พบชุดนำเข้า'});if(batch.data.status!=='committed')return res.status(409).json({error:'ย้อนกลับได้เฉพาะชุดที่นำเข้าสำเร็จ'});const moduleRows=await supabase.from('data_entries').select('module').eq('import_batch_id',req.params.id);if(moduleRows.error)return res.status(500).json({error:moduleRows.error.message});const denied=[...new Set((moduleRows.data||[]).map(row=>row.module))].filter(module=>!canAccessModule(req.user,module,'delete'));if(denied.length)return res.status(403).json({error:'ไม่มีสิทธิ์ย้อนกลับข้อมูลบางโมดูล',denied_modules:denied});const removed=await supabase.from('data_entries').delete().eq('import_batch_id',req.params.id).select('id');if(removed.error)return res.status(500).json({error:removed.error.message});await supabase.from('import_batches').update({status:'rolled_back',rolled_back_at:new Date().toISOString()}).eq('id',req.params.id);await audit(req,'rollback_monthly_image','import_batches',req.params.id,batch.data,{removed:removed.data?.length||0});return res.json({removed:removed.data?.length||0});});

app.post('/api/imports/multi-sheet/preview', requireSupabase, requirePermission('entries.import'), excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel .xlsx' });
    const preview = await parseMultiSheetWorkbook(req.file.buffer, req.file.originalname);
    const readyRows = preview.rows.filter(row => row.status === 'ready');
    const existing = await existingImportSourceKeys(readyRows.map(row => row.source_key), MULTI_SHEET_SOURCE);
    const existingEntries = await existingEntryCompositeKeys(readyRows.map(row => row.entry));
    for (const row of readyRows) {
      if (!existing.has(row.source_key) && !existingEntries.has(entryCompositeKey(row.entry))) continue;
      row.status = 'duplicate';
      row.issues.push('รายการนี้เคยนำเข้าฐานข้อมูลแล้ว');
      preview.summary.ready -= 1;
      preview.summary.duplicate += 1;
    }
    preview.summary.importable = preview.summary.ready;
    await audit(req, 'preview_multi_sheet_excel', 'import_batches', null, null, { file_name:preview.file_name, file_hash:preview.file_hash, summary:preview.summary });
    return res.json(preview);
  } catch (error) {
    const migrationMissing = /source_key|import_batches|source_type/i.test(String(error.message || ''));
    return res.status(migrationMissing ? 503 : 400).json({ error:migrationMissing ? 'กรุณารัน database/P3_MULTI_SHEET_IMPORT.sql ก่อนใช้งาน' : error.message });
  }
});

app.post('/api/imports/hygiene/preview', requireSupabase, requirePermission('entries.import'), excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel .xlsx' });
    const preview = await parseHygieneWorkbook(req.file.buffer, req.file.originalname);
    const readyRows = preview.rows.filter(row => row.status === 'ready');
    const existing = await existingImportSourceKeys(readyRows.map(row => row.source_key));
    for (const row of readyRows) {
      if (existing.has(row.source_key)) {
        row.status = 'duplicate';
        row.issues.push('รายการนี้เคยนำเข้าฐานข้อมูลแล้ว');
        preview.summary.ready -= 1;
        preview.summary.duplicate = (preview.summary.duplicate || 0) + 1;
      }
    }
    preview.summary.importable = preview.rows.filter(row => row.status === 'ready').length;
    await audit(req, 'preview_hygiene_excel', 'import_batches', null, null, { file_name: preview.file_name, file_hash: preview.file_hash, summary: preview.summary });
    res.json(preview);
  } catch (error) {
    const migrationMissing = /source_key|import_batches/i.test(String(error.message || ''));
    res.status(migrationMissing ? 503 : 400).json({
      error: migrationMissing ? 'ยังไม่ได้ติดตั้งฐานข้อมูลสำหรับ Excel Import กรุณารัน P1_HYGIENE_EXCEL_IMPORT.sql' : error.message
    });
  }
});

const hygieneCommitSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_hash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({
    source_key: z.string().regex(/^[a-f0-9]{64}$/),
    entry: entrySchemaBase
  })).min(1).max(2000),
  preview_summary: z.record(z.any()).optional()
});

app.post('/api/imports/multi-sheet/commit', requireSupabase, requirePermission('entries.import'), async (req, res) => {
  const parsed = hygieneCommitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'ข้อมูลยืนยันการนำเข้าไม่ถูกต้อง', details:parsed.error.flatten() });
  const requestedModules = [...new Set(parsed.data.rows.map(row => row.entry.module))];
  const supported = new Set(['rdf', 'tissue', 'black_bag', 'dog_food']);
  if (requestedModules.some(module => !supported.has(module))) return res.status(400).json({ error:'พบโมดูลที่ไม่รองรับในชุดนำเข้า' });
  const denied = requestedModules.filter(module => !canAccessModule(req.user, module, 'read'));
  if (denied.length) return res.status(403).json({ error:'ไม่มีสิทธิ์เพิ่มข้อมูลบางโมดูล', denied_modules:denied });
  let batchId = null;
  try {
    const existing = await existingImportSourceKeys(parsed.data.rows.map(row => row.source_key), MULTI_SHEET_SOURCE);
    const existingEntries = await existingEntryCompositeKeys(parsed.data.rows.map(row => row.entry));
    const candidates = parsed.data.rows.filter(row => !existing.has(row.source_key) && !existingEntries.has(entryCompositeKey(row.entry)));
    const skippedCount = parsed.data.rows.length - candidates.length;
    const batchResult = await supabase.from('import_batches').insert({
      source_type:MULTI_SHEET_SOURCE, file_name:parsed.data.file_name, file_sha256:parsed.data.file_hash,
      status:'committing', total_rows:parsed.data.rows.length, ready_rows:candidates.length,
      skipped_rows:skippedCount, review_rows:Number(parsed.data.preview_summary?.review || 0),
      summary:parsed.data.preview_summary || {}, created_by:req.user?.profileExists ? req.user.id : null
    }).select('*').single();
    if (batchResult.error) throw batchResult.error;
    batchId = batchResult.data.id;
    const payload = candidates.map(candidate => {
      const entryParsed = entrySchema.safeParse(candidate.entry);
      if (!entryParsed.success) throw new Error(`ข้อมูลไม่ถูกต้องที่ ${candidate.entry.module} ${candidate.entry.entry_date}`);
      return { ...normalizeEntry(entryParsed.data), source_system:MULTI_SHEET_SOURCE, source_key:candidate.source_key, import_batch_id:batchId, created_by:req.user?.profileExists ? req.user.id : null };
    });
    let imported = 0;
    for (let offset = 0; offset < payload.length; offset += 400) {
      const inserted = await supabase.from('data_entries').insert(payload.slice(offset, offset + 400)).select('id');
      if (inserted.error) throw inserted.error;
      imported += inserted.data?.length || 0;
    }
    const completed = await supabase.from('import_batches').update({ status:'committed', imported_rows:imported, committed_at:new Date().toISOString() }).eq('id', batchId).select('*').single();
    if (completed.error) throw completed.error;
    await audit(req, 'commit_multi_sheet_excel', 'import_batches', batchId, null, { imported_rows:imported, skipped_rows:skippedCount, modules:requestedModules });
    return res.status(201).json({ batch:completed.data, imported, skipped:skippedCount });
  } catch (error) {
    if (batchId) {
      await supabase.from('data_entries').delete().eq('import_batch_id', batchId);
      await supabase.from('import_batches').update({ status:'failed', summary:{ ...(parsed.data.preview_summary || {}), error:error.message } }).eq('id', batchId);
    }
    return res.status(500).json({ error:error.message, rolled_back:Boolean(batchId) });
  }
});

app.get('/api/imports/multi-sheet/history', requireSupabase, requirePermission('entries.import'), async (_req, res) => {
  const result = await supabase.from('import_batches').select('*').eq('source_type', MULTI_SHEET_SOURCE).order('created_at', { ascending:false }).limit(50);
  if (result.error) return res.status(500).json({ error:result.error.message });
  return res.json(result.data || []);
});

app.post('/api/imports/multi-sheet/:id/rollback', requireSupabase, requirePermission('entries.delete'), async (req, res) => {
  const batch = await supabase.from('import_batches').select('*').eq('id', req.params.id).eq('source_type', MULTI_SHEET_SOURCE).maybeSingle();
  if (batch.error) return res.status(500).json({ error:batch.error.message });
  if (!batch.data) return res.status(404).json({ error:'ไม่พบชุดนำเข้า' });
  if (batch.data.status !== 'committed') return res.status(409).json({ error:'ย้อนกลับได้เฉพาะชุดที่นำเข้าสำเร็จแล้ว' });
  const moduleRows = await supabase.from('data_entries').select('module').eq('import_batch_id', req.params.id);
  if (moduleRows.error) return res.status(500).json({ error:moduleRows.error.message });
  const denied = [...new Set((moduleRows.data || []).map(row => row.module))].filter(module => !canAccessModule(req.user, module, 'delete'));
  if (denied.length) return res.status(403).json({ error:'ไม่มีสิทธิ์ลบข้อมูลบางโมดูล', denied_modules:denied });
  const removed = await supabase.from('data_entries').delete().eq('import_batch_id', req.params.id).select('id');
  if (removed.error) return res.status(500).json({ error:removed.error.message });
  const updated = await supabase.from('import_batches').update({ status:'rolled_back', rolled_back_at:new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (updated.error) return res.status(500).json({ error:updated.error.message });
  await audit(req, 'rollback_multi_sheet_excel', 'import_batches', req.params.id, batch.data, { removed_rows:removed.data?.length || 0 });
  return res.json({ batch:updated.data, removed:removed.data?.length || 0 });
});

app.post('/api/imports/hygiene/commit', requireSupabase, requirePermission('entries.import'), async (req, res) => {
  const parsed = hygieneCommitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลยืนยันการนำเข้าไม่ถูกต้อง', details: parsed.error.flatten() });
  const requestedModules = [...new Set(parsed.data.rows.map(row => row.entry.module))];
  const denied = requestedModules.filter(module => !canAccessModule(req.user, module, 'create'));
  if (denied.length) return res.status(403).json({ error: 'ไม่มีสิทธิ์เพิ่มข้อมูลบางโมดูล', denied_modules: denied });

  const definitions = await supabase.from('master_modules').select('code,active,input_mode').in('code', requestedModules);
  if (definitions.error) return res.status(500).json({ error: definitions.error.message });
  const activeDefinitions = new Map((definitions.data || []).map(item => [item.code, item]));
  const invalidModules = requestedModules.filter(code => !activeDefinitions.get(code)?.active || activeDefinitions.get(code)?.input_mode === 'calculated');
  if (invalidModules.length) return res.status(400).json({ error: 'โมดูลยังไม่พร้อมรับข้อมูล กรุณารัน migration หรือเปิดใช้งานโมดูล', invalid_modules: invalidModules });

  let batchId = null;
  try {
    const existing = await existingImportSourceKeys(parsed.data.rows.map(row => row.source_key));
    const candidates = parsed.data.rows.filter(row => !existing.has(row.source_key));
    const batchResult = await supabase.from('import_batches').insert({
      source_type: 'hygiene_enterprise',
      file_name: parsed.data.file_name,
      file_sha256: parsed.data.file_hash,
      status: 'committing',
      total_rows: parsed.data.rows.length,
      ready_rows: candidates.length,
      skipped_rows: existing.size,
      review_rows: Number(parsed.data.preview_summary?.review || 0),
      summary: parsed.data.preview_summary || {},
      created_by: req.user?.profileExists ? req.user.id : null
    }).select('*').single();
    if (batchResult.error) throw batchResult.error;
    batchId = batchResult.data.id;

    const payload = [];
    for (const candidate of candidates) {
      const entryParsed = entrySchema.safeParse(candidate.entry);
      if (!entryParsed.success) throw new Error(`ข้อมูลไม่ถูกต้องที่ source ${candidate.source_key.slice(0, 8)}`);
      payload.push({
        ...normalizeEntry(entryParsed.data),
        source_system: 'hygiene_enterprise',
        source_key: candidate.source_key,
        import_batch_id: batchId,
        created_by: req.user?.profileExists ? req.user.id : null
      });
    }

    let imported = 0;
    for (let offset = 0; offset < payload.length; offset += 400) {
      const inserted = await supabase.from('data_entries').insert(payload.slice(offset, offset + 400)).select('id');
      if (inserted.error) throw inserted.error;
      imported += inserted.data?.length || 0;
    }
    const completed = await supabase.from('import_batches').update({ status: 'committed', imported_rows: imported, committed_at: new Date().toISOString() }).eq('id', batchId).select('*').single();
    if (completed.error) throw completed.error;
    await audit(req, 'commit_hygiene_excel', 'import_batches', batchId, null, { imported_rows: imported, skipped_rows: existing.size, modules: requestedModules });
    res.status(201).json({ batch: completed.data, imported, skipped: existing.size });
  } catch (error) {
    if (batchId) {
      await supabase.from('data_entries').delete().eq('import_batch_id', batchId);
      await supabase.from('import_batches').update({ status: 'failed', summary: { ...(parsed.data.preview_summary || {}), error: error.message } }).eq('id', batchId);
    }
    res.status(500).json({ error: error.message, rolled_back: Boolean(batchId) });
  }
});

app.get('/api/imports/hygiene/history', requireSupabase, requirePermission('entries.import'), async (_req, res) => {
  const result = await supabase.from('import_batches').select('*').eq('source_type', 'hygiene_enterprise').order('created_at', { ascending: false }).limit(50);
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result.data || []);
});

app.post('/api/imports/hygiene/:id/rollback', requireSupabase, requirePermission('entries.delete'), async (req, res) => {
  const batch = await supabase.from('import_batches').select('*').eq('id', req.params.id).maybeSingle();
  if (batch.error) return res.status(500).json({ error: batch.error.message });
  if (!batch.data) return res.status(404).json({ error: 'ไม่พบชุดนำเข้า' });
  if (batch.data.status !== 'committed') return res.status(409).json({ error: 'ย้อนกลับได้เฉพาะชุดที่นำเข้าสำเร็จแล้ว' });
  const moduleRows = await supabase.from('data_entries').select('module').eq('import_batch_id', req.params.id);
  if (moduleRows.error) return res.status(500).json({ error: moduleRows.error.message });
  const denied = [...new Set((moduleRows.data || []).map(row => row.module))].filter(module => !canAccessModule(req.user, module, 'delete'));
  if (denied.length) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบข้อมูลบางโมดูล', denied_modules: denied });
  const removed = await supabase.from('data_entries').delete().eq('import_batch_id', req.params.id).select('id');
  if (removed.error) return res.status(500).json({ error: removed.error.message });
  const updated = await supabase.from('import_batches').update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (updated.error) return res.status(500).json({ error: updated.error.message });
  await audit(req, 'rollback_hygiene_excel', 'import_batches', req.params.id, batch.data, { removed_rows: removed.data?.length || 0 });
  res.json({ batch: updated.data, removed: removed.data?.length || 0 });
});

app.post('/api/imports/tissue/preview', requireSupabase, requirePermission('entries.import'), excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel .xlsx' });
    const preview = await parseTissueWorkbook(req.file.buffer, req.file.originalname);
    const readyRows = preview.rows.filter(row => row.status === 'ready');
    const existing = await existingImportSourceKeys(readyRows.map(row => row.source_key), 'tissue_excel');
    for (const row of readyRows) {
      if (!existing.has(row.source_key)) continue;
      row.status = 'duplicate';
      row.issues.push('วันที่และประเภทนี้เคยนำเข้าฐานข้อมูลแล้ว');
      preview.summary.ready -= 1;
      preview.summary.duplicate += 1;
    }
    preview.summary.importable = preview.summary.ready;
    await audit(req, 'preview_tissue_excel', 'import_batches', null, null, { file_name: preview.file_name, file_hash: preview.file_hash, summary: preview.summary });
    return res.json(preview);
  } catch (error) {
    const migrationMissing = /source_key|import_batches/i.test(String(error.message || ''));
    return res.status(migrationMissing ? 503 : 400).json({
      error: migrationMissing ? 'ยังไม่ได้ติดตั้งฐานข้อมูล Tissue Import กรุณารัน P2_TISSUE_EXCEL_IMPORT.sql' : error.message
    });
  }
});

app.post('/api/imports/tissue/commit', requireSupabase, requirePermission('entries.import'), async (req, res) => {
  const parsed = hygieneCommitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลยืนยันการนำเข้าไม่ถูกต้อง', details: parsed.error.flatten() });
  if (!canAccessModule(req.user, 'tissue', 'create')) return res.status(403).json({ error: 'ไม่มีสิทธิ์เพิ่มข้อมูล Tissue' });
  if (parsed.data.rows.some(row => row.entry.module !== 'tissue')) return res.status(400).json({ error: 'ชุดนำเข้านี้รับเฉพาะข้อมูล Tissue' });

  let batchId = null;
  try {
    const existing = await existingImportSourceKeys(parsed.data.rows.map(row => row.source_key), 'tissue_excel');
    const candidates = parsed.data.rows.filter(row => !existing.has(row.source_key));
    const batchResult = await supabase.from('import_batches').insert({
      source_type: 'tissue_excel', file_name: parsed.data.file_name, file_sha256: parsed.data.file_hash,
      status: 'committing', total_rows: parsed.data.rows.length, ready_rows: candidates.length,
      skipped_rows: existing.size, review_rows: Number(parsed.data.preview_summary?.review || 0),
      summary: parsed.data.preview_summary || {}, created_by: req.user?.profileExists ? req.user.id : null
    }).select('*').single();
    if (batchResult.error) throw batchResult.error;
    batchId = batchResult.data.id;

    const payload = candidates.map(candidate => {
      const entryParsed = entrySchema.safeParse(candidate.entry);
      if (!entryParsed.success) throw new Error(`ข้อมูล Tissue ไม่ถูกต้องที่ ${candidate.source_key.slice(0, 8)}`);
      return {
        ...normalizeEntry(entryParsed.data), source_system: 'tissue_excel', source_key: candidate.source_key,
        import_batch_id: batchId, created_by: req.user?.profileExists ? req.user.id : null
      };
    });
    let imported = 0;
    for (let offset = 0; offset < payload.length; offset += 400) {
      const inserted = await supabase.from('data_entries').insert(payload.slice(offset, offset + 400)).select('id');
      if (inserted.error) throw inserted.error;
      imported += inserted.data?.length || 0;
    }
    const completed = await supabase.from('import_batches').update({ status: 'committed', imported_rows: imported, committed_at: new Date().toISOString() }).eq('id', batchId).select('*').single();
    if (completed.error) throw completed.error;
    await audit(req, 'commit_tissue_excel', 'import_batches', batchId, null, { imported_rows: imported, skipped_rows: existing.size });
    return res.status(201).json({ batch: completed.data, imported, skipped: existing.size });
  } catch (error) {
    if (batchId) {
      await supabase.from('data_entries').delete().eq('import_batch_id', batchId);
      await supabase.from('import_batches').update({ status: 'failed', summary: { ...(parsed.data.preview_summary || {}), error: error.message } }).eq('id', batchId);
    }
    return res.status(500).json({ error: error.message, rolled_back: Boolean(batchId) });
  }
});

app.get('/api/imports/tissue/history', requireSupabase, requirePermission('entries.import'), async (_req, res) => {
  const result = await supabase.from('import_batches').select('*').eq('source_type', 'tissue_excel').order('created_at', { ascending: false }).limit(50);
  if (result.error) return res.status(500).json({ error: result.error.message });
  return res.json(result.data || []);
});

app.post('/api/imports/tissue/:id/rollback', requireSupabase, requirePermission('entries.delete'), async (req, res) => {
  const batch = await supabase.from('import_batches').select('*').eq('id', req.params.id).eq('source_type', 'tissue_excel').maybeSingle();
  if (batch.error) return res.status(500).json({ error: batch.error.message });
  if (!batch.data) return res.status(404).json({ error: 'ไม่พบชุดนำเข้า Tissue' });
  if (batch.data.status !== 'committed') return res.status(409).json({ error: 'ย้อนกลับได้เฉพาะชุดที่นำเข้าสำเร็จแล้ว' });
  if (!canAccessModule(req.user, 'tissue', 'delete')) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบข้อมูล Tissue' });
  const removed = await supabase.from('data_entries').delete().eq('import_batch_id', req.params.id).select('id');
  if (removed.error) return res.status(500).json({ error: removed.error.message });
  const updated = await supabase.from('import_batches').update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (updated.error) return res.status(500).json({ error: updated.error.message });
  await audit(req, 'rollback_tissue_excel', 'import_batches', req.params.id, batch.data, { removed_rows: removed.data?.length || 0 });
  return res.json({ batch: updated.data, removed: removed.data?.length || 0 });
});

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowed = file.mimetype === 'application/pdf' || String(file.originalname || '').toLowerCase().endsWith('.pdf');
    callback(allowed ? null : new Error('รองรับเฉพาะไฟล์ PDF'), allowed);
  }
});

app.post('/api/fmhy/import', requireSupabase, requirePermission('fmhy.import'), upload.single('file'), async (req, res) => {
  try {
    const commit = req.body.commit === 'true' || req.body.commit === true;
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (commit) {
      const entriesToSave = Array.isArray(req.body.entries) ? req.body.entries : JSON.parse(req.body.entries || '[]');
      if (!entriesToSave.length) {
        return res.status(400).json({ error: 'No entries to save provided' });
      }

      if (entriesToSave.length > 100) return res.status(400).json({ error: 'FM-HY import contains too many rows' });
      const period_month = monthStart(entriesToSave[0].period_month);
      if (!period_month) return res.status(400).json({ error: 'Invalid FM-HY month' });
      let finalPayload = [];
      for (const entry of entriesToSave) {
        const parsed = entrySchema.safeParse(entry);
        if (!parsed.success || monthStart(parsed.data.period_month) !== period_month) {
          return res.status(400).json({ error: 'ข้อมูล FM-HY ไม่ถูกต้องหรือมีหลายเดือนปะปนกัน' });
        }
        if (!canAccessModule(req.user, parsed.data.module, 'read')) return res.status(403).json({ error: 'ไม่มีสิทธิ์นำเข้าข้อมูลในโมดูลนี้' });
        finalPayload.push({ ...normalizeEntry(parsed.data), created_by: req.user.id });
      }
      for (const entry of finalPayload) {
        const definitionValidation = await validateEntryDefinition(entry);
        if (!definitionValidation.ok) return res.status(400).json({ error: definitionValidation.error });
      }

      if (overwrite) {
        const modulesToOverwrite = [...new Set(finalPayload.map(e => e.module))];
        const existing = await supabase
          .from('data_entries')
          .select('id')
          .eq('period_month', period_month)
          .in('module', modulesToOverwrite);
        if (existing.error) return res.status(500).json({ error: existing.error.message });
        const inserted = await supabase.from('data_entries').insert(finalPayload).select('*');
        if (inserted.error) return res.status(500).json({ error: inserted.error.message });
        const oldIds = (existing.data || []).map(row => row.id);
        if (oldIds.length) {
          const removed = await supabase.from('data_entries').delete().in('id', oldIds);
          if (removed.error) {
            await supabase.from('data_entries').delete().in('id', (inserted.data || []).map(row => row.id));
            return res.status(500).json({ error: 'ไม่สามารถแทนที่ข้อมูลเดิมได้ ระบบคืนค่าข้อมูลใหม่แล้ว' });
          }
        }
        await audit(req, 'import_overwrite', 'data_entries', null, null, { source: 'fmhy_import', count: inserted.data?.length || 0, replaced: oldIds.length });
        return res.json({ success: true, count: inserted.data?.length || 0, summary: `แทนที่ข้อมูล FM-HY เดือน ${period_month.slice(0, 7)} สำเร็จ ${(inserted.data || []).length} รายการ` });
      } else {
        // Skip mode (Default): filter out duplicates
        const { data: existing, error: fetchErr } = await supabase
          .from('data_entries')
          .select('*')
          .eq('period_month', period_month);

        if (fetchErr) return res.status(500).json({ error: fetchErr.message });

        const nonDuplicates = finalPayload.filter(candidate => {
          const isDuplicate = existing.some(
            ex => ex.module === candidate.module && ex.category_code === candidate.category_code
          );
          return !isDuplicate;
        });

        finalPayload = nonDuplicates;
      }

      if (finalPayload.length > 0) {
        const { data, error } = await supabase.from('data_entries').insert(finalPayload).select('*');
        if (error) return res.status(500).json({ error: error.message });
        await audit(req, 'import', 'data_entries', null, null, { source: 'fmhy_import', count: data.length });
        
        const summary = `นำเข้าข้อมูลรายงาน FM-HY สำเร็จทั้งหมด ${data.length} รายการสำหรับเดือน ${entriesToSave[0].period_month.slice(0, 7)} (ข้ามข้อมูลที่ซ้ำกัน ${entriesToSave.length - data.length} รายการ)`;
        return res.json({ success: true, count: data.length, summary });
      } else {
        return res.json({ success: true, count: 0, summary: 'ข้ามข้อมูลทั้งหมดเนื่องจากซ้ำกับข้อมูลที่มีอยู่แล้วในระบบ' });
      }
    }

    // Parse and Analyze Stage
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    const filePath = req.file.path;
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3';
    const parserScript = path.join(__dirname, 'fmhy-parser.py');

    execFile(pythonExecutable, [parserScript, filePath], async (err, stdout, stderr) => {
      // Clean up uploaded file
      try { fs.unlinkSync(filePath); } catch (e) {}

      if (err) {
        console.error('Parser error:', err, stderr);
        return res.status(500).json({ error: 'Failed to parse PDF', details: err.message });
      }

      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.success) {
          return res.status(422).json({ error: parsed.error || 'Invalid report structure' });
        }

        const period_month = `${parsed.month}-01`;
        const { data: existingEntries, error: fetchErr } = await supabase
          .from('data_entries')
          .select('*')
          .eq('period_month', period_month);

        if (fetchErr) return res.status(500).json({ error: fetchErr.message });

        const candidateEntries = [
          { module: 'tissue', category_code: 'tissue_roll', material_name: 'กระดาษทิชชู่ ม้วน', quantity: parsed.data.tissue.roll, unit: 'ม้วน' },
          { module: 'tissue', category_code: 'tissue_hand', material_name: 'กระดาษทิชชู่ มือ', quantity: parsed.data.tissue.hand, unit: 'แพ็ค' },
          { module: 'tissue', category_code: 'tissue_popup', material_name: 'กระดาษทิชชู่ ป๊อปอัพ', quantity: parsed.data.tissue.popup, unit: 'แพ็ค' },
          { module: 'rdf', category_code: 'RDF', material_name: 'ขยะ RDF', weight_kg: parsed.data.waste.rdf, unit: 'kg' },
          { module: 'recycle', category_code: 'recycle_other', material_name: 'ขยะรีไซเคิล', weight_kg: parsed.data.waste.recycle_weight, amount: parsed.data.recycle_revenue, unit: 'kg' },
          { module: 'pig_feed', category_code: 'PIG_FEED', material_name: 'อาหารหมู (ขยะเปียก)', weight_kg: parsed.data.animal_feed.pig_feed, unit: 'kg' },
          { module: 'dog_food', category_code: 'DOG_FOOD', material_name: 'อาหารสุนัข (ขยะเปียก)', weight_kg: parsed.data.animal_feed.dog_food, unit: 'kg' },
          { module: 'black_bag', category_code: 'black_bag_small', material_name: 'ถุงดำเล็ก (18x20)', quantity: parsed.data.garbage_bags.small, unit: 'kg' },
          { module: 'black_bag', category_code: 'black_bag_medium', material_name: 'ถุงดำกลาง (28x36)', quantity: parsed.data.garbage_bags.medium, unit: 'kg' },
          { module: 'black_bag', category_code: 'black_bag_large', material_name: 'ถุงดำใหญ่ (30x40)', quantity: parsed.data.garbage_bags.large, unit: 'kg' }
        ].map(item => ({
          ...item,
          entry_date: period_month,
          period_month: period_month,
          metadata: { source: 'fmhy_import' }
        }));

        const entries = candidateEntries.map(candidate => {
          const isDuplicate = existingEntries.some(
            ex => ex.module === candidate.module && ex.category_code === candidate.category_code
          );
          return {
            ...candidate,
            isDuplicate
          };
        });

        const hasConflicts = entries.some(e => e.isDuplicate);

        res.json({
          success: true,
          month: parsed.month,
          thai_month: parsed.thai_month,
          year_be: parsed.year_be,
          entries,
          hasConflicts
        });
      } catch (e) {
        console.error('Failed to process JSON output:', e, stdout);
        res.status(500).json({ error: 'Failed to process parser output', details: e.message });
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard', requireSupabase, requirePermission('dashboard.read'), async (req, res) => {
  const month = monthStart(req.query.month || thailandMonth());
  const moduleAction = req.query.forExport === 'true' ? 'export' : 'read';
  let entriesQuery = supabase.from('data_entries').select('*').eq('period_month', month);
  const allowed = allowedModuleCodes(req.user, moduleAction);
  if (allowed && !allowed.length) return res.json({ month, ...summarizeRows([]), dynamic_modules: [] });
  if (allowed) entriesQuery = entriesQuery.in('module', allowed);
  const { data, error } = await entriesQuery;
  if (error) return res.status(500).json({ error: error.message });
  const summary = summarizeRows(data || []);
  const modulesResult = await supabase.from('master_modules').select('*').eq('active', true).order('sort_order');
  const fieldsResult = await supabase.from('module_fields').select('*').eq('active', true).order('sort_order');
  const formulasResult = await supabase.from('module_formulas').select('*').eq('active', true);
  if (modulesResult.error || fieldsResult.error || formulasResult.error) return res.status(500).json({ error: modulesResult.error?.message || fieldsResult.error?.message || formulasResult.error?.message });
  const visibleModules = (modulesResult.data || []).filter(module => canAccessModule(req.user, module.code, moduleAction));
  const dynamicModules = visibleModules.map(module => {
    const rows = (data || []).filter(row => row.module === module.code);
    const field = (fieldsResult.data || []).find(item => item.module_code === module.code && item.field_key === module.primary_metric);
    const values = rows.map(row => Number(row[module.primary_metric] ?? row.metadata?.dynamic_fields?.[module.primary_metric])).filter(Number.isFinite);
    let metricValue = values.reduce((sum, value) => sum + value, 0);
    if (module.aggregation === 'average') metricValue = values.length ? metricValue / values.length : 0;
    if (module.aggregation === 'latest') metricValue = values.length ? values[values.length - 1] : 0;
    if (module.aggregation === 'count') metricValue = rows.length;
    if (module.aggregation === 'calculated') {
      const formula = (formulasResult.data || []).find(item => item.module_code === module.code && item.output_field === module.primary_metric);
      metricValue = evaluateModuleFormula(formula, data || []);
    }
    return { ...module, metric_value: metricValue, metric_unit: module.default_unit || field?.unit || '', count: rows.length };
  });
  res.json({ month, ...summary, dynamic_modules: dynamicModules });
});

app.get('/api/data-quality', requireSupabase, requirePermission('quality.read'), async (req, res) => {
  const month = monthStart(req.query.month || thailandMonth());
  let query = supabase.from('data_entries').select('module,entry_date,weight_kg,quantity,amount').eq('period_month', month);
  const allowed = allowedModuleCodes(req.user, 'read');
  if (allowed && !allowed.length) return res.json({ month, scores: [] });
  if (allowed) query = query.in('module', allowed);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  let modulesQuery = supabase.from('master_modules').select('code,name_th,input_mode,primary_metric,active').eq('active', true);
  if (allowed) modulesQuery = modulesQuery.in('code', allowed);
  const definitions = await modulesQuery;
  if (definitions.error) return res.status(500).json({ error: definitions.error.message });
  res.json({ month, scores: buildQualityScores(data || [], month, definitions.data || []) });
});

app.get('/api/insights', requireSupabase, requirePermission('insights.read'), async (req, res) => {
  try {
    const month = req.query.month || thailandMonth();
    const modules = req.query.modules ? String(req.query.modules).split(',').filter(Boolean) : [];
    const result = await buildMetadataAwareInsights(month, modules, req.user);
    await audit(req, 'ai_insight', 'module_ai_settings', null, null, { month: monthStart(month), enabled_modules: result.enabled_modules, engine: result.engine, ai_status: result.ai?.status || 'local_only' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/charts/preview', requireSupabase, requirePermission('charts.read'), async (req, res) => {
  try {
    const month = req.query.month || thailandMonth();
    const requested = String(req.query.modules || MODULE_ORDER.join(',')).split(',').filter(Boolean);
    const modules = authorizeRequestedModules(req, res, requested, 'read');
    if (!modules) return;
    const rows = await getEntriesForMonth(month, modules);
    res.json(buildChartPreview({ month, rows, modules }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chart-builder/data', requireSupabase, requirePermission('charts.read'), async (req, res) => {
  try {
    const startMonth = String(req.query.startMonth || thailandMonth()).slice(0, 7);
    const endMonth = String(req.query.endMonth || startMonth).slice(0, 7);
    const metric = String(req.query.metric || 'weight_kg');
    const groupBy = String(req.query.groupBy || (startMonth === endMonth ? 'daily' : 'monthly'));
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth) || startMonth > endMonth) {
      return res.status(400).json({ error: 'Invalid chart month range' });
    }
    if (!['weight_kg', 'quantity', 'amount', 'count'].includes(metric)) return res.status(400).json({ error: 'Invalid chart metric' });
    if (!['daily', 'monthly'].includes(groupBy)) return res.status(400).json({ error: 'Invalid chart grouping' });
    const startIndex = Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(5, 7));
    const endIndex = Number(endMonth.slice(0, 4)) * 12 + Number(endMonth.slice(5, 7));
    if (endIndex - startIndex > 23) return res.status(400).json({ error: 'Chart range must not exceed 24 months' });

    const requestedSeries = String(req.query.series || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 30);
    if (!requestedSeries.length) return res.json({ start_month: startMonth, end_month: endMonth, metric, group_by: groupBy, has_data: false, compatible_units: true, units: [], series: [], points: [] });
    const requestedModules = [...new Set(requestedSeries.map(token => parseSeriesToken(token).module))];
    const authorized = authorizeRequestedModules(req, res, requestedModules, 'read');
    if (!authorized) return;

    const databaseModules = [...new Set(requestedModules.flatMap(module => databaseModulesFor(module)))];
    const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
    const endDate = `${endMonth}-${String(new Date(endYear, endMonthNumber, 0).getDate()).padStart(2, '0')}`;
    const buildQuery = () => supabase.from('data_entries').select('*')
      .in('module', databaseModules)
      .gte('period_month', `${startMonth}-01`)
      .lte('period_month', `${endMonth}-01`)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    const rows = await fetchAllPages(buildQuery);
    const result = aggregateChartRows({ rows, requestedSeries, metric, groupBy, moduleLabels: MODULES });
    res.json({ start_month: startMonth, end_month: endMonth, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/preview', requireSupabase, requirePermission('reports.preview'), async (req, res) => {
  try {
    const month = req.query.month || thailandMonth();
    const requested = String(req.query.modules || MODULE_ORDER.join(',')).split(',').filter(Boolean);
    const modules = authorizeRequestedModules(req, res, requested, 'read');
    if (!modules) return;
    const rows = await getEntriesForMonth(month, modules);
    const previousRows = await getEntriesForMonth(previousMonth(month), modules);
    const summary = summarizeRows(rows);
    const insights = buildAdvancedInsights({ month, rows, previousRows });
    const chartPreview = buildChartPreview({ month, rows, modules });
    const outline = buildReportOutline({ month, title: req.query.title || 'รายงานขยะประจำเดือน', modules, summary, insights, charts: chartPreview.charts });
    res.json({ month: monthStart(month), modules, summary, insights, charts: chartPreview.charts, outline });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports/powerpoint', requireSupabase, requirePermission('reports.export'), async (req, res) => {
  try {
    const month = req.body.month || thailandMonth();
    const requested = Array.isArray(req.body.modules) && req.body.modules.length ? req.body.modules : MODULE_ORDER;
    const modules = authorizeRequestedModules(req, res, requested, 'export');
    if (!modules) return;
    const rows = await getEntriesForMonth(month, modules);
    const previousRows = await getEntriesForMonth(previousMonth(month), modules);
    const summary = summarizeRows(rows);
    const insights = buildAdvancedInsights({ month, rows, previousRows });
    const chartPreview = buildChartPreview({ month, rows, modules });
    const outline = Array.isArray(req.body.outline) && req.body.outline.length
      ? req.body.outline
      : buildReportOutline({ month, title: req.body.title, modules, summary, insights, charts: chartPreview.charts });
    const buffer = await createPowerPointBuffer({ month, title: req.body.title, outline, rows, summary, insights, charts: chartPreview.charts });
    const safeMonth = monthStart(month).slice(0, 7);
    await supabase.from('report_runs').insert({
      report_type: 'powerpoint',
      title: req.body.title || 'รายงานขยะประจำเดือน',
      period_month: monthStart(month),
      modules,
      outline,
      status: 'success',
      created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null
    });
    await audit(req, 'export_powerpoint', 'report_runs', null, null, { month: safeMonth, modules, slides: outline.filter(s => s.enabled !== false).length, charts: chartPreview.charts.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="CKAP-${safeMonth}.pptx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports/client-export', requireSupabase, requirePermission('reports.export'), async (req, res) => {
  const parsed = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    title: z.string().min(1).max(300),
    modules: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(100),
    outline: z.array(z.record(z.any())).max(100).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลการส่งออกรายงานไม่ถูกต้อง' });
  const modules = authorizeRequestedModules(req, res, parsed.data.modules, 'export');
  if (!modules) return;
  const saved = await supabase.from('report_runs').insert({
    report_type: 'powerpoint_client', title: parsed.data.title, period_month: monthStart(parsed.data.month),
    modules, outline: parsed.data.outline || [], status: 'success', created_by: req.user.id
  }).select('id').single();
  if (saved.error) return res.status(500).json({ error: saved.error.message });
  await audit(req, 'export_powerpoint', 'report_runs', saved.data.id, null, { month: parsed.data.month, modules });
  return res.status(201).json({ ok: true, report_run_id: saved.data.id });
});

app.get('/api/users', requireSupabase, requirePermission('users.read'), async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const schema = z.object({ email: z.string().email(), display_name: z.string().min(1), role: z.enum(ROLE_KEYS), active: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user', details: parsed.error.flatten() });
  if (!canAssignRole(req.user, parsed.data.role)) return res.status(403).json({ error: 'เฉพาะ Owner เท่านั้นที่กำหนดบทบาท Owner ได้' });
  const redirectTo = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/?set-password=1`;
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo, data: { display_name: parsed.data.display_name, role: parsed.data.role } }
  );
  if (authError) return res.status(500).json({ error: authError.message });
  const profilePayload = { id: authData.user.id, email: parsed.data.email, display_name: parsed.data.display_name, role: parsed.data.role, active: parsed.data.active ?? true };
  const { data, error } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' }).select('*').single();
  if (error) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: error.message });
  }
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'profiles', data.id, null, data);
  res.status(201).json(data);
});

app.post('/api/users/:id/resend-invite', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', req.params.id).single();
  if (profileError) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const redirectTo = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/?set-password=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo });
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'resend_invite', 'profiles', profile.id, null, { email: profile.email });
  res.json({ ok: true });
});

app.put('/api/users/:id', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const oldRow = await supabase.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const parsed = z.object({
    email: z.string().email().optional(),
    display_name: z.string().min(1).optional(),
    role: z.enum(ROLE_KEYS).optional(),
    active: z.boolean().optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลผู้ใช้ไม่ถูกต้อง', details: parsed.error.flatten() });
  if (parsed.data.role && !canAssignRole(req.user, parsed.data.role)) return res.status(403).json({ error: 'เฉพาะ Owner เท่านั้นที่กำหนดบทบาท Owner ได้' });
  const removesOwner = oldRow.data.role === 'owner' && (parsed.data.role && parsed.data.role !== 'owner' || parsed.data.active === false);
  if (removesOwner && await isLastActiveOwner(req.params.id)) return res.status(409).json({ error: 'ไม่สามารถลดสิทธิ์หรือปิด Owner คนสุดท้ายได้' });
  const payload = {
    email: parsed.data.email,
    display_name: parsed.data.display_name,
    role: parsed.data.role,
    active: parsed.data.active,
    updated_at: new Date().toISOString()
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  if (parsed.data.email && parsed.data.email !== oldRow.data.email) {
    const authUpdate = await supabase.auth.admin.updateUserById(req.params.id, { email: parsed.data.email });
    if (authUpdate.error) return res.status(500).json({ error: 'ไม่สามารถเปลี่ยนอีเมล Authentication ได้' });
  }
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'profiles', data.id, oldRow.data || null, data);
  res.json(data);
});

app.delete('/api/users/:id', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const oldRow = await supabase.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (req.params.id === req.user?.id) return res.status(409).json({ error: 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่' });
  if (await isLastActiveOwner(req.params.id)) return res.status(409).json({ error: 'ไม่สามารถลบ Owner คนสุดท้ายได้' });
  const { error: authError } = await supabase.auth.admin.deleteUser(req.params.id);
  if (authError && !String(authError.message || '').toLowerCase().includes('not found')) {
    return res.status(500).json({ error: authError.message });
  }
  const { error } = await supabase.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'delete', 'profiles', req.params.id, oldRow.data || null, null);
  res.json({ ok: true });
});

app.get('/api/roles', requireSupabase, requirePermission('roles.read'), async (req, res) => {
  const roles = await supabase.from('roles').select('*').order('sort_order');
  if (roles.error) return res.status(500).json({ error: roles.error.message });
  const permissions = await supabase.from('permissions').select('*').order('sort_order');
  if (permissions.error) return res.status(500).json({ error: permissions.error.message });
  const matrix = await supabase.from('role_permissions').select('*');
  if (matrix.error) return res.status(500).json({ error: matrix.error.message });
  res.json({ roles: roles.data || [], permissions: permissions.data || [], role_permissions: matrix.data || [] });
});

app.put('/api/roles/:roleKey/permissions', requireSupabase, requirePermission('roles.manage'), async (req, res) => {
  const roleKey = req.params.roleKey;
  if (!ROLE_KEYS.includes(roleKey)) return res.status(404).json({ error: 'ไม่พบบทบาท' });
  if (roleKey === 'owner' && req.user?.role !== 'owner') return res.status(403).json({ error: 'เฉพาะ Owner เท่านั้นที่แก้สิทธิ์ Owner ได้' });
  const parsed = z.object({ permissions: z.array(z.string()).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'รายการสิทธิ์ไม่ถูกต้อง' });
  const permissions = Array.from(new Set(parsed.data.permissions));
  const known = await supabase.from('permissions').select('permission_key').in('permission_key', permissions.length ? permissions : ['__none__']);
  if (known.error) return res.status(500).json({ error: known.error.message });
  if ((known.data || []).length !== permissions.length) return res.status(400).json({ error: 'พบ Permission ที่ไม่มีอยู่ในระบบ' });
  if (permissions.length) {
    const payload = permissions.map(permission_key => ({ role_key: roleKey, permission_key, allowed: true }));
    const { error } = await supabase.from('role_permissions').upsert(payload);
    if (error) return res.status(500).json({ error: error.message });
  }
  let deleteQuery = supabase.from('role_permissions').delete().eq('role_key', roleKey);
  if (permissions.length) deleteQuery = deleteQuery.not('permission_key', 'in', `(${permissions.map(value => `"${value.replace(/"/g, '')}"`).join(',')})`);
  const { error: delError } = await deleteQuery;
  if (delError) return res.status(500).json({ error: delError.message });
  await audit(req, 'update_permissions', 'role_permissions', null, null, { role_key: roleKey, permissions });
  res.json({ ok: true, role_key: roleKey, permissions });
});

app.get('/api/audit-logs', requireSupabase, requirePermission('audit.read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/automation/jobs', requireSupabase, requirePermission('automation.read'), async (req, res) => {
  const { data, error } = await supabase.from('automation_jobs').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/automation/jobs', requireSupabase, requirePermission('automation.manage'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    action_type: z.enum(['data_quality_check', 'monthly_summary', 'report_preview', 'ai_insight_check', 'chart_preview']),
    enabled: z.boolean().optional(),
    interval_minutes: z.coerce.number().int().min(5).max(525600).optional(),
    next_run_at: z.string().datetime().optional().nullable(),
    config: z.record(z.any()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid automation job', details: parsed.error.flatten() });
  const payload = {
    ...parsed.data,
    enabled: parsed.data.enabled ?? true,
    interval_minutes: Number(parsed.data.interval_minutes || 1440),
    next_run_at: parsed.data.next_run_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    config: parsed.data.config || {},
    created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null
  };
  const { data, error } = await supabase.from('automation_jobs').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'automation_jobs', data.id, null, data);
  res.status(201).json(data);
});

app.put('/api/automation/jobs/:id', requireSupabase, requirePermission('automation.manage'), async (req, res) => {
  const oldRow = await supabase.from('automation_jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'ไม่พบ Automation Job' });
  const parsed = z.object({
    name: z.string().min(1).optional(),
    action_type: z.enum(['data_quality_check', 'monthly_summary', 'report_preview', 'ai_insight_check', 'chart_preview']).optional(),
    enabled: z.boolean().optional(),
    interval_minutes: z.coerce.number().int().min(5).max(525600).optional(),
    next_run_at: z.string().datetime().optional().nullable(),
    config: z.record(z.any()).optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูล Automation ไม่ถูกต้อง', details: parsed.error.flatten() });
  const payload = { ...parsed.data, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('automation_jobs').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'automation_jobs', data.id, oldRow.data || null, data);
  res.json(data);
});

app.post('/api/automation/jobs/:id/run', requireSupabase, requirePermission('automation.run'), async (req, res) => {
  const { data: job, error } = await supabase.from('automation_jobs').select('*').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  const result = await runAutomationJob(job, req);
  await supabase.from('automation_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', job.id);
  await audit(req, 'run', 'automation_jobs', job.id, null, result);
  res.json(result);
});

app.get('/api/automation/runs', requireSupabase, requirePermission('automation.read'), async (req, res) => {
  const { data, error } = await supabase.from('automation_runs').select('*').order('started_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET all categories (both active and inactive) for Settings
app.get('/api/master-categories/all', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const { data, error } = await supabase.from('master_categories').select('*').order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const mapped = (data || []).map(item => ({ ...item, unit: canonicalOperationalUnit(item.module, item.code, item.unit), color: item.color_hex || item.color }));
  res.json(mapped);
});

// POST to create a master category
app.post('/api/master-categories', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const schema = z.object({
    module: z.enum(['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'waste', 'animal_feed', 'garbage_bag', 'scrap_material', 'consumable', 'cleaning_liquid']),
    code: z.string().min(1),
    name_th: z.string().min(1),
    name_en: z.string().optional().nullable(),
    unit: z.string().min(1),
    color: z.string().optional().nullable(),
    sort_order: z.number().int().optional().default(0),
    active: z.boolean().optional().default(true)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid master category payload', details: parsed.error.flatten() });
  
  const payload = {
    module: parsed.data.module,
    code: parsed.data.code,
    name_th: parsed.data.name_th,
    name_en: parsed.data.name_en || null,
    unit: parsed.data.unit,
    color: parsed.data.color || null,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active
  };

  const { data, error } = await supabase.from('master_categories').insert(payload).select('*').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'รหัสหรือชื่อ Master Data นี้มีอยู่แล้วในหมวดที่เลือก' });
    return res.status(500).json({ error: error.message });
  }
  await audit(req, 'create', 'master_categories', data.id, null, data);
  res.status(201).json(data);
});

// PUT to edit a master category
app.put('/api/master-categories/:id', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const oldRow = await supabase.from('master_categories').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Category not found' });

  const schema = z.object({
    name_th: z.string().min(1).optional(),
    name_en: z.string().optional().nullable(),
    unit: z.string().min(1).optional(),
    color: z.string().optional().nullable(),
    sort_order: z.number().int().optional(),
    active: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload', details: parsed.error.flatten() });

  const payload = {
    name_th: parsed.data.name_th,
    name_en: parsed.data.name_en,
    unit: parsed.data.unit,
    color: parsed.data.color,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active,
    updated_at: new Date().toISOString()
  };

  // Remove undefined fields
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabase.from('master_categories').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'master_categories', data.id, oldRow.data, data);
  res.json(data);
});

// DELETE a master category (blocks deletion if used in data_entries)
app.delete('/api/master-categories/:id', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const oldRow = await supabase.from('master_categories').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Category not found' });

  // Check if used in data_entries
  const { count, error: countErr } = await supabase
    .from('data_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_code', oldRow.data.code);

  if (countErr) return res.status(500).json({ error: countErr.message });
  if (count > 0) {
    return res.status(400).json({
      error: 'Cannot delete category: it has active data entries in the system. Please set active = false to deactivate it instead.'
    });
  }

  // Otherwise, delete physically
  const { error: delErr } = await supabase.from('master_categories').delete().eq('id', req.params.id);
  if (delErr) return res.status(500).json({ error: delErr.message });
  await audit(req, 'delete', 'master_categories', req.params.id, oldRow.data, null);
  res.json({ ok: true });
});

app.get('/api/system-check', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const requiredTables = ['profiles','roles','permissions','role_permissions','user_permission_overrides','master_categories','data_entries','import_batches','audit_logs','report_presets','report_runs','report_files','automation_jobs','automation_runs','master_modules','module_fields','module_formulas','module_ai_settings'];
  const tableResults = await Promise.all(requiredTables.map(async table => {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    return { table, ok: !error, error: error?.message || null };
  }));
  const { data: authData, error: authError } = req.user?.id
    ? await supabase.auth.admin.getUserById(req.user.id)
    : { data: null, error: new Error('No authenticated user') };
  const authUser = authData?.user || null;
  const profileMatchesAuth = Boolean(authUser && req.user?.profileExists && authUser.id === req.user.id);
  const projectHost = (() => { try { return new URL(supabaseUrl).host; } catch { return null; } })();
  res.json({
    checked_at: new Date().toISOString(),
    backend: { ok: true, version: VERSION, node: process.version, environment: process.env.NODE_ENV || 'development', auth_mode: 'http_only_cookie', timezone: 'Asia/Bangkok' },
    supabase: { ok: isSupabaseConfigured, project_host: projectHost, tables: tableResults },
    authentication: {
      ok: !authError && profileMatchesAuth,
      auth_user_found: Boolean(authUser),
      profile_found: Boolean(req.user?.profileExists),
      uuid_matches: profileMatchesAuth,
      email_matches: Boolean(authUser?.email && req.user?.email && authUser.email.toLowerCase() === req.user.email.toLowerCase()),
      role: req.user?.role || 'blocked',
      error: authError?.message || null
    },
    environment: {
      supabase_url: Boolean(process.env.SUPABASE_URL),
      service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      anon_key: Boolean(process.env.SUPABASE_ANON_KEY),
      frontend_url: Boolean(process.env.FRONTEND_URL),
      ai_insight_api_url: Boolean(process.env.AI_INSIGHT_API_URL),
      ai_insight_api_key: Boolean(process.env.AI_INSIGHT_API_KEY),
      ai_insight_model: Boolean(process.env.AI_INSIGHT_MODEL)
    }
  });
});

app.get('/api/modules', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const modules = await supabase.from('master_modules').select('*').order('sort_order');
  if (modules.error) return res.status(500).json({ error: modules.error.message });
  const fields = await supabase.from('module_fields').select('*').order('sort_order');
  if (fields.error) return res.status(500).json({ error: fields.error.message });
  res.json((modules.data || []).map(module => ({ ...module, fields: (fields.data || []).filter(field => field.module_code === module.code) })));
});

app.get('/api/modules-active', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const modules = await supabase.from('master_modules').select('*').eq('active', true).order('sort_order');
  if (modules.error) return res.status(500).json({ error: modules.error.message });
  const fields = await supabase.from('module_fields').select('*').eq('active', true).order('sort_order');
  if (fields.error) return res.status(500).json({ error: fields.error.message });
  res.json((modules.data || []).filter(module => canAccessModule(req.user, module.code, 'read')).map(module => ({ ...module, fields: (fields.data || []).filter(field => field.module_code === module.code) })));
});

app.get('/api/module-ai-settings', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const modules = await supabase.from('master_modules').select('code,name_th,primary_metric,aggregation,better_direction,active').order('sort_order');
  if (modules.error) return res.status(500).json({ error: modules.error.message });
  const settings = await supabase.from('module_ai_settings').select('*');
  if (settings.error) return res.status(500).json({ error: settings.error.message });
  const byCode = new Map((settings.data || []).map(item => [item.module_code, item]));
  res.json((modules.data || []).map(module => ({ module, settings: byCode.get(module.code) || { module_code: module.code, enabled: false, primary_metric: module.primary_metric, aggregation: module.aggregation, better_direction: module.better_direction, warning_change_percent: 15, allowed_fields: [module.primary_metric], excluded_fields: ['created_by'] } })));
});

const moduleAiSettingsSchema = z.object({
  enabled: z.boolean(), context_th: z.string().max(2000).optional().nullable(), primary_metric: z.string().regex(/^[a-z][a-z0-9_]*$/),
  aggregation: z.enum(['sum','average','latest','count','calculated']), better_direction: z.enum(['lower','higher','neutral']),
  warning_change_percent: z.number().min(0).max(1000).optional().nullable(), allowed_fields: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(30),
  excluded_fields: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(30), instructions: z.string().max(2000).optional().nullable()
});

app.put('/api/module-ai-settings/:code', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const parsed = moduleAiSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'การตั้งค่า AI ไม่ถูกต้อง', details: parsed.error.flatten() });
  const moduleResult = await supabase.from('master_modules').select('code').eq('code', req.params.code).maybeSingle();
  if (!moduleResult.data) return res.status(404).json({ error: 'ไม่พบโมดูล' });
  const old = await supabase.from('module_ai_settings').select('*').eq('module_code', req.params.code).maybeSingle();
  const payload = { module_code: req.params.code, ...parsed.data, updated_at: new Date().toISOString() };
  const saved = await supabase.from('module_ai_settings').upsert(payload).select('*').single();
  if (saved.error) return res.status(500).json({ error: saved.error.message });
  await audit(req, 'update_ai_settings', 'module_ai_settings', req.params.code, old.data || null, saved.data);
  res.json(saved.data);
});

const moduleSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]*$/), name_th: z.string().min(1), description: z.string().optional().nullable(),
  input_mode: z.enum(['daily','monthly','daily_average','transaction','multi_row','hybrid','calculated']),
  icon_key: z.string().optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), primary_metric: z.string().min(1),
  default_unit: z.string().optional().nullable(), aggregation: z.enum(['sum','average','latest','count','calculated']),
  better_direction: z.enum(['lower','higher','neutral']), allow_csv_import: z.boolean().optional(), allow_csv_export: z.boolean().optional(),
  active: z.boolean().optional(), sort_order: z.number().int().optional(), fields: z.array(z.object({
    field_key: z.string().regex(/^[a-z][a-z0-9_]*$/), label_th: z.string().min(1), data_type: z.enum(['text','integer','decimal','date','month','select','boolean','calculated']),
    required: z.boolean().optional(), unit: z.string().optional().nullable(), placeholder: z.string().max(200).optional().nullable(),
    options: z.array(z.union([z.string(), z.object({ value: z.string(), label: z.string() })])).max(100).optional(),
    validation: z.record(z.any()).optional(), sort_order: z.number().int().optional(), active: z.boolean().optional()
  })).optional()
});

app.post('/api/modules', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const parsed = moduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลหมวดหลักไม่ถูกต้อง', details: parsed.error.flatten() });
  const { fields = [], ...module } = parsed.data;
  const { data, error } = await supabase.from('master_modules').insert({ ...module, system_module: false, category_module_code: module.code }).select('*').single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'รหัสหมวดหลักนี้มีอยู่แล้ว' : error.message });
  if (fields.length) {
    const payload = fields.map((field, index) => ({ ...field, module_code: data.code, sort_order: field.sort_order ?? (index + 1) * 10, validation: field.validation || {} }));
    const inserted = await supabase.from('module_fields').insert(payload);
    if (inserted.error) {
      await supabase.from('master_modules').delete().eq('id', data.id);
      await supabase.from('permissions').delete().like('permission_key', `modules.${data.code}.%`);
      return res.status(500).json({ error: inserted.error.message });
    }
  }
  const permissionRows = [
    { permission_key: modulePermissionKey(data.code, 'read'), permission_name_th: `ดูโมดูล ${data.name_th}`, permission_group: 'modules', description: `เข้าถึงข้อมูลและ Dashboard ของ ${data.name_th}`, sort_order: 1000 + Number(data.sort_order || 0) },
    { permission_key: modulePermissionKey(data.code, 'export'), permission_name_th: `ส่งออกรายงาน ${data.name_th}`, permission_group: 'modules', description: `ส่งออก CSV/PDF/PowerPoint ของ ${data.name_th}`, sort_order: 1001 + Number(data.sort_order || 0) }
  ];
  const permissionInsert = await supabase.from('permissions').upsert(permissionRows);
  if (!permissionInsert.error) await supabase.from('role_permissions').upsert(permissionRows.map(item => ({ role_key: 'owner', permission_key: item.permission_key, allowed: true })));
  await audit(req, 'create', 'master_modules', data.id, null, { ...data, fields });
  res.status(201).json({ ...data, fields });
});

app.put('/api/modules/:code', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const parsed = moduleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ข้อมูลหมวดหลักไม่ถูกต้อง', details: parsed.error.flatten() });
  const { fields, code: ignoredCode, ...patch } = parsed.data;
  const old = await supabase.from('master_modules').select('*').eq('code', req.params.code).maybeSingle();
  if (!old.data) return res.status(404).json({ error: 'ไม่พบหมวดหลัก' });
  const updated = await supabase.from('master_modules').update({ ...patch, updated_at: new Date().toISOString() }).eq('code', req.params.code).select('*').single();
  if (updated.error) return res.status(500).json({ error: updated.error.message });
  if (fields) {
    if (fields.length) {
      const inserted = await supabase.from('module_fields').upsert(fields.map((field,index)=>({ ...field,module_code:req.params.code,sort_order:field.sort_order ?? (index+1)*10,validation:field.validation||{},options:field.options||[] })), { onConflict: 'module_code,field_key' });
      if (inserted.error) return res.status(500).json({ error: inserted.error.message });
    }
    const keepKeys = fields.map(field => field.field_key);
    let removeFields = supabase.from('module_fields').delete().eq('module_code', req.params.code);
    if (keepKeys.length) removeFields = removeFields.not('field_key', 'in', `(${keepKeys.map(value => `"${value}"`).join(',')})`);
    const removed = await removeFields;
    if (removed.error) return res.status(500).json({ error: removed.error.message });
  }
  await audit(req, 'update', 'master_modules', updated.data.id, old.data, { ...updated.data, fields });
  res.json({ ...updated.data, fields });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'ไฟล์มีขนาดเกินขีดจำกัดที่กำหนด' });
  if (error?.message === 'Origin is not allowed') return res.status(403).json({ error: 'Origin is not allowed' });
  if (String(error?.message || '').includes('รองรับเฉพาะไฟล์ PDF')) return res.status(400).json({ error: error.message });
  if (String(error?.message || '').includes('รองรับเฉพาะไฟล์ Excel')) return res.status(400).json({ error: error.message });
  console.error('Unhandled request error:', error?.message || error);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

if (process.env.AUTOMATION_RUNNER_ENABLED === 'true') {
  setInterval(() => automationTick().catch(error => console.warn('Automation tick failed:', error.message)), 60 * 1000);
}

const defaultMasterCategories = [
  { module: 'tissue', code: 'tissue_roll', name_th: 'ม้วน', unit: 'ม้วน', color: '#3B82F6', sort_order: 10 },
  { module: 'tissue', code: 'tissue_hand', name_th: 'มือ', unit: 'แพ็ค', color: '#10B981', sort_order: 20 },
  { module: 'tissue', code: 'tissue_popup', name_th: 'ป๊อปอัพ', unit: 'แพ็ค', color: '#F59E0B', sort_order: 30 },
  { module: 'recycle', code: 'recycle_pet', name_th: 'ขวดพลาสติก PET', unit: 'kg', color: '#3B82F6', sort_order: 10 },
  { module: 'recycle', code: 'recycle_cardboard', name_th: 'กระดาษลัง', unit: 'kg', color: '#F59E0B', sort_order: 20 },
  { module: 'recycle', code: 'recycle_iron', name_th: 'เหล็ก', unit: 'kg', color: '#6B7280', sort_order: 30 },
  { module: 'recycle', code: 'recycle_aluminum', name_th: 'อลูมิเนียม', unit: 'kg', color: '#EC4899', sort_order: 40 },
  { module: 'recycle', code: 'recycle_glass', name_th: 'ขวดแก้ว', unit: 'kg', color: '#10B981', sort_order: 50 },
  { module: 'recycle', code: 'recycle_other', name_th: 'อื่น ๆ', unit: 'kg', color: '#8B5CF6', sort_order: 60 },
  { module: 'black_bag', code: 'black_bag_small', name_th: 'ถุงดำเล็ก', unit: 'kg', color: '#64748B', sort_order: 10 },
  { module: 'black_bag', code: 'black_bag_medium', name_th: 'ถุงดำกลาง', unit: 'kg', color: '#475569', sort_order: 20 },
  { module: 'black_bag', code: 'black_bag_large', name_th: 'ถุงดำใหญ่', unit: 'kg', color: '#334155', sort_order: 30 }
  ,{ module: 'consumable', code: 'consumable_foam_soap', name_th: 'สบู่โฟม', unit: 'แกลลอน', color: '#06B6D4', sort_order: 10 }
  ,{ module: 'consumable', code: 'consumable_seat_cleaner', name_th: 'น้ำยาเช็ดฝาโถ', unit: 'แกลลอน', color: '#EC4899', sort_order: 20 }
];

async function seedMasterCategoriesIfEmpty() {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('master_categories').select('id', { count: 'exact', head: true });
    if (error) {
      console.log('Note: master_categories table not found. Please run the SQL migration script: supabase/MIGRATION_MASTER_DATA.sql');
      return;
    }
    const { error: insertError } = await supabase.from('master_categories').upsert(defaultMasterCategories, { onConflict: 'module,code', ignoreDuplicates: true });
    if (insertError) {
      console.error('Failed to seed master categories:', insertError.message);
    }
  } catch (err) {
    console.warn('DB check/seed error:', err.message);
  }
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`${RELEASE_ID} Backend ${VERSION} running on port ${PORT}`);
    seedMasterCategoriesIfEmpty().catch(err => console.warn('Seeding failed:', err.message));
  });
}

module.exports = { app, automationTick, buildQualityScores, evaluateModuleFormula, canonicalOperationalUnit, normalizeEntry, canAccessModule, authorizeRequestedModules };
