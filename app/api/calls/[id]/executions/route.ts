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

        // ElevenLabs mentions tool calls in the transcript with specific roles
        const executions = (data.transcript || []).filter((m: any) =>
            m.role === 'tool' || m.role === 'function' || m.type === 'tool_call'
        );

        return NextResponse.json({ executions });

    } catch (error) {
        console.error("Error fetching executions from ElevenLabs:", error);
        return NextResponse.json({ error: "Failed to fetch executions" }, { status: 500 });
    }
}
