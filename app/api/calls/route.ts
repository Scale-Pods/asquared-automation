import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import crypto from 'crypto';



// --- Helper: Timeout Signal ---
function getTimeoutSignal(ms: number) {
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        return (AbortSignal as any).timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

// --- Helper: Timeout Signal ---

// --- Helper: Number Normalization ---
function cleanPhoneNumber(num: any): string {
    if (!num) return "Unknown";
    const str = String(num).replace(/\s+/g, '').replace(/\+/g, '').replace(/\D/g, '');
    if (!str || str.length < 5 || str.length > 22) return "Unknown";
    return str;
}

// --- Rate Lookup (Removed rates.json) ---
function getRateInfo(phoneNumber: string) {
    return { Country: 'UAE', Rate: 0.05 }; // Placeholder fallback
}


function calculateTelephonyCost(durationSecs: number, phoneNumber: string, isInbound: boolean, providerNumber?: string) {
    if (isInbound) return durationSecs > 0 ? 0.02 : 0;
    if (!durationSecs || durationSecs <= 0) return 0;

    const pClean = (providerNumber || "").replace(/\D/g, '');
    const tClean = (phoneNumber || "").replace(/\D/g, '');

    const botIsUS = pClean.startsWith('1');
    const botIsUK = pClean.startsWith('44');
    const targetIsUAE = tClean.startsWith('971');
    const targetIsUS = tClean.startsWith('1');
    const targetIsUK = tClean.startsWith('44');

    if (botIsUS || botIsUK) {
        if (targetIsUAE) return (durationSecs / 60) * 0.2426;
        if (botIsUS && targetIsUS) return (durationSecs / 60) * 0.013;
        if (botIsUK && targetIsUK) return (durationSecs / 60) * 0.0305;
        return (durationSecs / 60) * 0.05;
    }

    const rate = getRateInfo(tClean);
    return (durationSecs / 60) * (rate?.Rate ?? 0);
}



/**
 * Fetches call logs strictly from Supabase archive.
 * Data is synced to this table via an external n8n workflow.
 */
async function fetchArchivedCallLogs(fromDate: Date | null, toDate: Date | null): Promise<any[]> {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !secretKey) return [];

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };

    // Lean column selection for list view
    // Fetch specific columns based on schema. User added assistantId and type columns.
    const columns = 'id,started_at,customer_phone,customer_name,duration_seconds,status,cost_usd,source,transcript,summary,recording_url,vapi_account,assistantId,type';
    const BATCH_SIZE = 1000;

    // Build date filter
    let dateFilter = '';
    if (fromDate) dateFilter += `&started_at=gte.${fromDate.toISOString()}`;
    if (toDate) {
        const endOfRange = new Date(toDate);
        if (endOfRange.getUTCHours() === 0 && endOfRange.getUTCMinutes() === 0 && endOfRange.getUTCSeconds() === 0) {
            endOfRange.setUTCHours(23, 59, 59, 999);
        }
        dateFilter += `&started_at=lte.${endOfRange.toISOString()}`;
    }

    const normalizeRow = (d: any) => {
        const dur = d.duration_seconds || 0;
        const costVal = d.cost_usd ?? 0;
        const ph = d.customer_phone || 'Unknown';
        
        const aid = d.assistantId || null;
        const UAE_BOT_ID = '70f05e16-18f3-4f6e-964a-f47b299c6c1d';

        // Mapping rules for call type
        let isInbound = d.type === 'inboundPhoneCall';
        if (aid === UAE_BOT_ID) isInbound = false; // UAE bot is always outbound (Telephony)

        const assistantIdToPhone: Record<string, string> = {
            '70f05e16-18f3-4f6e-964a-f47b299c6c1d': '97148714150',
            'b35e3032-7865-4913-ba22-a913b5d4117b': '14782159151',
            '918c25eb-9882-452e-86df-b4851d464852': '447462179309',
            '9ac979c3-a0b3-4af6-bb0d-07ddf9c0d1cd': '447462179309',
        };

        const assistantPhone = (aid ? assistantIdToPhone[aid] : null) || 'Unknown';

        return {
            id: d.id,
            startedAt: d.started_at,
            durationSeconds: dur,
            costValue: costVal,
            cost: `$${Number(costVal).toFixed(3)}`,
            phone: ph,
            name: d.customer_name || 'Guest',
            phoneNumber: assistantPhone,
            callSummary: d.summary || '',
            transcript: d.transcript || '',
            recordingUrl: d.recording_url || '',
            // Map various Vapi success statuses to 'answered' for the dashboard filter
            status: (d.status === 'ended' || d.status === 'customer-ended-call' || d.status === 'assistant-ended-call' || d.status === 'voicemail') 
                ? 'answered' 
                : (d.status || 'answered'),
            type: isInbound ? "Inbound" : "Outbound",
            isInbound,
            country: getRateInfo(ph)?.Country || 'Unknown',
            source: 'vapi',
            vapiAccount: aid === '682cf6ae-23fd-44f3-a4a3-756998cd62c1' ? 'owners' : (d.vapi_account || 'normal'),
            vapiStatus: d.status,
            assistantId: aid,
            endedReason: null,
            breakdown: { agent: costVal, telephony: 0, total: costVal },
            raw: { id: d.id, startedAt: d.started_at, assistantId: aid, isInbound }
        };
    };

    try {
        const countUrl = `${baseUrl}/vapi_call_logs?select=${columns}${dateFilter}&order=started_at.desc&limit=${BATCH_SIZE}&offset=0`;
        const countRes = await fetch(countUrl, { headers: { ...headers, 'Prefer': 'count=exact' } });

        if (!countRes.ok) return [];

        const firstBatch = await countRes.json();
        if (!Array.isArray(firstBatch)) return [];

        const contentRange = countRes.headers.get('content-range');
        let totalCount = firstBatch.length;
        if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/);
            if (match) totalCount = parseInt(match[1], 10);
        }

        if (firstBatch.length >= totalCount || firstBatch.length < BATCH_SIZE) {
            return firstBatch.map(normalizeRow);
        }

        const remainingBatches: Promise<any[]>[] = [];
        for (let offset = BATCH_SIZE; offset < totalCount; offset += BATCH_SIZE) {
            const batchUrl = `${baseUrl}/vapi_call_logs?select=${columns}${dateFilter}&order=started_at.desc&limit=${BATCH_SIZE}&offset=${offset}`;
            remainingBatches.push(
                fetch(batchUrl, { headers })
                    .then(r => r.ok ? r.json() : [])
                    .catch(() => [])
            );
        }

        const batchResults = await Promise.all(remainingBatches);
        const allRows = [...firstBatch, ...batchResults.flat()];
        return allRows.map(normalizeRow);
    } catch (e) {
        console.error("[SupabaseFetch] Error:", e);
        return [];
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');

        const fromDateRaw = fromParam ? new Date(fromParam) : null;
        const toDateRaw = toParam ? new Date(toParam) : null;

        const fromDate = fromDateRaw && !isNaN(fromDateRaw.getTime()) ? fromDateRaw : null;
        const toDate = toDateRaw && !isNaN(toDateRaw.getTime()) ? toDateRaw : null;

        // Fetch exclusively from Supabase Archive
        const archivedCalls = await fetchArchivedCallLogs(fromDate, toDate);

        // Filter and Sort
        const final = archivedCalls
            .sort((a, b) => {
                const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
                const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
                return timeB - timeA;
            });

        return new NextResponse(JSON.stringify(final), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            }
        });

    } catch (globalErr) {
        console.error("Global calls API error:", globalErr);
        return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }
}
