'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isoMonthFromHeader, daysInMonth, numberStatus } = require('../tissue-import');

test('Tissue header interprets Thai two-digit Buddhist year correctly', () => {
  assert.equal(isoMonthFromHeader(new Date(Date.UTC(1968, 10, 1))), '2025-11');
  assert.equal(isoMonthFromHeader(new Date(Date.UTC(1969, 0, 1))), '2026-01');
  assert.equal(isoMonthFromHeader(new Date(Date.UTC(2026, 4, 1))), '2026-05');
});

test('Tissue importer validates real month lengths including leap year', () => {
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2025-11'), 30);
});

test('Tissue quantities preserve zero and reject blank, negative and decimal values', () => {
  assert.deepEqual(numberStatus(0), { ok:true, number:0 });
  assert.equal(numberStatus(null).ok, false);
  assert.equal(numberStatus(-1).ok, false);
  assert.equal(numberStatus(1.5).ok, false);
});
