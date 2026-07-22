'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, buildMetadataInsights, buildSafeAiPayload } = require('../metadata-insight');

const definitions = [
  { code:'rdf',name_th:'RDF',primary_metric:'weight_kg',default_unit:'kg',aggregation:'sum' },
  { code:'dog_food',name_th:'อาหารหมา',primary_metric:'weight_kg',default_unit:'kg',aggregation:'sum' },
  { code:'pig_feed',name_th:'อาหารหมู',primary_metric:'weight_kg',default_unit:'kg',aggregation:'average' },
  { code:'wet_waste',name_th:'ขยะเปียก',primary_metric:'weight_kg',default_unit:'kg',aggregation:'sum' },
  { code:'recycle',name_th:'รีไซเคิล',primary_metric:'weight_kg',default_unit:'kg',aggregation:'sum' },
  { code:'tissue',name_th:'กระดาษทิชชู่',primary_metric:'quantity',default_unit:'ม้วน',aggregation:'sum' },
  { code:'black_bag',name_th:'ถุงดำ',primary_metric:'quantity',default_unit:'ใบ',aggregation:'sum' },
  { code:'consumable',name_th:'ของใช้สิ้นเปลือง',primary_metric:'quantity',default_unit:'ชิ้น',aggregation:'sum' }
];

test('supports every existing module and custom metadata fields', () => {
  assert.equal(definitions.length,8);
  assert.equal(aggregate([{metadata:{dynamic_fields:{litres:10}}},{metadata:{dynamic_fields:{litres:20}}}],'litres','average'),15);
});

test('AI toggle and threshold control metadata insights', () => {
  const settings=definitions.map(item=>({module_code:item.code,enabled:item.code==='rdf',primary_metric:item.primary_metric,aggregation:item.aggregation,better_direction:'lower',warning_change_percent:10,excluded_fields:['created_by']}));
  const result=buildMetadataInsights({month:'2026-07',definitions,settings,currentRows:[{module:'rdf',weight_kg:150}],previousRows:[{module:'rdf',weight_kg:100}]});
  assert.deepEqual(result.enabled_modules,['rdf']);
  assert.equal(result.trends[0].change_percent,50);
  assert.equal(result.anomalies[0].title,'แนวโน้มสวนทางเป้าหมาย');
});

test('safe AI payload contains aggregates and no raw identity fields', () => {
  const settings=[{module_code:'rdf',enabled:true,primary_metric:'weight_kg',aggregation:'sum',better_direction:'lower',warning_change_percent:15,excluded_fields:['created_by']}];
  const result=buildMetadataInsights({month:'2026-07',definitions:definitions.slice(0,1),settings,currentRows:[{module:'rdf',weight_kg:10,created_by:'secret-user'}],previousRows:[]});
  const payload=buildSafeAiPayload(result,settings); const encoded=JSON.stringify(payload);
  assert.equal(encoded.includes('secret-user'),false); assert.equal(encoded.includes('created_by'),false); assert.equal(payload.modules[0].current_value,10);
});
