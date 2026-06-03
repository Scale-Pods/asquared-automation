import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Try fetching mono-recording from a Vapi account using its private key.
// Returns the streaming response or null if not found.
async function tryVapiAudio(id: string, privateKey: string, rangeHeader: string | null): Promise<NextResponse | null> {
    try {
        const res = await fetch(`https://api.vapi.ai/call/${id}/mono-recording`, {
            headers: {
                'Authorization': `Bearer ${privateKey}`,
                ...(rangeHeader ? { 'Range': rangeHeader } : {}),
            },
            redirect: 'follow',
        });

        if (res.ok || res.status === 206) {
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
        }
    } catch {}
    return null;
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const rangeHeader = request.headers.get('Range');

        const ownerKey = process.env.VAPI_PRIVATE_KEY;
        const normalKey = process.env.VAPI_NORMAL_LEADS_PRIVATE_KEY;

        // Try owner account first, then normal leads account
        if (ownerKey) {
            const res = await tryVapiAudio(id, ownerKey, rangeHeader);
            if (res) return res;
        }

        if (normalKey) {
            const res = await tryVapiAudio(id, normalKey, rangeHeader);
            if (res) return res;
        }

        return NextResponse.json({ error: 'Audio not found' }, { status: 404 });

    } catch (error) {
        console.error('[AudioRoute] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch audio' }, { status: 500 });
    }
}
