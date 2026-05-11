const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase config");
    process.exit(1);
}

const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`
};

async function checkColumns() {
    try {
        const leadsRes = await fetch(`${supabaseUrl}/rest/v1/master_leads?select=*&limit=1`, { headers });
        const leads = await leadsRes.json();
        console.log("Master Leads Columns:", Object.keys(leads[0] || {}));

        const callsRes = await fetch(`${supabaseUrl}/rest/v1/vapi_call_logs?select=*&limit=1`, { headers });
        const calls = await callsRes.json();
        console.log("Vapi Call Logs Columns:", Object.keys(calls[0] || {}));
    } catch (e) {
        console.error("Error:", e);
    }
}

checkColumns();
