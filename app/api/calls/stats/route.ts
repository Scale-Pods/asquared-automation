import { NextResponse } from 'next/server';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

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

    const fetchCalls = async () => {
        const columns = 'id,created_at,customer_phone,customer_name,duration_seconds,status,cost_usd,source,transcript,summary,recording_url,vapi_account,assistantId,type,voice_call_status';
        const BATCH_SIZE = 1000;

        let dateFilter = '';
        if (from) dateFilter += `&created_at=gte.${from}`;
        if (to) {
            const endDate = new Date(to);
            if (endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
                endDate.setUTCHours(23, 59, 59, 999);
            }
            dateFilter += `&created_at=lte.${endDate.toISOString()}`;
        }

        const normalizeRow = (d: any) => ({
            id: d.id,
            startedAt: d.created_at || d.started_at,
            durationSeconds: d.duration_seconds || 0,
            costValue: d.cost_usd ?? 0,
            status: (d.status || '').toLowerCase(),
            isInbound: d.type === 'inboundPhoneCall',
            vapiAccount: (d.assistantId || '') === '682cf6ae-23fd-44f3-a4a3-756998cd62c1' ? 'owners' : 'normal',
            voiceCallStatus: d.voice_call_status || ''
        });

        try {
            const url = `${baseUrl}/vapi_call_logs?select=${columns}${dateFilter}&order=created_at.desc&limit=${BATCH_SIZE}&offset=0`;
            const countRes = await fetch(url, { headers: { ...headers, 'Prefer': 'count=exact' }, cache: 'no-store' });
            if (!countRes.ok) return [];
            const firstBatch = await countRes.json();
            if (!Array.isArray(firstBatch)) return [];

            const cr = countRes.headers.get('content-range');
            let totalCount = firstBatch.length;
            if (cr) { const m = cr.match(/\/(\d+)$/); if (m) totalCount = parseInt(m[1], 10); }

            let allRows: any[];
            if (firstBatch.length >= totalCount || firstBatch.length < BATCH_SIZE) {
                allRows = firstBatch;
            } else {
                const offsets: number[] = [];
                for (let offset = BATCH_SIZE; offset < totalCount; offset += BATCH_SIZE) offsets.push(offset);

                const batches = await Promise.all(offsets.map(offset =>
                    fetch(`${baseUrl}/vapi_call_logs?select=${columns}${dateFilter}&order=created_at.desc&limit=${BATCH_SIZE}&offset=${offset}`, { headers, cache: 'no-store' })
                        .then(r => r.ok ? r.json() : [])
                        .catch(() => [])
                ));
                allRows = [...firstBatch, ...batches.flat()];
            }

            let normalized = allRows.map(normalizeRow);

            // Apply account filter server-side
            if (account === 'normal') normalized = normalized.filter(c => c.vapiAccount !== 'owners');
            else if (account === 'owners') normalized = normalized.filter(c => c.vapiAccount === 'owners');

            return normalized;
        } catch { return []; }
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
        const [calls, waitingCount] = await Promise.all([
            fetchCalls(),
            getCount("vapi_call_logs", '"voice_call_status"=eq.Awaiting%20availability')
        ]);

        const totalCalls = calls.length;
        let totalDuration = 0, totalCredits = 0;
        let normalCallsCount = 0, ownersCallsCount = 0;
        let normalPickedUp = 0, normalCompleted = 0;
        let ownerPickedUp = 0, ownerCompleted = 0;
        let inboundDuration = 0, outboundDuration = 0;

        const dayMap = new Map<string, { calls: number; credits: number }>();
        const durationBuckets: Record<string, number> = { '0-30s': 0, '30s-1m': 0, '1m-2m': 0, '2m-5m': 0, '5m+': 0 };
        const typesMap = new Map<string, number>();

        calls.forEach(call => {
            const dur = call.durationSeconds;
            const cost = call.costValue;
            const isOwner = call.vapiAccount === 'owners';
            const isNormal = call.vapiAccount === 'normal' || !call.vapiAccount;

            if (isOwner) ownersCallsCount++;
            else if (isNormal) normalCallsCount++;

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

            // Pick-up: duration_seconds > 18
            if (dur > 18) {
                if (isOwner) ownerPickedUp++;
                else if (isNormal) normalPickedUp++;
            }
            // Completion: status is customer-ended-call or assistant-ended-call
            if (call.status === 'customer-ended-call' || call.status === 'assistant-ended-call') {
                if (isOwner) ownerCompleted++;
                else if (isNormal) normalCompleted++;
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
            successRate: totalCalls > 0 ? Math.round(((normalPickedUp + ownerPickedUp) / totalCalls) * 100) : 0,
            inboundDuration,
            outboundDuration,
            normalCalls: normalCallsCount,
            ownersCalls: ownersCallsCount,
            pickupRate: normalCallsCount > 0 ? (normalPickedUp / normalCallsCount) * 100 : 0,
            completionRate: normalCallsCount > 0 ? (normalCompleted / normalCallsCount) * 100 : 0,
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
