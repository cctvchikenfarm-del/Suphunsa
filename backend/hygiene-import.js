'use strict';

const crypto = require('node:crypto');
const readXlsxFile = require('read-excel-file/node').default;
const { readSheetNames } = require('read-excel-file/node');

const THAI_MONTHS = {
  'มกราคม': 1, 'มกรา': 1,
  'กุมภาพันธ์': 2,
  'มีนาคม': 3, 'มีนา': 3,
  'เมษายน': 4, 'เมษา': 4,
  'พฤษภาคม': 5, 'พฤษาภาคม': 5,
  'มิถุนายน': 6, 'มิถุนา': 6,
  'กรกฎาคม': 7,
  'สิงหาคม': 8,
  'กันยายน': 9,
  'ตุลาคม': 10,
  'พฤศจิกายน': 11,
  'ธันวาคม': 12
};

const RECYCLE_CODES = {
  'กระดาษน้ำตาล': 'recycle_brown_paper',
  'กระดาษจับจั้ว': 'recycle_mixed_paper',
  'สังกะสีกระป๋อง': 'recycle_tin_can',
  'สังกะสีกระป๋อง 1': 'recycle_tin_can_1',
  'สังกะสีกระป๋อง 2': 'recycle_tin_can_2',
  'PET': 'recycle_pet',
  'พลาสติกรวม': 'recycle_mixed_plastic',
  'พลาสติกรวม1': 'recycle_mixed_plastic_1',
  'พลาสติกรวม2': 'recycle_mixed_plastic_2',
  'อลู-โค๊ก': 'recycle_aluminum_can',
  'แก้ว-รวมสี': 'recycle_mixed_glass'
};

const BLACK_BAG_CODES = {
  '30x40 สีดำ': 'black_bag_large',
  '28x36 สีชา': 'black_bag_medium',
  '18x20 สีดำ': 'black_bag_small'
};

function cellValue(value) {
  if (value && typeof value === 'object') {
    if (value.result !== undefined) return value.result;
    if (value.text !== undefined) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map(item => item.text).join('');
  }
  return value;
}

function numberOrNull(value) {
  const normalized = cellValue(value);
  if (normalized === null || normalized === undefined || normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  const normalized = cellValue(value);
  if (normalized === null || normalized === undefined || normalized === '') return null;
  return String(normalized).trim() || null;
}

function isoDate(value) {
  const normalized = cellValue(value);
  if (normalized instanceof Date && Number.isFinite(normalized.getTime())) {
    return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, '0')}-${String(normalized.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof normalized === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + normalized * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(normalized || ''))) return String(normalized);
  return null;
}

function parseThaiPeriod(label, monthNumber, buddhistYear) {
  let month = numberOrNull(monthNumber);
  let yearBe = numberOrNull(buddhistYear);
  const text = textOrNull(label) || '';
  if (!month) {
    const matched = Object.entries(THAI_MONTHS).find(([name]) => text.includes(name));
    month = matched?.[1] || null;
  }
  if (!yearBe) {
    const match = text.match(/(?:25)?(\d{2})\s*$/);
    if (match) yearBe = Number(match[1]) + 2500;
  }
  if (!month || !yearBe || yearBe < 2400 || yearBe > 2700) return null;
  const year = yearBe - 543;
  return { period_month: `${year}-${String(month).padStart(2, '0')}-01`, year_be: yearBe, month };
}

function headerMap(sheet) {
  const map = new Map();
  sheet.getRow(1).eachCell((cell, col) => map.set(String(textOrNull(cell.value) || '').replace(/\s+/g, ''), col));
  return key => map.get(String(key).replace(/\s+/g, '')) || null;
}

function sheetAdapter(name, rows) {
  return {
    name,
    rowCount: rows.length,
    getRow(rowNumber) {
      const values = rows[rowNumber - 1] || [];
      return {
        getCell(columnNumber) { return { value: values[columnNumber - 1] ?? null }; },
        eachCell(callback) { values.forEach((value, index) => callback({ value }, index + 1)); }
      };
    }
  };
}

function sourceMetadata({ sheet, sourceReference, fileHash, yearBe, kind }) {
  return {
    source_file_sha256: fileHash,
    source_sheet: sheet,
    source_reference: sourceReference,
    source_year_be: yearBe || null,
    import_kind: kind
  };
}

function previewRow({ sheet, rowNumber, sourceReference, fileHash, entry, issues = [], status = 'ready' }) {
  const identity = [sheet, sourceReference || `row-${rowNumber}`, entry?.module || '-', entry?.entry_date || '-', entry?.category_code || entry?.material_name || '-'].join('|');
  const sourceKey = crypto.createHash('sha256').update(identity).digest('hex');
  return {
    row_id: `${sheet}:${rowNumber}`,
    sheet,
    row_number: rowNumber,
    source_reference: sourceReference,
    source_key: sourceKey,
    status: issues.length && status === 'ready' ? 'review' : status,
    issues,
    entry: entry ? {
      ...entry,
      metadata: { ...(entry.metadata || {}), source_key: sourceKey }
    } : null
  };
}

function parseDailyWaste(sheet, fileHash) {
  const col = headerMap(sheet);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const date = isoDate(row.getCell(col('วันที่')).value);
    const weight = numberOrNull(row.getCell(col('ขยะทั่วไป_กก')).value);
    if (!date && weight === null) continue;
    const sourceReference = textOrNull(row.getCell(col('แหล่งข้อมูลเดิม')).value) || `OP_ขยะรายวัน!R${rowNumber}`;
    const issues = [];
    if (!date) issues.push('ไม่สามารถอ่านวันที่');
    if (weight === null || weight < 0) issues.push('น้ำหนักไม่ถูกต้อง');
    rows.push(previewRow({ sheet: sheet.name, rowNumber, sourceReference, fileHash, issues, entry: date ? {
      module: 'general_waste', entry_date: date, period_month: `${date.slice(0, 7)}-01`,
      material_name: 'ขยะทั่วไป', weight_kg: weight, unit: 'kg', notes: textOrNull(row.getCell(col('หมายเหตุ')).value),
      metadata: sourceMetadata({ sheet: sheet.name, sourceReference, fileHash, kind: 'daily_general_waste' })
    } : null }));
  }
  return rows;
}

function parseWetFood(sheet, fileHash) {
  const col = headerMap(sheet);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const type = textOrNull(row.getCell(col('ประเภท')).value);
    const weight = numberOrNull(row.getCell(col('ปริมาณ')).value);
    if (!type && weight === null) continue;
    const sourceReference = textOrNull(row.getCell(col('แหล่งข้อมูลเดิม')).value) || `OP_อาหารเปียก!R${rowNumber}`;
    const module = type === 'อาหารหมา' ? 'dog_food' : type === 'อาหารหมู' ? 'pig_feed' : null;
    const rawDate = isoDate(row.getCell(col('วันที่')).value);
    const period = parseThaiPeriod(row.getCell(col('เดือน')).value, null, null);
    const date = rawDate || (period ? period.period_month : null);
    const issues = [];
    if (!module) issues.push(`ไม่รู้จักประเภท ${type || '-'}`);
    if (!date) issues.push('ไม่สามารถอ่านเดือนหรือวันที่');
    if (weight === null || weight < 0) issues.push('น้ำหนักไม่ถูกต้อง');
    rows.push(previewRow({ sheet: sheet.name, rowNumber, sourceReference, fileHash, issues, entry: module && date ? {
      module, entry_date: date, period_month: `${date.slice(0, 7)}-01`, material_name: type,
      weight_kg: weight, unit: 'kg', notes: textOrNull(row.getCell(col('หมายเหตุ')).value),
      metadata: {
        ...sourceMetadata({ sheet: sheet.name, sourceReference, fileHash, yearBe: period?.year_be, kind: rawDate ? 'daily_wet_food' : 'monthly_wet_food' }),
        value_type: rawDate ? 'actual_daily' : 'monthly_total',
        entry_mode: rawDate ? 'daily' : 'monthly'
      }
    } : null }));
  }
  return rows;
}

function parseBlackBags(sheet, fileHash) {
  const col = headerMap(sheet);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const size = textOrNull(row.getCell(col('ขนาด')).value);
    const quantity = numberOrNull(row.getCell(col('จำนวน')).value);
    if (!size && quantity === null) continue;
    const period = parseThaiPeriod(row.getCell(col('เดือน')).value, row.getCell(col('เดือนลำดับ')).value, row.getCell(col('ปีพ.ศ.')).value);
    const sourceReference = textOrNull(row.getCell(col('แหล่งข้อมูลเดิม')).value) || `OP_ถุงดำ!R${rowNumber}`;
    const categoryCode = BLACK_BAG_CODES[size];
    const issues = [];
    if (!period) issues.push('ไม่สามารถอ่านเดือนและปี');
    if (!categoryCode) issues.push(`ไม่รู้จักขนาด ${size || '-'}`);
    if (quantity === null || quantity < 0) issues.push('จำนวนไม่ถูกต้อง');
    rows.push(previewRow({ sheet: sheet.name, rowNumber, sourceReference, fileHash, issues, entry: period && categoryCode ? {
      module: 'black_bag', category_code: categoryCode, entry_date: period.period_month, period_month: period.period_month,
      material_name: size, quantity, unit: 'kg',
      notes: textOrNull(row.getCell(col('หมายเหตุ')).value),
      metadata: sourceMetadata({ sheet: sheet.name, sourceReference, fileHash, yearBe: period.year_be, kind: 'monthly_black_bag' })
    } : null }));
  }
  return rows;
}

function parseRecycle(sheet, fileHash) {
  const col = headerMap(sheet);
  const rows = [];
  const semanticKeys = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const label = textOrNull(row.getCell(col('เดือน')).value);
    const material = textOrNull(row.getCell(col('รายการ')).value);
    const weight = numberOrNull(row.getCell(col('จำนวน_กก')).value);
    if (!material && weight === null) continue;
    const period = parseThaiPeriod(label, row.getCell(col('เดือนลำดับ')).value, row.getCell(col('ปีพ.ศ.')).value);
    const unitPrice = numberOrNull(row.getCell(col('ราคา_บาทต่อกก')).value);
    const amount = numberOrNull(row.getCell(col('จำนวนเงิน_บาท')).value);
    const sourceReference = textOrNull(row.getCell(col('แหล่งข้อมูลเดิม')).value) || `OP_Recycle!R${rowNumber}`;
    const issues = [];
    if (/พ\.ย\.-ธ\.ค\.|พฤศจิกายน.*ธันวาคม/u.test(label || '')) issues.push('ข้อมูลรวมพฤศจิกายน–ธันวาคม ต้องแยกเดือนก่อน');
    if (!period) issues.push('ไม่สามารถอ่านเดือนและปี');
    if (!material) issues.push('ไม่มีชื่อวัสดุ');
    if (weight === null || weight < 0) issues.push('น้ำหนักไม่ถูกต้อง');
    if (unitPrice !== null && amount !== null && Math.abs(weight * unitPrice - amount) > 0.02) issues.push(`ยอดเงินไม่ตรงสูตร ควรเป็น ${(weight * unitPrice).toFixed(2)}`);
    if (unitPrice !== null && amount === null) issues.push(`ไม่มีจำนวนเงิน ควรเป็น ${(weight * unitPrice).toFixed(2)}`);
    const semanticKey = period ? `${period.period_month}|${material}|${weight}|${unitPrice}` : null;
    if (semanticKey && semanticKeys.has(semanticKey)) {
      issues.push(`อาจซ้ำกับแถว ${semanticKeys.get(semanticKey)}`);
    } else if (semanticKey) semanticKeys.set(semanticKey, rowNumber);
    const categoryCode = RECYCLE_CODES[material] || `recycle_${String(material || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    rows.push(previewRow({ sheet: sheet.name, rowNumber, sourceReference, fileHash, issues, entry: period ? {
      module: 'recycle', category_code: categoryCode, entry_date: period.period_month, period_month: period.period_month,
      material_name: material, weight_kg: weight, unit: 'kg', unit_price: unitPrice, amount,
      notes: textOrNull(row.getCell(col('หมายเหตุ')).value),
      metadata: sourceMetadata({ sheet: sheet.name, sourceReference, fileHash, yearBe: period.year_be, kind: 'monthly_recycle' })
    } : null }));
  }
  return rows;
}

function parseMonthlyReference(sheet, fileHash) {
  const col = headerMap(sheet);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const type = textOrNull(row.getCell(col('ประเภทขยะ')).value);
    const value = numberOrNull(row.getCell(col('ปริมาณ')).value);
    if (!type && value === null) continue;
    const period = parseThaiPeriod(row.getCell(col('เดือน')).value, row.getCell(col('เดือนลำดับ')).value, row.getCell(col('ปีพ.ศ.')).value);
    const sourceReference = textOrNull(row.getCell(col('แหล่งข้อมูลเดิม')).value) || `OP_ขยะรายเดือน!R${rowNumber}`;
    rows.push(previewRow({ sheet: sheet.name, rowNumber, sourceReference, fileHash, status: 'reference', issues: ['เป็นยอดสรุปสำหรับตรวจสอบ ไม่บันทึกซ้ำใน data_entries'], entry: period ? {
      module: 'monthly_reference', entry_date: period.period_month, period_month: period.period_month,
      material_name: type, weight_kg: value, unit: 'kg',
      metadata: sourceMetadata({ sheet: sheet.name, sourceReference, fileHash, yearBe: period.year_be, kind: 'monthly_reference' })
    } : null }));
  }
  return rows;
}

async function parseHygieneWorkbook(buffer, fileName = 'upload.xlsx') {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const rows = [];
  const parsers = {
    'OP_Recycle': parseRecycle,
    'OP_ขยะรายวัน': parseDailyWaste,
    'OP_ขยะรายเดือน': parseMonthlyReference,
    'OP_อาหารเปียก': parseWetFood,
    'OP_ถุงดำ': parseBlackBags
  };
  const foundSheets = [];
  const sheetNames = await readSheetNames(buffer);
  for (const [sheetName, parser] of Object.entries(parsers)) {
    if (!sheetNames.includes(sheetName)) continue;
    const sheet = sheetAdapter(sheetName, await readXlsxFile(buffer, { sheet: sheetName }));
    foundSheets.push(sheetName);
    rows.push(...parser(sheet, fileHash));
  }
  if (!foundSheets.length) throw new Error('ไม่พบชีท OP_* ที่รองรับในไฟล์');
  const seenSourceKeys = new Set();
  for (const row of rows) {
    if (seenSourceKeys.has(row.source_key)) {
      row.status = 'review';
      row.issues.push('source key ซ้ำในไฟล์เดียวกัน');
    }
    seenSourceKeys.add(row.source_key);
  }
  const summary = rows.reduce((result, row) => {
    result.total += 1;
    result[row.status] = (result[row.status] || 0) + 1;
    result.by_sheet[row.sheet] = (result.by_sheet[row.sheet] || 0) + 1;
    return result;
  }, { total: 0, ready: 0, review: 0, reference: 0, by_sheet: {} });
  return { file_name: fileName, file_hash: fileHash, found_sheets: foundSheets, missing_expected_sheets: Object.keys(parsers).filter(name => !foundSheets.includes(name)), summary, rows };
}

module.exports = { parseHygieneWorkbook, parseThaiPeriod, isoDate, parseRecycle, parseMonthlyReference, sheetAdapter };
