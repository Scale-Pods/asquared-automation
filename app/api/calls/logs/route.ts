import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/server-parsers';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

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

    // Cross-table phone -> name/voice-status lookup (join across lead tables) —
    // kept as a direct fetch since it's a many-table join the RPC doesn't own.
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
        const [rows, phoneMap] = await Promise.all([
            callRpc<any[]>('get_voice_call_logs', {
                p_from: from || null,
                p_to: to || null,
                p_account: account,
                p_status: statusFilter,
                p_voice_status: voiceStatusFilter,
                p_type: typeFilter,
                p_search: search || null,
                p_sort: sort,
                p_page: page,
                p_page_size: pageSize,
            }),
            buildPhoneMap(),
        ]);

        const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

        const calls = rows.map((d: any) => {
            const ph = d.customer_phone || 'Unknown';
            const phDigits = ph.replace(/\D/g, '');
            const leadInfo = phDigits && phDigits.length > 5 ? phoneMap.get(phDigits) : undefined;
            let customerName = d.customer_name || 'Guest';
            if (leadInfo && leadInfo.name && (customerName === 'Guest' || customerName === 'Unknown')) {
                customerName = leadInfo.name;
            }

            return {
                id: d.id,
                startedAt: d.started_at,
                customerPhone: ph,
                customerName,
                durationSeconds: d.duration_seconds || 0,
                costUsd: d.cost_usd ?? 0,
                source: 'vapi',
                isInbound: d.is_inbound,
                vapiAccount: d.vapi_account,
                status: d.status,
                transcript: '',
                summary: '',
                recordingUrl: '',
                assistantId: null,
                voiceCallStatus: d.voice_call_status || '',
                note: d.note || '',
                country: deriveCountry(ph),
                displayDate: ''
            };
        });

        return NextResponse.json({ calls, total, page, pageSize }, {
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
