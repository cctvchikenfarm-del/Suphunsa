export const COMMON_UNITS = ['kg','ใบ','ม้วน','แพ็ก','แผ่น','ขวด','แกลลอน','กล่อง','กระสอบ','ชิ้น']

export function suggestUnit(module, name = '') {
  const text = String(name).trim().toLowerCase()
  const keywordRules = [
    { words:['ม้วน','roll'], unit:'ม้วน' },
    { words:['แพ็ก','แพ็ค','pack'], unit:'แพ็ก' },
    { words:['ทิชชู่มือ','เช็ดมือ','ป๊อปอัพ','ป๊อบอัพ'], unit:'แพ็ค' },
    { words:['แผ่น','sheet'], unit:'แผ่น' },
    { words:['สบู่เหลว','น้ำยา'], unit:'แกลลอน' },
    { words:['แกลลอน'], unit:'แกลลอน' },
    { words:['ขวด','bottle'], unit:'ขวด' },
    { words:['ถ้วย','cup'], unit:'ใบ' },
    { words:['กล่อง','box'], unit:'กล่อง' },
    { words:['กระสอบ','sack'], unit:'กระสอบ' },
    { words:['ชิ้นส่วน','ชิ้น','piece'], unit:'ชิ้น' }
  ]
  const matched = keywordRules.find(rule => rule.words.some(word => text.includes(word)))
  if (matched) return { unit: matched.unit, confidence: 'keyword' }
  const moduleUnits = { rdf:'kg',dog_food:'kg',pig_feed:'kg',wet_waste:'kg',recycle:'kg',black_bag:'kg',tissue:'',consumable:'แกลลอน' }
  const unit = moduleUnits[module] ?? ''
  return unit ? { unit, confidence:'module' } : { unit:'', confidence:'unknown' }
}
