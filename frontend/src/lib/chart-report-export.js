import PptxGenJS from 'pptxgenjs'

const CLEAN = color => String(color || '#2563eb').replace('#', '')

export async function exportChartReportPowerPoint({
  title,
  periodLabel,
  chartType,
  series,
  points,
  colors,
  layout = 'LAYOUT_WIDE'
}) {
  const ppt = new PptxGenJS()
  ppt.layout = layout
  ppt.author = 'CKAP System'
  ppt.subject = 'Station data report'
  ppt.title = title
  ppt.company = 'Central Krabi'
  ppt.lang = 'th-TH'
  ppt.theme = {
    headFontFace: 'Tahoma',
    bodyFontFace: 'Tahoma',
    lang: 'th-TH'
  }

  const wide = layout === 'LAYOUT_WIDE'
  const slideWidth = wide ? 13.333 : 10
  const slideHeight = 7.5
  const slide = ppt.addSlide()
  slide.background = { color: 'F8FAFC' }
  slide.addShape(ppt.ShapeType.rect, { x: 0, y: 0, w: slideWidth, h: 0.16, line: { color: '0F766E', transparency: 100 }, fill: { color: '0F766E' } })
  slide.addText(title, { x: 0.55, y: 0.35, w: slideWidth - 1.1, h: 0.38, fontFace: 'Tahoma', fontSize: 21, bold: true, color: '0F172A', margin: 0 })
  slide.addText(`${periodLabel} • ข้อมูลจริงจากฐานข้อมูล`, { x: 0.55, y: 0.8, w: slideWidth - 1.1, h: 0.24, fontFace: 'Tahoma', fontSize: 9.5, color: '64748B', margin: 0 })

  const chartSeries = chartType === 'pie'
    ? [{ name: title, labels: series.map(item => item.label), values: series.map(item => item.total) }]
    : series.map(item => ({
        name: item.label,
        labels: points.map(point => point.label),
        values: points.map(point => Number(point.values?.[item.key] || 0))
      }))
  const pptType = chartType === 'line' ? ppt.ChartType.line : chartType === 'pie' ? ppt.ChartType.pie : ppt.ChartType.bar
  slide.addChart(pptType, chartSeries, {
    x: 0.55, y: 1.2, w: slideWidth - 1.1, h: 3.55,
    showTitle: false,
    showLegend: true,
    legendPos: 'b',
    catAxisLabelFontFace: 'Tahoma',
    valAxisLabelFontFace: 'Tahoma',
    chartColors: series.map(item => CLEAN(colors[item.key])),
    showCatName: chartType === 'pie',
    showPercent: chartType === 'pie',
    showLeaderLines: chartType === 'pie',
    showValue: chartType !== 'pie',
    valGridLine: { color: 'E2E8F0', width: 1 },
    showBorder: false
  })

  const visiblePoints = points.slice(0, 12)
  const headers = ['ช่วงเวลา', ...series.map(item => `${item.label} (${item.unit})`)]
  const rows = visiblePoints.map(point => [point.label, ...series.map(item => Number(point.values?.[item.key] || 0))])
  if (rows.length) {
    slide.addTable([headers, ...rows], {
      x: 0.55, y: 5.05, w: slideWidth - 1.1, h: 1.65,
      border: { type: 'solid', color: 'CBD5E1', pt: 0.6 },
      fill: 'FFFFFF', color: '334155', fontFace: 'Tahoma', fontSize: 7.5,
      margin: 0.04,
      bold: false,
      rowH: 0.18,
      autoFit: false
    })
  }
  slide.addText(`สร้างเมื่อ ${new Date().toLocaleString('th-TH')}`, { x: 0.55, y: slideHeight - 0.38, w: slideWidth - 1.1, h: 0.16, fontFace: 'Tahoma', fontSize: 7, color: '94A3B8', align: 'right', margin: 0 })

  const safeTitle = String(title || 'CKAP_Chart').replace(/[\\/:*?"<>|]+/g, '_')
  await ppt.writeFile({ fileName: `${safeTitle}.pptx` })
}
