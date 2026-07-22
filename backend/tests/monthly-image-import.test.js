'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {buildMonthlyImagePreview,matchCategory}=require('../monthly-image-import');

const categories=[
  {module:'tissue',code:'tissue_roll',name_th:'ม้วน',unit:'ม้วน'},{module:'tissue',code:'tissue_hand',name_th:'มือ',unit:'แพ็ค'},{module:'tissue',code:'tissue_popup',name_th:'ป๊อปอัพ',unit:'แพ็ค'},
  {module:'recycle',code:'brown',name_th:'กระดาษน้ำตาล',unit:'kg'},{module:'recycle',code:'pet',name_th:'PET',unit:'kg'}
];
const fileHash='a'.repeat(64);

test('vertical image columns are matched by headers and never by position',()=>{
  const extraction={document_type:'daily_vertical_sheet',confidence:.95,columns:[{key:'popup',label:'pop-up'},{key:'roll',label:'ม้วน'},{key:'hand',label:'มือ'}],rows:[{day:1,values:{popup:2,roll:52,hand:2},confidence:.96}]};
  const result=buildMonthlyImagePreview({extraction,categories,month:'2026-06',fileHash,fileName:'sheet.jpg'});
  assert.deepEqual(result.rows.map(row=>[row.entry.category_code,row.entry.quantity]),[['tissue_popup',2],['tissue_roll',52],['tissue_hand',2]]);
  assert.equal(result.summary.ready,3);
});

test('new vertical columns stop for review instead of shifting neighboring values',()=>{
  const extraction={document_type:'daily_vertical_sheet',confidence:.95,columns:[{key:'roll',label:'ม้วน'},{key:'new',label:'คอลัมน์ใหม่'},{key:'popup',label:'ป๊อปอัพ'}],rows:[{day:2,values:{roll:51,new:9,popup:2}}]};
  const result=buildMonthlyImagePreview({extraction,categories,month:'2026-06',fileHash,fileName:'sheet.jpg'});
  assert.equal(result.rows.find(row=>row.raw_label==='คอลัมน์ใหม่').status,'review');
  assert.equal(result.rows.find(row=>row.raw_label==='ป๊อปอัพ').entry.quantity,2);
});

test('recycle voucher stores line items and uses net total only for validation',()=>{
  const extraction={document_type:'recycle_voucher',confidence:.98,net_total:4542,rows:[{material_name:'PET',weight_kg:162,unit_price:6,amount:972},{material_name:'กระดาษน้ำตาล',weight_kg:1190,unit_price:3,amount:3570}]};
  const result=buildMonthlyImagePreview({extraction,categories,month:'2026-06',fileHash,fileName:'voucher.jpg'});
  assert.equal(result.rows.length,2); assert.equal(result.calculated_total,4542); assert.equal(result.document_issues.length,0);
  assert.equal(result.rows.some(row=>row.entry.amount===4542),false);
  assert.equal(matchCategory('ขวด PET',categories).code,'pet');
});
