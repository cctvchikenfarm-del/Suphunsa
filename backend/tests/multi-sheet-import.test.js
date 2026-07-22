'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { excelSerialDate, buddhistDate, thaiPeriod, SOURCE_SYSTEM } = require('../multi-sheet-import');

test('multi-sheet importer converts Excel and Buddhist dates', () => {
  assert.equal(excelSerialDate(45962), '2025-11-01');
  assert.equal(buddhistDate(new Date(Date.UTC(2569, 1, 1))), '2026-02-01');
});

test('multi-sheet importer accepts Thai month typo and stable source name', () => {
  assert.equal(thaiPeriod('พศจิกายน 68'), '2025-11-01');
  assert.equal(thaiPeriod('พฤษภาคม 69'), '2026-05-01');
  assert.equal(SOURCE_SYSTEM, 'central_multi_sheet');
});
