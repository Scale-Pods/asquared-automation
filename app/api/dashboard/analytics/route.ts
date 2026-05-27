import { NextResponse } from 'next/server';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { processReplyLeads } from '@/lib/server-parsers';

export const dynamic = 'force-dynamic';

function parseMsg(raw: any): { date: Date | null; content: string } {
    if (!raw || !String(raw).trim()) return { date: null, content: "" };
    const content = String(raw).trim();
    if (content.length >= 10 && !isNaN(new Date(content).getTime())) {
        if (content.includes('T') || (content.includes('-') && content.includes(':'))) {
            return { date: new Date(content), content: "" };
        }
    }
    const isoRegex = /[\n\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*)$/;
    const isoMatch = content.match(isoRegex);
    if (isoMatch) {
        const d = new Date(isoMatch[1]);
        if (!isNaN(d.getTime())) {
            return { date: d, content: content.replace(isoRegex, '').trim() };
        }
    }
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.includes('-') && lastLine.includes(':')) {
        const lastLineDate = new Date(lastLine.replace(' ', 'T'));
        if (!isNaN(lastLineDate.getTime())) {
            return { date: lastLineDate, content: lines.length > 1 ? lines.slice(0, -1).join('\n').trim() : content };
        }
    }
    return { date: null, content: content };
}

function parseWPStamp(tsRaw: any): Date | null {
    if (!tsRaw || !tsRaw.includes(' - ')) return null;
    const parts = tsRaw.split(' - ');
    const datePart = parts[parts.length - 1].trim();
    const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return isNaN(d.getTime()) ? null : d;
}

function isWithinRange(d: Date | null, fromDate: Date | null, toDate: Date | null): boolean {
    if (!fromDate || !toDate) return true;
    if (!d) return false;
    if (d >= fromDate && d <= toDate) return true;
    const toYYYYMMDD = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const dStr = toYYYYMMDD(d);
    const fStr = toYYYYMMDD(fromDate);
    const tStr = toYYYYMMDD(toDate);
    return dStr >= fStr && dStr <= tStr;
}

function getLeadLatestWPActivity(lead: any, parseFn: typeof parseMsg, parseWP: typeof parseWPStamp): Date {
    const wp1Ts = lead["W.P_1 TS"];
    const wp1Parsed = parseWP(wp1Ts);
    if (wp1Parsed) return wp1Parsed;
    let latest = new Date(lead.created_at);
    const stageData = lead.stage_data || {};
    const getD = (raw: any) => parseFn(raw).date;
    for (let i = 1; i <= 12; i++) {
        let d = getD(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]);
        const tsRaw = lead[`W.P_${i} TS`];
        if (!d && tsRaw && tsRaw.includes(' - ')) {
            const tsDate = parseWP(tsRaw);
            if (tsDate) d = tsDate;
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

function calculateDuration(call: any): number {
    return call.duration_seconds || call.durationSeconds || 0;
}

function formatDuration(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

async function fetchAllRows(baseUrl: string, headers: Record<string, string>, table: string, dateColumn: string | null, from: string | null, to: string | null): Promise<any[]> {
    const PAGE_SIZE = 2000;
    let allData: any[] = [];
    let offset = 0;
    while (true) {
        let url = `${baseUrl}/${table}?select=*&offset=${offset}&limit=${PAGE_SIZE}`;
        if (dateColumn && from) url += `&"${dateColumn}"=gte.${from}`;
        if (dateColumn && to) url += `&"${dateColumn}"=lte.${to}`;
        try {
            const res = await fetch(url, { headers, cache: 'no-store' });
            if (!res.ok) break;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        } catch { break; }
    }
    return allData;
}

async function fetchAllRowsWithDateParts(baseUrl: string, headers: Record<string, string>, table: string, dateColumn: string, from: string | null, to: string | null): Promise<any[]> {
    const PAGE_SIZE = 2000;
    let allData: any[] = [];
    let offset = 0;
    while (true) {
        let url = `${baseUrl}/${table}?select=*&offset=${offset}&limit=${PAGE_SIZE}`;
        if (from) url += `&"${dateColumn}"=gte.${from}`;
        if (to) {
            const endDate = new Date(to);
            if (endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
                endDate.setUTCHours(23, 59, 59, 999);
            }
            url += `&"${dateColumn}"=lte.${endDate.toISOString()}`;
        }
        try {
            const res = await fetch(url, { headers, cache: 'no-store' });
            if (!res.ok) break;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        } catch { break; }
    }
    return allData;
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

        // Fetch ALL data (date filtering done in JS via created_at to match original client behavior)
        const [
            leadsRows,
            masterLeads,
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            allCallsRaw,
            allCallsNf
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", null, null, null),
            fetchAllRows(baseUrl, headers, "master_leads", null, null, null),
            fetchAllRowsWithDateParts(baseUrl, headers, "intro", "WP_last_contacted", null, null),
            fetchAllRowsWithDateParts(baseUrl, headers, "intro_uk", "WP_last_contacted", null, null),
            fetchAllRowsWithDateParts(baseUrl, headers, "follow_up", "WP_last_contacted", null, null),
            fetchAllRowsWithDateParts(baseUrl, headers, "follow_up_uk", "WP_last_contacted", null, null),
            fetchAllRowsWithDateParts(baseUrl, headers, "vapi_call_logs", "created_at", from, to),
            fetchAllRowsWithDateParts(baseUrl, headers, "vapi_call_logs_nf", "created_at", from, to)
        ]);

        const allCalls = [...allCallsRaw, ...allCallsNf];

        // Combine all normal leads
        const allLeads = [...leadsRows, ...introRows, ...introUkRows, ...followUpRows, ...followUpUkRows];

        // Helper to check if a lead is from a "normal" loop (not master)
        const isNormalLoop = (l: any) => {
            const sl = l.source_loop || "";
            return sl !== "Master Leads" && sl !== "Master";
        };

        // Filter leads by created_at date range
        const filteredByCreated = allLeads.filter((l: any) => {
            if (!fromDate || !toDate) return true;
            const d = new Date(l.created_at || 0);
            return isWithinRange(d, fromDate, toDate);
        });

        // --- Acquisition Chart ---
        const acquisitionMap: Record<string, number> = {};
        let startDate = fromDate ? new Date(fromDate) : subDays(new Date(), 7);
        let endDate = toDate ? new Date(toDate) : new Date();
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        while (current <= end) {
            const dateStr = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            acquisitionMap[dateStr] = 0;
            current.setDate(current.getDate() + 1);
        }
        filteredByCreated.forEach((lead: any) => {
            const date = new Date(lead.created_at || Date.now());
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (acquisitionMap[dateStr] !== undefined) acquisitionMap[dateStr]++;
        });
        const acquisitionChartData = Object.entries(acquisitionMap).map(([name, leads]) => ({ name, leads }));

        // --- Total normal leads ---
        const normalLeads = allLeads.filter((l: any) => isNormalLoop(l) && isWithinRange(new Date(l.created_at || 0), fromDate, toDate));
        const normalLeadsCount = normalLeads.length;

        // Oldest lead date
        let oldestLeadDate = "Real-time";
        if (normalLeads.length > 0) {
            const oldest = normalLeads.reduce((min: Date, lead: any) => {
                const d = new Date(lead.created_at);
                return d < min ? d : min;
            }, new Date(normalLeads[0].created_at));
            oldestLeadDate = `Since ${oldest.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }

        // --- Total Emails Sent ---
        let emailCount = 0;
        const emailDates: Date[] = [];
        allLeads.forEach((lead: any) => {
            const stages = lead.stages_passed || [];
            const stageData = lead.stage_data || {};
            stages.forEach((stage: string) => {
                if (stage.toLowerCase().trim().startsWith("email_")) {
                    const d = parseMsg(stageData[stage]).date || new Date(lead.updated_at || lead.created_at);
                    if (isWithinRange(d, fromDate, toDate)) {
                        emailCount++;
                        emailDates.push(d);
                    }
                }
            });
        });
        const oldestEmailDate = emailDates.length > 0
            ? `Since ${emailDates.reduce((min, d) => d < min ? d : min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : "Real-time";

        // --- Total WhatsApp Reachouts ---
        let whatsappReachouts = 0;
        const wpDates: Date[] = [];
        allLeads.forEach((lead: any) => {
            if (!isNormalLoop(lead)) return;
            const wp1Val = lead["W.P_1"];
            if (!wp1Val || wp1Val === "" || wp1Val === "No") return;
            const trimmed = String(wp1Val).trim();
            let reachoutDate: Date | null = null;
            const dObj = new Date(trimmed);
            if (!isNaN(dObj.getTime()) && (trimmed.includes('T') || (trimmed.includes('-') && trimmed.includes(':')))) {
                reachoutDate = dObj;
            } else {
                reachoutDate = parseMsg(trimmed).date;
            }
            if (!reachoutDate) {
                const wp1Ts = lead["W.P_1 TS"];
                reachoutDate = parseWPStamp(wp1Ts);
            }
            if (reachoutDate && isWithinRange(reachoutDate, fromDate, toDate)) {
                whatsappReachouts++;
                wpDates.push(reachoutDate);
            }
        });
        const oldestWPDate = wpDates.length > 0
            ? `Since ${wpDates.reduce((min, d) => d < min ? d : min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : "Real-time";

        // --- Total Replies ---
        let totalReplies = 0;
        const replyLeads: any[] = [];
        allLeads.forEach((lead: any) => {
            if (!isNormalLoop(lead)) return;
            const replyVal = lead["WP_Replied_track"];
            if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                const parsed = parseMsg(replyVal);
                let isRepliedInRange = false;
                if (parsed.date) {
                    if (isWithinRange(parsed.date, fromDate, toDate)) isRepliedInRange = true;
                } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                    if (isWithinRange(new Date(lead.created_at), fromDate, toDate)) isRepliedInRange = true;
                }
                if (isRepliedInRange) {
                    totalReplies++;
                    replyLeads.push(lead);
                }
            }
        });

        // --- Voice Calls ---
        const SEC_ASSISTANT = 'c552e5b3-6c41-41d2-83b4-7c820e0d14bb';
        const UNKNOWN_ASSISTANT = '3266ea3f-336e-436a-bd2a-63f196aab37f';
        const OWNERS_ASSISTANT = '682cf6ae-23fd-44f3-a4a3-756998cd62c1';
        let totalVoiceCalls = 0;
        let secondaryVoiceCalls = 0;
        let unknownVoiceCalls = 0;
        let ownerVoiceCalls = 0;
        let totalVoiceSeconds = 0;
        let secondaryVoiceSeconds = 0;
        let unknownVoiceSeconds = 0;
        let ownerVoiceSeconds = 0;
        allCalls.forEach((call: any) => {
            if (!isWithinRange(new Date(call.created_at || 0), fromDate, toDate)) return;
            if (call.source === 'vapi') {
                const aid = call.assistantId || '';
                const isSecondary = aid === SEC_ASSISTANT;
                const isUnknown = aid === UNKNOWN_ASSISTANT;
                const isOwner = aid === OWNERS_ASSISTANT;
                if (isSecondary) {
                    secondaryVoiceCalls++;
                    secondaryVoiceSeconds += calculateDuration(call);
                } else if (isUnknown) {
                    unknownVoiceCalls++;
                    unknownVoiceSeconds += calculateDuration(call);
                } else if (isOwner) {
                    ownerVoiceCalls++;
                    ownerVoiceSeconds += calculateDuration(call);
                } else {
                    totalVoiceCalls++;
                }
            }
            totalVoiceSeconds += calculateDuration(call);
        });
        // --- Owner Stats (from master_leads, filtered by created_at with fallback to Last Contacted) ---
        const masterLeadsFiltered = masterLeads.filter((o: any) => {
            const d = new Date(o.created_at || o["Last Contacted"] || 0);
            return isWithinRange(d, fromDate, toDate);
        });
        let totalOwnerLeads = masterLeadsFiltered.length;
        let ownerWhatsappReachouts = 0;
        let ownerTotalReplies = 0;
        let minOwnerWPDate: Date | null = null;
        masterLeads.forEach((o: any) => {
            const wp1 = o["Whatsapp 1"] || o["Whatsapp_1"];
            const wp2 = o["Whatsapp 2"] || o["Whatsapp_2"];
            const wp1Date = parseMsg(wp1).date;
            const wp2Date = parseMsg(wp2).date;
            if ((wp1Date && isWithinRange(wp1Date, fromDate, toDate)) || (wp2Date && isWithinRange(wp2Date, fromDate, toDate))) {
                ownerWhatsappReachouts++;
                const d = wp1Date || wp2Date;
                if (d && (!minOwnerWPDate || d < minOwnerWPDate)) minOwnerWPDate = d;
            }
            if (o.Replied && (String(o.Replied).toLowerCase() === 'yes' || String(o.Replied).toLowerCase() === 'replied')) {
                ownerTotalReplies++;
            }
        });
        const formatLabel = (d: Date | null) => d ? `Since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : "Real-time";
        const ownerLeadsSince = totalOwnerLeads > 0 ? "Real-time" : "Real-time";
        const ownerWhatsappSince = formatLabel(minOwnerWPDate);
        const ownerRepliesSince = ownerTotalReplies > 0 ? "Real-time" : "Real-time";

        const voiceMinutesString = formatDuration(totalVoiceSeconds);
        const secondaryVoiceDurationString = formatDuration(secondaryVoiceSeconds);
        const unknownVoiceDurationString = formatDuration(unknownVoiceSeconds);
        const ownerVoiceDurationString = formatDuration(ownerVoiceSeconds);

        const response = {
            normalLeadsCount,
            emailCount,
            whatsappReachouts,
            totalVoiceCalls,
            secondaryVoiceCalls,
            unknownVoiceCalls,
            ownerVoiceCalls,
            totalVoiceSeconds,
            voiceMinutesString,
            secondaryVoiceDurationString,
            unknownVoiceDurationString,
            ownerVoiceDurationString,
            totalReplies,
            totalOwnerLeads,
            ownerWhatsappReachouts,
            ownerTotalReplies,
            oldestLeadDate,
            oldestEmailDate,
            oldestWPDate,
            ownerLeadsSince,
            ownerWhatsappSince,
            ownerRepliesSince,
            acquisitionChartData,
            replyLeads,
            replyData: processReplyLeads(replyLeads)
        };

        return NextResponse.json(response, {
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
