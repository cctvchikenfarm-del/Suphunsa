const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('profiles').select('email, role');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Profiles in DB:', data);
  }
}

run();
