import { NextResponse } from 'next/server';
import { callRpc } from '@/lib/supabase-rpc';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    try {
        const [callStats, sentimentStats] = await Promise.all([
            callRpc('get_voice_call_stats', { p_from: from || null, p_to: to || null }),
            callRpc('get_leads_sentiment_stats'),
        ]);

        const stats = {
            totalCalls: callStats.totalCalls,
            avgDuration: callStats.avgDuration,
            totalCost: callStats.totalCost,
            successRate: callStats.totalCalls > 0
                ? Math.round(((callStats.secondaryCalls * callStats.pickupRate / 100) +
                    (callStats.unknownCalls * callStats.unknownPickupRate / 100) +
                    (callStats.ownersCalls * callStats.ownerPickupRate / 100)) / callStats.totalCalls * 100)
                : 0,
            inboundDuration: callStats.inboundDuration,
            outboundDuration: callStats.outboundDuration,
            secondaryCalls: callStats.secondaryCalls,
            unknownCalls: callStats.unknownCalls,
            ownersCalls: callStats.ownersCalls,
            pickupRate: callStats.pickupRate,
            completionRate: callStats.completionRate,
            unknownPickupRate: callStats.unknownPickupRate,
            unknownCompletionRate: callStats.unknownCompletionRate,
            ownerPickupRate: callStats.ownerPickupRate,
            ownerCompletionRate: callStats.ownerCompletionRate,
            volumeData: callStats.volumeData,
            durationData: callStats.durationData,
            costData: callStats.costData,
            typesData: callStats.typesData,
            ownerWaitingAvailabilityCount: callStats.ownerWaitingAvailabilityCount,
            secondaryHotQualified: sentimentStats.secondaryHotQualified,
            secondaryForecastReady: sentimentStats.secondaryForecastReady,
            unknownHotQualified: sentimentStats.unknownHotQualified,
            unknownForecastReady: sentimentStats.unknownForecastReady,
        };

        return NextResponse.json(stats, {
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
