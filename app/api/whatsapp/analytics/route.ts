import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, parseTSDate, getMsgDateWithFallback, isWithinRange, fetchAllRows } from '@/lib/server-parsers';
import { consolidateLeads, RawLeadsResponse } from '@/lib/leads-utils';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

function getMsgDate(raw: any): Date | null {
    if (!raw || !String(raw).trim()) return null;
    const content = String(raw).trim();
    const isoRegex = /\n\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.+)$/;
    const isoMatch = content.match(isoRegex);
    if (isoMatch) return new Date(isoMatch[1]);
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    const lastLineDate = new Date(lastLine.replace(' ', 'T'));
    if (lines.length > 1 && !isNaN(lastLineDate.getTime()) && lastLine.includes('-') && lastLine.includes(':')) {
        return lastLineDate;
    }
    return null;
}

function parseNurtureTS(raw: any): Date | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
    const m = s.match(/at\s+([A-Za-z]+\s+\d{1,2}\s+\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)/i);
    if (m) { const d = new Date(m[1].replace(',', '')); if (!isNaN(d.getTime())) return d; }
    return null;
}

const NURTURE_WP_COLS = [
    'week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
    'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
    'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4',
];
const NURTURE_WP_TS_COLS = [
    'week1_wp_1_ts','week1_wp_2_ts','week1_wp_3_ts','week1_wp_4_ts',
    'week2_wp_1_ts','week2_wp_2_ts','week2_wp_3_ts','week2_wp_4_ts',
    'week3_wp_1_ts','week3_wp_2_ts','week3_wp_3_ts','week3_wp_4_ts',
];

const getNurtureFirstContactDate = (l: any): Date | null => {
    const firstTs = l['week1_wp_1_ts'];
    if (firstTs) {
        const d = parseNurtureTS(firstTs);
        if (d && !isNaN(d.getTime())) return d;
    }
    for (const tsCol of NURTURE_WP_TS_COLS) {
        const ts = l[tsCol];
        if (ts) { const d = parseNurtureTS(ts); if (d && !isNaN(d.getTime())) return d; }
    }
    const legacyTs = l.wp_last_contacted || l.last_contacted;
    if (legacyTs) { const d = new Date(legacyTs); if (!isNaN(d.getTime())) return d; }
    for (const col of NURTURE_WP_COLS) {
        if (l[col] && String(l[col]).trim() !== '') {
            const d = new Date(l.created_at || 0);
            return isNaN(d.getTime()) ? null : d;
        }
    }
    return null;
};

const getNurtureReplyDate = (l: any): Date | null => {
    const rTrack = l.wp_replied_track;
    if (!rTrack || String(rTrack).trim() === '' || String(rTrack).toLowerCase() === 'no') return null;
    const d = new Date(rTrack);
    if (!isNaN(d.getTime())) return d;
    const parsed = parseMsg(rTrack);
    if (parsed.date) return parsed.date;
    return null;
};

function getLeadLatestActivity(lead: any): Date {
    let latestDate = new Date(lead.created_at);
    for (let i = 1; i <= 12; i++) {
        const tsRaw = lead[`W.P_${i} TS`];
        let d = getMsgDate(lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]);
        if (!d && tsRaw) {
            d = parseTSDate(tsRaw);
        }
        if (d && d > latestDate) latestDate = d;
    }
    const rd = getMsgDate(lead.whatsapp_replied || lead.stage_data?.["WhatsApp Replied"]);
    if (rd && rd > latestDate) latestDate = rd;
    const fd = getMsgDate(lead["W.P_FollowUp"] || lead.stage_data?.["WhatsApp FollowUp"]);
    if (fd && fd > latestDate) latestDate = fd;
    for (let i = 1; i <= 10; i++) {
        const dReplied = getMsgDate(lead[`W.P_Replied_${i}`]);
        if (dReplied && dReplied > latestDate) latestDate = dReplied;
        const dFollow = getMsgDate(lead[`W.P_FollowUp_${i}`]);
        if (dFollow && dFollow > latestDate) latestDate = dFollow;
        const fTs = lead[`w_p_followup_ts_${i}`];
        if (fTs) {
            const d = parseTSDate(fTs);
            if (d && d > latestDate) latestDate = d;
        }
    }
    return latestDate;
}

function getReachoutDate(lead: any): Date | null {
    for (let i = 1; i <= 12; i++) {
        const wp = lead[`W.P_${i}`];
        if (wp && wp !== "" && wp !== "No") {
            const d = parseMsg(wp).date;
            if (d) return d;
        }
        const wpTs = lead[`W.P_${i} TS`];
        if (wpTs) {
            const d = parseTSDate(wpTs);
            if (d) return d;
        }
    }
    if (lead.last_outreach_at) {
        const d = new Date(lead.last_outreach_at);
        if (!isNaN(d.getTime())) return d;
    }
    for (let i = 1; i <= 12; i++) {
        const wp = lead[`W.P_${i}`];
        if (wp && wp !== "" && wp !== "No") {
            const d = new Date(lead.created_at || 0);
            if (!isNaN(d.getTime())) return d;
        }
    }
    return null;
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

    try {
        const fromDate = from ? startOfDay(new Date(from)) : null;
        const toDate = to ? endOfDay(new Date(to)) : null;

        const isInRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            if (d >= fromDate && d <= toDate) return true;
            const toYYYYMMDD = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            return toYYYYMMDD(d) >= toYYYYMMDD(fromDate) && toYYYYMMDD(d) <= toYYYYMMDD(toDate);
        };

        const NURTURE_WP_COLS = [
            'week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
            'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
            'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4',
        ];

        const [
            leadsRows,
            ownerMetrics,
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            nurtureRows,
            nurtureUkRows,
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to),
            // Owner stats now computed entirely in Postgres — no more full master_leads fetch here.
            callRpc('get_owner_metrics', { p_from: from || null, p_to: to || null }),
            // No DB-level date filter on TEXT columns; in-memory isInRange handles it
            fetchAllRows(baseUrl, headers, "intro", null, from, to),
            fetchAllRows(baseUrl, headers, "intro_uk", null, from, to),
            fetchAllRows(baseUrl, headers, "follow_up", null, from, to),
            fetchAllRows(baseUrl, headers, "follow_up_uk", null, from, to),
            fetchAllRows(baseUrl, headers, "nurture_leads", null, from, to),
            fetchAllRows(baseUrl, headers, "nurture_leads_uk", null, from, to),
        ]);

        // Normalize nurture rows into consolidated-lead schema
        const NURTURE_TO_WP: Record<string, string> = {};
        const nurtureKeys = ['week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
                            'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
                            'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4'];
        nurtureKeys.forEach((key, i) => { NURTURE_TO_WP[key] = `W.P_${i + 1}`; });

        const NURTURE_TS_TO_WP: Record<string, string> = {};
        nurtureKeys.forEach((key, i) => { NURTURE_TS_TO_WP[`${key}_ts`] = `W.P_${i + 1} TS`; });

        const normalizeNurture = (rows: any[], sourceLoop: string) =>
            rows.map((l: any) => {
                const tbl = sourceLoop === 'Nurture' ? 'nurture_leads' : 'nurture_leads_uk';
                const mapped: any = { ...l, id: `${tbl}-${l.id}` };
                nurtureKeys.forEach((nk) => {
                    const wpKey = NURTURE_TO_WP[nk];
                    if (l[nk] && String(l[nk]).trim() !== '') mapped[wpKey] = l[nk];
                });
                nurtureKeys.forEach((nk) => {
                    const tsKey = `${nk}_ts`;
                    const wpTsKey = NURTURE_TS_TO_WP[tsKey];
                    if (l[tsKey]) mapped[wpTsKey] = String(l[tsKey]);
                });
                
                // Map replies, followups, and timestamps dynamically supporting both space and underscore variants
                for (let i = 1; i <= 10; i++) {
                    const repliedVal = l[`W.P_Replied ${i}`] ?? l[`wp_replied_${i}`] ?? l[`W.P_Replied_${i}`];
                    if (repliedVal && String(repliedVal).trim() !== '') {
                        mapped[`W.P_Replied_${i}`] = repliedVal;
                    }

                    const followupVal = l[`W.P_FollowUp ${i}`] ?? l[`wp_followup_${i}`] ?? l[`W.P_FollowUp_${i}`];
                    if (followupVal && String(followupVal).trim() !== '') {
                        mapped[`W.P_FollowUp_${i}`] = followupVal;
                    }

                    const followupTsVal = l[`W.P_FollowUp TS ${i}`] ?? l[`wp_followup_ts_${i}`] ?? l[`W.P_FollowUp_TS_${i}`];
                    if (followupTsVal) {
                        mapped[`w_p_followup_ts_${i}`] = String(followupTsVal);
                        mapped[`W.P_FollowUp_${i} TS`] = String(followupTsVal);
                    }
                }
                mapped.source_loop = sourceLoop;
                mapped.source_table = sourceLoop === 'Nurture' ? 'nurture_leads' : 'nurture_leads_uk';
                mapped.phone = l.Phone || l.phone || '';
                mapped.name = l.name || l.Name || '';
                mapped["WP_Replied_track"] = l.WP_Replied_track || l.wp_replied_track || (l.replied === true ? 'Yes' : '') || '';
                mapped["WP_last_contacted"] = l.wp_last_contacted || l["Last Contacted"] || '';
                mapped.replied = l.replied === true ? 'Yes' : (l.Replied || l.replied || '');
                return mapped;
            });

        const normNurture   = normalizeNurture(nurtureRows,   'Nurture');
        const normNurtureUk = normalizeNurture(nurtureUkRows, 'Nurture UK');

        // Nurture stats (separate schema, filtered in-memory)
        const filteredNurtureRows = normNurture.filter((l: any) => {
            const rd = getNurtureFirstContactDate(l);
            return rd && isInRange(rd);
        });
        const filteredNurtureUkRows = normNurtureUk.filter((l: any) => {
            const rd = getNurtureFirstContactDate(l);
            return rd && isInRange(rd);
        });

        let nurtureTotalSent = 0, nurtureReplied = 0;
        let nurtureUkTotalSent = 0, nurtureUkReplied = 0;

        filteredNurtureRows.forEach((l: any) => {
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureTotalSent++; });
            const replyDate = getNurtureReplyDate(l);
            if (replyDate && isInRange(replyDate)) nurtureReplied++;
        });
        filteredNurtureUkRows.forEach((l: any) => {
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureUkTotalSent++; });
            const replyDate = getNurtureReplyDate(l);
            if (replyDate && isInRange(replyDate)) nurtureUkReplied++;
        });

        // Consolidate intro/follow_up rows to normalize field names (space→underscore, TS mappings, etc.)
        const rawForConsolidation: RawLeadsResponse = {
            intro: introRows,
            intro_uk: introUkRows,
            follow_up: followUpRows,
            follow_up_uk: followUpUkRows,
        };
        const consolidatedNormalLeads = consolidateLeads(rawForConsolidation);

        // Combine consolidated normal leads, leads table, and normalized nurture leads
        const allLeads = [...consolidatedNormalLeads, ...leadsRows, ...normNurture, ...normNurtureUk];

        const filteredLeads = allLeads.filter((lead: any) => {
            const rd = getReachoutDate(lead);
            if (!rd) return false;
            return isInRange(rd);
        });

        // Compute reply counts per round
        const roundSent: Record<string, number> = {};
        let totalSent = 0;

        filteredLeads.forEach((l: any) => {
            const lead = l as any;
            const stageData = lead.stage_data || {};

            // Round counting: each round W.P_1 through W.P_12
            for (let i = 1; i <= 12; i++) {
                const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                if (d && isInRange(d)) {
                    totalSent++;
                    const roundLabel = i <= 6 ? `Round ${i}` : 'Round 12+';
                    roundSent[roundLabel] = (roundSent[roundLabel] || 0) + 1;
                }
            }

            const df = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
            if (df && isInRange(df)) {
                totalSent++;
                roundSent['Follow-up'] = (roundSent['Follow-up'] || 0) + 1;
            }

            for (let i = 1; i <= 10; i++) {
                const ds = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`, `W.P_FollowUp_${i} TS`);
                if (ds && isInRange(ds)) {
                    totalSent++;
                    roundSent['Follow-up'] = (roundSent['Follow-up'] || 0) + 1;
                }
            }
        });

        // Reply count (matching computeWPReplies logic)
        const seen = new Set<string>();
        let repliedCount = 0;
        filteredLeads.forEach((lead: any) => {
            const uid = lead["Lead ID"] || lead.id || lead.phone;
            if (!uid || seen.has(uid)) return;
            seen.add(uid);

            const track = lead["WP_Replied_track"];
            if (!track || String(track).trim() === "" || String(track).trim().toLowerCase() === "no") return;

            const content = String(track).trim();
            let replyDate: Date | null = null;

            const isoMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^ \n]*)/);
            if (isoMatch) {
                const d = new Date(isoMatch[1]);
                if (!isNaN(d.getTime())) replyDate = d;
            }

            if (!replyDate) {
                const d = new Date(content);
                if (!isNaN(d.getTime()) && (content.includes('T') || (content.includes('-') && content.includes(':')))) {
                    replyDate = d;
                }
            }

            if (replyDate && isInRange(replyDate)) {
                repliedCount++;
            }
        });

        const replyRate = filteredLeads.length > 0 ? ((repliedCount / filteredLeads.length) * 100).toFixed(1) + "%" : "0%";

        // Trend data
        const groups: Record<string, { date: string; sent: number; replied: number }> = {};
        filteredLeads.forEach((l: any) => {
            const lead = l as any;
            const stageData = lead.stage_data || {};
            const latestAct = getLeadLatestActivity(lead);
            if (!latestAct) return;

            const dStr = latestAct.toLocaleDateString([], { month: 'short', day: 'numeric' });
            if (!groups[dStr]) groups[dStr] = { date: dStr, sent: 0, replied: 0 };

            for (let i = 1; i <= 12; i++) {
                const d = parseMsg(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]).date;
                if (d && isInRange(d)) groups[dStr].sent++;
            }
            const df = parseMsg(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]).date;
            if (df && isInRange(df)) groups[dStr].sent++;
            for (let i = 1; i <= 10; i++) {
                const ds = parseMsg(lead[`W.P_FollowUp_${i}`]).date;
                if (ds && isInRange(ds)) groups[dStr].sent++;
            }

            const replyVal = lead["WP_Replied_track"];
            let isRepliedInRange = false;
            if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                const parsed = parseMsg(replyVal);
                if (parsed.date) {
                    if (isInRange(parsed.date)) isRepliedInRange = true;
                } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                    if (isInRange(new Date(lead.created_at))) isRepliedInRange = true;
                }
            }
            if (isRepliedInRange) {
                groups[dStr].replied += 1;
            }
        });

        const trendData = Object.values(groups)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-7);

        // Round data for bar chart
        const roundLabels = ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Round 12+', 'Follow-up'];
        const roundData = roundLabels.map(name => ({
            name,
            value: roundSent[name] || 0
        }));

        const stats = {
            totalSent,
            repliedCount,
            totalLeads: filteredLeads.length,
            replyRate,
            loopData: []
        };

        const ownerStats = { reachouts: ownerMetrics.reachouts, replies: ownerMetrics.replies, msgsSent: ownerMetrics.msgsSent };
        const nurtureStats = {
            totalSent: nurtureTotalSent, replied: nurtureReplied, total: nurtureRows.length,
            replyRate: nurtureRows.length > 0 ? ((nurtureReplied / nurtureRows.length) * 100).toFixed(1) + "%" : "0%"
        };
        const nurtureUkStats = {
            totalSent: nurtureUkTotalSent, replied: nurtureUkReplied, total: nurtureUkRows.length,
            replyRate: nurtureUkRows.length > 0 ? ((nurtureUkReplied / nurtureUkRows.length) * 100).toFixed(1) + "%" : "0%"
        };

        const repliedTrend = groups;

        return NextResponse.json({ stats, ownerStats, nurtureStats, nurtureUkStats, trendData, repliedTrend, roundData }, {
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
