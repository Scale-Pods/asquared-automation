import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchTable(baseUrl: string, headers: Record<string, string>, table: string, columns: string, filter: string, BATCH_SIZE = 2000) {
    try {
        const url = `${baseUrl}/${table}?select=${columns}&${filter}&limit=0`;
        const res = await fetch(url, { headers: { ...headers, "Prefer": "count=exact" }, cache: 'no-store' });
        let totalCalls = 0;
        if (res.ok) {
            const cr = res.headers.get("content-range");
            if (cr) { const m = cr.match(/\/(\d+)$/); if (m) totalCalls = parseInt(m[1], 10); }
        }

        let allRows: any[] = [];
        let offset = 0;
        while (offset < totalCalls) {
            const batchUrl = `${baseUrl}/${table}?select=${columns}&${filter}&limit=${BATCH_SIZE}&offset=${offset}`;
            const batchRes = await fetch(batchUrl, { headers, cache: 'no-store' });
            if (!batchRes.ok) break;
            const batch: any[] = await batchRes.json();
            if (!Array.isArray(batch) || batch.length === 0) break;
            allRows = [...allRows, ...batch];
            offset += BATCH_SIZE;
            if (batch.length < BATCH_SIZE) break;
        }
        return allRows;
    } catch { return []; }
}

export async function GET() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers: Record<string, string> = {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };

    try {
        const [ownerRows, nfRows] = await Promise.all([
            fetchTable(baseUrl, headers, 'vapi_call_logs', 'cost_usd,vapi_account', 'cost_usd=not.is.null'),
            fetchTable(baseUrl, headers, 'vapi_call_logs_nf', 'cost_usd,vapi_account', 'cost_usd=not.is.null')
        ]);

        const allRows = [...ownerRows, ...nfRows];
        let totalAgentCost = 0;
        let secondaryAgentCost = 0;
        let unknownAgentCost = 0;
        let ownerAgentCost = 0;

        allRows.forEach((row: any) => {
            const cost = parseFloat(row.cost_usd) || 0;
            const acct = String(row.vapi_account || '').toLowerCase();
            totalAgentCost += cost;
            if (acct === 'secondary') secondaryAgentCost += cost;
            else if (acct === 'unknown') unknownAgentCost += cost;
            else if (acct === 'owner' || acct === 'owners') ownerAgentCost += cost;
        });

        return NextResponse.json({ totalAgentCost, secondaryAgentCost, unknownAgentCost, ownerAgentCost });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
