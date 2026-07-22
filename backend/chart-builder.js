const MODULE_ALIASES = { cleaning_liquid: 'consumable' };

function canonicalModule(value) {
  return MODULE_ALIASES[value] || value;
}

function seriesToken(module, category = '') {
  return category ? `${canonicalModule(module)}~${category}` : canonicalModule(module);
}

function parseSeriesToken(token) {
  const [module, ...categoryParts] = String(token || '').split('~');
  return { module: canonicalModule(module), category: categoryParts.join('~') };
}

function metricValue(row, metric, groupBy = 'monthly') {
  if (metric === 'count') return 1;
  const value = Number(row?.[metric] || 0);
  const [year, month] = String(row?.period_month || row?.entry_date || '').slice(0, 7).split('-').map(Number);
  const calendarDays = year && month ? new Date(year, month, 0).getDate() : 1;
  return isDailyAverageEntry(row) && groupBy === 'monthly' ? value * Number(row?.metadata?.days_in_month || calendarDays) : value;
}

function pointKey(row, groupBy) {
  const date = String(row.entry_date || row.period_month || '').slice(0, 10);
  return groupBy === 'daily' ? date : date.slice(0, 7);
}

function defaultUnit(metric) {
  if (metric === 'weight_kg') return 'kg';
  if (metric === 'amount') return 'บาท';
  if (metric === 'count') return 'รายการ';
  return 'จำนวน';
}

function canonicalQuantityUnit(row) {
  const module = canonicalModule(row?.module);
  if (module === 'black_bag') return 'kg';
  if (module === 'consumable') return 'แกลลอน';
  if (module === 'tissue') return row?.category_code === 'tissue_roll' ? 'ม้วน' : 'แพ็ค';
  return row?.unit;
}

function isDailyAverageEntry(row) {
  const metadata = row?.metadata || {};
  const actualDaily = metadata.value_type === 'actual_daily' || metadata.entry_mode === 'daily';
  const monthlyTotal = metadata.value_type === 'monthly_total' || metadata.entry_mode === 'monthly_total' || metadata.input_mode === 'monthly_total';
  const explicitAverage = metadata.value_type === 'daily_average' || metadata.entry_mode === 'daily_average' || metadata.input_mode === 'daily_average';
  if (actualDaily || monthlyTotal) return false;
  if (explicitAverage) return true;
  const entryDay = Number(String(row?.entry_date || row?.period_month || '').slice(8, 10) || 1);
  return row?.module === 'pig_feed' && entryDay === 1;
}

function aggregateChartRows({ rows = [], requestedSeries = [], metric = 'weight_kg', groupBy = 'monthly', moduleLabels = {} }) {
  const normalizedRows = rows.map(row => ({ ...row, module: canonicalModule(row.module) }));
  const series = requestedSeries.map(parseSeriesToken).map(definition => {
    const key = seriesToken(definition.module, definition.category);
    const matchingRows = normalizedRows.filter(row => {
      if (definition.module === 'wet_waste') return ['dog_food', 'pig_feed'].includes(row.module);
      return row.module === definition.module && (!definition.category || row.category_code === definition.category || row.material_name === definition.category);
    });
    const materialLabel = definition.category && matchingRows.find(row => row.material_name)?.material_name;
    const units = metric === 'quantity'
      ? [...new Set(matchingRows.map(canonicalQuantityUnit).filter(Boolean))]
      : [defaultUnit(metric)];
    return {
      key,
      module: definition.module,
      category: definition.category || null,
      label: materialLabel || (definition.category ? `${moduleLabels[definition.module] || definition.module} · ${definition.category}` : moduleLabels[definition.module] || definition.module),
      unit: units.length === 1 ? units[0] : units.length > 1 ? 'หลายหน่วย' : defaultUnit(metric),
      mixed_units: units.length > 1,
      rows: matchingRows
    };
  });

  const keys = [...new Set(series.flatMap(item => item.rows.map(row => pointKey(row, groupBy))).filter(Boolean))].sort();
  const points = keys.map(key => {
    const values = {};
    for (const item of series) {
      values[item.key] = Number(item.rows.filter(row => pointKey(row, groupBy) === key).reduce((sum, row) => sum + metricValue(row, metric, groupBy), 0).toFixed(2));
    }
    return { key, label: key, values };
  });
  const resultSeries = series.map(({ rows: itemRows, ...item }) => ({
    ...item,
    total: Number(itemRows.reduce((sum, row) => sum + metricValue(row, metric, groupBy), 0).toFixed(2)),
    records: itemRows.length
  }));
  const activeSeries = resultSeries.filter(item => item.records > 0 && item.total !== 0);
  const activeUnits = [...new Set(activeSeries.map(item => item.unit))];
  const hasData = resultSeries.some(item => item.records > 0);
  return {
    metric,
    group_by: groupBy,
    has_data: hasData,
    compatible_units: !activeSeries.some(item => item.mixed_units),
    units: activeUnits,
    series: resultSeries,
    points
  };
}

module.exports = { canonicalModule, seriesToken, parseSeriesToken, canonicalQuantityUnit, isDailyAverageEntry, metricValue, aggregateChartRows };
