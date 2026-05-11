import { NextRequest, NextResponse } from 'next/server';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const { id } = await context.params;
        const conversationId = id;

        if (!apiKey) return NextResponse.json({ error: "Configuration error" }, { status: 500 });

        const response = await fetch(`${ELEVENLABS_BASE_URL}/convai/conversations/${conversationId}`, {
            headers: { 'xi-api-key': apiKey }
        });

        if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

        const data = await response.json();

        // ElevenLabs doesn't always provide a direct audio URL in the main object
        // If has_audio is true, we might need to point to a proxy or let the frontend know
        return NextResponse.json({
            recordingUrl: data.audio_url || (data.has_audio ? `/api/calls/${conversationId}/audio` : null)
        });

    } catch (error) {
        console.error("Error fetching recording info:", error);
        return NextResponse.json({ error: "Failed to fetch recording" }, { status: 500 });
    }
}
