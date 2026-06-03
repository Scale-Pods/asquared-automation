import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, getMsgDateWithFallback, isWithinRange, fetchAllRows, processReplyLeads } from '@/lib/server-parsers';

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
    if (wp1Ts && wp1Ts.includes(' - ')) {
        const parts = wp1Ts.split(' - ');
        const datePart = parts[parts.length - 1].trim();
        const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        }
    }
    // leads table uses last_outreach_at instead of W.P_1
    if (lead.last_outreach_at) {
        const d = new Date(lead.last_outreach_at);
        if (!isNaN(d.getTime())) return d;
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

        // Compute nurture stats separately (different schema: week1_wp_1..week3_wp_4, wp_replied_track)
        const NURTURE_WP_COLS = [
            'week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
            'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
            'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4',
        ];

        const getNurtureReachoutDate = (l: any): Date | null => {
            const ts = l.wp_last_contacted || l.last_contacted;
            if (ts) { const d = new Date(ts); if (!isNaN(d.getTime())) return d; }
            for (const col of NURTURE_WP_COLS) {
                if (l[col] && String(l[col]).trim() !== '') return new Date(l.created_at || 0);
            }
            return null;
        };

        let nurtureMsgsSent = 0, nurtureReplies = 0, nurtureLeadsContacted = 0;
        let nurtureUkMsgsSent = 0, nurtureUkReplies = 0, nurtureUkLeadsContacted = 0;

        [...nurtureRows].forEach((l: any) => {
            const rd = getNurtureReachoutDate(l);
            if (!rd || !isInRange(rd)) return;
            nurtureLeadsContacted++;
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureMsgsSent++; });
            if (l.wp_replied_track && String(l.wp_replied_track).trim() !== '') nurtureReplies++;
        });

        [...nurtureUkRows].forEach((l: any) => {
            const rd = getNurtureReachoutDate(l);
            if (!rd || !isInRange(rd)) return;
            nurtureUkLeadsContacted++;
            NURTURE_WP_COLS.forEach(col => { if (l[col] && String(l[col]).trim() !== '') nurtureUkMsgsSent++; });
            if (l.wp_replied_track && String(l.wp_replied_track).trim() !== '') nurtureUkReplies++;
        });

        const allLeads = [...leadsRows, ...introRows, ...introUkRows, ...followUpRows, ...followUpUkRows];

        const filteredLeads = allLeads.filter((lead: any) => {
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

        filteredLeads.forEach((lead: any) => {
            let leadSentCount = 0;
            let hasWPInDate = false;

            for (let i = 1; i <= 12; i++) {
                const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                if (d && isInRange(d)) {
                    leadSentCount++;
                    hasWPInDate = true;
                }
            }
            const fup = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
            if (fup && isInRange(fup)) {
                leadSentCount++;
                hasWPInDate = true;
            }
            for (let i = 1; i <= 10; i++) {
                const d = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`);
                if (d && isInRange(d)) {
                    leadSentCount++;
                    hasWPInDate = true;
                }
            }

            if (hasWPInDate) {
                messagesSent += leadSentCount;
                uniqueLeadsContacted++;
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
                totalReplies++;
                repliedLeads.push(lead);
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
            totalLeads: filteredLeads.length,
            contactedLeads: messagesSent,
            totalReplies,
            replied: totalReplies,
            waiting,
            nurture: 0,
            unresponsive: filteredLeads.length - uniqueLeadsContacted
        };

        const ownerStats = { reachouts: ownerReachouts, replies: ownerReplies, msgsSent: ownerMsgsSent };
        const nurtureStats = { leadsContacted: nurtureLeadsContacted, msgsSent: nurtureMsgsSent, replies: nurtureReplies };
        const nurtureUkStats = { leadsContacted: nurtureUkLeadsContacted, msgsSent: nurtureUkMsgsSent, replies: nurtureUkReplies };

        const donutData = [
            { name: 'Total Leads', value: filteredLeads.length, color: '#8b5cf6' },
            { name: 'Messages Sent', value: messagesSent, color: '#3b82f6' },
            { name: 'Total Replies', value: totalReplies, color: '#10b981' },
        ];

        const trendData = Object.values(dailyGroups)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-7);

        return NextResponse.json({ stats, ownerStats, nurtureStats, nurtureUkStats, donutData, trendData, repliedLeads, replyData: processReplyLeads(repliedLeads) }, {
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
