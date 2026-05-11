import { NextResponse } from 'next/server';

export async function GET() {
    const elApiKey = process.env.ELEVENLABS_API_KEY;
    const vapiPrivKey = process.env.VAPI_PRIVATE_KEY;

    let elData = null;
    let vapiData = null;

    if (elApiKey) {
        try {
            const elRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
                method: 'GET',
                headers: { 'xi-api-key': elApiKey, 'Content-Type': 'application/json' }
            });

            if (elRes.ok) {
                const data = await elRes.json();
                elData = {
                    character_count: data.character_count,
                    character_limit: data.character_limit,
                    reset_at: data.next_character_count_reset_unix,
                    usage_percent: (data.character_count / data.character_limit) * 100,
                    status: data.status
                };
            } else {
                elData = { error: `Fetch failed (${elRes.status})` };
            }
        } catch (e) {
            console.error('ElevenLabs Balance Fetch Error:', e);
            elData = { error: 'Fetch exception' };
        }
    } else {
        elData = { error: 'API Key Missing' };
    }

    if (vapiPrivKey) {
        try {
            // Try /org first (standard)
            const vapiRes = await fetch('https://api.vapi.ai/org', {
                headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
            });

            if (vapiRes.ok) {
                let rawVapi = await vapiRes.json();
                console.log('[Vapi API Debug] Org Response Type:', typeof rawVapi, Array.isArray(rawVapi) ? 'Array' : 'Object');

                // If it's an array, take the first org
                if (Array.isArray(rawVapi) && rawVapi.length > 0) {
                    rawVapi = rawVapi[0];
                }

                const balance = rawVapi.balance ??
                    rawVapi.billing?.balance ??
                    rawVapi.credits ??
                    rawVapi.creditsBalance ??
                    rawVapi.org?.balance ??
                    rawVapi.billingPlan?.balance ??
                    rawVapi.billing?.credits ??
                    rawVapi.billing?.balance_amount ??
                    0;

                const used = rawVapi.totalSpent ??
                    rawVapi.billing?.totalSpent ??
                    rawVapi.usage?.totalCost ??
                    rawVapi.org?.usage?.totalCost ??
                    rawVapi.billing?.total_spent ??
                    rawVapi.consumed_credits ??
                    rawVapi.used_credits ??
                    0;

                const total = balance + used;

                vapiData = {
                    ...rawVapi,
                    balance,
                    used,
                    total_recharge: total > balance ? total : balance
                };
            } else {
                const vapiMeRes = await fetch('https://api.vapi.ai/me', {
                    headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
                });

                if (vapiMeRes.ok) {
                    let rawMe = await vapiMeRes.json();
                    const org = rawMe.org || rawMe.organization || rawMe;

                    const balance = org.balance ??
                        org.billing?.balance ??
                        org.credits ??
                        org.billingPlan?.balance ??
                        0;

                    const used = org.billing?.totalSpent ??
                        org.usage?.totalCost ??
                        0;

                    const total = balance + used;

                    vapiData = {
                        ...rawMe,
                        balance,
                        used,
                        total_recharge: total > balance ? total : balance
                    };
                } else {
                    const errStatus = vapiRes.status;
                    const errMeStatus = vapiMeRes.status;
                    vapiData = { error: `Fetch failed (Org: ${errStatus}, Me: ${errMeStatus})` };
                }
            }
        } catch (e) {
            console.error('Vapi Balance Fetch Error:', e);
            vapiData = { error: 'Fetch exception' };
        }
    } else {
        vapiData = { error: 'API Key Missing' };
    }

    return NextResponse.json({
        elevenlabs: elData,
        vapi: vapiData,
        // Maintain backward compatibility for character_count if only ElevenLabs is used
        ...(elData || {})
    });
}
