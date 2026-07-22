const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../../Desktop/LAst cKap/backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('data_entries')
    .select('category_code, material_name, module')
    .eq('module', 'recycle');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const unique = {};
  data.forEach(d => {
    const key = `${d.category_code} | ${d.material_name}`;
    unique[key] = (unique[key] || 0) + 1;
  });
  
  console.log('Unique recycle entries in database:', unique);
}

check();
