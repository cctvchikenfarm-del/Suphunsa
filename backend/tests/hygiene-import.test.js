'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseThaiPeriod, parseRecycle, parseMonthlyReference, sheetAdapter } = require('../hygiene-import');

test('converts Buddhist year and Thai month to database period', () => {
  assert.deepEqual(parseThaiPeriod('มีนาคม 69', 3, 2569), { period_month: '2026-03-01', year_be: 2569, month: 3 });
  assert.equal(parseThaiPeriod('พ.ย.-ธ.ค. 68', null, 2568), null);
});

test('Hygiene parser separates ready, review and reference rows', () => {
  const hash = 'a'.repeat(64);
  const recycle = sheetAdapter('OP_Recycle', [
    ['เดือน','เดือนลำดับ','ปี พ.ศ.','รายการ','จำนวน_กก','ราคา_บาทต่อกก','จำนวนเงิน_บาท','หมายเหตุ','แหล่งข้อมูลเดิม'],
    ['มกราคม 69',1,2569,'PET',10,6,60,null,'วัสดุ!R3C6'],
    ['เมษายน 69',4,2569,'พลาสติกรวม1',145,3.5,657.5,null,'วัสดุ!R7C22']
  ]);
  const monthly = sheetAdapter('OP_ขยะรายเดือน', [
    ['เดือน','เดือนลำดับ','ปี พ.ศ.','ประเภทขยะ','ปริมาณ','หน่วย','แหล่งข้อมูลเดิม'],
    ['มกราคม 69',1,2569,'Total',100,'กก.','ขยะ!R64']
  ]);
  const rows = [...parseRecycle(recycle, hash), ...parseMonthlyReference(monthly, hash)];
  assert.equal(rows.filter(row => row.status === 'ready').length, 1);
  assert.equal(rows.filter(row => row.status === 'review').length, 1);
  assert.equal(rows.filter(row => row.status === 'reference').length, 1);
  assert.match(rows.find(row => row.status === 'review').issues.join(' '), /ยอดเงินไม่ตรงสูตร/);
  const ready = rows.find(row => row.status === 'ready');
  assert.equal(ready.entry.module, 'recycle');
  assert.equal(ready.entry.period_month, '2026-01-01');
  assert.match(ready.source_key, /^[a-f0-9]{64}$/);
});
