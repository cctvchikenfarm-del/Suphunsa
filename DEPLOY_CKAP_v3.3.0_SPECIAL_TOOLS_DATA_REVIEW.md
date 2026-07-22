# CKAP v3.3.0 — Special Tools & Data Review

## สิ่งที่เปลี่ยน

- รวม FM-HY, Hygiene Excel, Tissue Excel, Chart Builder และ PowerPoint ไว้ในหน้า “เครื่องมือพิเศษ”
- การ์ดเครื่องมืออยู่แถวเดียว เปิดเนื้อหาในหน้าเดิม จำเครื่องมือล่าสุด และตรวจสิทธิ์ก่อนแสดง
- หน้าบันทึกข้อมูลมีมุมมอง ปฏิทิน/บันทึกข้อมูล, ตารางข้อมูล และสรุปรายเดือน
- เปิดดูข้อมูลเดิม แก้ไข ลบ และอ่านประวัติย้อนหลังได้ โดยการแก้ไข/ลบต้องระบุเหตุผล
- ใช้ชื่อ “ขยะ RDF” และ “น้ำยาต่างๆ”; ซ่อนขยะทั่วไปเฉพาะการ์ดบันทึก แต่ไม่ลบข้อมูลเดิม
- การ์ดหมวดข้อมูลอยู่แถวเดียวและเลื่อนแนวนอนบนจอเล็ก

## Deploy

1. Backend บน Render: Root Directory `backend`, Build `npm ci`, Start `npm start`
2. Frontend บน Render: Root Directory `frontend`, Build `npm ci && npm run build`, Publish `dist`
3. ใช้ Environment Variables เดิมของ v3.2.5 โดยเฉพาะ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `FRONTEND_URL`
4. ไม่ต้องเพิ่มตารางใหม่ เหตุผลการแก้ไขถูกเก็บใน `audit_logs` ที่มีอยู่แล้ว

## ตรวจสอบก่อนใช้งาน

- `GET /api/health` ต้องแสดง release `CKAP_v3.3.0_SPECIAL_TOOLS_DATA_REVIEW`
- Backend tests: 19 ผ่าน
- Frontend tests: 19 ผ่าน
- Frontend production build: ผ่าน
