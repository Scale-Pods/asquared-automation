import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import crypto from 'crypto';

const SEC_ASSISTANT = 'c552e5b3-6c41-41d2-83b4-7c820e0d14bb';
const UNKNOWN_ASSISTANT = '3266ea3f-336e-436a-bd2a-63f196aab37f';
const OWNERS_ASSISTANT = '682cf6ae-23fd-44f3-a4a3-756998cd62c1';

// --- Helper: Timeout Signal ---
function getTimeoutSignal(ms: number) {
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        return (AbortSignal as any).timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

// --- Helper: Number Normalization ---
function cleanPhoneNumber(num: any): string {
    if (!num) return "Unknown";
    const str = String(num).replace(/\s+/g, '').replace(/\+/g, '').replace(/\D/g, '');
    if (!str || str.length < 5 || str.length > 22) return "Unknown";
    return str;
}

// --- Rate Lookup ---
function getRateInfo(phoneNumber: string) {
    return { Country: 'UAE', Rate: 0.05 };
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

async function fetchTable(baseUrl: string, headers: Record<string, string>, table: string, columns: string, dateFilter: string, BATCH_SIZE = 1000) {
    try {
        const url = `${baseUrl}/${table}?select=${columns}${dateFilter}&order=created_at.desc&limit=${BATCH_SIZE}&offset=0`;
        const countRes = await fetch(url, { headers: { ...headers, 'Prefer': 'count=exact' }, cache: 'no-store' });
        if (!countRes.ok) return [];
        const firstBatch = await countRes.json();
        if (!Array.isArray(firstBatch)) return [];

        const cr = countRes.headers.get('content-range');
        let totalCount = firstBatch.length;
        if (cr) { const m = cr.match(/\/(\d+)$/); if (m) totalCount = parseInt(m[1], 10); }

        if (firstBatch.length >= totalCount || firstBatch.length < BATCH_SIZE) return firstBatch;

        const offsets: number[] = [];
        for (let offset = BATCH_SIZE; offset < totalCount; offset += BATCH_SIZE) offsets.push(offset);

        const batches = await Promise.all(offsets.map(offset =>
            fetch(`${baseUrl}/${table}?select=${columns}${dateFilter}&order=created_at.desc&limit=${BATCH_SIZE}&offset=${offset}`, { headers, cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
        ));
        return [...firstBatch, ...batches.flat()];
    } catch { return []; }
}

/**
 * Fetches call logs from both Supabase tables and merges.
 * Owners data from vapi_call_logs, secondary/unknown from vapi_call_logs_nf.
 */
async function fetchAllCallLogs(fromDate: Date | null, toDate: Date | null): Promise<any[]> {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !secretKey) return [];

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };

    const columns = 'id,created_at,customer_phone,customer_name,duration_seconds,status,cost_usd,source,transcript,summary,recording_url,vapi_account,assistantId,type';

    let dateFilter = '';
    if (fromDate) dateFilter += `&created_at=gte.${fromDate.toISOString()}`;
    if (toDate) {
        const endOfRange = new Date(toDate);
        if (endOfRange.getUTCHours() === 0 && endOfRange.getUTCMinutes() === 0 && endOfRange.getUTCSeconds() === 0) {
            endOfRange.setUTCHours(23, 59, 59, 999);
        }
        dateFilter += `&created_at=lte.${endOfRange.toISOString()}`;
    }

    const [ownerRows, nfRows] = await Promise.all([
        fetchTable(baseUrl, headers, 'vapi_call_logs', columns, dateFilter),
        fetchTable(baseUrl, headers, 'vapi_call_logs_nf', columns, dateFilter)
    ]);

    const allRows = [...ownerRows, ...nfRows];

    const normalizeRow = (d: any) => {
        const dur = d.duration_seconds || 0;
        const costVal = d.cost_usd ?? 0;
        const ph = d.customer_phone || 'Unknown';

        const aid = d.assistantId || null;
        const UAE_BOT_ID = '70f05e16-18f3-4f6e-964a-f47b299c6c1d';

        let isInbound = d.type === 'inboundPhoneCall';
        if (aid === UAE_BOT_ID) isInbound = false;

        const assistantIdToPhone: Record<string, string> = {
            '70f05e16-18f3-4f6e-964a-f47b299c6c1d': '97148714150',
            'b35e3032-7865-4913-ba22-a913b5d4117b': '14782159151',
            '918c25eb-9882-452e-86df-b4851d464852': '447462179309',
            '9ac979c3-a0b3-4af6-bb0d-07ddf9c0d1cd': '447462179309',
        };

        const assistantPhone = (aid ? assistantIdToPhone[aid] : null) || 'Unknown';

        let account: string;
        if (aid === SEC_ASSISTANT) account = 'secondary';
        else if (aid === UNKNOWN_ASSISTANT) account = 'unknown';
        else if (aid === OWNERS_ASSISTANT) account = 'owners';
        else account = 'normal';

        return {
            id: d.id,
            startedAt: d.created_at || d.started_at,

            durationSeconds: dur,
            costValue: costVal,
            cost: `$${Number(costVal).toFixed(3)}`,
            phone: ph,
            name: d.customer_name || 'Guest',
            phoneNumber: assistantPhone,
            callSummary: d.summary || '',
            transcript: d.transcript || '',
            recordingUrl: d.recording_url || '',
            status: (d.status === 'ended' || d.status === 'customer-ended-call' || d.status === 'assistant-ended-call' || d.status === 'voicemail')
                ? 'answered'
                : (d.status || 'answered'),
            type: isInbound ? "Inbound" : "Outbound",
            isInbound,
            country: getRateInfo(ph)?.Country || 'Unknown',
            source: 'vapi',
            vapiAccount: account,
            vapiStatus: d.status,

            assistantId: aid,
            endedReason: null,
            breakdown: { agent: costVal, telephony: 0, total: costVal },
            raw: { id: d.id, startedAt: d.started_at, assistantId: aid, isInbound }
        };
    };

    return allRows.map(normalizeRow);
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

        const archivedCalls = await fetchAllCallLogs(fromDate, toDate);

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
