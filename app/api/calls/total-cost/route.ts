import { NextResponse } from 'next/server';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const result = await callRpc<{ total: number; byAccount: Record<string, number> }>('get_voice_total_cost');

        return NextResponse.json({
            totalAgentCost: result.total || 0,
            secondaryAgentCost: result.byAccount?.secondary || 0,
            unknownAgentCost: result.byAccount?.unknown || 0,
            ownerAgentCost: result.byAccount?.owners || 0,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
