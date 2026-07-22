const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('master_categories').select('*');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Categories in DB:', data.map(c => ({ module: c.module, code: c.code, name_th: c.name_th })));
  }
}

run();
