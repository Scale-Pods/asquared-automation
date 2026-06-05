const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvVar = (name) => {
    const regex = new RegExp(`^${name}\\s*=\\s*(.*)$`, 'm');
    const match = envContent.match(regex);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const secretKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

console.log('URL:', supabaseUrl);
console.log('Has key:', !!secretKey);

async function checkTable(tableName) {
    const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${tableName}`;
    const headers = {
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
    };

    try {
        const response = await fetch(`${baseUrl}?select=*&limit=1`, { headers });
        const data = await response.json();
        const contentRange = response.headers.get('content-range');
        const count = contentRange ? contentRange.split('/')[1] : 'unknown';
        console.log(`\nTable: ${tableName}`);
        console.log(`Total Count: ${count}`);
        if (data && data.length > 0) {
            console.log('Sample Row keys:', Object.keys(data[0]));
            console.log('Sample Row data:', JSON.stringify(data[0], null, 2));
        } else {
            console.log('No rows found.');
        }
    } catch (err) {
        console.error(`Error checking ${tableName}:`, err);
    }
}

async function run() {
    await checkTable('nurture_leads');
    await checkTable('nurture_leads_uk');
}

run();
