import { NextRequest, NextResponse } from 'next/server';

// ─── CRITICAL for Vercel ─────────────────────────────────────────────────────
// Serverless (Lambda) functions on Vercel buffer the entire response body before
// sending anything. For a multi-minute audio file, that means the user waits the
// full download time before a single byte reaches their browser.
//
// Edge Runtime runs at the CDN edge node closest to the user, has ZERO cold-start
// time, and truly streams bytes as they arrive from ElevenLabs — so the browser
// can start playing almost immediately.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const elApiKey = process.env.ELEVENLABS_API_KEY;
        const vapiPrivKey = process.env.VAPI_PRIVATE_KEY;
        const { id } = await context.params;

        // 1. Try Vapi First (since IDs are distinct)
        if (vapiPrivKey) {
            console.log(`[AudioProxy] Attempting Vapi lookup for: ${id}`);
            const vapiRes = await fetch(`https://api.vapi.ai/call/${id}`, {
                headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
            });

            if (vapiRes.ok) {
                const callData = await vapiRes.json();
                const recordingUrl = callData.recordingUrl;
                if (recordingUrl) {
                    console.log(`[AudioProxy] Found Vapi Recording URL for ${id}: ${recordingUrl.substring(0, 40)}...`);
                    const audioRes = await fetch(recordingUrl, {
                        headers: {
                            ...(request.headers.get('Range') ? { 'Range': request.headers.get('Range')! } : {}),
                        }
                    });
                    if (audioRes.ok || audioRes.status === 206) {
                        const contentType = audioRes.headers.get('Content-Type');
                        const finalContentType = (contentType && contentType.includes('audio')) ? contentType : 'audio/mpeg';

                        console.log(`[AudioProxy] Streaming Vapi Audio: ${id}, Status: ${audioRes.status}, Type: ${finalContentType}`);
                        return new NextResponse(audioRes.body, {
                            status: audioRes.status,
                            headers: {
                                'Content-Type': finalContentType,
                                'Content-Length': audioRes.headers.get('Content-Length') || '',
                                'Accept-Ranges': 'bytes',
                                'Cache-Control': 'public, max-age=3600',
                                'Content-Disposition': `inline; filename="vapi-call-${id}.mp3"`,
                            },
                        });
                    } else {
                        console.warn(`[AudioProxy] Vapi Stream failure for ${id}: ${audioRes.status}`);
                    }
                } else {
                    console.warn(`[AudioProxy] Vapi call found but no recordingUrl: ${id}`);
                }
            } else {
                console.log(`[AudioProxy] Vapi lookup failed (${vapiRes.status}) for ${id}`);
            }
        }

        // 2. Fallback to ElevenLabs
        if (!elApiKey) return NextResponse.json({ error: "Configuration error" }, { status: 500 });

        const upstream = await fetch(`${ELEVENLABS_BASE_URL}/convai/conversations/${id}/audio`, {
            headers: {
                'xi-api-key': elApiKey,
                ...(request.headers.get('Range') ? { 'Range': request.headers.get('Range')! } : {}),
            }
        });

        if (!upstream.ok && upstream.status !== 206) {
            // Log for debugging since we're hitting 404s
            console.warn(`[AudioProxy] ElevenLabs returned ${upstream.status} for ${id}`);
            return NextResponse.json({ error: "Audio not found" }, { status: upstream.status });
        }

        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
                'Content-Length': upstream.headers.get('Content-Length') || '',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
                'Content-Disposition': `inline; filename="call-${id}.mp3"`,
            },
        });

    } catch (error) {
        console.error("Error proxying audio:", error);
        return NextResponse.json({ error: "Failed to fetch audio" }, { status: 500 });
    }
}
