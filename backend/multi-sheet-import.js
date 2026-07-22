'use strict';

const crypto = require('node:crypto');
const readXlsxFile = require('read-excel-file/node').default;
const { readSheetNames } = require('read-excel-file/node');

const SOURCE_SYSTEM = 'central_multi_sheet';
const THAI_MONTHS = { มกราคม:1, กุมภาพันธ์:2, มีนาคม:3, เมษายน:4, พฤษภาคม:5, มิถุนายน:6, กรกฎาคม:7, สิงหาคม:8, กันยายน:9, ตุลาคม:10, พฤศจิกายน:11, พศจิกายน:11, ธันวาคม:12 };

function pad(value) { return String(value).padStart(2, '0'); }
function periodMonth(year, month) { return `${year}-${pad(month)}-01`; }
function excelSerialDate(serial) {
  if (!Number.isFinite(Number(serial))) return null;
  return new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000).toISOString().slice(0, 10);
}
function buddhistDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear() > 2400 ? value.getUTCFullYear() - 543 : value.getUTCFullYear();
  return `${year}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}
function thaiPeriod(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  const monthName = Object.keys(THAI_MONTHS).find(name => text.includes(name));
  const yearMatch = text.match(/(\d{2,4})/);
  if (!monthName || !yearMatch) return null;
  let year = Number(yearMatch[1]);
  if (year < 100) year += 2500;
  if (year > 2400) year -= 543;
  return periodMonth(year, THAI_MONTHS[monthName]);
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function sourceKey(entry) {
  return crypto.createHash('sha256').update([SOURCE_SYSTEM, entry.module, entry.entry_date, entry.category_code || '', entry.metadata?.entry_mode || ''].join('|')).digest('hex');
}
function previewRow(sheet, rowNumber, entry, issues = []) {
  const key = sourceKey(entry);
  return { row_id:key, sheet, row_number: rowNumber, status: issues.length ? 'review' : 'ready', issues, source_key:key, entry };
}
function validateNumber(value, { integer = false } = {}) {
  if (value === null) return ['ว่าง'];
  if (value < 0) return ['ค่าติดลบ'];
  if (integer && !Number.isInteger(value)) return ['ต้องเป็นจำนวนเต็ม'];
  return [];
}

function parseRdf(rows) {
  const output = [];
  for (let index = 1; index < rows.length; index += 1) {
    const date = excelSerialDate(rows[index][0]);
    const weight = numberOrNull(rows[index][1]);
    if (weight === null) continue;
    const entry = { module:'rdf', category_code:'RDF', entry_date:date, period_month:`${date?.slice(0,7)}-01`, material_name:'ขยะ RDF', weight_kg:weight, unit:'kg', metadata:{ value_type:'actual_daily', source_sheet:'ขยะ RDF', source_row:index + 1 } };
    const issues = [...(!date ? ['วันที่ไม่ถูกต้อง'] : []), ...validateNumber(weight)];
    output.push(previewRow('ขยะ RDF', index + 1, entry, issues));
  }
  return output;
}

function parseTissue(rows) {
  const types = [
    { column:1, code:'tissue_roll', name:'ม้วน', unit:'ม้วน' },
    { column:2, code:'tissue_hand', name:'เช็ดมือ', unit:'แพ็ค' },
    { column:3, code:'tissue_popup', name:'ป๊อปอัพ', unit:'แพ็ค' }
  ];
  const output = [];
  for (let index = 1; index < rows.length; index += 1) {
    const date = buddhistDate(rows[index][0]);
    for (const type of types) {
      const quantity = numberOrNull(rows[index][type.column]);
      if (quantity === null) continue;
      const entry = { module:'tissue', category_code:type.code, entry_date:date, period_month:`${date?.slice(0,7)}-01`, material_name:type.name, quantity, unit:type.unit, metadata:{ entry_mode:'daily', source_sheet:'ทิชชู่', source_row:index + 1 } };
      const issues = [...(!date ? ['วันที่ไม่ถูกต้อง'] : []), ...validateNumber(quantity, { integer:true })];
      output.push(previewRow('ทิชชู่', index + 1, entry, issues));
    }
  }
  return output;
}

function parseBlackBags(rows) {
  const types = [
    { column:1, code:'black_bag_large', name:'ถุงใหญ่ 30x40 สีดำ' },
    { column:2, code:'black_bag_medium', name:'ถุงกลาง 28x36 สีชา' },
    { column:3, code:'black_bag_small', name:'ถุงเล็ก 18x20 สีดำ' }
  ];
  const headerIndex = rows.findIndex(row => String(row?.[0] || '').trim() === 'เดือน');
  if (headerIndex < 0) return [];
  const output = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const period = thaiPeriod(rows[index][0]);
    for (const type of types) {
      const quantity = numberOrNull(rows[index][type.column]);
      if (quantity === null) continue;
      const entry = { module:'black_bag', category_code:type.code, entry_date:period, period_month:period, material_name:type.name, quantity, unit:'kg', metadata:{ entry_mode:'monthly', source_sheet:'ถุงขยะ', source_row:index + 1 } };
      const issues = [...(!period ? ['เดือนไม่ถูกต้อง'] : []), ...validateNumber(quantity, { integer:true })];
      output.push(previewRow('ถุงขยะ', index + 1, entry, issues));
    }
  }
  return output;
}

function parseDogFood(rows) {
  const output = [];
  for (let index = 1; index < rows.length; index += 1) {
    const date = buddhistDate(rows[index][0]);
    const weight = numberOrNull(rows[index][1]);
    if (weight === null) continue;
    const entry = { module:'dog_food', category_code:'DOG_FOOD', entry_date:date, period_month:`${date?.slice(0,7)}-01`, material_name:'อาหารหมา', weight_kg:weight, unit:'kg', metadata:{ value_type:'actual_daily', source_sheet:'อาหารหมา', source_row:index + 1 } };
    const issues = [...(!date ? ['วันที่ไม่ถูกต้อง'] : []), ...validateNumber(weight)];
    output.push(previewRow('อาหารหมา', index + 1, entry, issues));
  }
  return output;
}

async function parseMultiSheetWorkbook(buffer, fileName = 'upload.xlsx') {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const parsers = { 'ขยะ RDF':parseRdf, 'ทิชชู่':parseTissue, 'ถุงขยะ':parseBlackBags, 'อาหารหมา':parseDogFood };
  const sheetNames = await readSheetNames(buffer);
  const foundSheets = Object.keys(parsers).filter(name => sheetNames.includes(name));
  if (!foundSheets.length) throw new Error('ไม่พบแท็บที่รองรับ: ขยะ RDF, ทิชชู่, ถุงขยะ หรืออาหารหมา');
  const rows = [];
  for (const name of foundSheets) rows.push(...parsers[name](await readXlsxFile(buffer, { sheet:name })));
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.source_key)) { row.status = 'review'; row.issues.push('รายการซ้ำภายในไฟล์'); }
    seen.add(row.source_key);
  }
  const summary = rows.reduce((result, row) => {
    result.total += 1; result[row.status] += 1;
    result.by_sheet[row.sheet] = (result.by_sheet[row.sheet] || 0) + 1;
    result.by_module[row.entry.module] = (result.by_module[row.entry.module] || 0) + 1;
    return result;
  }, { total:0, ready:0, review:0, duplicate:0, by_sheet:{}, by_module:{} });
  summary.importable = summary.ready;
  return { file_name:fileName, file_hash:fileHash, source_system:SOURCE_SYSTEM, found_sheets:foundSheets, missing_sheets:Object.keys(parsers).filter(name => !foundSheets.includes(name)), summary, rows };
}

module.exports = { parseMultiSheetWorkbook, excelSerialDate, buddhistDate, thaiPeriod, SOURCE_SYSTEM };
