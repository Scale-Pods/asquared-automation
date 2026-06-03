import { NextRequest, NextResponse } from 'next/server';

const VAPI_STORAGE = /(?:storage|calllogs)\.vapi\.ai/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function tryMonoRecording(callId: string, privateKey: string, rangeHeader: string | null): Promise<NextResponse | null> {
    try {
        const res = await fetch(`https://api.vapi.ai/call/${callId}/mono-recording`, {
            headers: {
                'Authorization': `Bearer ${privateKey}`,
                ...(rangeHeader ? { 'Range': rangeHeader } : {}),
            },
            redirect: 'follow',
        });
        if (res.ok || res.status === 206) {
            const ct = res.headers.get('Content-Type') || 'audio/mpeg';
            return new NextResponse(res.body, {
                status: res.status,
                headers: {
                    'Content-Type': ct.includes('audio') ? ct : 'audio/mpeg',
                    'Content-Length': res.headers.get('Content-Length') || '',
                    'Content-Range': res.headers.get('Content-Range') || '',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-store',
                },
            });
        }
    } catch {}
    return null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) return new NextResponse('Missing URL', { status: 400 });

    const rangeHeader = request.headers.get('range');
    const ownerKey    = process.env.VAPI_PRIVATE_KEY;
    const normalKey   = process.env.VAPI_NORMAL_LEADS_PRIVATE_KEY;

    try {
        // ── Vapi storage URLs or direct api.vapi.ai URLs ─────────────────────────
        if (VAPI_STORAGE.test(url) || url.includes('api.vapi.ai')) {
            const uuidMatch = url.match(UUID_RE);
            if (uuidMatch) {
                const callId = uuidMatch[0];
                // Try owner account, then normal leads account
                for (const key of [ownerKey, normalKey].filter(Boolean) as string[]) {
                    const res = await tryMonoRecording(callId, key, rangeHeader);
                    if (res) return res;
                }
            }
            // No UUID found or both accounts returned non-200 — nothing we can do
            return new NextResponse('Audio not available', { status: 404 });
        }

        // ── All other URLs (signed URLs, CDN, etc.) ───────────────────────────────
        const headers: Record<string, string> = { 'Accept': 'audio/*' };
        if (rangeHeader) headers['Range'] = rangeHeader;

        const response = await fetch(url, { headers, redirect: 'follow' });

        if (!response.ok && response.status !== 206) {
            console.error('[AudioProxy] Source fetch failed:', { status: response.status, url });
            return new NextResponse('Source fetch failed', { status: response.status });
        }

        const ct = response.headers.get('Content-Type') || 'audio/mpeg';
        return new NextResponse(response.body, {
            status: response.status === 206 ? 206 : 200,
            headers: {
                'Content-Type': ct,
                'Content-Length': response.headers.get('Content-Length') || '',
                'Content-Range': response.headers.get('Content-Range') || '',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
            },
        });

    } catch (error) {
        console.error('[AudioProxy] Internal error:', error);
        return new NextResponse('Proxy server error', { status: 500 });
    }
}
