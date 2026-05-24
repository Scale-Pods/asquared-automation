import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { parseMsg, parseTSDate, getMsgDateWithFallback, isWithinRange, fetchAllRows, processReplyLeads } from '@/lib/server-parsers';

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
            followUpUkRows
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to),
            fetchAllRows(baseUrl, headers, "master_leads", "Last Contacted", from, to),
            fetchAllRows(baseUrl, headers, "intro", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "intro_uk", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up_uk", "WP_last_contacted", from, to)
        ]);

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

        const donutData = [
            { name: 'Total Leads', value: filteredLeads.length, color: '#8b5cf6' },
            { name: 'Messages Sent', value: messagesSent, color: '#3b82f6' },
            { name: 'Total Replies', value: totalReplies, color: '#10b981' },
        ];

        const trendData = Object.values(dailyGroups)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-7);

        return NextResponse.json({ stats, ownerStats, donutData, trendData, repliedLeads, replyData: processReplyLeads(repliedLeads) }, {
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
