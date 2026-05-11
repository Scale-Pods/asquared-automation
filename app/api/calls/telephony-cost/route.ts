import { NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { getDidLogicCDRs, findMatch, cleanPhoneNumber } from '@/lib/telephony';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const calls = body.calls || [];
        if (calls.length === 0) {
            return NextResponse.json({ success: true, costs: {} });
        }

        // 1. Determine date range for CDR fetch
        let minDate = new Date();
        let maxDate = new Date(0);
        let hasValidDate = false;

        calls.forEach((c: any) => {
            if (c.startedAt) {
                const d = new Date(c.startedAt);
                if (!isNaN(d.getTime())) {
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;
                    hasValidDate = true;
                }
            }
        });

        if (!hasValidDate) {
            minDate = subDays(new Date(), 1);
            maxDate = new Date();
        }

        const fromStr = format(subDays(minDate, 1), 'yyyy-MM-dd');
        const toStr = format(maxDate, 'yyyy-MM-dd');

        // 2. Fetch CDRs
        const cdrs = await getDidLogicCDRs(fromStr, toStr);

        // 3. Match and calculate costs
        const results: Record<string, number> = {};

        calls.forEach((call: any) => {
            const { id, isInbound, durationSeconds } = call;
            
            if (isInbound) {
                results[id] = durationSeconds > 0 ? 0.02 : 0;
            } else {
                const matched = findMatch(call, cdrs);
                if (matched) {
                    results[id] = Math.abs(parseFloat(matched.cost || matched.price || matched.amount || 0));
                } else {
                    const pClean = cleanPhoneNumber(call.phone);
                    let rate = 0.05;
                    if (pClean.startsWith('971')) rate = 0.24;
                    else if (pClean.startsWith('1')) rate = 0.015;
                    else if (pClean.startsWith('44')) rate = 0.03;
                    results[id] = (durationSeconds / 60) * rate;
                }
            }
        });

        return NextResponse.json({ success: true, costs: results });
    } catch (e) {
        console.error("Telephony Cost API error:", e);
        return NextResponse.json({ error: "Failed to fetch telephony costs" }, { status: 500 });
    }
}
