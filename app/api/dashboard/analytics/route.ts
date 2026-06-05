import { NextResponse } from 'next/server';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { processReplyLeads, fetchAllRows } from '@/lib/server-parsers';

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


function calculateDuration(call: any): number {
    return call.duration_seconds || call.durationSeconds || 0;
}

function formatDuration(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
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

        const [
            leadsRows,
            masterLeads,
            introRows,
            introUkRows,
            followUpRows,
            followUpUkRows,
            allCallsRaw,
            allCallsNf,
            nurtureLeadsRows,
            nurtureLeadsUkRows,
        ] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", "created_at", from, to),
            fetchAllRows(baseUrl, headers, "master_leads", "created_at", from, to),
            fetchAllRows(baseUrl, headers, "intro", null, from, to),
            fetchAllRows(baseUrl, headers, "intro_uk", null, from, to),
            fetchAllRows(baseUrl, headers, "follow_up", null, from, to),
            fetchAllRows(baseUrl, headers, "follow_up_uk", null, from, to),
            fetchAllRows(baseUrl, headers, "vapi_call_logs", "created_at", from, to),
            fetchAllRows(baseUrl, headers, "vapi_call_logs_nf", "created_at", from, to),
            fetchAllRows(baseUrl, headers, "nurture_leads", null, from, to),
            fetchAllRows(baseUrl, headers, "nurture_leads_uk", null, from, to),
        ]);

        const allCalls = [...allCallsRaw, ...allCallsNf];

        // Normal contact tables (intro/follow_up variants) — no server-side date filter
        const normalContactRows = [...introRows, ...introUkRows, ...followUpRows, ...followUpUkRows];

        // --- Acquisition Chart (based on leads.created_at, already server-filtered) ---
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
        leadsRows.forEach((lead: any) => {
            const date = new Date(lead.created_at || Date.now());
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (acquisitionMap[dateStr] !== undefined) acquisitionMap[dateStr]++;
        });
        const acquisitionChartData = Object.entries(acquisitionMap).map(([name, leads]) => ({ name, leads }));

        // --- Total Leads: count of leads table rows (already server-filtered by created_at) ---
        const normalLeadsCount = leadsRows.length;

        const oldestLeadDate = leadsRows.length > 0
            ? `Since ${leadsRows.reduce((min: Date, l: any) => { const d = new Date(l.created_at); return d < min ? d : min; }, new Date(leadsRows[0].created_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : "Real-time";

        // --- Total Emails Sent (from intro/follow_up contact rows) ---
        let emailCount = 0;
        const emailDates: Date[] = [];
        normalContactRows.forEach((lead: any) => {
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

        // Parses nurture TS strings like "READ at Jun 02 2026, 08:05 PM"
        const parseNurtureTS = (raw: any): Date | null => {
            if (!raw) return null;
            const s = String(raw).trim();
            // ISO timestamp (e.g. from timestamptz column direct value)
            const iso = new Date(s);
            if (!isNaN(iso.getTime())) return iso;
            // "READ at Jun 02 2026, 08:05 PM" — strip leading word+at
            const m = s.match(/at\s+([A-Za-z]+\s+\d{1,2}\s+\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)/i);
            if (m) { const d = new Date(m[1].replace(',', '')); if (!isNaN(d.getTime())) return d; }
            return null;
        };

        // Resolve reachout date for normal contact rows:
        // 1. ISO date embedded in W.P_1 content  2. W.P_1 TS stamp ("Read - DD/MM/YYYY")  3. created_at
        const resolveNormalWPDate = (lead: any): Date | null => {
            const wp1Val = lead["W.P_1"];
            if (!wp1Val || wp1Val === "" || String(wp1Val).toLowerCase() === "no") return null;
            return (
                parseMsg(wp1Val).date ||
                parseWPStamp(lead["W.P_1 TS"]) ||
                (lead.created_at ? new Date(lead.created_at) : null)
            );
        };

        // Per-table reachout counts for detailed subtitle
        let wpIntro = 0, wpIntroUk = 0, wpFollowUp = 0, wpFollowUpUk = 0;
        introRows.forEach((l: any)     => { const d = resolveNormalWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpIntro++; });
        introUkRows.forEach((l: any)   => { const d = resolveNormalWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpIntroUk++; });
        followUpRows.forEach((l: any)  => { const d = resolveNormalWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpFollowUp++; });
        followUpUkRows.forEach((l: any)=> { const d = resolveNormalWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpFollowUpUk++; });

        const NURTURE_WP1_PAIRS = [
            ['week1_wp_1', 'week1_wp_1_ts'],
            ['week2_wp_1', 'week2_wp_1_ts'],
            ['week3_wp_1', 'week3_wp_1_ts'],
        ] as const;

        // Resolve reachout date for nurture rows:
        // 1. _ts column (ISO or "READ at ...") 2. created_at
        const resolveNurtureWPDate = (l: any): Date | null => {
            for (const [wpCol, tsCol] of NURTURE_WP1_PAIRS) {
                if (!l[wpCol] || String(l[wpCol]).trim() === '') continue;
                const d = parseNurtureTS(l[tsCol]) || (l.created_at ? new Date(l.created_at) : null);
                if (d && !isNaN(d.getTime())) return d;
            }
            return null;
        };

        let wpNurture = 0, wpNurtureUk = 0;
        nurtureLeadsRows.forEach((l: any)   => { const d = resolveNurtureWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpNurture++; });
        nurtureLeadsUkRows.forEach((l: any) => { const d = resolveNurtureWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) wpNurtureUk++; });

        const whatsappReachouts = wpIntro + wpIntroUk + wpFollowUp + wpFollowUpUk;
        const nurtureWpReachouts = wpNurture;
        const nurtureUkWpReachouts = wpNurtureUk;

        // Subtitle: "intro:X | intro_uk:Y | follow_up:Z | follow_up_uk:W | nurture:A | nurture_uk:B"
        const wpSubtitle = `intro:${wpIntro} | intro_uk:${wpIntroUk} | follow_up:${wpFollowUp} | follow_up_uk:${wpFollowUpUk} | nurture:${wpNurture} | nurture_uk:${wpNurtureUk}`;

        const allWpDates: Date[] = [];
        normalContactRows.forEach((l: any) => { const d = resolveNormalWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) allWpDates.push(d); });
        [...nurtureLeadsRows, ...nurtureLeadsUkRows].forEach((l: any) => { const d = resolveNurtureWPDate(l); if (d && isWithinRange(d, fromDate, toDate)) allWpDates.push(d); });

        const oldestWPDate = allWpDates.length > 0
            ? `Since ${allWpDates.reduce((min, d) => d < min ? d : min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : "Real-time";

        // --- Total Replies (including nurture contact rows, date-filtered by WP_Replied_track) ---
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
                mapped["WP_Replied_track"] = l.WP_Replied_track || l.wp_replied_track || '';
                mapped["WP_last_contacted"] = l.wp_last_contacted || l.WP_last_contacted || l.last_contacted || l["Last Contacted"] || '';
                mapped.replied = l.Replied || l.replied || '';
                return mapped;
            });

        const normNurture   = normalizeNurture(nurtureLeadsRows,   'Nurture');
        const normNurtureUk = normalizeNurture(nurtureLeadsUkRows, 'Nurture UK');

        const allContactRows = [...normalContactRows, ...normNurture, ...normNurtureUk];

        let totalReplies = 0;
        const replyLeads: any[] = [];
        allContactRows.forEach((lead: any) => {
            const replyVal = lead["WP_Replied_track"];
            if (!replyVal || replyVal === "" || String(replyVal).toLowerCase() === "no") return;
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
            totalVoiceSeconds += calculateDuration(call);
        });
        // --- Owner Stats (master_leads already server-filtered by created_at) ---
        let totalOwnerLeads = masterLeads.length;
        let ownerWhatsappReachouts = 0;
        let ownerTotalReplies = 0;
        let minOwnerWPDate: Date | null = null;
        let minOwnerLeadDate: Date | null = null;
        masterLeads.forEach((o: any) => {
            const createdAt = new Date(o.created_at || 0);
            if (!minOwnerLeadDate || createdAt < minOwnerLeadDate) minOwnerLeadDate = createdAt;
            const wp1 = o["Whatsapp 1"] || o["Whatsapp_1"];
            const wp2 = o["Whatsapp 2"] || o["Whatsapp_2"];
            const wp1Date = parseMsg(wp1).date;
            const wp2Date = parseMsg(wp2).date;
            if (wp1Date || wp2Date) {
                ownerWhatsappReachouts++;
                const d = wp1Date || wp2Date;
                if (d && (!minOwnerWPDate || d < minOwnerWPDate)) minOwnerWPDate = d;
            }
            if (o.Replied && (String(o.Replied).toLowerCase() === 'yes' || String(o.Replied).toLowerCase() === 'replied')) {
                ownerTotalReplies++;
            }
        });
        const formatLabel = (d: Date | null) => d ? `Since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : "Real-time";
        const ownerLeadsSince = formatLabel(minOwnerLeadDate);
        const ownerWhatsappSince = formatLabel(minOwnerWPDate);
        const ownerRepliesSince = ownerTotalReplies > 0 ? "Real-time" : "Real-time";

        const voiceMinutesString = formatDuration(totalVoiceSeconds);
        const secondaryVoiceDurationString = formatDuration(secondaryVoiceSeconds);
        const unknownVoiceDurationString = formatDuration(unknownVoiceSeconds);
        const ownerVoiceDurationString = formatDuration(ownerVoiceSeconds);

        // --- Nurture Leads stats (WP reachouts already computed above) ---
        const nurtureLeadsCount = nurtureLeadsRows.filter((l: any) =>
            isWithinRange(l.created_at ? new Date(l.created_at) : null, fromDate, toDate)
        ).length;

        const getNurtureReplyDate = (l: any): Date | null => {
            const rTrack = l.wp_replied_track;
            if (!rTrack || String(rTrack).trim() === '' || String(rTrack).toLowerCase() === 'no') return null;
            const d = new Date(rTrack);
            if (!isNaN(d.getTime())) return d;
            const parsed = parseMsg(rTrack);
            if (parsed.date) return parsed.date;
            return null;
        };

        const nurtureReplies = nurtureLeadsRows.filter((l: any) => {
            const rd = getNurtureReplyDate(l);
            return rd && isWithinRange(rd, fromDate, toDate);
        }).length;

        const nurtureUkLeadsCount = nurtureLeadsUkRows.filter((l: any) =>
            isWithinRange(l.created_at ? new Date(l.created_at) : null, fromDate, toDate)
        ).length;

        const nurtureUkReplies = nurtureLeadsUkRows.filter((l: any) => {
            const rd = getNurtureReplyDate(l);
            return rd && isWithinRange(rd, fromDate, toDate);
        }).length;

        const minNurtureDate = nurtureLeadsRows.reduce((min: Date | null, l: any) => {
            const d = new Date(l.created_at || 0);
            return !min || d < min ? d : min;
        }, null as Date | null);
        const minNurtureUkDate = nurtureLeadsUkRows.reduce((min: Date | null, l: any) => {
            const d = new Date(l.created_at || 0);
            return !min || d < min ? d : min;
        }, null as Date | null);

        const nurtureSince   = formatLabel(minNurtureDate);
        const nurtureUkSince = formatLabel(minNurtureUkDate);

        const response = {
            normalLeadsCount,
            emailCount,
            whatsappReachouts,
            wpSubtitle,
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
            replyData: processReplyLeads(replyLeads),
            nurtureLeadsCount,
            nurtureWpReachouts,
            nurtureReplies,
            nurtureSince,
            nurtureUkLeadsCount,
            nurtureUkWpReachouts,
            nurtureUkReplies,
            nurtureUkSince,
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
