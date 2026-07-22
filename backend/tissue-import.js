'use strict';

const crypto = require('node:crypto');
const readXlsxFile = require('read-excel-file/node').default;
const { readSheetNames } = require('read-excel-file/node');

const TISSUE_TYPES = [
  { label: 'ม้วน', code: 'tissue_roll', unit: 'ม้วน' },
  { label: 'เช็ดมือ', code: 'tissue_hand', unit: 'แพ็ค' },
  { label: 'ป๊อปอัพ', code: 'tissue_popup', unit: 'แพ็ค' }
];

function isoMonthFromHeader(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  const rawYear = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  let year = rawYear;
  // Excel displays 1968/1969 as Nov-68/Jan-69 in the supplied Thai workbook.
  // In this operational context the two-digit suffix is Buddhist year 2568/2569.
  if (rawYear >= 1900 && rawYear <= 1999) year = 2500 + (rawYear % 100) - 543;
  if (year < 2000 || year > 2200) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function numberStatus(value) {
  if (value === null || value === undefined || value === '') return { ok: false, issue: 'ช่องว่างในวันที่ใช้งานจริง' };
  const number = Number(value);
  if (!Number.isFinite(number)) return { ok: false, issue: 'ค่าไม่ใช่ตัวเลข' };
  if (number < 0) return { ok: false, issue: 'จำนวนต้องไม่ติดลบ' };
  if (!Number.isInteger(number)) return { ok: false, issue: 'จำนวนต้องเป็นเลขจำนวนเต็ม' };
  return { ok: true, number };
}

function sourceKey(entry) {
  return crypto.createHash('sha256').update(`tissue|${entry.entry_date}|${entry.category_code}`).digest('hex');
}

async function parseTissueWorkbook(buffer, fileName = 'tissue.xlsx') {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const sheetNames = await readSheetNames(buffer);
  let selectedSheet = null;
  let rows = null;
  for (const sheetName of sheetNames) {
    const candidate = await readXlsxFile(buffer, { sheet: sheetName });
    if (String(candidate?.[0]?.[0] || '').includes('ทิชชู่') && String(candidate?.[1]?.[0] || '').includes('วันที่')) {
      selectedSheet = sheetName;
      rows = candidate;
      break;
    }
  }
  if (!rows) throw new Error('ไม่พบตาราง Tissue ที่มีหัวข้อเดือนและประเภททิชชู่');

  const monthColumns = [];
  for (let column = 1; column < (rows[0]?.length || 0); column += 3) {
    const month = isoMonthFromHeader(rows[0][column]);
    const labels = TISSUE_TYPES.map((_, index) => String(rows[1]?.[column + index] || '').trim());
    if (month && TISSUE_TYPES.every((type, index) => labels[index] === type.label)) monthColumns.push({ month, column });
  }
  if (!monthColumns.length) throw new Error('ไม่พบหัวเดือนแบบ Nov-68 พร้อมคอลัมน์ ม้วน/เช็ดมือ/ป๊อปอัพ');

  const totalRowIndex = rows.findIndex(row => String(row?.[0] || '').includes('รวมรายเดือน'));
  if (totalRowIndex < 0) throw new Error('ไม่พบแถวรวมรายเดือน');

  const previewRows = [];
  const reconciliation = [];
  for (const { month, column } of monthColumns) {
    const maximumDay = daysInMonth(month);
    const calculated = [0, 0, 0];
    const missing = [0, 0, 0];
    const expected = TISSUE_TYPES.map((_, index) => Number(rows[totalRowIndex]?.[column + index]));
    for (let day = 1; day <= maximumDay; day += 1) {
      const rowIndex = day + 1;
      for (let typeIndex = 0; typeIndex < TISSUE_TYPES.length; typeIndex += 1) {
        const type = TISSUE_TYPES[typeIndex];
        const checked = numberStatus(rows[rowIndex]?.[column + typeIndex]);
        const entryDate = `${month}-${String(day).padStart(2, '0')}`;
        const entry = checked.ok ? {
          module: 'tissue', category_code: type.code, entry_date: entryDate,
          period_month: `${month}-01`, material_name: type.label,
          quantity: checked.number, unit: type.unit,
          metadata: { import_kind: 'tissue_daily', source_sheet: selectedSheet, source_month: month, source_day: day }
        } : null;
        if (checked.ok) calculated[typeIndex] += checked.number;
        else missing[typeIndex] += 1;
        const key = sourceKey({ entry_date: entryDate, category_code: type.code });
        previewRows.push({
          row_id: `${selectedSheet}:${entryDate}:${type.code}`, sheet: selectedSheet,
          row_number: rowIndex + 1, day, week: day <= 28 ? Math.ceil(day / 7) : 5,
          month, source_key: key, status: checked.ok ? 'ready' : 'review',
          issues: checked.ok ? [] : [checked.issue], entry
        });
      }
    }
    reconciliation.push({
      month,
      values: TISSUE_TYPES.map((type, index) => ({
        category_code: type.code, label: type.label, calculated: calculated[index],
        expected: Number.isFinite(expected[index]) ? expected[index] : null,
        missing: missing[index],
        matches: Number.isFinite(expected[index]) && calculated[index] === expected[index] && missing[index] === 0
      }))
    });
  }

  const summary = previewRows.reduce((result, row) => {
    result.total += 1;
    result[row.status] += 1;
    return result;
  }, { total: 0, ready: 0, review: 0, duplicate: 0, importable: 0 });
  summary.importable = summary.ready;
  return {
    file_name: fileName, file_hash: fileHash, sheet: selectedSheet,
    months: monthColumns.map(item => item.month), reconciliation,
    summary, rows: previewRows
  };
}

module.exports = { parseTissueWorkbook, isoMonthFromHeader, daysInMonth, numberStatus };
