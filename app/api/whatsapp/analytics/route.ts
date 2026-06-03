import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, parseTSDate, getMsgDateWithFallback, isWithinRange, fetchAllRows } from '@/lib/server-parsers';

export const dynamic = 'force-dynamic';

function getLeadLatestActivity(lead: any): Date {
    const wp1Ts = lead["W.P_1 TS"];
    if (wp1Ts && wp1Ts.includes(' - ')) {
        const parts = wp1Ts.split(' - ');
        const datePart = parts[parts.length - 1].trim();
        const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
            if (!isNaN(d.getTime())) return d;
        }
    }

    let latest = new Date(lead.updated_at || lead.created_at);
    const stageData = lead.stage_data || {};
    const getD = (raw: any) => parseMsg(raw).date;
    for (let i = 1; i <= 12; i++) {
        let d = getD(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]);
        const tsRaw = lead[`W.P_${i} TS`];
        if (!d && tsRaw && tsRaw.includes(' - ')) {
            const parts = tsRaw.split(' - ');
            const datePart = parts[parts.length - 1].trim();
            const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                const tsDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                if (!isNaN(tsDate.getTime())) {
                    const rawLower = tsRaw.toLowerCase();
                    if (rawLower.includes('read') || rawLower.includes('delivered') || rawLower.includes('failed')) {
                        tsDate.setHours(0, 0, 0, 0);
                    }
                    d = tsDate;
                }
            }
        }
        if (d && d > latest) latest = d;
    }
    const rd = getD(lead.whatsapp_replied || stageData["WhatsApp Replied"]);
    if (rd && rd > latest) latest = rd;
    const fd = getD(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]);
    if (fd && fd > latest) latest = fd;
    for (let i = 1; i <= 10; i++) {
        const d1 = getD(lead[`W.P_Replied_${i}`]);
        if (d1 && d1 > latest) latest = d1;
        const d2 = getD(lead[`W.P_FollowUp_${i}`]);
        if (d2 && d2 > latest) latest = d2;
    }
    return latest;
}

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

        // Nurture stats (separate schema)
        let nurtureTotalSent = 0, nurtureReplied = 0;
        let nurtureUkTotalSent = 0, nurtureUkReplied = 0;

        [...nurtureRows].forEach((l: any) => {
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureTotalSent++; });
            if (l.wp_replied_track && String(l.wp_replied_track).trim() !== '') nurtureReplied++;
        });
        [...nurtureUkRows].forEach((l: any) => {
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureUkTotalSent++; });
            if (l.wp_replied_track && String(l.wp_replied_track).trim() !== '') nurtureUkReplied++;
        });

        const allLeads = [...leadsRows, ...introRows, ...introUkRows, ...followUpRows, ...followUpUkRows];

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
                const d = parseMsg(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]).date;
                if (d && isInRange(d)) {
                    totalSent++;
                    const roundLabel = i <= 6 ? `Round ${i}` : 'Round 12+';
                    roundSent[roundLabel] = (roundSent[roundLabel] || 0) + 1;
                }
            }

            const df = parseMsg(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]).date;
            if (df && isInRange(df)) {
                totalSent++;
                roundSent['Follow-up'] = (roundSent['Follow-up'] || 0) + 1;
            }

            for (let i = 1; i <= 10; i++) {
                const ds = parseMsg(lead[`W.P_FollowUp_${i}`]).date;
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

        // Owner stats
        let ownerReachouts = 0, ownerReplies = 0, ownerMsgsSent = 0;
        masterLeads.forEach((o: any) => {
            const wp1 = o["Whatsapp_1"];
            if (!wp1 || wp1 === "" || String(wp1).toLowerCase() === "no") return;

            ownerReachouts++;
            if (wp1) ownerMsgsSent++;
            if (o["retry_1"]) ownerMsgsSent++;
            for (let i = 1; i <= 10; i++) {
                if (o[`Bot_Replied_${i}`]) ownerMsgsSent++;
            }

            const wtsReply = o["WTS_Reply_Track"];
            if (wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no") {
                ownerReplies++;
            }
        });

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

        const ownerStats = { reachouts: ownerReachouts, replies: ownerReplies, msgsSent: ownerMsgsSent };
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
