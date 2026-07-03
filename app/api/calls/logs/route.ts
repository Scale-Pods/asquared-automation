import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/server-parsers';

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
    const account = searchParams.get('account') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const voiceStatusFilter = searchParams.get('voiceStatus') || 'all';
    const typeFilter = searchParams.get('type') || 'all';
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    const pageSize = Math.min(1000, Math.max(1, parseInt(pageSizeParam || "50", 10) || 50));

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

    const COUNTRY_MAP: Record<string, string> = {
        '1': 'US/CA', '91': 'India', '44': 'UK', '971': 'UAE',
        '966': 'Saudi Arabia', '974': 'Qatar', '973': 'Bahrain',
        '968': 'Oman', '965': 'Kuwait', '962': 'Jordan',
        '20': 'Egypt', '961': 'Lebanon', '972': 'Israel',
        '49': 'Germany', '33': 'France', '34': 'Spain',
        '39': 'Italy', '31': 'Netherlands', '41': 'Switzerland',
        '46': 'Sweden', '47': 'Norway', '45': 'Denmark',
        '358': 'Finland', '48': 'Poland', '7': 'Russia',
        '86': 'China', '81': 'Japan', '82': 'South Korea',
        '65': 'Singapore', '60': 'Malaysia', '62': 'Indonesia',
        '63': 'Philippines', '66': 'Thailand', '84': 'Vietnam',
        '61': 'Australia', '64': 'New Zealand',
        '27': 'South Africa', '234': 'Nigeria', '254': 'Kenya',
        '55': 'Brazil', '52': 'Mexico', '54': 'Argentina',
        '56': 'Chile', '57': 'Colombia', '51': 'Peru',
    };

    function deriveCountry(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        for (let len = 3; len >= 1; len--) {
            const prefix = digits.substring(0, len);
            if (COUNTRY_MAP[prefix]) return `+${prefix} ${COUNTRY_MAP[prefix]}`;
        }
        return 'Unknown';
    }

    const columns = 'id,created_at,customer_phone,customer_name,duration_seconds,status,cost_usd,source,transcript,summary,recording_url,vapi_account,assistantId,type,voice_call_status,note';

    let dateFilter = '';
    if (from) dateFilter += `&created_at=gte.${from}`;
    if (to) {
        const endDate = new Date(to);
        if (endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
            endDate.setUTCHours(23, 59, 59, 999);
        }
        dateFilter += `&created_at=lte.${endDate.toISOString()}`;
    }

    const buildPhoneMap = async () => {
        const phoneMap = new Map<string, { name: string; voice_call_status?: string; note?: string }>();
        try {
            const tables = ["leads", "master_leads", "intro", "intro_uk", "follow_up", "follow_up_uk"];
            const allLeads = await Promise.all(tables.map(t =>
                fetchAllRows(baseUrl, headers, t, null, null, null)
            ));
            allLeads.flat().forEach((l: any) => {
                const phone = l.phone || l.customer_number || l.Contact_Number || l.Phone || "";
                const clean = phone.replace(/\D/g, '');
                if (clean && clean.length > 5) {
                    if (!phoneMap.has(clean)) {
                        phoneMap.set(clean, {
                            name: l.name || l.customer_name || l["Owner Name"] || l.Name || "",
                            voice_call_status: l.voice_call_status || l["Voice Call Status"] || "",
                            note: l.note || ""
                        });
                    }
                }
            });
        } catch {}
        return phoneMap;
    };

    try {
        const [ownerRows, nfRows, phoneMap] = await Promise.all([
            fetchTable(baseUrl, headers, 'vapi_call_logs', columns, dateFilter),
            fetchTable(baseUrl, headers, 'vapi_call_logs_nf', columns, dateFilter),
            buildPhoneMap()
        ]);

        const allRows = [...ownerRows, ...nfRows];

        const normalizeRow = (d: any) => {
            const ph = d.customer_phone || 'Unknown';
            const aid = d.assistantId || null;

            const phDigits = ph.replace(/\D/g, '');
            const leadInfo = phDigits && phDigits.length > 5 ? phoneMap.get(phDigits) : undefined;
            let customerName = d.customer_name || 'Guest';
            if (leadInfo && leadInfo.name && (customerName === 'Guest' || customerName === 'Unknown')) {
                customerName = leadInfo.name;
            }

            const acct = String(d.vapi_account || '').toLowerCase();
            let account = 'normal';
            if (acct === 'secondary') account = 'secondary';
            else if (acct === 'unknown') account = 'unknown';
            else if (acct === 'owner' || acct === 'owners') account = 'owners';

            return {
                id: d.id,
                startedAt: d.created_at || d.started_at,
                customerPhone: ph,
                customerName,
                durationSeconds: d.duration_seconds || 0,
                costUsd: d.cost_usd ?? 0,
                source: 'vapi',
                isInbound: d.type === 'inboundPhoneCall',
                vapiAccount: account,
                status: (d.status || '').toLowerCase(),
                transcript: d.transcript || '',
                summary: d.summary || '',
                recordingUrl: d.recording_url || '',
                assistantId: aid,
                voiceCallStatus: d.voice_call_status || '',
                note: d.note || '',
                country: deriveCountry(ph),
                displayDate: ''
            };
        };

        let calls = allRows.map(normalizeRow);

        if (account === 'secondary') calls = calls.filter(c => c.vapiAccount === 'secondary');
        else if (account === 'unknown') calls = calls.filter(c => c.vapiAccount === 'unknown');
        else if (account === 'owners') calls = calls.filter(c => c.vapiAccount === 'owners');
        else if (account === 'normal') calls = calls.filter(c => c.vapiAccount === 'normal');

        if (statusFilter !== 'all') {
            calls = calls.filter(c => c.status === statusFilter);
        }

        if (voiceStatusFilter !== 'all') {
            const target = voiceStatusFilter.toLowerCase();
            calls = calls.filter(c => {
                const vcs = (c.voiceCallStatus || '').toLowerCase();
                if (target === 'did not answer') {
                    return vcs === 'no answer' || vcs === 'did_not_answer' || vcs === 'no_answer';
                }
                return vcs === target;
            });
        }

        if (typeFilter !== 'all') {
            const normalizedType = typeFilter.toLowerCase();
            calls = calls.filter(c => {
                const callType = c.isInbound ? 'inbound' : 'outbound';
                return callType === normalizedType;
            });
        }

        if (search) {
            const q = search.toLowerCase().trim();
            const phoneSearch = q.replace(/\D/g, '');
            calls = calls.filter(c => {
                const phoneTarget = (c.customerPhone || '').replace(/\D/g, '');
                const matchesPhone = phoneSearch && phoneTarget.includes(phoneSearch);
                const matchesName = c.customerName.toLowerCase().includes(q);
                return matchesPhone || matchesName;
            });
        }

        calls.sort((a, b) => {
            if (sort === 'longest') return (b.durationSeconds || 0) - (a.durationSeconds || 0);
            if (sort === 'shortest') return (a.durationSeconds || 0) - (b.durationSeconds || 0);
            const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            // oldest = ascending (ta - tb), newest = descending (tb - ta)
            return sort === 'oldest' ? ta - tb : tb - ta;
        });

        const total = calls.length;
        const paginated = calls.slice((page - 1) * pageSize, page * pageSize);

        return NextResponse.json({ calls: paginated, total, page, pageSize }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
