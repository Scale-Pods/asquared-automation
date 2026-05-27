import { NextResponse } from 'next/server';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

const SEC_ASSISTANT = 'c552e5b3-6c41-41d2-83b4-7c820e0d14bb';
const UNKNOWN_ASSISTANT = '3266ea3f-336e-436a-bd2a-63f196aab37f';
const OWNERS_ASSISTANT = '682cf6ae-23fd-44f3-a4a3-756998cd62c1';

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

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const account = searchParams.get('account') || 'all';

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

    const columns = 'id,created_at,customer_phone,customer_name,duration_seconds,status,cost_usd,source,transcript,summary,recording_url,vapi_account,assistantId,type,voice_call_status';

    let dateFilter = '';
    if (from) dateFilter += `&created_at=gte.${from}`;
    if (to) {
        const endDate = new Date(to);
        if (endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
            endDate.setUTCHours(23, 59, 59, 999);
        }
        dateFilter += `&created_at=lte.${endDate.toISOString()}`;
    }

    const normalizeRow = (d: any) => {
        const aid = d.assistantId || '';
        let account: string;
        if (aid === SEC_ASSISTANT) account = 'secondary';
        else if (aid === UNKNOWN_ASSISTANT) account = 'unknown';
        else if (aid === OWNERS_ASSISTANT) account = 'owners';
        else account = 'normal';

        return {
            id: d.id,
            startedAt: d.created_at || d.started_at,
            durationSeconds: d.duration_seconds || 0,
            costValue: d.cost_usd ?? 0,
            status: (d.status || '').toLowerCase(),
            isInbound: d.type === 'inboundPhoneCall',
            vapiAccount: account,
            voiceCallStatus: d.voice_call_status || ''
        };
    };

    const getCount = async (table: string, filter: string) => {
        try {
            const url = `${baseUrl}/${table}?select=count&limit=0&${filter}`;
            const res = await fetch(url, { headers: { ...headers, "Prefer": "count=exact" }, cache: 'no-store' });
            if (!res.ok) return 0;
            const cr = res.headers.get("content-range");
            return cr ? parseInt(cr.split('/')[1]) || 0 : 0;
        } catch { return 0; }
    };

    try {
        const [ownerRows, nfRows, waitingCount] = await Promise.all([
            fetchTable(baseUrl, headers, 'vapi_call_logs', columns, dateFilter),
            fetchTable(baseUrl, headers, 'vapi_call_logs_nf', columns, dateFilter),
            getCount("vapi_call_logs_nf", '"voice_call_status"=eq.Awaiting%20availability')
        ]);

        const allRows = [...ownerRows, ...nfRows];
        let normalized = allRows.map(normalizeRow);

        if (account === 'secondary') normalized = normalized.filter(c => c.vapiAccount === 'secondary');
        else if (account === 'unknown') normalized = normalized.filter(c => c.vapiAccount === 'unknown');
        else if (account === 'owners') normalized = normalized.filter(c => c.vapiAccount === 'owners');
        else if (account === 'normal') normalized = normalized.filter(c => c.vapiAccount === 'normal');

        const totalCalls = normalized.length;
        let totalDuration = 0, totalCredits = 0;
        let secondaryCallsCount = 0, unknownCallsCount = 0, ownersCallsCount = 0;
        let secondaryPickedUp = 0, secondaryCompleted = 0;
        let unknownPickedUp = 0, unknownCompleted = 0;
        let ownerPickedUp = 0, ownerCompleted = 0;
        let inboundDuration = 0, outboundDuration = 0;

        const dayMap = new Map<string, { calls: number; credits: number }>();
        const durationBuckets: Record<string, number> = { '0-30s': 0, '30s-1m': 0, '1m-2m': 0, '2m-5m': 0, '5m+': 0 };
        const typesMap = new Map<string, number>();

        normalized.forEach(call => {
            const dur = call.durationSeconds;
            const cost = call.costValue;
            const isSecondary = call.vapiAccount === 'secondary';
            const isUnknown = call.vapiAccount === 'unknown';
            const isOwner = call.vapiAccount === 'owners';

            if (isSecondary) secondaryCallsCount++;
            else if (isUnknown) unknownCallsCount++;
            else if (isOwner) ownersCallsCount++;

            totalDuration += dur;
            totalCredits += cost;

            if (call.isInbound) inboundDuration += dur;
            else outboundDuration += dur;

            const typeLabel = call.isInbound ? 'Inbound' : 'Outbound';
            typesMap.set(typeLabel, (typesMap.get(typeLabel) || 0) + 1);

            const dayStr = call.startedAt ? format(new Date(call.startedAt), 'MMM dd') : 'N/A';
            const dayEntry = dayMap.get(dayStr) || { calls: 0, credits: 0 };
            dayEntry.calls++;
            dayEntry.credits += cost;
            dayMap.set(dayStr, dayEntry);

            if (dur < 30) durationBuckets['0-30s']++;
            else if (dur < 60) durationBuckets['30s-1m']++;
            else if (dur < 120) durationBuckets['1m-2m']++;
            else if (dur < 300) durationBuckets['2m-5m']++;
            else durationBuckets['5m+']++;

            if (dur > 18) {
                if (isSecondary) secondaryPickedUp++;
                else if (isUnknown) unknownPickedUp++;
                else if (isOwner) ownerPickedUp++;
            }
            if (call.status === 'customer-ended-call' || call.status === 'assistant-ended-call') {
                if (isSecondary) secondaryCompleted++;
                else if (isUnknown) unknownCompleted++;
                else if (isOwner) ownerCompleted++;
            }
        });

        const sortedDays = Array.from(dayMap.entries()).sort((a, b) => {
            const da = new Date(`${a[0]} ${new Date().getFullYear()}`).getTime();
            const db = new Date(`${b[0]} ${new Date().getFullYear()}`).getTime();
            return da - db;
        });

        const stats = {
            totalCalls,
            avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
            totalCost: totalCredits,
            successRate: totalCalls > 0 ? Math.round(((secondaryPickedUp + unknownPickedUp + ownerPickedUp) / totalCalls) * 100) : 0,
            inboundDuration,
            outboundDuration,
            secondaryCalls: secondaryCallsCount,
            unknownCalls: unknownCallsCount,
            ownersCalls: ownersCallsCount,
            pickupRate: secondaryCallsCount > 0 ? (secondaryPickedUp / secondaryCallsCount) * 100 : 0,
            completionRate: secondaryCallsCount > 0 ? (secondaryCompleted / secondaryCallsCount) * 100 : 0,
            unknownPickupRate: unknownCallsCount > 0 ? (unknownPickedUp / unknownCallsCount) * 100 : 0,
            unknownCompletionRate: unknownCallsCount > 0 ? (unknownCompleted / unknownCallsCount) * 100 : 0,
            ownerPickupRate: ownersCallsCount > 0 ? (ownerPickedUp / ownersCallsCount) * 100 : 0,
            ownerCompletionRate: ownersCallsCount > 0 ? (ownerCompleted / ownersCallsCount) * 100 : 0,
            volumeData: sortedDays.map(([name, obj]) => ({ name, value: obj.calls })),
            durationData: Object.entries(durationBuckets).map(([name, value]) => ({ name, value })),
            costData: sortedDays.map(([name, obj]) => ({ name, value: obj.credits })),
            typesData: Array.from(typesMap.entries()).map(([name, value]) => ({ name, value })),
            waitingAvailabilityCount: waitingCount
        };

        return NextResponse.json(stats, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
