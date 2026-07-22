// export-report.js - Export helpers for CKAP v3
export function safeName(value) {
  return String(value || "report")
    .replace(/[^a-zA-Z0-9ก-๙_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportFilename(context, extension) {
  return `${safeName(context.organizationName)}_${safeName(context.moduleLabel)}_${safeName(context.periodLabel)}.${extension}`;
}

export function downloadChartSvg(svgElement, filename = 'CKAP-chart.svg') {
  if (!svgElement) throw new Error('ไม่พบกราฟสำหรับส่งออก')
  const clone = svgElement.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const source = new XMLSerializer().serializeToString(clone)
  downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), filename)
}

export async function downloadChartPng(svgElement, filename = 'CKAP-chart.png', scale = 3) {
  if (!svgElement) throw new Error('ไม่พบกราฟสำหรับส่งออก')
  await document.fonts?.ready
  const bounds = svgElement.getBoundingClientRect()
  const width = Math.max(1, Math.round(bounds.width))
  const height = Math.max(1, Math.round(bounds.height))
  const clone = svgElement.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const source = new XMLSerializer().serializeToString(clone)
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('ไม่สามารถแปลงกราฟเป็นภาพได้'))
      image.src = sourceUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    context.scale(scale, scale)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1))
    if (!blob) throw new Error('ไม่สามารถสร้างไฟล์ PNG ได้')
    downloadBlob(blob, filename)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
