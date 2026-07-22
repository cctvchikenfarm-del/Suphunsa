const STANDARD_KEYS = new Set(['weight_kg', 'quantity', 'unit_price', 'amount'])

export function readEntryValue(row, fieldKey) {
  if (!row || !fieldKey) return null
  if (Object.prototype.hasOwnProperty.call(row, fieldKey) && row[fieldKey] !== null && row[fieldKey] !== '') return row[fieldKey]
  return row.metadata?.dynamic_fields?.[fieldKey] ?? null
}

export function aggregateModuleRows(rows, definition) {
  const metric = definition?.primary_metric || 'quantity'
  const values = (rows || []).map(row => Number(readEntryValue(row, metric))).filter(Number.isFinite)
  const mode = definition?.aggregation || 'sum'
  let value = 0
  if (mode === 'average') value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0
  else if (mode === 'latest') value = values.length ? values[values.length - 1] : 0
  else if (mode === 'count') value = (rows || []).length
  else value = values.reduce((sum, item) => sum + item, 0)
  return { value, count: (rows || []).length, metric, unit: definition?.default_unit || definition?.fields?.find(field => field.field_key === metric)?.unit || '' }
}

export function buildModuleMonthlySeries(rows, definition, months) {
  return (months || []).map(month => {
    const monthRows = (rows || []).filter(row => String(row.period_month || row.entry_date || '').slice(0, 7) === month)
    return { month, ...aggregateModuleRows(monthRows, definition) }
  })
}

export function moduleTableFields(definition) {
  return (definition?.fields || []).filter(field => field.active !== false && field.data_type !== 'calculated').map(field => ({
    key: field.field_key,
    label: field.label_th || field.field_key,
    unit: field.unit || (STANDARD_KEYS.has(field.field_key) ? definition?.default_unit || '' : '')
  }))
}

export function percentChange(current, previous) {
  const c = Number(current || 0); const p = Number(previous || 0)
  if (!p && !c) return 0
  if (!p) return 100
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(1))
}
