import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase config");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data: leads, error: leadsError } = await supabase.from('master_leads').select('*').limit(1);
    if (leadsError) console.error("Leads Error:", leadsError);
    else console.log("Master Leads Columns:", Object.keys(leads[0] || {}));

    const { data: calls, error: callsError } = await supabase.from('vapi_call_logs').select('*').limit(1);
    if (callsError) console.error("Calls Error:", callsError);
    else console.log("Vapi Call Logs Columns:", Object.keys(calls[0] || {}));
}

checkColumns();
