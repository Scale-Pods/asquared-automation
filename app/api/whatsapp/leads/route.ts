import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, parseTSDate, getMsgDateWithFallback, isWithinRange, fetchAllRows } from '@/lib/server-parsers';
import { consolidateLeads, RawLeadsResponse, ConsolidatedLead } from '@/lib/leads-utils';

export const dynamic = 'force-dynamic';

function getReachoutDate(lead: any): Date | null {
    const wp1 = lead["W.P_1"];
    if (!wp1 || wp1 === "" || wp1 === "No") return null;
    let reachoutDate = parseMsg(wp1).date;
    if (!reachoutDate) {
        const wp1Ts = lead["W.P_1 TS"];
        if (wp1Ts && wp1Ts.includes(' - ')) {
            const parts = wp1Ts.split(' - ');
            const datePart = parts[parts.length - 1].trim();
            const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                reachoutDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
            }
        }
    }
    return reachoutDate;
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

        const [
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            masterLeadsRows,
            leadsRows
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "intro", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "intro_uk", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up_uk", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "master_leads", "Last Contacted", from, to),
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to)
        ]);

        const rawData: RawLeadsResponse = {
            intro: introRows,
            intro_uk: introUkRows,
            follow_up: followUpRows,
            follow_up_uk: followUpUkRows,
            master_leads: masterLeadsRows,
            leads: leadsRows
        };

        let consolidatedLeads = consolidateLeads(rawData);

        // Filter: W.P_1 must exist (skip when searching by id for chat detail lookup)
        if (!search) {
            consolidatedLeads = consolidatedLeads.filter((l: any) => {
                const wp1 = l["W.P_1"];
                return wp1 && wp1 !== "" && wp1 !== "No";
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
