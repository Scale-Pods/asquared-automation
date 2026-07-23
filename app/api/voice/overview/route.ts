import { NextResponse } from 'next/server';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    try {
        const stats = await callRpc('get_voice_call_stats', {
            p_from: from || null,
            p_to: to || null,
        });

        let balance = null;
        const vapiPrivKey = process.env.VAPI_PRIVATE_KEY;
        if (vapiPrivKey) {
            try {
                const vapiRes = await fetch('https://api.vapi.ai/org', {
                    headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
                });
                if (vapiRes.ok) {
                    let raw = await vapiRes.json();
                    if (Array.isArray(raw) && raw.length > 0) raw = raw[0];
                    balance = raw.balance ??
                        raw.billing?.balance ??
                        raw.credits ??
                        raw.creditsBalance ??
                        raw.org?.balance ??
                        raw.billingPlan?.balance ??
                        raw.billing?.credits ??
                        raw.billing?.balance_amount ??
                        null;
                }
            } catch {}
        }

        return NextResponse.json({ ...stats, balance }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
