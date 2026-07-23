import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/server-parsers';
import { consolidateLeads, getWhatsAppHistory, RawLeadsResponse, ConsolidatedLead } from '@/lib/leads-utils';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

// All available tables with display labels.
// Owners (master_leads) are handled separately by /api/whatsapp/owners — they don't share
// this table's WhatsApp-eligibility schema (W.P_1 etc) and are never surfaced here.
export const ALL_TABLES = [
    { key: 'intro',           label: 'Intro' },
    { key: 'intro_uk',        label: 'Intro UK' },
    { key: 'follow_up',       label: 'Follow Up' },
    { key: 'follow_up_uk',    label: 'Follow Up UK' },
    { key: 'leads',           label: 'Leads' },
    { key: 'nurture_leads',   label: 'Nurture' },
    { key: 'nurture_leads_uk',label: 'Nurture UK' },
] as const;

const RPC_TABLES = ['intro', 'intro_uk', 'follow_up', 'follow_up_uk'];
const NURTURE_TABLES = ['nurture_leads', 'nurture_leads_uk'];

function replyStatusToRpcParam(replyStatus: string): string {
    if (replyStatus === 'replied') return 'replied';
    if (replyStatus === 'sent') return 'sent';
    return 'all';
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search') || '';
    const replyStatus = searchParams.get('replyStatus') || 'all';
    const tableFilter = searchParams.get('table') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    // ID-prefixed search (e.g. "intro_uk-458") is used by the chat-detail component to
    // resolve a single lead by its full record — it needs every W.P_*/W.P_Replied_*
    // message-body column to build the conversation timeline, which the summary RPCs
    // deliberately don't return. Keep that one path on the full-row fetch.
    const dashIdx = search.indexOf('-');
    const prefix = dashIdx > 0 ? search.slice(0, dashIdx).toLowerCase() : null;
    const ID_PREFIX_MAP: Record<string, string> = {
        'intro_uk': 'intro_uk', 'follow_up_uk': 'follow_up_uk', 'follow_up': 'follow_up', 'intro': 'intro',
        'leads': 'leads', 'nurture_leads_uk': 'nurture_leads_uk', 'nurture_leads': 'nurture_leads',
    };
    const isIdLookup = prefix !== null && ID_PREFIX_MAP[prefix] !== undefined;

    if (isIdLookup) {
        return handleIdLookup(search, prefix!, ID_PREFIX_MAP[prefix!]);
    }

    try {
        const tablesToQuery = tableFilter !== 'all' ? [tableFilter] : [...RPC_TABLES, ...NURTURE_TABLES, 'leads'];

        const results = await Promise.all(tablesToQuery.map(async (table) => {
            if (RPC_TABLES.includes(table)) {
                const rows = await callRpc<any[]>('get_whatsapp_leads', {
                    p_table: table,
                    p_from: from || null,
                    p_to: to || null,
                    p_search: search || null,
                    p_reply_status: replyStatusToRpcParam(replyStatus),
                    p_page: 1,
                    p_page_size: 10000, // fetch all matching rows; final pagination happens after merging tables
                });
                return rows.map((r: any) => ({
                    id: `${table}-${r.id}`,
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    source_table: table,
                    source_loop: table === 'intro' ? 'Intro' : table === 'intro_uk' ? 'Intro UK' : table === 'follow_up' ? 'Follow Up' : 'Follow Up UK',
                    replied: r.replied,
                    WP_Replied_track: r.replied ? 'Yes' : '',
                    last_contacted: r.last_contacted,
                    sent_count: r.sent_count,
                }));
            }
            if (NURTURE_TABLES.includes(table)) {
                const rows = await callRpc<any[]>('get_nurture_leads', {
                    p_table: table,
                    p_from: from || null,
                    p_to: to || null,
                    p_search: search || null,
                    p_reply_status: replyStatusToRpcParam(replyStatus),
                    p_page: 1,
                    p_page_size: 10000,
                });
                return rows.map((r: any) => ({
                    id: `${table}-${r.id}`,
                    name: r.name,
                    phone: r.phone,
                    email: '',
                    source_table: table,
                    source_loop: table === 'nurture_leads' ? 'Nurture' : 'Nurture UK',
                    replied: r.replied,
                    WP_Replied_track: r.replied ? 'Yes' : '',
                    last_contacted: r.last_contacted,
                    sent_count: r.sent_count,
                }));
            }
            // `leads` table: real created_at/last_outreach_at, no message-body columns to
            // scan — kept as a direct filtered fetch (no WhatsApp-eligibility concept here).
            const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
            const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
            const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
            const headers: Record<string, string> = {
                "apikey": secretKey, "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json"
            };
            const rows = await fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to);
            return rows
                .filter((l: any) => l.response_received || l.last_outreach_at)
                .filter((l: any) => {
                    if (!search) return true;
                    const q = search.toLowerCase();
                    return (l.name || '').toLowerCase().includes(q) || (l.Phone || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
                })
                .map((l: any) => ({
                    id: `leads-${l.id}`,
                    name: l.name || 'Guest',
                    phone: l.Phone || 'Unknown',
                    email: l.email,
                    source_table: 'leads',
                    source_loop: 'Leads',
                    replied: !!l.response_received,
                    WP_Replied_track: l.response_received ? 'Yes' : '',
                    last_contacted: l.last_outreach_at,
                    sent_count: l.current_step || 0,
                }));
        }));

        let merged = results.flat();

        if (replyStatus !== 'all') {
            merged = merged.filter((l: any) => replyStatus === 'replied' ? l.replied : !l.replied);
        }

        merged.sort((a: any, b: any) => {
            const da = a.last_contacted ? new Date(a.last_contacted).getTime() : 0;
            const db = b.last_contacted ? new Date(b.last_contacted).getTime() : 0;
            return db - da;
        });

        const total = merged.length;
        const paginatedLeads = merged.slice((page - 1) * pageSize, page * pageSize);

        return NextResponse.json({
            leads: paginatedLeads,
            total,
            page,
            pageSize
        }, {
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

// Full-row fetch for a single lead by prefixed ID — used by the chat-detail component,
// which needs every W.P_N/W.P_Replied_N/W.P_FollowUp_N message-body column.
async function handleIdLookup(search: string, prefix: string, targetTable: string) {
    const cleanSearch = search.slice(prefix.length + 1);

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers: Record<string, string> = {
        "apikey": secretKey, "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json"
    };

    try {
        const extraParams = new URLSearchParams();
        if (['intro', 'intro_uk', 'follow_up', 'follow_up_uk'].includes(targetTable)) {
            extraParams.append('ID', `eq.${cleanSearch}`);
        } else {
            extraParams.append('id', `eq.${cleanSearch}`);
        }

        const rows = await fetchAllRows(baseUrl, headers, targetTable, null, null, null, extraParams);

        let consolidatedLeads: ConsolidatedLead[] = [];
        if (['intro', 'intro_uk', 'follow_up', 'follow_up_uk'].includes(targetTable)) {
            const rawData: RawLeadsResponse = { [targetTable]: rows } as RawLeadsResponse;
            consolidatedLeads = consolidateLeads(rawData);
        } else if (targetTable === 'leads') {
            consolidatedLeads = rows.map((l: any) => ({
                id: `leads-${l.id}`,
                name: l.name || 'Guest',
                phone: l.Phone || 'Unknown',
                email: l.email || '',
                replied: l.response_received ? 'Yes' : '',
                current_loop: l.current_loop || '',
                source_loop: 'Leads',
                source_table: 'leads',
                stages_passed: [],
                stage_data: {},
                created_at: l.created_at,
                updated_at: l.updated_at,
            })) as any;
        } else if (['nurture_leads', 'nurture_leads_uk'].includes(targetTable)) {
            consolidatedLeads = rows.map((l: any) => {
                const stages: string[] = [];
                const stage_data: Record<string, any> = {};
                (['week1', 'week2', 'week3'] as const).forEach((week) => {
                    for (let i = 1; i <= 4; i++) {
                        const val = l[`${week}_wp_${i}`];
                        if (val !== undefined && val !== null && String(val).trim() !== "") {
                            const stageName = `${week}_wp_${i}`;
                            stages.push(stageName);
                            stage_data[stageName] = val;
                        }
                    }
                });

                return {
                    ...l,
                    ...getWhatsAppHistory(l),
                    id: `${targetTable}-${l.id}`,
                    name: l.name || 'Guest',
                    phone: l.Phone || 'Unknown',
                    replied: l.Replied || (stage_data && Object.keys(stage_data).length ? 'Yes' : 'No'),
                    source_loop: targetTable === 'nurture_leads' ? 'Nurture' : 'Nurture UK',
                    source_table: targetTable,
                    stages_passed: stages,
                    stage_data,
                    WP_Replied_track: l.WP_Replied_track || '',
                };
            }) as any;
        }

        return NextResponse.json({
            leads: consolidatedLeads,
            total: consolidatedLeads.length,
            page: 1,
            pageSize: consolidatedLeads.length || 1,
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
