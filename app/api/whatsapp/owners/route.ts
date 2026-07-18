import { NextResponse } from 'next/server';
import { startOfDay, endOfDay } from 'date-fns';
import { fetchAllRows } from '@/lib/server-parsers';
import { computeOwnerMetrics, getOwnerName, getOwnerPhone, getOwnerLastContactedDate, ownerHasReplied, getOwnerMessagesSentCount, getOwnerMessageStatuses, getWhatsappEligibleOwners, OWNER_LIST_COLUMNS } from '@/lib/master-leads-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const replyStatus = searchParams.get('replyStatus') || 'all'; // all | replied | waiting
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

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
        // whatsapp_last_contacted is TEXT, so date filtering happens in-memory after fetch —
        // same pattern as intro/follow_up (server-side filter is only applied for real timestamp columns).
        // Only fetch the columns actually needed for list rows + metrics — master_leads has 60+
        // columns (10 rounds of free-text replies/follow-ups) and select=* was the main cause
        // of slow owners-tab loads.
        const owners = await fetchAllRows(baseUrl, headers, "master_leads", null, null, null, undefined, OWNER_LIST_COLUMNS);

        const fromDate = from ? startOfDay(new Date(from)) : null;
        const toDate = to ? endOfDay(new Date(to)) : null;

        const metrics = computeOwnerMetrics(owners, fromDate, toDate);

        // Only WhatsApp-eligible owners (real bot-side activity) within the selected
        // whatsapp_last_contacted range — never the raw, unfiltered master_leads table.
        let filtered = getWhatsappEligibleOwners(owners, fromDate, toDate);

        if (search) {
            const digits = search.replace(/\D/g, '');
            filtered = filtered.filter((o: any) => {
                const name = getOwnerName(o).toLowerCase();
                const phone = getOwnerPhone(o).toString();
                const phoneDigits = phone.replace(/\D/g, '');
                return name.includes(search) || (digits && phoneDigits.includes(digits));
            });
        }
        if (replyStatus === 'replied') {
            filtered = filtered.filter((o: any) => ownerHasReplied(o));
        } else if (replyStatus === 'waiting') {
            filtered = filtered.filter((o: any) => !ownerHasReplied(o));
        }

        filtered = [...filtered].sort((a: any, b: any) => {
            const da = getOwnerLastContactedDate(a)?.getTime() || 0;
            const db = getOwnerLastContactedDate(b)?.getTime() || 0;
            return db - da;
        });

        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const pageRows = filtered.slice(start, start + pageSize).map((o: any) => ({
            id: o.master_leads_id,
            name: getOwnerName(o),
            phone: getOwnerPhone(o),
            location: o["Location"] || null,
            projectName: o["Project Name"] || null,
            unitNumber: o["Unit Number"] || null,
            propertyType: o["Property Type"] || null,
            replied: ownerHasReplied(o),
            sentiment: o["wa_sentiment"] || null,
            lastContacted: getOwnerLastContactedDate(o)?.toISOString() || null,
            voiceCallStatus: o["voice_call_status"] || null,
            note: o["note"] || null,
            sentCount: getOwnerMessagesSentCount(o),
            messageStatuses: getOwnerMessageStatuses(o),
        }));

        return NextResponse.json({
            owners: pageRows,
            total,
            page,
            pageSize,
            metrics,
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
