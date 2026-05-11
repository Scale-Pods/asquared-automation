const url = "https://qgxgtavkovqklijfpnfl.supabase.co/rest/v1/vapi_call_logs?select=*&limit=1";
const headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneGd0YXZrb3Zxa2xpamZwbmZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2MDUzOSwiZXhwIjoyMDkzNjM2NTM5fQ.X8Lpgzpm1Xgb0v9qML9W6Xm3hDKCwFVeniJs39F5z54",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneGd0YXZrb3Zxa2xpamZwbmZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2MDUzOSwiZXhwIjoyMDkzNjM2NTM5fQ.X8Lpgzpm1Xgb0v9qML9W6Xm3hDKCwFVeniJs39F5z54"
};

fetch(url, { headers })
    .then(r => r.json())
    .then(d => {
        console.log("vapi_call_logs Columns:", Object.keys(d[0] || {}));
    })
    .catch(e => console.error(e));
