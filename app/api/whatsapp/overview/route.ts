import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, getMsgDateWithFallback, isWithinRange, fetchAllRows, processReplyLeads, parseTSDate } from '@/lib/server-parsers';
import { consolidateLeads, RawLeadsResponse } from '@/lib/leads-utils';

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
        // Check snake_case follow-up TS (intro/follow_up tables after consolidation)
        const fTs = lead[`w_p_followup_ts_${i}`];
        if (fTs) {
            const d = parseTSDate(fTs);
            if (d && d > latestDate) latestDate = d;
        }
    }
    return latestDate;
}

function getReachoutDate(lead: any): Date | null {
    const wp1 = lead["W.P_1"];
    if (wp1 && wp1 !== "" && wp1 !== "No") {
        const d = parseMsg(wp1).date;
        if (d) return d;
    }
    const wp1Ts = lead["W.P_1 TS"];
    if (wp1Ts) {
        const d = parseTSDate(wp1Ts);
        if (d) return d;
    }
    // leads table uses last_outreach_at
    if (lead.last_outreach_at) {
        const d = new Date(lead.last_outreach_at);
        if (!isNaN(d.getTime())) return d;
    }
    // Fallback: message exists but date undetectable — use created_at
    if (wp1 && wp1 !== "" && wp1 !== "No") {
        const d = new Date(lead.created_at || 0);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

// Returns date for a follow-up message, checking the snake_case TS field
function getFollowUpDate(lead: any, i: number): Date | null {
    const raw = lead[`W.P_FollowUp_${i}`];
    if (!raw || !String(raw).trim() || String(raw).trim().toLowerCase() === "no") return null;
    const d = parseMsg(raw).date;
    if (d) return d;
    // w_p_followup_ts_${i} is the snake_case TS column from intro/follow_up tables
    const ts = lead[`w_p_followup_ts_${i}`];
    if (ts) {
        const tsDate = parseTSDate(String(ts));
        if (tsDate) return tsDate;
    }
    // Fallback to created_at
    return lead.created_at ? new Date(lead.created_at) : null;
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
            return isWithinRange(d, fromDate, toDate);
        };

        const [
            leadsRows,
            masterLeads,
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            nurtureRows,
            nurtureUkRows,
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to),
            fetchAllRows(baseUrl, headers, "master_leads", "Last Contacted", from, to),
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
                const mapped: any = { ...l };
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
                mapped["WP_Replied_track"] = l.wp_replied_track || '';
                mapped["WP_last_contacted"] = l.wp_last_contacted || l.last_contacted || '';
                return mapped;
            });

        const normNurture   = normalizeNurture(nurtureRows,   'Nurture');
        const normNurtureUk = normalizeNurture(nurtureUkRows, 'Nurture UK');

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

        // A lead counts as a reachout only when W.P_1 is not null/empty (or W.P_1 TS has a parseable date)
        // AND that date falls within the selected range.
        const filteredLeads = allLeads.filter((lead: any) => {
            const wp1 = lead["W.P_1"];
            const wp1Ts = lead["W.P_1 TS"];
            // Must have at least W.P_1 content or W.P_1 TS
            const hasFirstMsg = (wp1 && String(wp1).trim() !== '' && String(wp1).trim().toLowerCase() !== 'no')
                             || (wp1Ts && String(wp1Ts).trim() !== '');
            if (!hasFirstMsg) return false;
            const rd = getReachoutDate(lead);
            if (!rd) return false;
            return isInRange(rd);
        });

        const dailyGroups: Record<string, { date: string; sent: number; replied: number }> = {};
        let messagesSent = 0;
        let uniqueLeadsContacted = 0;
        let waiting = 0;
        let totalReplies = 0;
        const repliedLeads: any[] = [];

        // Per-table breakdowns
        const tableReachouts: Record<string, number> = {};
        const tableReplies: Record<string, number> = {};
        const tableMsgsSent: Record<string, number> = {};

        filteredLeads.forEach((lead: any) => {
            const tKey: string = lead.source_table || 'unknown';
            // Count reachout: W.P_1 not null is our definition (already filtered above)
            tableReachouts[tKey] = (tableReachouts[tKey] || 0) + 1;

            let leadSentCount = 0;
            let hasWPInDate = false;

            // Count W.P_1..12 initial templates
            for (let i = 1; i <= 12; i++) {
                const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                if (d && isInRange(d)) {
                    leadSentCount++;
                    hasWPInDate = true;
                }
            }

            // Single legacy follow-up field
            const fup = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
            if (fup && isInRange(fup)) {
                leadSentCount++;
                hasWPInDate = true;
            }

            // W.P_FollowUp_1..10 with snake_case TS field support
            for (let i = 1; i <= 10; i++) {
                const d = getFollowUpDate(lead, i);
                if (d && isInRange(d)) {
                    leadSentCount++;
                    hasWPInDate = true;
                }
            }

            if (hasWPInDate) {
                messagesSent += leadSentCount;
                uniqueLeadsContacted++;
                tableMsgsSent[tKey] = (tableMsgsSent[tKey] || 0) + leadSentCount;
            }

            // Reply detection:
            // 1. WP_Replied_track (intro/follow_up consolidated — mapped from wp_replied_track)
            // 2. W.P_Replied_1..10 (older intro/follow_up schema)
            // A reply counts only if the lead itself is in the filtered set (already guaranteed above)
            const replyVal = lead["WP_Replied_track"];
            let isRepliedInRange = false;

            if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                const parsed = parseMsg(replyVal);
                if (parsed.date) {
                    // Reply has an embedded date — check if it's in range
                    if (isInRange(parsed.date)) isRepliedInRange = true;
                } else {
                    // "yes" / "replied" — no date, count it (lead is already in range)
                    isRepliedInRange = true;
                }
            }

            // Fallback: W.P_Replied_1..10 (intro/follow_up after consolidation)
            if (!isRepliedInRange) {
                for (let i = 1; i <= 10; i++) {
                    const rVal = lead[`W.P_Replied_${i}`];
                    if (rVal && String(rVal).trim() !== '' && String(rVal).toLowerCase() !== 'no') {
                        const parsed = parseMsg(rVal);
                        const replyDate = parsed.date;
                        // If there's a parseable date, check range; otherwise count it (lead is in range)
                        if (!replyDate || isInRange(replyDate)) { isRepliedInRange = true; break; }
                    }
                }
            }

            if (isRepliedInRange) {
                totalReplies++;
                repliedLeads.push(lead);
                tableReplies[tKey] = (tableReplies[tKey] || 0) + 1;
            } else if (hasWPInDate) {
                waiting++;
            }

            const latestAct = getLeadLatestActivity(lead);
            if (latestAct) {
                const dStr = latestAct.toLocaleDateString([], { month: 'short', day: 'numeric' });
                if (!dailyGroups[dStr]) dailyGroups[dStr] = { date: dStr, sent: 0, replied: 0 };
                dailyGroups[dStr].sent += leadSentCount;
                if (isRepliedInRange) dailyGroups[dStr].replied += 1;
            }
        });

        // Nurture table counts are now automatically integrated through allLeads consolidation

        const totalReachouts = Object.values(tableReachouts).reduce((a, b) => a + b, 0);
        const totalRepliesAll = Object.values(tableReplies).reduce((a, b) => a + b, 0);
        const totalMsgsSentAll = Object.values(tableMsgsSent).reduce((a, b) => a + b, 0);

        let ownerReachouts = 0, ownerReplies = 0, ownerMsgsSent = 0;
        masterLeads.forEach((o: any) => {
            const wp1 = o["Whatsapp_1"];
            if (!wp1 || wp1 === "") return;

            const wpDate = o["Whatsapp_1_Date"] ? new Date(o["Whatsapp_1_Date"]) : null;
            if (!isInRange(wpDate)) return;

            ownerReachouts++;
            if (wp1) ownerMsgsSent++;
            if (o["retry_1"]) ownerMsgsSent++;
            for (let i = 1; i <= 5; i++) {
                if (o[`Bot_Replied_${i}`]) ownerMsgsSent++;
            }

            const wtsReply = o["WTS_Reply_Track"];
            if (wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no") {
                ownerReplies++;
            }
        });

        const stats = {
            totalLeads: totalReachouts,
            contactedLeads: totalMsgsSentAll,
            totalReplies: totalRepliesAll,
            replied: totalRepliesAll,
            waiting,
            nurture: 0,
            unresponsive: filteredLeads.length - uniqueLeadsContacted
        };

        const ownerStats = { reachouts: ownerReachouts, replies: ownerReplies, msgsSent: ownerMsgsSent };

        const donutData = [
            { name: 'Total Leads', value: totalReachouts, color: '#8b5cf6' },
            { name: 'Messages Sent', value: totalMsgsSentAll, color: '#3b82f6' },
            { name: 'Total Replies', value: totalRepliesAll, color: '#10b981' },
        ];

        const trendData = Object.values(dailyGroups)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-7);

        return NextResponse.json({ stats, ownerStats, tableReachouts, tableReplies, tableMsgsSent, donutData, trendData, repliedLeads, replyData: processReplyLeads(repliedLeads) }, {
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
