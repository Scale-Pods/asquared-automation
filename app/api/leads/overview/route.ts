import { NextResponse } from 'next/server';
import { consolidateLeads } from '@/lib/leads-utils';
import { fetchAllRows } from '@/lib/server-parsers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all';
    const loop = searchParams.get('loop') || 'all';
    const status = searchParams.get('status') || 'all';
    const region = searchParams.get('region') || 'all';
    const channel = searchParams.get('channel') || 'all';
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    const pageSize = Math.min(1000, Math.max(1, parseInt(pageSizeParam || "10", 10) || 10));

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

    const isUSALead = (phone: string) => {
        if (!phone) return false;
        const clean = phone.replace(/\D/g, '');
        return (clean.length === 10) || (clean.length === 11 && clean.startsWith('1'));
    };

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const isWithinCreatedRange = (d: Date | null) => {
        if (!fromDate || !toDate) return true;
        if (!d) return false;
        return d >= fromDate && d <= toDate;
    };

    try {
        const [leadsResult, masterLeadsResult, introResult, introUkResult, followUpResult, followUpUkResult] = await Promise.all([
            fetchAllRows(baseUrl, headers, "leads", "last_outreach_at", from, to),
            fetchAllRows(baseUrl, headers, "master_leads", "last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "intro", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "intro_uk", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up", "WP_last_contacted", from, to),
            fetchAllRows(baseUrl, headers, "follow_up_uk", "WP_last_contacted", from, to)
        ]);

        const rawResponse: Record<string, any> = {
            intro: introResult,
            intro_uk: introUkResult,
            follow_up: followUpResult,
            follow_up_uk: followUpUkResult,
            master_leads: masterLeadsResult,
            leads: leadsResult
        };

        let allLeads = consolidateLeads(rawResponse);

        const results = allLeads.filter(lead => {
            const isMaster = lead.source_table === "master_leads";
            const isLeads = lead.source_table?.startsWith("leads");

            if (type === 'normal') {
                if (!isLeads) return false;
            } else if (type === 'owners') {
                if (!isMaster) return false;
            } else {
                if (!isMaster && !isLeads) return false;
            }

            const dateCol = lead.WP_last_contacted || lead.last_outreach_at || lead.last_contacted || lead.created_at;
            const d = new Date(dateCol || 0);
            if (!isWithinCreatedRange(d)) return false;

            if (search) {
                const q = search.toLowerCase();
                const matchesName = lead.name?.toLowerCase().includes(q);
                const matchesEmail = lead.email?.toLowerCase().includes(q);
                const matchesPhone = lead.phone?.toLowerCase().includes(q);
                if (!matchesName && !matchesEmail && !matchesPhone) return false;
            }

            if (loop !== 'all') {
                const src = (lead.source_loop || '').toLowerCase();
                const matches = (loop === 'intro' && src === 'intro') ||
                    (loop === 'followup' && (src === 'follow up' || src.includes('follow'))) ||
                    (loop === 'master' && src === 'master leads') ||
                    (loop === 'nurture' && src === 'nurture');
                if (!matches) return false;
            }

            if (status !== 'all') {
                const isReplied = (lead.replied === "Yes" || (lead.email_replied && lead.email_replied !== "No") || (lead.whatsapp_replied && lead.whatsapp_replied !== "No"));
                if (status === 'replied' && !isReplied) return false;
                if (status === 'sent' && isReplied) return false;
            }

            if (region !== 'all') {
                const isUSA = isUSALead(lead.phone);
                if (region === 'usa' && !isUSA) return false;
                if (region === 'global' && isUSA) return false;
            }

            if (channel !== 'all') {
                const hasEmail = lead.email && lead.email !== "No Email";
                const hasWP = !!lead.phone;
                if (channel === 'email' && !hasEmail) return false;
                if (channel === 'whatsapp' && !hasWP) return false;
            }

            return true;
        });

        const total = results.length;
        const paginated = results.slice((page - 1) * pageSize, page * pageSize);

        return NextResponse.json({ leads: paginated, total, page, pageSize }, {
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
