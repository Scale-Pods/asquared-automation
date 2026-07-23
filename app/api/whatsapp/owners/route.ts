import { NextResponse } from 'next/server';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = (searchParams.get('search') || '').trim();
    const replyStatus = searchParams.get('replyStatus') || 'all'; // all | replied | waiting
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10) || 10));

    try {
        const [rows, metrics] = await Promise.all([
            callRpc<any[]>('get_owner_list', {
                p_from: from || null,
                p_to: to || null,
                p_search: search || null,
                p_reply_status: replyStatus,
                p_page: page,
                p_page_size: pageSize,
            }),
            callRpc('get_owner_metrics', { p_from: from || null, p_to: to || null }),
        ]);

        const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

        const owners = rows.map((o: any) => ({
            id: o.id,
            name: o.name,
            phone: o.phone,
            location: o.location,
            projectName: o.project_name,
            unitNumber: o.unit_number,
            propertyType: o.property_type,
            replied: o.replied,
            sentiment: o.sentiment,
            lastContacted: o.last_contacted,
            voiceCallStatus: o.voice_call_status,
            note: o.note,
            sentCount: o.sent_count,
            messageStatuses: o.message_statuses || [],
        }));

        return NextResponse.json({
            owners,
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
