import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeThaiDigits, validateNumericInput, dateBelongsToMonth } from '../src/lib/validation.js'
import { exportEntriesCsv, parseEntriesCsv, exportDynamicCsv, parseDynamicCsv } from '../src/lib/csv-engine.js'
import { getModuleConfig, getGroupedConfig, getWeekIndex, isDailyAverageEntry, monthlyEntryValue, isActivePositiveEntry, getReportableMonths } from '../src/lib/ledger-config.js'
import { suggestUnit } from '../src/lib/unit-suggestions.js'
import { aggregateModuleRows, buildModuleMonthlySeries, moduleTableFields, percentChange } from '../src/lib/metadata-analytics.js'

test('เลขไทยถูกแปลงและตรวจชนิดข้อมูล', () => {
  assert.equal(normalizeThaiDigits('๑๒.๕'), '12.5')
  assert.equal(validateNumericInput('กด', { label:'น้ำหนัก' }).error.includes('ลืมเปลี่ยนภาษา'), true)
  assert.equal(validateNumericInput('-1').error.length > 0, true)
  assert.equal(validateNumericInput('1.5', { integer:true }).error.length > 0, true)
  assert.equal(dateBelongsToMonth('2026-07-12','2026-07'), true)
})

test('อาหารหมูเป็นค่าเฉลี่ยรายวัน ส่วนข้อมูลรายวันจริงไม่คูณซ้ำ', () => {
  const monthly = { module:'pig_feed', period_month:'2026-06-01', weight_kg:1200, metadata:{ value_type:'monthly_total' } }
  const average30 = { period_month:'2026-06-01', weight_kg:40, metadata:{ value_type:'daily_average' } }
  const average28 = { period_month:'2026-02-01', weight_kg:40, metadata:{ input_mode:'daily_average' } }
  const actualDaily = { module:'pig_feed', period_month:'2026-06-01', weight_kg:40, metadata:{ value_type:'actual_daily' } }
  assert.equal(isDailyAverageEntry(monthly), false)
  assert.equal(monthlyEntryValue(monthly), 1200)
  assert.equal(monthlyEntryValue(average30), 1200)
  assert.equal(monthlyEntryValue(average28), 1120)
  assert.equal(monthlyEntryValue(actualDaily), 40)
})

test('CSV export แล้ว import กลับได้', () => {
  const source=[{id:'abc',module:'rdf',entry_date:'2026-07-01',period_month:'2026-07-01',material_name:'RDF',weight_kg:12.5,unit:'kg',notes:'ทดสอบ,ภาษาไทย',metadata:{value_type:'actual_daily'}}]
  const parsed=parseEntriesCsv(exportEntriesCsv(source,'rdf','2026-07'),'rdf','2026-07')
  assert.equal(parsed.length,1); assert.deepEqual(parsed[0].errors,[])
  assert.equal(parsed[0].entry.id,'abc'); assert.equal(parsed[0].entry.weight_kg,12.5)
  assert.equal(parsed[0].entry.notes,'ทดสอบ,ภาษาไทย')
})

test('CSV ปฏิเสธหมวดและเดือนผิด', () => {
  const csv=exportEntriesCsv([{module:'rdf',entry_date:'2026-06-01',period_month:'2026-06-01'}],'rdf','2026-06')
  const parsed=parseEntriesCsv(csv,'dog_food','2026-07')
  assert.equal(parsed[0].errors.length > 0,true)
})

test('Frontend permissions fail closed', () => {
  for (const file of ['Workspace.jsx','DataEntry.jsx','AnnualLedger.jsx']) {
    const source=fs.readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8')
    assert.equal(source.includes('permissions.length === 0 ||'),false)
    assert.equal(source.includes('!permissions.length ||'),false)
  }
})

test('Ledger configuration remains module-specific', () => {
  assert.equal(getModuleConfig('recycle').type, 'sales')
  assert.equal(getModuleConfig('tissue').showAmount, false)
  assert.equal(getModuleConfig('rdf').type, 'weight')
  assert.deepEqual(getGroupedConfig('black_bag').cols, ['period','module','qty','count'])
  assert.equal(getWeekIndex(28), 4)
})

test('Monthly report uses an adjustable accumulated range and module-correct chart rules', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  const dashboard = fs.readFileSync(new URL('../src/components/Dashboard.jsx', import.meta.url), 'utf8')
  assert.equal(ledger.includes('function AdaptiveAccumulatedChart'), true)
  assert.equal(ledger.includes('const useBars = monthsCount <= 4'), true)
  assert.equal(ledger.includes('summaryStartMonth'), true)
  assert.equal(ledger.includes('จำนวนรวมประจำเดือน'), true)
  assert.equal(ledger.includes("gridTemplateColumns: '1fr'"), true)
  assert.equal(ledger.includes('ledger-section-modal'), true)
  assert.equal(ledger.includes("third: 2, half: 3, full: 6"), true)
  assert.equal(ledger.includes('getSectionGraphHeight'), true)
  assert.equal(ledger.includes("code: 'black_bag_large'"), true)
  assert.equal(ledger.includes("color: '#18181b'"), true)
  assert.equal(ledger.includes('normalizeBagCode'), true)
  assert.equal(ledger.includes('sectionZoom'), false)
  assert.equal(ledger.includes('กลับหน้ารวม'), true)
  assert.equal((ledger.match(/useState\(true\)/g) || []).length >= 6, true)
  assert.equal((ledger.match(/renderSectionControls\('/g) || []).length, 7)
  assert.equal(dashboard.includes('Current Snapshot'), true)
  assert.equal(dashboard.includes('<TabBar tabs={TABS}'), false)
  assert.equal(dashboard.includes('เดือนที่ต้องการแสดง'), true)
  assert.equal(dashboard.includes("queryKey: ['entries', 'dashboard-snapshot', startMonth]"), true)
  assert.equal(dashboard.includes('/api/entries?month=${startMonth}'), true)
  assert.equal(dashboard.includes('ช่วงเวลาแสดงผล'), false)
})

test('Station summaries omit unrecorded months and keep a visible recycle line with monthly point colors', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  assert.equal(ledger.includes('getReportableMonths(entries, requestedSummaryMonths)'), true)
  assert.equal(ledger.includes("const [selectedMonth, setSelectedMonth] = useState('')"), true)
  assert.equal(ledger.includes('const latestRecordedMonth = getReportableMonths(entries, yearMonths).at(-1)'), true)
  assert.equal(ledger.includes('const w = monthlyEntryValue(e)'), true)
  assert.equal(ledger.includes('เฉลี่ย/สัปดาห์'), false)
  assert.equal(ledger.includes('เฉลี่ย/เดือน'), false)
  assert.equal(ledger.includes('3. ของใช้สิ้นเปลือง'), true)
  assert.equal(ledger.includes('ยังไม่มีข้อมูลที่บันทึกในช่วงเดือนนี้'), true)
  assert.equal(ledger.includes('const MONTH_POINT_COLORS = ['), true)
  assert.equal(ledger.includes('colorByMonth'), true)
  assert.equal(ledger.includes('MONTH_POINT_COLORS[index % MONTH_POINT_COLORS.length]'), true)
  assert.equal(ledger.includes('__segment_'), false)
  assert.equal(ledger.includes('stroke="transparent"'), false)
  assert.equal(ledger.includes('stroke={item.color}'), true)
})

test('Conditional Zero-Fill hides all-zero or deleted months but keeps zero cells inside active months', () => {
  const requested = ['2026-01', '2026-06', '2026-07']
  const entries = [
    { module:'wet_waste', period_month:'2026-01-01', weight_kg:0, quantity:0, amount:0 },
    { module:'rdf', period_month:'2026-01-01', weight_kg:125 },
    { module:'recycle', period_month:'2026-06-01', weight_kg:0, amount:0 },
    { module:'rdf', period_month:'2026-07-01', weight_kg:40, deleted_at:'2026-07-20T00:00:00Z' },
    { module:'recycle', period_month:'2026-07-01', amount:500, metadata:{ is_deleted:true } }
  ]
  assert.equal(isActivePositiveEntry(entries[0]), false)
  assert.equal(isActivePositiveEntry(entries[1]), true)
  assert.deepEqual(getReportableMonths(entries, requested), ['2026-01'])
})

test('Recycle monthly report groups by Master Data code and never creates phantom zero rows', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  assert.equal(ledger.includes("const key = categoryCode || `legacy:${legacyName}`"), true)
  assert.equal(ledger.includes('recycleCategories.get(categoryCode)'), true)
  assert.equal(ledger.includes("{ name: 'อลู-โค้ก'"), false)
  assert.equal(ledger.includes('standardMaterials'), false)
})

test('Custom Chart Builder is isolated, configurable, and never invents a winner for zero data', () => {
  const source=fs.readFileSync(new URL('../src/components/ChartBuilder.jsx',import.meta.url),'utf8')
  const backend=fs.readFileSync(new URL('../../backend/server.js',import.meta.url),'utf8')
  assert.equal(source.includes('เลือกทั้งหมด'),true)
  assert.equal(source.includes('เคลียร์ทั้งหมด'),true)
  assert.equal(source.includes('type="color"'),true)
  assert.equal(source.includes('เดือนเริ่มต้น'),true)
  assert.equal(source.includes('เดือนสิ้นสุด'),true)
  assert.equal(source.includes('ตารางตรวจสอบข้อมูลกราฟ'),true)
  assert.equal(source.includes('ไม่พบข้อมูลสำหรับเงื่อนไขที่เลือก'),true)
  assert.equal(source.includes('/api/chart-builder/data'),true)
  assert.equal(source.includes("const [groupBy, setGroupBy] = useState('monthly')"),true)
  assert.equal(source.includes("const QUANTITY_MODULES = new Set(['tissue','black_bag','consumable'])"),true)
  assert.equal(source.includes("selectedModules.every(module => QUANTITY_MODULES.has(module))"),true)
  assert.equal(source.includes("['count','จำนวนรายการ','รายการ']"),false)
  assert.equal(source.includes("downloadChartPng"),true)
  assert.equal(source.includes("downloadChartSvg"),true)
  assert.equal(source.includes("ส่งออก PowerPoint คมชัด"),true)
  assert.equal(backend.includes("app.get('/api/chart-builder/data'"),true)
  assert.equal(backend.includes(".gte('period_month', `${startMonth}-01`)"),true)
  assert.equal(backend.includes(".lte('period_month', `${endMonth}-01`)"),true)
  assert.equal(backend.includes('fetchAllPages(buildQuery)'),true)
})

test('Special Tools exposes only monthly image import, charts, and PowerPoint', () => {
  const tools=fs.readFileSync(new URL('../src/components/SpecialTools.jsx',import.meta.url),'utf8')
  const importer=fs.readFileSync(new URL('../src/components/MonthlyImageImport.jsx',import.meta.url),'utf8')
  assert.match(tools,/id:'monthly-image'/); assert.match(tools,/id:'charts'/); assert.match(tools,/id:'powerpoint'/)
  assert.doesNotMatch(tools,/id:'multi-sheet'|id:'fmhy'|id:'hygiene'|id:'tissue'/)
  assert.match(importer,/\/api\/imports\/monthly-image\/preview/)
  assert.match(importer,/จับคู่ Master Data/)
  assert.match(importer,/status==='ready'/)
})

test('Entry screens and every importer refresh dashboard and station summaries', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  assert.equal(ledger.includes("queryKey: ['entries', 'summary-ledger', startDate, endDate]"), true)
  assert.equal(ledger.includes("refetchOnMount: 'always'"), true)
  for (const file of ['DataEntry.jsx', 'DynamicModuleEntry.jsx', 'TissueImport.jsx', 'HygieneImport.jsx', 'MultiSheetImport.jsx', 'FMHYImport.jsx']) {
    const source = fs.readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
    assert.equal(source.includes("queryKey: ['entries']") || source.includes("queryKey:['entries']"), true, `${file} must invalidate the shared entries cache`)
  }
})

test('Master Data unit suggestions follow module and keywords', () => {
  assert.equal(suggestUnit('rdf','RDF').unit,'kg')
  assert.equal(suggestUnit('black_bag','ถุงดำใหญ่').unit,'kg')
  assert.equal(suggestUnit('tissue','ทิชชู่ม้วนใหญ่').unit,'ม้วน')
  assert.equal(suggestUnit('consumable','น้ำยาเช็ดพื้น').unit,'แกลลอน')
  assert.equal(suggestUnit('consumable','อุปกรณ์ไม่ระบุ').unit,'แกลลอน')
})

test('น้ำยาต่างๆ uses consumable as the canonical module and still reads legacy cleaning_liquid rows', () => {
  const entry = fs.readFileSync(new URL('../src/components/DataEntry.jsx', import.meta.url), 'utf8')
  const settings = fs.readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8')
  const ledgerConfig = fs.readFileSync(new URL('../src/lib/ledger-config.js', import.meta.url), 'utf8')
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  assert.equal(entry.includes("consumable: 'consumable'"), true)
  assert.equal(settings.includes("consumable: 'consumable'"), true)
  assert.equal(settings.includes("{ value: 'consumable', label: 'น้ำยาต่างๆ' }"), true)
  assert.equal(ledgerConfig.includes("consumable:'consumable'"), true)
  assert.equal(entry.includes("['consumable', 'cleaning_liquid'].includes(c.module)"), true)
  assert.equal(ledger.includes("['consumable', 'cleaning_liquid'].includes(e.module)"), true)
})

test('Dynamic module CSV round-trip follows metadata fields', () => {
  const definition={code:'water',fields:[{field_key:'quantity',label_th:'ปริมาณน้ำ',data_type:'decimal',required:true,validation:{min:0}}]}
  const rows=[{id:'w1',entry_date:'2026-07-01',quantity:125.5,metadata:{dynamic_fields:{}}}]
  const parsed=parseDynamicCsv(exportDynamicCsv(rows,definition,'2026-07'),definition,'2026-07')
  assert.equal(parsed[0].errors.length,0);assert.equal(parsed[0].values.quantity,125.5);assert.equal(parsed[0].id,'w1')
})

test('Batch requests use the canonical entries envelope', () => {
  for (const file of ['DataEntry.jsx','DynamicModuleEntry.jsx']) {
    const source=fs.readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8')
    assert.equal(source.includes('JSON.stringify({ entries: payloads })') || source.includes('JSON.stringify({entries:payload})'),true)
  }
})

test('M4 metadata analytics supports dynamic fields and aggregations', () => {
  const definition={code:'water',primary_metric:'litres',default_unit:'ลิตร',aggregation:'average',fields:[{field_key:'litres',label_th:'ปริมาณน้ำ',data_type:'decimal',active:true}]}
  const rows=[
    {period_month:'2026-06-01',metadata:{dynamic_fields:{litres:100}}},
    {period_month:'2026-07-01',metadata:{dynamic_fields:{litres:120}}},
    {period_month:'2026-07-01',metadata:{dynamic_fields:{litres:180}}}
  ]
  assert.deepEqual(aggregateModuleRows(rows.slice(1),definition),{value:150,count:2,metric:'litres',unit:'ลิตร'})
  assert.deepEqual(buildModuleMonthlySeries(rows,definition,['2026-06','2026-07']).map(item=>item.value),[100,150])
  assert.deepEqual(moduleTableFields(definition),[{key:'litres',label:'ปริมาณน้ำ',unit:''}])
  assert.equal(percentChange(150,100),50)
})

test('M4 backend applies module permissions and returns metadata summaries', () => {
  const source=fs.readFileSync(new URL('../../backend/server.js',import.meta.url),'utf8')
  assert.equal(source.includes('function requireModuleAccess'),true)
  assert.equal(source.includes('dynamic_modules: dynamicModules'),true)
  assert.equal(source.includes("req.query.forExport === 'true' ? 'export' : 'read'"),true)
})

test('M5-M6 wires AI settings, monthly image permission and safe Render roots', () => {
  const settings=fs.readFileSync(new URL('../src/components/AISettings.jsx',import.meta.url),'utf8')
  const workspace=fs.readFileSync(new URL('../src/components/Workspace.jsx',import.meta.url),'utf8')
  const specialTools=fs.readFileSync(new URL('../src/components/SpecialTools.jsx',import.meta.url),'utf8')
  const render=fs.readFileSync(new URL('../../render.yaml',import.meta.url),'utf8')
  const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
  const gitignore=fs.readFileSync(new URL('../../.gitignore',import.meta.url),'utf8')
  assert.equal(settings.includes('/api/module-ai-settings'),true)
  assert.equal(workspace.includes("id: 'special-tools'"),true)
  assert.equal(specialTools.includes("permission:'entries.import'"),true)
  assert.equal(render.includes('rootDir: backend')&&render.includes('startCommand: npm start'),true)
  assert.equal(render.includes('npm --prefix backend start'),false)
  assert.equal(css.includes('@media (max-width:'),true)
  assert.equal(gitignore.includes('backend/.env')&&gitignore.includes('frontend/.env')&&gitignore.includes('*.zip'),true)
})

test('Personal Finance style login uses backend HttpOnly cookie flow', () => {
  const login=fs.readFileSync(new URL('../src/components/Login.jsx',import.meta.url),'utf8')
  const api=fs.readFileSync(new URL('../src/api.js',import.meta.url),'utf8')
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  assert.equal(login.includes("apiFetch('/api/auth/login'"),true)
  assert.equal(api.includes("credentials: 'include'"),true)
  assert.equal(api.includes("localStorage.getItem('ckap_token')"),false)
  assert.equal(app.includes("localStorage.setItem('ckap_token'"),false)
})

test('password recovery restores session and allows both password fields to be revealed', () => {
  const source=fs.readFileSync(new URL('../src/components/SetPassword.jsx',import.meta.url),'utf8')
  assert.match(source,/exchangeCodeForSession/)
  assert.match(source,/auth\.setSession/)
  assert.match(source,/showPassword/)
  assert.match(source,/showConfirm/)
  assert.match(source,/ลิงก์ตั้งรหัสผ่านหมดอายุ/)
})

test('PowerPoint export enforces export permission and records history', () => {
  const source=fs.readFileSync(new URL('../src/components/PPTBuilder.jsx',import.meta.url),'utf8')
  assert.equal(source.includes("permissions.includes('reports.export')"),true)
  assert.equal(source.includes('/api/reports/client-export'),true)
  assert.equal(source.includes('forExport=true'),true)
})

test('production package includes per-service lockfiles', () => {
  assert.equal(fs.existsSync(new URL('../../backend/package-lock.json',import.meta.url)),true)
  assert.equal(fs.existsSync(new URL('../package-lock.json',import.meta.url)),true)
})

test('Render Node 20 WebSocket dependency and legacy Hygiene importer stay packaged', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const backendPackage = JSON.parse(read('../../backend/package.json'))
  const backendLock = JSON.parse(read('../../backend/package-lock.json'))
  const server = read('../../backend/server.js')
  const workspace = read('../src/components/Workspace.jsx')
  const specialTools = read('../src/components/SpecialTools.jsx')
  const importer = read('../src/components/HygieneImport.jsx')
  assert.ok(backendPackage.dependencies.ws)
  assert.ok(backendPackage.dependencies['read-excel-file'])
  assert.ok(backendLock.packages['node_modules/ws'])
  assert.ok(backendLock.packages['node_modules/read-excel-file'])
  assert.match(server, /realtime:\s*\{\s*transport:\s*WebSocket\s*\}/)
  assert.match(workspace, /SpecialTools/)
  assert.doesNotMatch(specialTools, /HygieneImport/)
  assert.match(importer, /\/api\/imports\/hygiene\/preview/)
  assert.match(importer, /\/rollback/)
})

test('auth profile migration never trusts user-controlled role metadata', () => {
  const sql=fs.readFileSync(new URL('../../database/AUTH_PROFILE_SYNC_MIGRATION_v3.0.9.sql',import.meta.url),'utf8')
  assert.equal(sql.includes("raw_user_meta_data->>'role'"),false)
  assert.equal(sql.includes("'viewer',true"),true)
})

test('legacy Tissue importer stays packaged while owner-only visual theme cards remain wired', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const workspace = read('../src/components/Workspace.jsx')
  const specialTools = read('../src/components/SpecialTools.jsx')
  const importer = read('../src/components/TissueImport.jsx')
  const migration = read('../../database/P2_TISSUE_EXCEL_IMPORT.sql')
  assert.match(workspace, /SpecialTools/)
  assert.doesNotMatch(specialTools, /TissueImport/)
  assert.match(workspace, /me\?\.role === 'owner'/)
  assert.match(workspace, /theme-swatches/)
  assert.match(importer, /รายวัน\/แถว/)
  assert.match(importer, /รายสัปดาห์/)
  assert.match(importer, /ทั้งเดือน/)
  assert.match(importer, /\/api\/imports\/tissue\/preview/)
  assert.match(migration, /tissue_excel/)
})

test('Data Entry provides calendar, table, summary and audited corrections', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const dataEntry = read('../src/components/DataEntry.jsx')
  const server = read('../../backend/server.js')
  assert.match(dataEntry, /ปฏิทิน \/ บันทึกข้อมูล/)
  assert.match(dataEntry, /ตารางข้อมูล/)
  assert.match(dataEntry, /สรุปรายเดือน/)
  assert.match(dataEntry, /เหตุผลการแก้ไข/)
  assert.match(server, /\/api\/entries\/calendar/)
  assert.match(server, /\/api\/entries\/month-summary/)
  assert.match(server, /\/api\/entries\/:id\/history/)
  assert.match(server, /กรุณาระบุเหตุผลการลบ/)
})

test('legacy multi-sheet importer stays packaged with canonical dog-food code', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const tools = read('../src/components/SpecialTools.jsx')
  const importer = read('../src/components/MultiSheetImport.jsx')
  const dataEntry = read('../src/components/DataEntry.jsx')
  const server = read('../../backend/server.js')
  assert.doesNotMatch(tools, /MultiSheetImport/)
  assert.match(importer, /\/api\/imports\/multi-sheet\/preview/)
  assert.match(importer, /นำเข้าครั้งเดียว/)
  assert.match(dataEntry, /DOG_FOOD/)
  assert.doesNotMatch(dataEntry, /DOG_FEED/)
  assert.match(server, /parseMultiSheetWorkbook/)
})

test('Report cards use stable preset layouts while tables retain a sticky first column', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(ledger, /startSectionResize|ckap-ledger-section-widths|role="separator"/)
  assert.doesNotMatch(styles, /\.ledger-resize-handle/)
  assert.match(ledger, /third: 2, half: 3, full: 6/)
  assert.match(styles, /position:sticky/)
  assert.match(styles, /overflow-x:auto/)
})

test('Station Summary report studio exports isolated PowerPoint-ready previews', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(ledger, /function ReportStudio/)
  assert.match(ledger, /PowerPoint 16:9/)
  assert.match(ledger, /PowerPoint 4:3/)
  assert.match(ledger, /A4 แนวนอน/)
  assert.match(ledger, /PNG 3x/)
  assert.match(ledger, /pptxgenjs/)
  assert.match(ledger, /html-to-image/)
  assert.match(ledger, /ส่งออกไม่สำเร็จ/)
  assert.match(ledger, /pixelRatio:3/)
  assert.match(ledger, /ดาวน์โหลดไฟล์ที่สร้างแล้ว/)
  assert.match(ledger, /outputType:'blob'/)
  assert.match(ledger, /data-report-section="tissue"/)
  assert.match(ledger, /data-report-section="recycle-monthly"/)
  assert.match(styles, /\.report-studio-modal/)
  assert.match(styles, /--studio-title-size/)
})

test('monthly Station Summary keeps sections 5-6 on one selected month and places the recycle chart above its table', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  assert.match(ledger, /viewMode === 'monthly'[\s\S]*?selectedMonth \? \[`\$\{selectedCE\}-\$\{selectedMonth\}`\] : \[\][\s\S]*?: summaryMonths/)
  assert.match(ledger, /monthly-recycle-report-layout[\s\S]*?monthly-recycle-table[^>]*style=\{\{ order: 2 \}\}[\s\S]*?monthly-recycle-chart[^>]*order: 1/)
  assert.match(ledger, /SECTION 8:[\s\S]*?\{viewMode === 'yearly' && \(/)
  assert.match(ledger, /String\(e\.period_month \|\| ''\)\.slice\(0, 7\) === targetMonthStr/)
  assert.match(ledger, /monthsCount=\{feedReportMonths\.length\}/)
})

test('Station Summary and report exports use the approved operational units', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  const ppt = fs.readFileSync(new URL('../src/components/PPTBuilder.jsx', import.meta.url), 'utf8')
  assert.match(ledger, /black_bag_large[^\n]*unit: 'kg'/)
  assert.match(ledger, /tissue_hand', label: 'มือ', unit: 'แพ็ค'/)
  assert.match(ledger, /unit: 'แกลลอน'/)
  assert.doesNotMatch(ppt, /มือ \(แผ่น\)/)
  assert.match(ppt, /มือ \(แพ็ค\)/)
})

test('annual line charts render Line elements directly without Fragment wrappers', () => {
  const ledger = fs.readFileSync(new URL('../src/components/AnnualLedger.jsx', import.meta.url), 'utf8')
  const adaptiveChart = ledger.slice(ledger.indexOf('function AdaptiveAccumulatedChart'), ledger.indexOf('export default function AnnualLedger'))
  assert.doesNotMatch(adaptiveChart, /React\.Fragment|<Fragment/)
  assert.match(adaptiveChart, /<Line[\s\S]*dataKey=\{item\.dataKey\}[\s\S]*stroke=\{item\.color\}/)
  assert.match(adaptiveChart, /MONTH_POINT_COLORS\[index % MONTH_POINT_COLORS\.length\]/)
})

test('mobile workspace uses isolated bottom navigation without changing desktop sidebar', () => {
  const workspace = fs.readFileSync(new URL('../src/components/Workspace.jsx', import.meta.url), 'utf8')
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(workspace, /mobile-bottom-nav/)
  assert.match(workspace, /mobile-more-sheet/)
  assert.match(styles, /@media \(max-width: 768px\)/)
  assert.match(styles, /\.sidebar \{ display: none; \}/)
  assert.match(styles, /\.mobile-bottom-nav \{ position: fixed;/)
  assert.doesNotMatch(styles, /\.ledger-resize-handle/)
  assert.match(styles, /overflow-x: auto !important;/)
  assert.match(styles, /\.sidebar \{ width: 280px;/)
})
