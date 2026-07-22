const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateChartRows } = require('../chart-builder');

const labels = { rdf:'ขยะ RDF',dog_food:'อาหารหมา',pig_feed:'อาหารหมู',wet_waste:'ขยะเปียก',consumable:'น้ำยาต่างๆ' };

test('custom chart builder compares monthly weights and calculates wet waste', () => {
  const rows = [
    { module:'rdf',entry_date:'2026-01-01',weight_kg:10,unit:'kg' },
    { module:'dog_food',entry_date:'2026-01-02',weight_kg:4,unit:'kg' },
    { module:'pig_feed',entry_date:'2026-01-03',weight_kg:6,unit:'kg' },
    { module:'rdf',entry_date:'2026-02-01',weight_kg:15,unit:'kg' }
  ];
  const result=aggregateChartRows({rows,requestedSeries:['rdf','wet_waste'],metric:'weight_kg',groupBy:'monthly',moduleLabels:labels});
  assert.equal(result.compatible_units,true);
  assert.deepEqual(result.points.map(point=>point.label),['2026-01','2026-02']);
  assert.equal(result.points[0].values.rdf,10);
  assert.equal(result.points[0].values.wet_waste,10);
  assert.equal(result.series.find(item=>item.key==='rdf').total,25);
});

test('custom chart builder supports subcategories and legacy cleaning_liquid data', () => {
  const rows = [
    { module:'cleaning_liquid',category_code:'soap',material_name:'สบู่โฟม',entry_date:'2026-07-01',quantity:2,unit:'แกลลอน' },
    { module:'consumable',category_code:'soap',material_name:'สบู่โฟม',entry_date:'2026-07-02',quantity:3,unit:'แกลลอน' }
  ];
  const result=aggregateChartRows({rows,requestedSeries:['consumable~soap'],metric:'quantity',groupBy:'daily',moduleLabels:labels});
  assert.equal(result.series[0].total,5);
  assert.equal(result.series[0].label,'สบู่โฟม');
  assert.equal(result.series[0].unit,'แกลลอน');
});

test('custom chart builder applies canonical report units to legacy quantity rows', () => {
  const rows = [
    { module:'consumable',entry_date:'2026-07-01',quantity:2,unit:'ขวด' },
    { module:'consumable',entry_date:'2026-07-02',quantity:3,unit:'แกลลอน' }
  ];
  const result=aggregateChartRows({rows,requestedSeries:['consumable'],metric:'quantity',groupBy:'daily',moduleLabels:labels});
  assert.equal(result.compatible_units,true);
  assert.equal(result.series[0].mixed_units,false);
  assert.equal(result.series[0].unit,'แกลลอน');
});

test('canonical report units cover black bags and every tissue type', () => {
  const rows = [
    { module:'black_bag',category_code:'black_bag_large',entry_date:'2026-07-01',quantity:4,unit:'ใบ' },
    { module:'tissue',category_code:'tissue_roll',entry_date:'2026-07-01',quantity:2,unit:'ม้วน' },
    { module:'tissue',category_code:'tissue_hand',entry_date:'2026-07-01',quantity:3,unit:'แผ่น' },
    { module:'tissue',category_code:'tissue_popup',entry_date:'2026-07-01',quantity:5,unit:'แพ็ค' }
  ];
  const result=aggregateChartRows({rows,requestedSeries:['black_bag~black_bag_large','tissue~tissue_roll','tissue~tissue_hand','tissue~tissue_popup'],metric:'quantity',groupBy:'monthly',moduleLabels:labels});
  assert.deepEqual(result.series.map(item=>item.unit),['kg','ม้วน','แพ็ค','แพ็ค']);
});

test('daily average is expanded only in monthly chart results', () => {
  const rows=[{ module:'rdf',entry_date:'2026-07-01',period_month:'2026-07-01',weight_kg:10,unit:'kg',metadata:{entry_mode:'daily_average',value_type:'daily_average',days_in_month:31} }];
  const monthly=aggregateChartRows({rows,requestedSeries:['rdf'],metric:'weight_kg',groupBy:'monthly',moduleLabels:labels});
  const daily=aggregateChartRows({rows,requestedSeries:['rdf'],metric:'weight_kg',groupBy:'daily',moduleLabels:labels});
  assert.equal(monthly.series[0].total,310);
  assert.equal(daily.series[0].total,10);
});

test('pig feed distinguishes monthly totals, daily averages, and actual daily rows', () => {
  const rows = [
    { module:'pig_feed',entry_date:'2026-06-01',period_month:'2026-06-01',weight_kg:1200,unit:'kg',metadata:{value_type:'monthly_total'} },
    { module:'dog_food',entry_date:'2026-02-01',period_month:'2026-02-01',weight_kg:10,unit:'kg',metadata:{input_mode:'daily_average'} },
    { module:'pig_feed',entry_date:'2026-07-03',period_month:'2026-07-01',weight_kg:10,unit:'kg',metadata:{value_type:'actual_daily'} }
  ];
  const result=aggregateChartRows({rows,requestedSeries:['pig_feed','dog_food'],metric:'weight_kg',groupBy:'monthly',moduleLabels:labels});
  assert.equal(result.series.find(item=>item.key==='pig_feed').total,1210);
  assert.equal(result.series.find(item=>item.key==='dog_food').total,280);
});
