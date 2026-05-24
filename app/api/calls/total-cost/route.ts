import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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
        const url = `${baseUrl}/vapi_call_logs?select=cost_usd,vapi_account&cost_usd=not.is.null&limit=0`;
        const res = await fetch(url, { headers: { ...headers, "Prefer": "count=exact" }, cache: 'no-store' });

        let totalCalls = 0;
        if (res.ok) {
            const cr = res.headers.get("content-range");
            if (cr) { const m = cr.match(/\/(\d+)$/); if (m) totalCalls = parseInt(m[1], 10); }
        }

        const BATCH_SIZE = 2000;
        let totalAgentCost = 0;
        let ownerAgentCost = 0;
        let offset = 0;

        while (offset < totalCalls) {
            const batchUrl = `${baseUrl}/vapi_call_logs?select=cost_usd,vapi_account&cost_usd=not.is.null&limit=${BATCH_SIZE}&offset=${offset}`;
            const batchRes = await fetch(batchUrl, { headers, cache: 'no-store' });
            if (!batchRes.ok) break;
            const batch: any[] = await batchRes.json();
            if (!Array.isArray(batch) || batch.length === 0) break;

            batch.forEach((row: any) => {
                const cost = parseFloat(row.cost_usd) || 0;
                totalAgentCost += cost;
                if (row.vapi_account === 'owners') ownerAgentCost += cost;
            });

            offset += BATCH_SIZE;
            if (batch.length < BATCH_SIZE) break;
        }

        return NextResponse.json({ totalAgentCost, ownerAgentCost });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
