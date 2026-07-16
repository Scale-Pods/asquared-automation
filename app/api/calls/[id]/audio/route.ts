import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const rangeHeader = request.headers.get('Range');

        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
        const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

        if (!supabaseUrl || !secretKey) {
            return NextResponse.json({ error: 'Config missing' }, { status: 500 });
        }

        const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
        const h = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };

        let recordingUrl: string | null = null;
        for (const table of ['vapi_call_logs_nf', 'vapi_call_logs']) {
            const res = await fetch(`${base}/${table}?id=eq.${id}&select=recording_url`, { headers: h });
            if (res.ok) {
                const data = await res.json();
                if (data?.[0]?.recording_url) {
                    recordingUrl = data[0].recording_url;
                    break;
                }
            }
        }

        if (!recordingUrl) {
            return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
        }

        const res = await fetch(recordingUrl, {
            headers: rangeHeader ? { 'Range': rangeHeader } : {},
            redirect: 'follow',
        });

        if (!res.ok && res.status !== 206) {
            return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
        }

        const contentType = res.headers.get('Content-Type') || 'audio/mpeg';
        return new NextResponse(res.body, {
            status: res.status,
            headers: {
                'Content-Type': contentType.includes('audio') ? contentType : 'audio/mpeg',
                'Content-Length': res.headers.get('Content-Length') || '',
                'Content-Range': res.headers.get('Content-Range') || '',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
                'Content-Disposition': `inline; filename="vapi-call-${id}.mp3"`,
            },
        });

    } catch (error) {
        console.error('[AudioRoute] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch audio' }, { status: 500 });
    }
}
