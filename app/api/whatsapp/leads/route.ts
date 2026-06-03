import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, fetchAllRows } from '@/lib/server-parsers';
import { consolidateLeads, RawLeadsResponse, ConsolidatedLead } from '@/lib/leads-utils';

export const dynamic = 'force-dynamic';

function getReachoutDate(lead: any): Date | null {
    const wp1 = lead["W.P_1"];
    if (wp1 && wp1 !== "" && wp1 !== "No") {
        const d = parseMsg(wp1).date;
        if (d) return d;
    }
    const wp1Ts = lead["W.P_1 TS"];
    if (wp1Ts && wp1Ts.includes(' - ')) {
        const parts = wp1Ts.split(' - ');
        const datePart = parts[parts.length - 1].trim();
        const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        }
    }
    return null;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search') || '';
    const replyStatus = searchParams.get('replyStatus') || 'all';
    const loop = searchParams.get('loop') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

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
        const fromDate = from ? startOfDay(new Date(from)) : null;
        const toDate = to ? endOfDay(new Date(to)) : null;

        // When searching by a prefixed ID (e.g. "intro_uk-458"), only fetch the matching table
        const ID_PREFIX_MAP: Record<string, string> = {
            'intro_uk': 'intro_uk',
            'follow_up_uk': 'follow_up_uk',
            'follow_up': 'follow_up',
            'intro': 'intro',
            'master': 'master_leads',
            'leads': 'leads',
            'nurture_leads_uk': 'nurture_leads_uk',
            'nurture_leads': 'nurture_leads',
        };
        let targetTable: string | null = null;
        if (search) {
            const dashIdx = search.lastIndexOf('-');
            if (dashIdx > 0) {
                const prefix = search.slice(0, dashIdx).toLowerCase();
                targetTable = ID_PREFIX_MAP[prefix] ?? null;
            }
        }

        const fetchTable = (table: string, dateCol: string | null) =>
            (targetTable === null || targetTable === table)
                ? fetchAllRows(baseUrl, headers, table, dateCol, from, to)
                : Promise.resolve([]);

        const [
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            masterLeadsRows,
            leadsRows,
            nurtureRows,
            nurtureUkRows,
        ] = await Promise.all([
            fetchTable("intro", null),
            fetchTable("intro_uk", null),
            fetchTable("follow_up", null),
            fetchTable("follow_up_uk", null),
            fetchTable("master_leads", "Last Contacted"),
            fetchTable("leads", "last_outreach_at"),
            fetchTable("nurture_leads", null),
            fetchTable("nurture_leads_uk", null),
        ]);

        // Normalise nurture rows into consolidated-lead shape so existing filters work
        // Map nurture week columns to W.P_1..W.P_12
        const NURTURE_TO_WP: Record<string, string> = {};
        const nurtureKeys = ['week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
                            'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
                            'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4'];
        nurtureKeys.forEach((key, i) => { NURTURE_TO_WP[key] = `W.P_${i + 1}`; });

        // Map nurture timestamp columns to W.P_* TS
        const NURTURE_TS_TO_WP: Record<string, string> = {};
        nurtureKeys.forEach((key, i) => { NURTURE_TS_TO_WP[`${key}_ts`] = `W.P_${i + 1} TS`; });

        // Map wp_replied_* → W.P_Replied_*, wp_followup_* → W.P_FollowUp_*, wp_followup_ts_* → W.P_FollowUp_* TS
        const REPLIED_MAP: Record<string, string> = {};
        const FOLLOWUP_MAP: Record<string, string> = {};
        const FOLLOWUP_TS_MAP: Record<string, string> = {};
        for (let i = 1; i <= 10; i++) {
            REPLIED_MAP[`wp_replied_${i}`] = `W.P_Replied_${i}`;
            FOLLOWUP_MAP[`wp_followup_${i}`] = `W.P_FollowUp_${i}`;
            FOLLOWUP_TS_MAP[`wp_followup_ts_${i}`] = `W.P_FollowUp_${i} TS`;
        }

        const normalizeNurture = (rows: any[], sourceLoop: string) =>
            rows.map((l: any) => {
                const mapped: any = { ...l };
                // Map content columns
                nurtureKeys.forEach((nk) => {
                    const wpKey = NURTURE_TO_WP[nk];
                    if (l[nk] && String(l[nk]).trim() !== '') {
                        mapped[wpKey] = l[nk];
                    }
                });
                // Map timestamp columns
                nurtureKeys.forEach((nk) => {
                    const tsKey = `${nk}_ts`;
                    const wpTsKey = NURTURE_TS_TO_WP[tsKey];
                    if (l[tsKey]) mapped[wpTsKey] = String(l[tsKey]);
                });
                // Map reply columns
                Object.entries(REPLIED_MAP).forEach(([src, dest]) => {
                    if (l[src] && String(l[src]).trim() !== '') mapped[dest] = l[src];
                });
                // Map followup columns
                Object.entries(FOLLOWUP_MAP).forEach(([src, dest]) => {
                    if (l[src] && String(l[src]).trim() !== '') mapped[dest] = l[src];
                });
                // Map followup TS columns
                Object.entries(FOLLOWUP_TS_MAP).forEach(([src, dest]) => {
                    if (l[src]) mapped[dest] = String(l[src]);
                });
                mapped.source_loop = sourceLoop;
                mapped.source_table = sourceLoop === 'Nurture' ? 'nurture_leads' : 'nurture_leads_uk';
                mapped["WP_Replied_track"] = l.wp_replied_track || '';
                mapped["WP_last_contacted"] = l.wp_last_contacted || l.last_contacted || '';
                return mapped;
            });

        const normNurture   = normalizeNurture(nurtureRows,   'Nurture');
        const normNurtureUk = normalizeNurture(nurtureUkRows, 'Nurture UK');

        const rawData: RawLeadsResponse = {
            intro: introRows,
            intro_uk: introUkRows,
            follow_up: followUpRows,
            follow_up_uk: followUpUkRows,
            master_leads: masterLeadsRows,
            leads: leadsRows
        };

        let consolidatedLeads = [
            ...consolidateLeads(rawData),
            ...normNurture,
            ...normNurtureUk,
        ];

        // Filter: must have some WhatsApp activity (skip when searching by id for chat detail lookup)
        if (!search) {
            consolidatedLeads = consolidatedLeads.filter((l: any) => {
                const wp1 = l["W.P_1"];
                if (wp1 && wp1 !== "" && wp1 !== "No") return true;
                if (l["W.P_1 TS"]) return true;
                for (let i = 2; i <= 12; i++) {
                    if (l[`W.P_${i}`]) return true;
                }
                if (l.WP_Replied_track) return true;
                return false;
            });
        }

        // Filter: date range on reachout date
        if (fromDate && toDate) {
            consolidatedLeads = consolidatedLeads.filter((l: any) => {
                const rd = getReachoutDate(l);
                if (!rd) return false;
                return rd >= fromDate && rd <= toDate;
            });
        }

        // Filter: search (by name, email, phone, or id)
        if (search) {
            const q = search.toLowerCase();
            consolidatedLeads = consolidatedLeads.filter((l: ConsolidatedLead) =>
                l.id.toLowerCase().includes(q) ||
                l.name.toLowerCase().includes(q) ||
                l.email.toLowerCase().includes(q) ||
                l.phone.toLowerCase().includes(q)
            );
        }

        // Filter: reply status
        if (replyStatus !== 'all') {
            consolidatedLeads = consolidatedLeads.filter((l: any) => {
                const wtR = l["WP_Replied_track"];
                let hasReplied = false;
                if (wtR && wtR !== "" && String(wtR).toLowerCase() !== "no") {
                    const parsed = parseMsg(wtR);
                    if (parsed.date || String(wtR).toLowerCase() === "yes" || String(wtR).toLowerCase() === "replied") {
                        hasReplied = true;
                    }
                }
                return replyStatus === 'replied' ? hasReplied : !hasReplied;
            });
        }

        // Filter: loop
        if (loop !== 'all') {
            consolidatedLeads = consolidatedLeads.filter((l: ConsolidatedLead) => {
                const sl = l.source_loop?.toLowerCase() || '';
                if (loop === 'intro') return sl === 'intro';
                if (loop === 'follow_up') return sl === 'follow up';
                if (loop === 'nurture') return sl === 'nurture';
                return true;
            });
        }

        const total = consolidatedLeads.length;
        const paginatedLeads = consolidatedLeads.slice((page - 1) * pageSize, page * pageSize);

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
