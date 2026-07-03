import { NextResponse } from 'next/server';
import { format, getHours } from 'date-fns';

export const dynamic = 'force-dynamic';



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

    try {
        const [ownerRows, nfRows] = await Promise.all([
            fetchTable(baseUrl, headers, 'vapi_call_logs', columns, dateFilter),
            fetchTable(baseUrl, headers, 'vapi_call_logs_nf', columns, dateFilter)
        ]);

        const allRows = [...ownerRows, ...nfRows];

        const calls = allRows.map((d: any) => {
            const acct = String(d.vapi_account || '').toLowerCase();
            let account = 'normal';
            if (acct === 'secondary') account = 'secondary';
            else if (acct === 'unknown') account = 'unknown';
            else if (acct === 'owner' || acct === 'owners') account = 'owners';

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
        });

        const totalCalls = calls.length;
        let totalDuration = 0, totalCost = 0, successCount = 0;
        let secondaryCallsCount = 0, unknownCallsCount = 0, ownersCallsCount = 0;
        let secondaryPickedUp = 0, secondaryCompleted = 0;
        let unknownPickedUp = 0, unknownCompleted = 0;
        let ownerPickedUp = 0, ownerCompleted = 0;

        const dayMap = new Map<string, { calls: number; credits: number; display: string }>();
        const hourMap = new Array(24).fill(0);
        const durationBuckets: Record<string, number> = { '0-30s': 0, '30s-1m': 0, '1m-2m': 0, '2m-5m': 0, '5m+': 0 };
        const typesMap = new Map<string, number>();

        calls.forEach(call => {
            const dur = call.durationSeconds;
            const cost = call.costValue;
            const isSecondary = call.vapiAccount === 'secondary';
            const isUnknown = call.vapiAccount === 'unknown';
            const isOwner = call.vapiAccount === 'owners';

            if (isSecondary) secondaryCallsCount++;
            else if (isUnknown) unknownCallsCount++;
            else if (isOwner) ownersCallsCount++;

            totalDuration += dur;
            totalCost += cost;

            const typeLabel = call.isInbound ? 'Inbound' : 'Outbound';
            typesMap.set(typeLabel, (typesMap.get(typeLabel) || 0) + 1);

            if (call.startedAt) {
                const dayKey = format(new Date(call.startedAt), 'yyyy-MM-dd');
                const displayKey = format(new Date(call.startedAt), 'MMM dd');
                if (!dayMap.has(dayKey)) dayMap.set(dayKey, { calls: 0, credits: 0, display: displayKey });
                const entry = dayMap.get(dayKey)!;
                entry.calls++;
                entry.credits += cost;

                const hour = getHours(new Date(call.startedAt));
                hourMap[hour]++;
            }

            if (dur < 30) durationBuckets['0-30s']++;
            else if (dur < 60) durationBuckets['30s-1m']++;
            else if (dur < 120) durationBuckets['1m-2m']++;
            else if (dur < 300) durationBuckets['2m-5m']++;
            else durationBuckets['5m+']++;

            const pickedUp = dur > 18;
            const completed = call.status === 'customer-ended-call' || call.status === 'assistant-ended-call';

            if (isSecondary) {
                if (pickedUp) secondaryPickedUp++;
                if (completed) secondaryCompleted++;
            } else if (isUnknown) {
                if (pickedUp) unknownPickedUp++;
                if (completed) unknownCompleted++;
            } else if (isOwner) {
                if (pickedUp) ownerPickedUp++;
                if (completed) ownerCompleted++;
            }
        });

        const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        const hourlyData = hourMap.map((count, hour) => ({ hour, count }));
        const volumeData = sortedDays.map(([, entry]) => ({ name: entry.display, value: entry.calls }));
        const typesData = Array.from(typesMap.entries()).map(([name, value]) => ({ name, value }));
        const durationData = Object.entries(durationBuckets).map(([name, value]) => ({ name, value }));
        const costData = sortedDays.map(([, entry]) => ({ name: entry.display, value: entry.credits }));

        let balance = null;
        const vapiPrivKey = process.env.VAPI_PRIVATE_KEY;
        if (vapiPrivKey) {
            try {
                const vapiRes = await fetch('https://api.vapi.ai/org', {
                    headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
                });
                if (vapiRes.ok) {
                    let raw = await vapiRes.json();
                    if (Array.isArray(raw) && raw.length > 0) raw = raw[0];
                    balance = raw.balance ??
                        raw.billing?.balance ??
                        raw.credits ??
                        raw.creditsBalance ??
                        raw.org?.balance ??
                        raw.billingPlan?.balance ??
                        raw.billing?.credits ??
                        raw.billing?.balance_amount ??
                        null;
                }
            } catch {}
        }

        const stats = {
            totalCalls,
            totalDuration,
            totalCost,
            avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
            secondaryCalls: secondaryCallsCount,
            unknownCalls: unknownCallsCount,
            ownersCalls: ownersCallsCount,
            pickupRate: secondaryCallsCount > 0 ? (secondaryPickedUp / secondaryCallsCount) * 100 : 0,
            completionRate: secondaryCallsCount > 0 ? (secondaryCompleted / secondaryCallsCount) * 100 : 0,
            unknownPickupRate: unknownCallsCount > 0 ? (unknownPickedUp / unknownCallsCount) * 100 : 0,
            unknownCompletionRate: unknownCallsCount > 0 ? (unknownCompleted / unknownCallsCount) * 100 : 0,
            ownerPickupRate: ownersCallsCount > 0 ? (ownerPickedUp / ownersCallsCount) * 100 : 0,
            ownerCompletionRate: ownersCallsCount > 0 ? (ownerCompleted / ownersCallsCount) * 100 : 0,
            hourlyData,
            volumeData,
            typesData,
            durationData,
            costData,
            balance
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
