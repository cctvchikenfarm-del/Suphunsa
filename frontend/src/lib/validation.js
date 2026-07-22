const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'

export function normalizeThaiDigits(value) {
  return String(value ?? '').replace(/[๐-๙]/g, digit => String(THAI_DIGITS.indexOf(digit)))
}

export function validateNumericInput(value, { integer = false, required = false, label = 'ข้อมูล', min = 0 } = {}) {
  const normalized = normalizeThaiDigits(value).trim().replace(/,/g, '')
  if (!normalized) return required ? { value: normalized, error: `กรุณากรอก${label}` } : { value: normalized, error: '' }
  if (/[A-Za-zก-๙]/u.test(normalized)) return { value: normalized, error: `พบตัวอักษรในช่อง${label} อาจลืมเปลี่ยนภาษาของแป้นพิมพ์` }
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return { value: normalized, error: `กรุณากรอก${label}เป็นตัวเลขเท่านั้น` }
  const number = Number(normalized)
  if (!Number.isFinite(number)) return { value: normalized, error: `${label}ไม่ใช่ตัวเลขที่ถูกต้อง` }
  if (number < min) return { value: normalized, error: `${label}ต้องไม่น้อยกว่า ${min}` }
  if (integer && !Number.isInteger(number)) return { value: normalized, error: `${label}ต้องเป็นจำนวนเต็มเท่านั้น` }
  return { value: normalized, number, error: '' }
}

export function dateBelongsToMonth(date, month) {
  return Boolean(date && month && String(date).slice(0, 7) === String(month).slice(0, 7))
}
