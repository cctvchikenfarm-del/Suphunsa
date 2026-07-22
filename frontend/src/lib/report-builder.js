// report-builder.js - Custom Report Builder for CKAP v3
import pptxgen from "pptxgenjs";
import { monthlyEntryValue } from './ledger-config.js';

export const reportThemeOptions = [
  { id: "executive_dark", label: "Executive Dark", description: "หน้าปกเข้ม สีกรมม่วง ดูหรูหรา", primary: "1E1B4B", accent: "6366F1", surface: "F9FAFB", textLight: "FFFFFF", textDark: "111827" },
  { id: "clean_blue", label: "Clean Blue", description: "โทนสีฟ้าข้าราชการ สุภาพ อ่านง่าย", primary: "0F172A", accent: "2563EB", surface: "F8FAFC", textLight: "FFFFFF", textDark: "0F172A" },
  { id: "eco_green", label: "Eco Green", description: "โทนเขียวธรรมชาติ เหมาะกับรายงานสิ่งแวดล้อม", primary: "064E3B", accent: "10B981", surface: "F0FDF4", textLight: "FFFFFF", textDark: "064E3B" },
  { id: "minimal_slate", label: "Minimal Slate", description: "ขาวเทาสะอาดตา สไตล์มินิมอล", primary: "334155", accent: "64748B", surface: "FFFFFF", textLight: "FFFFFF", textDark: "1E293B" },
  { id: "central_pattana", label: "Central Pattana", description: "โทนสีทองและเทาเข้ม ตามอัตลักษณ์ของ CPN", primary: "262522", accent: "B39254", surface: "FAF9F5", textLight: "FFFFFF", textDark: "262522" }
];


export const slideLayoutOptions = [
  { id: "auto", label: "Auto Layout", description: "ให้ระบบจัดวางตามเหมาะสม" },
  { id: "kpi_chart_analysis", label: "KPI + Chart + Analysis", description: "สไลด์ภาพรวมมาตรฐาน" },
  { id: "chart_focus", label: "Chart Focus", description: "ขยายกราฟให้เด่นชัด" },
  { id: "table_focus", label: "Table Focus", description: "เน้นแสดงตารางข้อมูลดิบ" }
];

export const moduleLabels = {
  rdf: "ขยะ RDF",
  dog_food: "อาหารหมา",
  pig_feed: "อาหารหมู",
  recycle: "ขยะรีไซเคิล",
  tissue: "กระดาษทิชชู่",
  black_bag: "ถุงดำ",
  consumable: "น้ำยาต่างๆ",
  general_waste: "ขยะทั่วไป",
  wet_waste: "ขยะเปียก"
};

export function thaiMonthLabel(monthStr) {
  if (!monthStr) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr.slice(0, 7));
  if (!match) return monthStr;
  const year = Number(match[1]) + 543; // พ.ศ.
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${months[Number(match[2]) - 1]} ${String(year).slice(-2)}`;
}

export function getReportTheme(themeId) {
  return reportThemeOptions.find(t => t.id === themeId) || reportThemeOptions[0];
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

function getMonthlyDataForModule(entries, moduleCode, metricKey = 'quantity') {
  const series = Array(12).fill(0);
  (entries || []).forEach(row => {
    if (row.module !== moduleCode) return;
    const date = new Date(row.entry_date);
    const m = date.getMonth();
    if (m >= 0 && m < 12) {
      const field = metricKey === 'weight' ? 'weight_kg' : (metricKey === 'amount' ? 'amount' : 'quantity');
      const val = metricKey === 'weight' ? monthlyEntryValue(row, field) : (row[field] || 0);
      series[m] += Number(val);
    }
  });
  return series;
}

function getMonthlyDataForCategory(entries, moduleCode, categoryCode, metricKey = 'quantity') {
  const series = Array(12).fill(0);
  (entries || []).forEach(row => {
    if (row.module !== moduleCode) return;
    if (categoryCode && row.category_code !== categoryCode) return;
    const date = new Date(row.entry_date);
    const m = date.getMonth();
    if (m >= 0 && m < 12) {
      const field = metricKey === 'weight' ? 'weight_kg' : (metricKey === 'amount' ? 'amount' : 'quantity');
      const val = metricKey === 'weight' ? monthlyEntryValue(row, field) : (row[field] || 0);
      series[m] += Number(val);
    }
  });
  return series;
}

// สร้างสไลด์เอาท์ไลน์เริ่มต้นตามข้อมูลที่มีอยู่
export function buildReportSlideOutline(dashboardData, qualityData, settings = {}) {
  const slides = [];
  let index = 0;

  if (settings.reportType === 'fmhy') {
    slides.push({
      id: `cover:${index++}`,
      title: settings.title || "Hygiene Monthly Report (FM-HY)",
      description: "หน้าปกแสดงสีกราฟิกและชื่อประจำเดือน",
      type: "cover",
      enabled: true,
      locked: true
    });
    slides.push({
      id: `fmhy_tissue:${index++}`,
      title: "รายงานการใช้กระดาษทิชชู่",
      description: "เปรียบเทียบปริมาณการใช้กระดาษทิชชู่สะสมรายเดือนแยกประเภท",
      type: "fmhy_tissue",
      enabled: true
    });
    slides.push({
      id: `fmhy_waste:${index++}`,
      title: "รายงานสรุปขยะและเปรียบเทียบปริมาณ",
      description: "ขยะเปียก ขยะรีไซเคิล และขยะ RDF ประจำเดือน",
      type: "fmhy_waste",
      enabled: true
    });
    slides.push({
      id: `fmhy_feed:${index++}`,
      title: "เปรียบเทียบปริมาณอาหารสัตว์ (หมู & สุนัข)",
      description: "ปริมาณอาหารสัตว์แปรรูปจากขยะเศษอาหารรายเดือน",
      type: "fmhy_feed",
      enabled: true
    });
    slides.push({
      id: `fmhy_recycle_rev:${index++}`,
      title: "รายการรายได้จากการขายเศษวัสดุ",
      description: "รายได้เศษวัสดุรีไซเคิลสะสมรายเดือน",
      type: "fmhy_recycle_rev",
      enabled: true
    });
    slides.push({
      id: `fmhy_bags:${index++}`,
      title: "รายงานการใช้ถุงขยะแยกขนาด",
      description: "เปรียบเทียบปริมาณถุงขยะ ขนาด 30x40, 28x36, 18x20",
      type: "fmhy_bags",
      enabled: true
    });

    return slides;
  }
  index = 0;

  // 1. Cover
  slides.push({
    id: `cover:${index++}`,
    title: settings.title || "รายงานสรุปปริมาณขยะและทรัพยากร",
    description: "หน้าปกแสดงสีกราฟิกและชื่อประจำเดือน",
    type: "cover",
    enabled: true,
    locked: true
  });

  // 2. Executive Summary
  slides.push({
    id: `summary:${index++}`,
    title: "Executive Summary",
    description: "ภาพรวมยอดรวมน้ำหนัก รายได้ และรายการข้อมูล",
    type: "summary",
    enabled: true,
    locked: true
  });

  // 3. Module charts
  slides.push({
    id: `chart:${index++}`,
    title: "สรุปปริมาณแยกตามประเภทงาน",
    description: "กราฟแท่งเปรียบเทียบน้ำหนักขยะ/ทรัพยากรรายหมวด",
    type: "chart",
    enabled: settings.includeCharts !== false,
    layout: "chart_focus"
  });

  // 4. Data Quality
  if (qualityData) {
    slides.push({
      id: `quality:${index++}`,
      title: "รายงานคุณภาพและความสมบูรณ์ของข้อมูล",
      description: "เปอร์เซ็นต์ความครบถ้วนของข้อมูลแต่ละงาน",
      type: "quality",
      enabled: settings.includeQuality !== false,
      layout: "kpi_chart_analysis"
    });
  }

  // 5. Data Table
  slides.push({
    id: `table:${index++}`,
    title: "ตารางสรุปรายหมวดข้อมูล",
    description: "ตารางสรุปยอดน้ำหนักและราคาประเมิน",
    type: "table",
    enabled: settings.includeTables !== false,
    layout: "table_focus"
  });

  // 6. Recommendations
  slides.push({
    id: `recommendations:${index++}`,
    title: "ข้อเสนอแนะและมาตรการถัดไป",
    description: "ข้อเสนอแนะในการจัดการทรัพยากรและขยะ",
    type: "recommendations",
    enabled: true,
    locked: true
  });

  // 7. Custom slides
  if (Array.isArray(settings.customSlides)) {
    settings.customSlides.forEach(cs => {
      slides.push({
        id: cs.id,
        title: cs.title,
        description: cs.description || "สไลด์ที่เพิ่มเติมเองโดยผู้ใช้งาน",
        type: "custom",
        content: cs.content || [],
        enabled: cs.enabled !== false,
        locked: false
      });
    });
  }

  // ใช้ Overrides สำหรับเปิด/ปิด หรือแก้ไขชื่อสไลด์
  return slides.map((slide, fallbackOrder) => {
    const override = settings.slideOutlineOverrides?.[slide.id] || {};
    return {
      ...slide,
      enabled: override.enabled !== false && slide.enabled,
      title: override.title || slide.title,
      layout: override.layout || slide.layout || "auto",
      order: typeof override.order === "number" ? override.order : fallbackOrder
    };
  }).sort((a, b) => a.order - b.order);
}

// ช่วยย่อข้อความไม่ให้ล้นสไลด์
function truncateText(text, maxLen = 120) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

// สร้าง PowerPoint จากเอาท์ไลน์
export async function exportReportBuilderPowerPoint(dashboardData, qualityData, settings, context) {
  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "Central Krabi Analytics Platform";
  ppt.title = settings.title || "รายงานขยะประจำเดือน";
  ppt.company = "Central Krabi";
  
  const theme = getReportTheme(settings.theme || "executive_dark");
  const monthTh = thaiMonthLabel(settings.month);
  const activeSlides = (settings.customSlideOutline || buildReportSlideOutline(dashboardData, qualityData, settings)).filter(s => s.enabled);

  let pageNum = 1;

  activeSlides.forEach(slideConfig => {
    const slide = ppt.addSlide();
    slide.background = { color: theme.surface };

    // ฟังก์ชันเขียน Header/Footer ทั่วไป
    const addHeaderFooter = (titleText) => {
      // Header
      slide.addText(truncateText(titleText, 60), { x: 0.5, y: 0.35, w: 10, h: 0.5, fontSize: 24, bold: true, color: theme.primary, margin: 0 });
      slide.addText(`ข้อมูลประจำเดือน ${monthTh} • สร้างโดยระบบอัตโนมัติ`, { x: 0.5, y: 0.85, w: 8, h: 0.25, fontSize: 10, color: "6B7280", margin: 0 });
      
      // Logo ในมุมขวาบน (สไลด์หน้าที่สองเป็นต้นไป)
      try {
        slide.addImage({
          path: "/central-krabi-logo.png",
          x: 11.2,
          y: 0.25,
          w: 1.6,
          h: 0.7
        });
      } catch (err) {
        console.warn("Could not load central-krabi-logo.png for PPTX: ", err);
      }
 
      // Footer
      slide.addText(`Central Krabi Analytics Platform v3.0`, { x: 0.5, y: 7.1, w: 5, h: 0.2, fontSize: 8.5, color: "9CA3AF", margin: 0 });
      slide.addText(String(pageNum), { x: 12.3, y: 7.1, w: 0.5, h: 0.2, fontSize: 8.5, color: "9CA3AF", align: "right", margin: 0 });
    };

    // ฟังก์ชันเขียนคอลัมน์วิเคราะห์ข้อมูล/ข้อเสนอแนะด้านขวา (สำหรับสไลด์แบบ 3 คอลัมน์)
    const renderBulletsColumn = (targetSlide, bullets, x = 10.2, y = 1.5, w = 2.6, h = 4.8) => {
      targetSlide.addShape("roundRect", { x, y, w, h, fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1 }, rectRadius: 0.08 });
      targetSlide.addText("💡 การวิเคราะห์ / ข้อแนะนำ", { x: x + 0.1, y: y + 0.15, w: w - 0.2, h: 0.3, fontSize: 10, color: "1E3A8A", bold: true });
      
      bullets.forEach((bullet, idx) => {
        const by = y + 0.5 + idx * 0.75;
        if (by + 0.7 <= y + h) {
          targetSlide.addText(bullet, {
            x: x + 0.1,
            y: by,
            w: w - 0.2,
            h: 0.7,
            fontSize: 9,
            color: "334155",
            align: "l",
            valign: "t"
          });
        }
      });
    };

    if (slideConfig.type === "cover") {
      // หน้าปก
      slide.background = { color: theme.primary };
      // กล่องสีตกแต่ง
      slide.addShape("rect", { x: 0, y: 0, w: 0.4, h: 7.5, fill: { color: theme.accent } });
      slide.addText("CENTRAL KRABI", { x: 0.8, y: 1.8, w: 8, h: 0.3, fontSize: 13, bold: true, color: theme.accent, charSpace: 2 });
      slide.addText(slideConfig.title, { x: 0.8, y: 2.2, w: 11.5, h: 1.5, fontSize: 38, bold: true, color: theme.textLight, margin: 0 });
      slide.addText(`รายงานสรุปผลข้อมูลประจำเดือน ${monthTh}`, { x: 0.8, y: 3.8, w: 11, h: 0.4, fontSize: 18, color: "E2E8F0" });
      slide.addText(`จัดทำขึ้นโดยระบบอัตโนมัติ เมื่อวันที่ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date())}`, { x: 0.8, y: 6.2, w: 10, h: 0.3, fontSize: 11, color: "94A3B8" });
    } 
    
    else if (slideConfig.type === "summary") {
      // Executive Summary
      addHeaderFooter(slideConfig.title);

      const totals = dashboardData?.totals || {};
      const kpiData = [
        { label: "น้ำหนักขยะและทรัพยากรรวม", val: `${Number(totals.total_weight_kg || 0).toLocaleString()} kg`, desc: "น้ำหนักที่รวบรวมได้ทั้งหมด" },
        { label: "รายได้ประเมินรวม", val: `${Number(totals.total_amount || 0).toLocaleString()} บาท`, desc: "รายได้จากการรีไซเคิลและวัสดุ" },
        { label: "รายการบันทึกข้อมูล", val: `${Number(totals.entry_count || 0).toLocaleString()} รายการ`, desc: "ความถี่ในการคีย์ข้อมูลลงฐาน" },
        { label: "ขยะเปียกรวม (หมู+หมา)", val: `${Number(totals.wet_waste_weight_kg || 0).toLocaleString()} kg`, desc: "สัดส่วนขยะเปียกที่แยกได้" }
      ];

      kpiData.forEach((kpi, idx) => {
        const x = 0.6 + (idx % 2) * 6.1;
        const y = 1.4 + Math.floor(idx / 2) * 2.5;
        slide.addShape("roundRect", { x, y, w: 5.8, h: 2.1, fill: { color: "FFFFFF" }, line: { color: "E5E7EB", pt: 1 }, rectRadius: 0.1 });
        slide.addShape("rect", { x: x + 0.02, y: y + 0.02, w: 0.1, h: 2.06, fill: { color: theme.accent } });
        slide.addText(kpi.label, { x: x + 0.3, y: y + 0.3, w: 5, h: 0.3, fontSize: 12, color: "4B5563", bold: true });
        slide.addText(kpi.val, { x: x + 0.3, y: y + 0.7, w: 5, h: 0.6, fontSize: 28, bold: true, color: theme.primary });
        slide.addText(kpi.desc, { x: x + 0.3, y: y + 1.4, w: 5, h: 0.3, fontSize: 10.5, color: "9CA3AF" });
      });
    }

    else if (slideConfig.type === "chart") {
      // หน้ากราฟสรุป
      addHeaderFooter(slideConfig.title);

      const modulesData = dashboardData?.dynamic_modules?.length ? dashboardData.dynamic_modules : (dashboardData?.modules || []);
      const labels = modulesData.map(m => m.name_th || moduleLabels[m.module] || m.module || m.code);
      const values = modulesData.map(m => Number(m.metric_value ?? m.weight_kg ?? 0));

      if (labels.length > 0) {
        try {
          slide.addChart(ppt.ChartType.bar, [
            { name: "ค่าตัวชี้วัดหลัก", labels, values }
          ], {
            x: 0.6, y: 1.4, w: 12.1, h: 5.2,
            showLegend: false,
            showTitle: false,
            showValue: true,
            valAxisTitle: "ค่าตัวชี้วัดหลักตาม Metadata",
            dataLabelFontFace: "Aptos",
            dataLabelFontSize: 11,
            catAxisLabelFontFace: "Aptos",
            catAxisLabelFontSize: 11,
            chartColors: [theme.accent.replace("#", "")]
          });
        } catch {
          // Fallback ในกรณีที่ Chart รันไม่ได้
          slide.addText("ไม่สามารถแสดงผลกราฟในขณะนี้ได้เนื่องจากข้อมูลขัดข้อง", { x: 1, y: 3, w: 10, h: 1, fontSize: 14, color: "EF4444" });
        }
      } else {
        slide.addText("ไม่มีข้อมูลที่สามารถนำมาวาดกราฟได้", { x: 1, y: 3, w: 10, h: 1, fontSize: 14, color: "6B7280", align: "center" });
      }
    }

    else if (slideConfig.type === "quality" && qualityData) {
      // หน้า Data Quality
      addHeaderFooter(slideConfig.title);

      // แสดงค่าเฉลี่ย
      const completenessList = qualityData.scores || [];
      const avgCompleteness = completenessList.length 
        ? Math.round(completenessList.reduce((sum, item) => sum + (item.score || 0), 0) / completenessList.length) 
        : 0;

      slide.addShape("roundRect", { x: 0.6, y: 1.5, w: 3.5, h: 4.8, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.08 });
      slide.addText("คะแนนความครบถ้วนเฉลี่ย", { x: 0.8, y: 1.8, w: 3.1, h: 0.3, fontSize: 11.5, color: "6B7280", align: "center" });
      slide.addText(`${avgCompleteness}%`, { x: 0.8, y: 2.3, w: 3.1, h: 1.5, fontSize: 62, bold: true, color: avgCompleteness >= 90 ? "10B981" : "F59E0B", align: "center" });
      slide.addText("จากการประเมิน 6 ประเภทงาน", { x: 0.8, y: 4.2, w: 3.1, h: 0.3, fontSize: 11, color: "9CA3AF", align: "center" });

      // ตารางแสดงแต่ละงาน
      const headers = ["ประเภทงาน", "ความครอบคลุมวัน", "ความสมบูรณ์ข้อมูล", "คะแนนรวม"];
      const rows = completenessList.map(item => [
        moduleLabels[item.module] || item.module,
        `${item.covered_days}/${item.expected_days} วัน`,
        item.entries > 0 ? "สมบูรณ์" : "ไม่มีข้อมูล",
        `${item.score}%`
      ]);

      slide.addTable([headers, ...rows], {
        x: 4.5, y: 1.5, w: 8.2, h: 4.8,
        border: { type: "solid", color: "E5E7EB", pt: 1 },
        fontSize: 11,
        color: "374151",
        fill: "FFFFFF",
        rowH: 0.45,
        colW: [2.5, 2.0, 2.0, 1.7]
      });
    }

    else if (slideConfig.type === "table") {
      // หน้าตารางข้อมูลสรุป
      addHeaderFooter(slideConfig.title);

      const modulesData = dashboardData?.dynamic_modules?.length ? dashboardData.dynamic_modules : (dashboardData?.modules || []);
      const headers = ["โมดูล", "ตัวชี้วัดหลัก", "หน่วย", "จำนวนรายการที่บันทึก"];
      const rows = modulesData.map(m => [
        m.name_th || moduleLabels[m.module] || m.module || m.code,
        Number(m.metric_value ?? m.weight_kg ?? 0).toLocaleString(),
        m.metric_unit || "kg",
        `${Number(m.count || 0).toLocaleString()} ครั้ง`
      ]);

      // เพิ่มแถวรวม
      const totals = dashboardData?.totals || {};
      rows.push([
        "ยอดรวมทั้งหมด",
        Number(totals.total_weight_kg || 0).toLocaleString(),
        "ค่ารวมอ้างอิง",
        `${Number(totals.entry_count || 0).toLocaleString()} ครั้ง`
      ]);

      slide.addTable([headers, ...rows], {
        x: 0.6, y: 1.4, w: 12.1, h: 5.2,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: 12,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.52,
        colW: [3.5, 2.8, 3.0, 2.8]
      });
    }

    else if (slideConfig.type === "recommendations") {
      // ข้อเสนอแนะ
      addHeaderFooter(slideConfig.title);

      const bulletPoints = [
        "1. ติดตามปริมาณขยะ RDF และปรับปรุงกระบวนการบดอัดเพื่อเพิ่มประสิทธิภาพในการส่งเตาเผาขยะอย่างต่อเนื่อง",
        "2. วิเคราะห์แนวโน้มขยะรีไซเคิลรายสัปดาห์ เพื่อหาโอกาสเจรจาต่อรองราคากับพ่อค้าคนกลางในช่วงที่ราคากลางปรับตัวสูงขึ้น",
        "3. สำหรับหมวดขยะเปียก (เศษอาหารสัตว์) ควรรักษามาตรฐานสุขอนามัยและการจัดเก็บ เพื่อลดกลิ่นรบกวนในระหว่างสัปดาห์",
        "4. ตรวจสอบการคีย์ข้อมูลในระบบเป็นรายสัปดาห์ผ่านเมนูตรวจคุณภาพข้อมูล (Data Quality) เพื่อป้องกันข้อมูลสูญหาย",
        "5. เสนอให้จัดอบรมพนักงานเกี่ยวกับการแยกประเภทขยะกระดาษทิชชู่และถุงดำเพิ่มเติม เพื่อลดปริมาณขยะทั่วไปที่ไม่จำเป็น"
      ];

      slide.addShape("roundRect", { x: 0.6, y: 1.5, w: 12.1, h: 4.8, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.1 });
      
      bulletPoints.forEach((point, index) => {
        const py = 1.9 + index * 0.8;
        slide.addText(point, { x: 1.0, y: py, w: 11.3, h: 0.5, fontSize: 13, color: "374151", bold: index < 2 });
      });
    }

    else if (slideConfig.type === "custom") {
      addHeaderFooter(slideConfig.title);
      const bulletPoints = Array.isArray(slideConfig.content) ? slideConfig.content : [];
      slide.addShape("roundRect", { x: 0.6, y: 1.5, w: 12.1, h: 4.8, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.1 });
      if (bulletPoints.length > 0) {
        bulletPoints.forEach((point, index) => {
          const py = 1.9 + index * 0.8;
          slide.addText(point, { x: 1.0, y: py, w: 11.3, h: 0.5, fontSize: 13, color: "374151" });
        });
      } else {
        slide.addText("(สไลด์นี้ยังไม่มีข้อมูลเนื้อหาหลัก)", { x: 1.0, y: 1.9, w: 11.3, h: 0.5, fontSize: 13, color: "9CA3AF", italic: true });
      }
    }

    else if (slideConfig.type === "fmhy_tissue") {
      addHeaderFooter(slideConfig.title);
      const entries = settings.entriesForYear || [];
      const rollSeries = getMonthlyDataForCategory(entries, 'tissue', 'tissue_roll', 'quantity');
      const handSeries = getMonthlyDataForCategory(entries, 'tissue', 'tissue_hand', 'quantity');
      const popupSeries = getMonthlyDataForCategory(entries, 'tissue', 'tissue_popup', 'quantity');

      const tableHeaders = ["ประเภท", "ม้วน", "มือ (แพ็ค)", "ป๊อปอัพ (แพ็ค)"];
      const tableRows = THAI_MONTHS_SHORT.map((m, idx) => [
        m, 
        rollSeries[idx].toLocaleString(), 
        handSeries[idx].toLocaleString(), 
        popupSeries[idx].toLocaleString()
      ]);

      const bullets = slideConfig.bullets || [];
      const hasBullets = bullets.length > 0;

      slide.addTable([tableHeaders, ...tableRows], {
        x: hasBullets ? 0.5 : 0.6,
        y: 1.5,
        w: hasBullets ? 4.5 : 5.2,
        h: 4.8,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: hasBullets ? 8.5 : 10,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.36
      });

      const chartData = [
        { name: "ม้วน", labels: THAI_MONTHS_SHORT, values: rollSeries },
        { name: "มือ", labels: THAI_MONTHS_SHORT, values: handSeries },
        { name: "ป๊อปอัพ", labels: THAI_MONTHS_SHORT, values: popupSeries }
      ];
      slide.addChart(ppt.ChartType.line, chartData, {
        x: hasBullets ? 5.2 : 6.2,
        y: 1.5,
        w: hasBullets ? 4.8 : 6.5,
        h: 4.8,
        showLegend: true,
        legendPos: "b",
        title: "แนวโน้มปริมาณการใช้กระดาษทิชชู่รายเดือน"
      });

      if (hasBullets) {
        renderBulletsColumn(slide, bullets, 10.2, 1.5, 2.6, 4.8);
      }
    }

    else if (slideConfig.type === "fmhy_waste") {
      addHeaderFooter(slideConfig.title);
      const entries = settings.entriesForYear || [];
      const wetSeries = getMonthlyDataForModule(entries, 'wet_waste', 'weight');
      const recycleSeries = getMonthlyDataForModule(entries, 'recycle', 'weight');
      const rdfSeries = getMonthlyDataForModule(entries, 'rdf', 'weight');

      const tableHeaders = ["เดือน", "ขยะเปียก", "Recycle", "RDF"];
      const tableRows = THAI_MONTHS_SHORT.map((m, idx) => [
        m,
        wetSeries[idx].toLocaleString(),
        recycleSeries[idx].toLocaleString(),
        rdfSeries[idx].toLocaleString()
      ]);

      const bullets = slideConfig.bullets || [];
      const hasBullets = bullets.length > 0;

      slide.addTable([tableHeaders, ...tableRows], {
        x: hasBullets ? 0.5 : 0.6,
        y: 1.5,
        w: hasBullets ? 4.5 : 5.2,
        h: 4.8,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: hasBullets ? 8.5 : 10,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.36
      });

      const chartData = [
        { name: "ขยะเปียก", labels: THAI_MONTHS_SHORT, values: wetSeries },
        { name: "Recycle", labels: THAI_MONTHS_SHORT, values: recycleSeries },
        { name: "ขยะ RDF", labels: THAI_MONTHS_SHORT, values: rdfSeries }
      ];
      slide.addChart(ppt.ChartType.bar, chartData, {
        x: hasBullets ? 5.2 : 6.2,
        y: 1.5,
        w: hasBullets ? 4.8 : 6.5,
        h: 4.8,
        showLegend: true,
        legendPos: "b",
        title: "เปรียบเทียบปริมาณขยะรายเดือน"
      });

      if (hasBullets) {
        renderBulletsColumn(slide, bullets, 10.2, 1.5, 2.6, 4.8);
      }
    }

    else if (slideConfig.type === "fmhy_feed") {
      addHeaderFooter(slideConfig.title);
      const entries = settings.entriesForYear || [];
      const pigSeries = getMonthlyDataForCategory(entries, 'pig_feed', 'PIG_FEED', 'weight');
      const dogSeries = getMonthlyDataForCategory(entries, 'dog_food', 'DOG_FOOD', 'weight');

      const tableHeaders = ["เดือน", "อาหารหมู", "อาหารสุนัข"];
      const tableRows = THAI_MONTHS_SHORT.map((m, idx) => [
        m,
        pigSeries[idx].toLocaleString(),
        dogSeries[idx].toLocaleString()
      ]);

      const bullets = slideConfig.bullets || [];
      const hasBullets = bullets.length > 0;

      slide.addTable([tableHeaders, ...tableRows], {
        x: hasBullets ? 0.5 : 0.6,
        y: 1.5,
        w: hasBullets ? 4.5 : 5.2,
        h: 4.8,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: hasBullets ? 8.5 : 10,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.36
      });

      const chartData = [
        { name: "อาหารหมู", labels: THAI_MONTHS_SHORT, values: pigSeries },
        { name: "อาหารสุนัข", labels: THAI_MONTHS_SHORT, values: dogSeries }
      ];
      slide.addChart(ppt.ChartType.bar, chartData, {
        x: hasBullets ? 5.2 : 6.2,
        y: 1.5,
        w: hasBullets ? 4.8 : 6.5,
        h: 4.8,
        showLegend: true,
        legendPos: "b",
        title: "ปริมาณอาหารสัตว์แปรรูปจากเศษอาหาร"
      });

      if (hasBullets) {
        renderBulletsColumn(slide, bullets, 10.2, 1.5, 2.6, 4.8);
      }
    }

    else if (slideConfig.type === "fmhy_recycle_rev") {
      addHeaderFooter(slideConfig.title);
      const entries = settings.entriesForYear || [];
      const revSeries = getMonthlyDataForModule(entries, 'recycle', 'amount');

      const tableHeaders = ["เดือน", "เงินเศษวัสดุ (บาท)"];
      const tableRows = THAI_MONTHS_SHORT.map((m, idx) => [
        m,
        revSeries[idx].toLocaleString()
      ]);

      const bullets = slideConfig.bullets || [];
      const hasBullets = bullets.length > 0;

      slide.addTable([tableHeaders, ...tableRows], {
        x: hasBullets ? 0.5 : 0.6,
        y: 1.5,
        w: hasBullets ? 4.5 : 5.2,
        h: 4.8,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: hasBullets ? 8.5 : 10,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.36
      });

      const chartData = [
        { name: "รายได้รีไซเคิล", labels: THAI_MONTHS_SHORT, values: revSeries }
      ];
      slide.addChart(ppt.ChartType.line, chartData, {
        x: hasBullets ? 5.2 : 6.2,
        y: 1.5,
        w: hasBullets ? 4.8 : 6.5,
        h: 4.8,
        showLegend: true,
        legendPos: "b",
        title: "รายได้จากการจำหน่ายเศษวัสดุรายเดือน"
      });

      if (hasBullets) {
        renderBulletsColumn(slide, bullets, 10.2, 1.5, 2.6, 4.8);
      }
    }

    else if (slideConfig.type === "fmhy_bags") {
      addHeaderFooter(slideConfig.title);
      const entries = settings.entriesForYear || [];
      const smallSeries = getMonthlyDataForCategory(entries, 'black_bag', 'black_bag_small', 'quantity');
      const medSeries = getMonthlyDataForCategory(entries, 'black_bag', 'black_bag_medium', 'quantity');
      const largeSeries = getMonthlyDataForCategory(entries, 'black_bag', 'black_bag_large', 'quantity');

      const tableHeaders = ["เดือน", "30x40", "28x36", "18x20"];
      const tableRows = THAI_MONTHS_SHORT.map((m, idx) => [
        m,
        largeSeries[idx].toLocaleString(),
        medSeries[idx].toLocaleString(),
        smallSeries[idx].toLocaleString()
      ]);

      const bullets = slideConfig.bullets || [];
      const hasBullets = bullets.length > 0;

      slide.addTable([tableHeaders, ...tableRows], {
        x: hasBullets ? 0.5 : 0.6,
        y: 1.5,
        w: hasBullets ? 4.5 : 5.2,
        h: 4.8,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
        fontSize: hasBullets ? 8.5 : 10,
        color: "1E293B",
        fill: "FFFFFF",
        rowH: 0.36
      });

      const chartData = [
        { name: "ถุงใหญ่ (30x40)", labels: THAI_MONTHS_SHORT, values: largeSeries },
        { name: "ถุงกลาง (28x36)", labels: THAI_MONTHS_SHORT, values: medSeries },
        { name: "ถุงเล็ก (18x20)", labels: THAI_MONTHS_SHORT, values: smallSeries }
      ];
      slide.addChart(ppt.ChartType.line, chartData, {
        x: hasBullets ? 5.2 : 6.2,
        y: 1.5,
        w: hasBullets ? 4.8 : 6.5,
        h: 4.8,
        showLegend: true,
        legendPos: "b",
        title: "แนวโน้มความต้องการใช้ถุงดำประจำศูนย์การค้า"
      });

      if (hasBullets) {
        renderBulletsColumn(slide, bullets, 10.2, 1.5, 2.6, 4.8);
      }
    }


    pageNum++;
  });

  await ppt.writeFile({ fileName: `CKAP_Report_${settings.month}.pptx` });
}
