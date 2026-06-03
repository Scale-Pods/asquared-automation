import { NextRequest, NextResponse } from 'next/server';

async function tryVapi(id: string, privateKey: string): Promise<any | null> {
    try {
        const res = await fetch(`https://api.vapi.ai/call/${id}`, {
            headers: { 'Authorization': `Bearer ${privateKey}` },
        });
        if (res.ok) return await res.json();
    } catch {}
    return null;
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const ownerKey  = process.env.VAPI_PRIVATE_KEY;
        const normalKey = process.env.VAPI_NORMAL_LEADS_PRIVATE_KEY;

        let data: any = null;
        for (const key of [ownerKey, normalKey].filter(Boolean) as string[]) {
            data = await tryVapi(id, key);
            if (data) break;
        }

        if (!data) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

        const transcript = Array.isArray(data.transcript)
            ? data.transcript
            : (data.messages || []);

        return NextResponse.json({ transcript });

    } catch (error) {
        console.error('Error fetching transcript:', error);
        return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
    }
}
