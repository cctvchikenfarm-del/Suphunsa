async function fetchAllPages(buildQuery, { pageSize = 1000, maxPages = 100 } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const pageRows = data || [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
  throw new Error(`Result exceeds the safe pagination limit (${pageSize * maxPages} rows)`);
}

module.exports = { fetchAllPages };
