'use strict';

function readMetric(row, key) {
  const raw = row?.[key] ?? row?.metadata?.dynamic_fields?.[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function aggregate(rows, key, mode = 'sum') {
  const values = (rows || []).map(row => readMetric(row, key)).filter(Number.isFinite);
  if (mode === 'count') return (rows || []).length;
  if (mode === 'latest') return values.length ? values[values.length - 1] : 0;
  if (mode === 'average') return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return values.reduce((sum, value) => sum + value, 0);
}

function changePercent(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function buildMetadataInsights({ month, definitions = [], settings = [], currentRows = [], previousRows = [] }) {
  const settingsByCode = new Map(settings.filter(item => item.enabled).map(item => [item.module_code, item]));
  const activeDefinitions = definitions.filter(item => settingsByCode.has(item.code));
  const trends = [];
  const anomalies = [];
  const recommendations = [];

  for (const definition of activeDefinitions) {
    const setting = settingsByCode.get(definition.code);
    const metric = setting.primary_metric || definition.primary_metric || 'quantity';
    const aggregation = setting.aggregation || definition.aggregation || 'sum';
    const unit = definition.default_unit || '';
    const currentModuleRows = currentRows.filter(row => row.module === definition.code);
    const previousModuleRows = previousRows.filter(row => row.module === definition.code);
    const current = aggregate(currentModuleRows, metric, aggregation);
    const previous = aggregate(previousModuleRows, metric, aggregation);
    const change = changePercent(current, previous);
    const threshold = Number(setting.warning_change_percent ?? 15);
    const direction = change > threshold ? 'up' : change < -threshold ? 'down' : 'stable';
    const undesirable = setting.better_direction === 'lower' ? direction === 'up' : setting.better_direction === 'higher' ? direction === 'down' : false;
    const label = definition.name_th || definition.code;
    const message = direction === 'up' ? `${label} เพิ่มขึ้น ${Math.abs(change)}% จากเดือนก่อน` : direction === 'down' ? `${label} ลดลง ${Math.abs(change)}% จากเดือนก่อน` : `${label} ใกล้เคียงเดือนก่อน`;
    trends.push({ module: definition.code, label, metric, unit, aggregation, current_value: Number(current.toFixed(2)), previous_value: Number(previous.toFixed(2)), current_weight_kg: Number(current.toFixed(2)), previous_weight_kg: Number(previous.toFixed(2)), change_percent: change, direction, count: currentModuleRows.length, message });
    if (undesirable) anomalies.push({ severity: Math.abs(change) >= threshold * 2 ? 'high' : 'medium', module: definition.code, label, title: 'แนวโน้มสวนทางเป้าหมาย', details: `${message} ขณะที่ทิศทางที่ต้องการคือ ${setting.better_direction === 'lower' ? 'ลดลง' : 'เพิ่มขึ้น'}`, metric_value: current, unit });
    if (currentModuleRows.length === 0) anomalies.push({ severity: 'medium', module: definition.code, label, title: 'ไม่มีข้อมูลในเดือนนี้', details: 'ควรตรวจสอบรอบการบันทึกก่อนนำข้อมูลไปทำรายงาน', metric_value: 0, unit });
  }

  for (const anomaly of anomalies.slice(0, 4)) recommendations.push({ priority: anomaly.severity === 'high' ? 'high' : 'medium', title: `ตรวจสอบ ${anomaly.label}`, details: anomaly.details });
  if (activeDefinitions.length && !recommendations.length) recommendations.push({ priority: 'normal', title: 'แนวโน้มอยู่ในเกณฑ์ที่กำหนด', details: 'ยังไม่พบการเปลี่ยนแปลงที่เกินค่าแจ้งเตือนของโมดูลที่เปิดใช้ AI' });
  const score = Math.max(0, 100 - anomalies.reduce((sum, item) => sum + (item.severity === 'high' ? 20 : 10), 0));
  const strongest = trends.slice().sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))[0];
  const headline = !activeDefinitions.length ? 'ยังไม่มีโมดูลที่เปิดใช้ AI Insight' : strongest ? `${strongest.message} · คะแนนความพร้อม ${score}%` : `เปิดวิเคราะห์ ${activeDefinitions.length} โมดูล คะแนนความพร้อม ${score}%`;
  return { month: `${String(month).slice(0, 7)}-01`, generated_at: new Date().toISOString(), engine: 'CKAP metadata analytical engine', metadata_mode: true, enabled_modules: activeDefinitions.map(item => item.code), score, headline, trends, anomalies, recommendations, quality_scores: [], powerpoint_bullets: [headline, recommendations[0]?.details].filter(Boolean) };
}

function buildSafeAiPayload(result, settings = []) {
  const settingsByCode = new Map(settings.map(item => [item.module_code, item]));
  return {
    month: result.month,
    score: result.score,
    modules: (result.trends || []).map(item => {
      const setting = settingsByCode.get(item.module) || {};
      return { module: item.module, label: item.label, metric: item.metric, unit: item.unit, aggregation: item.aggregation, current_value: item.current_value, previous_value: item.previous_value, change_percent: item.change_percent, desired_direction: setting.better_direction || 'neutral', alert_threshold_percent: setting.warning_change_percent ?? 15, context: setting.context_th || '', instructions: setting.instructions || '' };
    }),
    anomalies: (result.anomalies || []).map(item => ({ module: item.module, severity: item.severity, title: item.title, details: item.details }))
  };
}

module.exports = { readMetric, aggregate, changePercent, buildMetadataInsights, buildSafeAiPayload };
