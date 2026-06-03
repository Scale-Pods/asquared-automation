import { NextResponse } from 'next/server';

async function fetchVapiBalance(privateKey: string, label: string): Promise<any> {
    try {
        const res = await fetch('https://api.vapi.ai/org', {
            headers: { 'Authorization': `Bearer ${privateKey}`, 'Content-Type': 'application/json' },
        });

        if (res.ok) {
            let raw = await res.json();
            if (Array.isArray(raw) && raw.length > 0) raw = raw[0];

            const balance = raw.balance ?? raw.billing?.balance ?? raw.credits ?? raw.creditsBalance ?? raw.org?.balance ?? raw.billingPlan?.balance ?? raw.billing?.credits ?? raw.billing?.balance_amount ?? 0;
            const used    = raw.totalSpent ?? raw.billing?.totalSpent ?? raw.usage?.totalCost ?? raw.org?.usage?.totalCost ?? raw.billing?.total_spent ?? raw.consumed_credits ?? raw.used_credits ?? 0;

            return { ...raw, balance, used, total_recharge: balance + used, label };
        }

        // Fallback to /me
        const meRes = await fetch('https://api.vapi.ai/me', {
            headers: { 'Authorization': `Bearer ${privateKey}`, 'Content-Type': 'application/json' },
        });
        if (meRes.ok) {
            const raw = await meRes.json();
            const org = raw.org || raw.organization || raw;
            const balance = org.balance ?? org.billing?.balance ?? org.credits ?? org.billingPlan?.balance ?? 0;
            const used    = org.billing?.totalSpent ?? org.usage?.totalCost ?? 0;
            return { ...raw, balance, used, total_recharge: balance + used, label };
        }

        return { error: `Fetch failed (${res.status})`, label };
    } catch (e) {
        console.error(`Vapi Balance Fetch Error [${label}]:`, e);
        return { error: 'Fetch exception', label };
    }
}

export async function GET() {
    const ownerKey  = process.env.VAPI_PRIVATE_KEY;
    const normalKey = process.env.VAPI_NORMAL_LEADS_PRIVATE_KEY;

    const [ownerData, normalData] = await Promise.all([
        ownerKey  ? fetchVapiBalance(ownerKey,  'Owner Leads')  : Promise.resolve({ error: 'API Key Missing', label: 'Owner Leads' }),
        normalKey ? fetchVapiBalance(normalKey, 'Normal Leads') : Promise.resolve({ error: 'API Key Missing', label: 'Normal Leads' }),
    ]);

    // vapi field = owner account (primary, used everywhere balance is displayed)
    return NextResponse.json({
        vapi: ownerData,
        vapiNormal: normalData,
    });
}
