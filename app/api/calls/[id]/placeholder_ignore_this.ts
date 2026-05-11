import { NextResponse } from 'next/server';

const VAPI_BASE_URL = 'https://api.vapi.ai';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    // Check if we are in a specific sub-route context
    // Ideally this file should be flexible or we replicate. 
    // Since Next.js App Router uses folder structure, we need separate files for [id]/transcript/route.ts etc.
    // OR we can use this one file for [id] and have other files for sub-paths.

    // Changing approach: The user requested specific endpoints:
    // GET /api/calls/:callId/transcript
    // GET /api/calls/:callId/recording
    // GET /api/calls/:callId/executions

    // I will Create separate files for these to be explicit and clean as per Next.js App Router standards.
    return NextResponse.json({ error: "Use specific endpoints" }, { status: 404 });
}
