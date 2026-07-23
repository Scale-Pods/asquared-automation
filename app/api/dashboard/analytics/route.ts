import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/server-parsers';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

function formatDuration(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

const formatLabel = (d: Date | null) => d ? `Since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : "Real-time";

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
        const [
            leadsRows,
            ownerMetrics,
            normalOverview,
            voiceStats,
            nurtureStats,
            nurtureUkStats,
            nurtureLeadsForSince,
            nurtureUkLeadsForSince,
            replyPreviews,
        ] = await Promise.all([
            // `leads` has a real created_at timestamp — narrowed to only the columns the
            // acquisition chart / count / oldest-date logic actually needs.
            fetchAllRows(baseUrl, headers, "leads", "created_at", from, to, undefined, "id,created_at"),
            callRpc('get_owner_metrics', { p_from: from || null, p_to: to || null }),
            callRpc('get_whatsapp_normal_overview', { p_from: from || null, p_to: to || null }),
            callRpc('get_voice_call_stats', { p_from: from || null, p_to: to || null }),
            callRpc('get_nurture_table_stats', { p_table: 'nurture_leads', p_from: from || null, p_to: to || null }),
            callRpc('get_nurture_table_stats', { p_table: 'nurture_leads_uk', p_from: from || null, p_to: to || null }),
            // Only created_at is needed for the "nurture since" subtitle label + count-in-range.
            fetchAllRows(baseUrl, headers, "nurture_leads", "created_at", from, to, undefined, "id,created_at"),
            fetchAllRows(baseUrl, headers, "nurture_leads_uk", "created_at", from, to, undefined, "id,created_at"),
            callRpc('get_whatsapp_reply_previews', { p_from: from || null, p_to: to || null, p_limit: 50 }),
        ]);

        // --- Acquisition Chart (based on leads.created_at, already server-filtered) ---
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        const acquisitionMap: Record<string, number> = {};
        const startDate = fromDate || new Date(Date.now() - 7 * 86400000);
        const endDate = toDate || new Date();
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

        const normalLeadsCount = leadsRows.length;
        const oldestLeadDate = leadsRows.length > 0
            ? formatLabel(leadsRows.reduce((min: Date, l: any) => { const d = new Date(l.created_at); return d < min ? d : min; }, new Date(leadsRows[0].created_at)))
            : "Real-time";

        const emailCount = 0;
        const oldestEmailDate = "Real-time";

        const whatsappReachouts = Object.values(normalOverview.tableReachouts as Record<string, number>).reduce((a, b) => a + b, 0);
        const wpIntro = normalOverview.tableReachouts?.intro || 0;
        const wpIntroUk = normalOverview.tableReachouts?.intro_uk || 0;
        const wpFollowUp = normalOverview.tableReachouts?.follow_up || 0;
        const wpFollowUpUk = normalOverview.tableReachouts?.follow_up_uk || 0;
        const wpNurture = nurtureStats.reachouts || 0;
        const wpNurtureUk = nurtureUkStats.reachouts || 0;

        const nurtureWpReachouts = wpNurture;
        const nurtureUkWpReachouts = wpNurtureUk;

        const wpSubtitle = `intro:${wpIntro} | intro_uk:${wpIntroUk} | follow_up:${wpFollowUp} | follow_up_uk:${wpFollowUpUk} | nurture:${wpNurture} | nurture_uk:${wpNurtureUk}`;

        const oldestWPDate = formatLabel(normalOverview.oldestReachoutAt ? new Date(normalOverview.oldestReachoutAt) : null);

        const totalReplies = (Object.values(normalOverview.tableReplies as Record<string, number>).reduce((a, b) => a + b, 0))
            + (nurtureStats.replies || 0) + (nurtureUkStats.replies || 0);

        const replyLeads: any[] = [];
        const replyData = replyPreviews.map((r: any) => {
            const content = extractPreviewContent(r.reply_content);
            const replyDate = r.reply_date ? new Date(r.reply_date) : new Date();
            return {
                id: `${r.source_table}-${r.id}-wp`,
                contactName: r.name || "Unknown",
                contactInfo: r.phone || "No info",
                mode: 'WhatsApp' as const,
                date: replyDate.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: replyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied' as const,
                preview: content.substring(0, 70) + (content.length > 70 ? "..." : ""),
                link: `/dashboard/whatsapp/chat?chat=${r.source_table}-${r.id}`,
            };
        });

        // --- Voice Calls (from RPC — real timestamps, true SQL aggregation) ---
        const totalVoiceCalls = voiceStats.normalCalls || 0;
        const secondaryVoiceCalls = voiceStats.secondaryCalls || 0;
        const unknownVoiceCalls = voiceStats.unknownCalls || 0;
        const ownerVoiceCalls = voiceStats.ownersCalls || 0;
        const totalVoiceSeconds = voiceStats.totalDuration || 0;
        const voiceMinutesString = formatDuration(totalVoiceSeconds);

        // --- Owner Stats ---
        const totalOwnerLeads = ownerMetrics.totalOwners;
        const ownerWhatsappReachouts = ownerMetrics.reachouts;
        const ownerTotalReplies = ownerMetrics.replies;
        const minOwnerWPDate = ownerMetrics.oldestContactedAt ? new Date(ownerMetrics.oldestContactedAt) : null;
        const ownerLeadsSince = formatLabel(minOwnerWPDate);
        const ownerWhatsappSince = formatLabel(minOwnerWPDate);
        const ownerRepliesSince = "Real-time";

        // --- Nurture "since" labels + count-in-range (created_at based, narrow fetch) ---
        const nurtureLeadsCount = nurtureLeadsForSince.length;
        const nurtureUkLeadsCount = nurtureUkLeadsForSince.length;
        const minNurtureDate = nurtureLeadsForSince.reduce((min: Date | null, l: any) => {
            const d = new Date(l.created_at || 0);
            return !min || d < min ? d : min;
        }, null as Date | null);
        const minNurtureUkDate = nurtureUkLeadsForSince.reduce((min: Date | null, l: any) => {
            const d = new Date(l.created_at || 0);
            return !min || d < min ? d : min;
        }, null as Date | null);
        const nurtureSince = formatLabel(minNurtureDate);
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
            secondaryVoiceDurationString: formatDuration(voiceStats.secondaryVoiceSeconds || 0),
            unknownVoiceDurationString: formatDuration(voiceStats.unknownVoiceSeconds || 0),
            ownerVoiceDurationString: formatDuration(voiceStats.ownerVoiceSeconds || 0),
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
            replyData,
            nurtureLeadsCount,
            nurtureWpReachouts,
            nurtureReplies: nurtureStats.replies || 0,
            nurtureSince,
            nurtureUkLeadsCount,
            nurtureUkWpReachouts,
            nurtureUkReplies: nurtureUkStats.replies || 0,
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

function extractPreviewContent(raw: string | null): string {
    if (!raw || !raw.trim()) return "Lead replied via WhatsApp";
    const content = raw.trim();
    const isoMatch = content.match(/\n\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.+)$/);
    if (isoMatch) return content.replace(isoMatch[0], '').trim() || "Lead replied via WhatsApp";
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (lines.length > 1 && lastLine.includes('-') && lastLine.includes(':') && !isNaN(new Date(lastLine.replace(' ', 'T')).getTime())) {
        return lines.slice(0, -1).join('\n').trim() || "Lead replied via WhatsApp";
    }
    return content;
}
