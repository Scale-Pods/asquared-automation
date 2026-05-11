const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`
};

async function checkColumns() {
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/nr_wf?select=*&limit=1`, { headers });
        const data = await res.json();
        console.log("nr_wf Columns:", Object.keys(data[0] || {}));

        const res2 = await fetch(`${supabaseUrl}/rest/v1/followup?select=*&limit=1`, { headers });
        const data2 = await res2.json();
        console.log("followup Columns:", Object.keys(data2[0] || {}));
    } catch (e) {
        console.error("Error:", e);
    }
}

checkColumns();
