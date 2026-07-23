import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/server-parsers';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

const NURTURE_TABLES = ['nurture_leads', 'nurture_leads_uk'] as const;

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
        const [normalOverview, ownerMetrics, nurtureStats, nurtureUkStats, leadsRows, replyPreviews] = await Promise.all([
            callRpc('get_whatsapp_normal_overview', { p_from: from || null, p_to: to || null }),
            callRpc('get_owner_metrics', { p_from: from || null, p_to: to || null }),
            callRpc('get_nurture_table_stats', { p_table: 'nurture_leads', p_from: from || null, p_to: to || null }),
            callRpc('get_nurture_table_stats', { p_table: 'nurture_leads_uk', p_from: from || null, p_to: to || null }),
            // `leads` table has a real last_outreach_at timestamp; kept as a narrow-column
            // count-only fetch since it's cheap and not yet part of the shared RPC surface.
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to, undefined, "id,response_received"),
            callRpc('get_whatsapp_reply_previews', { p_from: from || null, p_to: to || null, p_limit: 50 }),
        ]);

        const tableReachouts: Record<string, number> = { ...normalOverview.tableReachouts };
        const tableReplies: Record<string, number> = { ...normalOverview.tableReplies };
        const tableMsgsSent: Record<string, number> = { ...normalOverview.tableMsgsSent };

        NURTURE_TABLES.forEach((tbl, i) => {
            const s = i === 0 ? nurtureStats : nurtureUkStats;
            tableReachouts[tbl] = s.reachouts || 0;
            tableReplies[tbl] = s.replies || 0;
            tableMsgsSent[tbl] = s.msgsSent || 0;
        });

        const totalReachouts = Object.values(tableReachouts).reduce((a, b) => a + b, 0);
        const totalRepliesAll = Object.values(tableReplies).reduce((a, b) => a + b, 0);
        const totalMsgsSentAll = Object.values(tableMsgsSent).reduce((a, b) => a + b, 0);

        const leadsRepliedCount = leadsRows.filter((l: any) => l.response_received).length;

        const stats = {
            totalLeads: totalReachouts,
            contactedLeads: totalMsgsSentAll,
            totalReplies: totalRepliesAll + leadsRepliedCount,
            replied: totalRepliesAll + leadsRepliedCount,
            waiting: normalOverview.waiting || 0,
            nurture: (nurtureStats.reachouts || 0) + (nurtureUkStats.reachouts || 0),
            unresponsive: (normalOverview.totalReachouts || 0) - (normalOverview.uniqueContacted || 0),
        };

        const donutData = [
            { name: 'Total Leads', value: totalReachouts, color: '#8b5cf6' },
            { name: 'Messages Sent', value: totalMsgsSentAll, color: '#3b82f6' },
            { name: 'Total Replies', value: stats.totalReplies, color: '#10b981' },
        ];

        const ownerStats = { reachouts: ownerMetrics.reachouts, replies: ownerMetrics.replies, msgsSent: ownerMetrics.msgsSent };

        const replyData = replyPreviews.map((r: any) => {
            const parsed = extractPreviewContent(r.reply_content);
            const replyDate = r.reply_date ? new Date(r.reply_date) : new Date();
            return {
                id: `${r.source_table}-${r.id}-wp`,
                contactName: r.name || "Unknown",
                contactInfo: r.phone || "No info",
                mode: 'WhatsApp' as const,
                date: replyDate.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: replyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied' as const,
                preview: parsed.substring(0, 70) + (parsed.length > 70 ? "..." : ""),
                link: `/dashboard/whatsapp/chat?chat=${r.source_table}-${r.id}`,
            };
        });

        return NextResponse.json({
            stats,
            ownerStats,
            tableReachouts,
            tableReplies,
            tableMsgsSent,
            donutData,
            trendData: normalOverview.trend || [],
            repliedLeads: [],
            replyData,
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

// Strips a trailing embedded date the same way lib/server-parsers.ts's parseMsg does,
// so preview text shown in "Recent Replies" never includes the raw timestamp.
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
