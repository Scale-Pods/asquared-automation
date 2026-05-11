import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        const headers: Record<string, string> = {
            'Accept': 'audio/*',
        };

        const range = request.headers.get('range');
        if (range) headers['Range'] = range;

        // Auth for providers
        if (url.includes('api.elevenlabs.io') && process.env.ELEVENLABS_API_KEY) headers['xi-api-key'] = process.env.ELEVENLABS_API_KEY;
        if (url.includes('api.vapi.ai') && process.env.VAPI_PRIVATE_KEY) headers['Authorization'] = `Bearer ${process.env.VAPI_PRIVATE_KEY}`;

        const response = await fetch(url, { headers, redirect: 'follow' });

        if (!response.ok && response.status !== 206) {
            console.error('[AudioProxy] Source fetch failed:', { status: response.status, url });
            return new NextResponse('Source fetch failed', { status: response.status });
        }

        const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
        const contentLength = response.headers.get('Content-Length');
        const contentRange = response.headers.get('Content-Range');

        return new NextResponse(response.body, {
            status: response.status === 206 ? 206 : 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': contentLength || '',
                'Content-Range': contentRange || '',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        console.error('[AudioProxy] Internal error:', error);
        return new NextResponse('Proxy server error', { status: 500 });
    }
}
