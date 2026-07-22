const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAllPages } = require('../pagination');

test('fetchAllPages reads beyond the Supabase 1000-row response limit', async () => {
  const source = Array.from({ length: 2050 }, (_, id) => ({ id }));
  const ranges = [];
  const buildQuery = () => ({ range: async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  } });
  const rows = await fetchAllPages(buildQuery);
  assert.equal(rows.length, 2050);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(rows.at(-1).id, 2049);
});

test('fetchAllPages forwards database errors', async () => {
  const expected = new Error('database unavailable');
  const buildQuery = () => ({ range: async () => ({ data: null, error: expected }) });
  await assert.rejects(() => fetchAllPages(buildQuery), expected);
});
