import { NextRequest, NextResponse } from 'next/server';


export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const vapiPrivKey = process.env.VAPI_PRIVATE_KEY;
        const { id } = await context.params;

        // Fetch Leads for name resolution
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
        const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
        const leadsMap = new Map<string, string>();
        if (supabaseUrl && secretKey) {
            try {
                const headers = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };
                const tables = ["leads", "owner_reachout", "owner_outreach"];
                const results = await Promise.all(tables.map(t => fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${t}?select=name,phone`, { headers }).then(r => r.json())));

                results.forEach(data => {
                    if (Array.isArray(data)) {
                        data.forEach(l => {
                            const clean = String(l.phone || "").replace(/\D/g, '');
                            if (clean && l.name) leadsMap.set(clean, l.name);
                        });
                    }
                });
            } catch (e) { }
        }

        const vapiPhoneMap = new Map<string, string>();
        // Manual Overrides (User Provided) for high-fidelity identification
        vapiPhoneMap.set('4a7e7a31-0bbc-4fde-831e-2489119ee226', '17624000439');
        vapiPhoneMap.set('e66fe46b-9fe2-4628-a32b-08ced680bc04', '97144396291');
        vapiPhoneMap.set('4baf3613-ba3d-4860-9ea1-62156686b6f1', '447462179309');
        vapiPhoneMap.set('66dff692-d2a5-47d4-bbe0-245509dc7404', '14782159151');
        vapiPhoneMap.set('d91ba874-2522-4d62-adf6-681f2a0bf4fe', '97148714150');

        if (vapiPrivKey) {
            try {
                const res = await fetch('https://api.vapi.ai/phone-number', {
                    headers: { 'Authorization': `Bearer ${vapiPrivKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    (Array.isArray(data) ? data : (data.data || [])).forEach((p: any) => {
                        if (p.id && (p.number || p.phoneNumber)) vapiPhoneMap.set(p.id, String(p.number || p.phoneNumber).replace(/\D/g, ''));
                    });
                }
            } catch (e) { }
        }

        const resolveName = (rawName: string, phone: string) => {
            const cleanPhone = String(phone || "").replace(/\D/g, '');
            if (leadsMap.has(cleanPhone)) return leadsMap.get(cleanPhone);
            if (rawName && /^\d+$/.test(rawName.replace(/\D/g, '')) && rawName.length > 5) return "Guest";
            return rawName || "Guest";
        };

        // Since Vapi is currently the primary provider, try it first for speed
        if (vapiPrivKey) {
            try {
                const vapiRes = await fetch(`https://api.vapi.ai/call/${id}`, {
                    headers: { 'Authorization': `Bearer ${vapiPrivKey}`, 'Content-Type': 'application/json' }
                });

                if (vapiRes.ok) {
                    const data = await vapiRes.json();
                    const customer = data.customer || {};
                    const isInbound = data.type?.toLowerCase().includes('inbound');

                    // GUEST NUMBER ALWAYS COMES FROM CUSTOMER (STRICT)
                    let customerPhone = String(customer.number || "Unknown").replace(/\D/g, '');
                    if (customerPhone.length > 15) customerPhone = "Unknown";

                    // BOT NUMBER ALWAYS COMES FROM PHONENUMBER OBJECT OR CACHE
                    const rawAssistant = data.phoneNumber?.number || vapiPhoneMap.get(data.phoneNumberId) || data.phoneNumberId || "Unknown";
                    let assistantPhone = String(rawAssistant).replace(/\D/g, '');
                    if (assistantPhone.length > 15) assistantPhone = "Internal-Line";

                    const finalData = {
                        ...data,
                        id: data.id,
                        name: resolveName(customer.name, customerPhone),
                        startedAt: data.startedAt,
                        durationSeconds: data.durationSeconds || 0,
                        cost: typeof data.cost === 'number' ? `$${data.cost.toFixed(3)}` : (data.cost || "$0.00"),
                        phoneNumber: assistantPhone, // Bot
                        customer_number: customerPhone, // Guest
                        phone: customerPhone !== "Unknown" ? `+${customerPhone}` : "Unknown", // Add 'phone' for modal compatibility
                        type: isInbound ? "Inbound" : "Outbound",
                        isInbound,
                        source: 'vapi',
                        audio_url: data.recordingUrl
                    };

                    // Add telephony cost
                    try {
                        const { getTelephonyCost } = await import('@/lib/telephony');
                        const telCost = await getTelephonyCost({
                            phone: customerPhone,
                            startedAt: data.startedAt,
                            durationSeconds: data.durationSeconds,
                            isInbound
                        });
                        (finalData as any).telephony_cost = telCost;
                        (finalData as any).breakdown = {
                            agent: data.cost || 0,
                            telephony: telCost,
                            total: (data.cost || 0) + telCost
                        };
                    } catch (telErr) {
                        console.error("Error fetching telephony cost in individual call API:", telErr);
                    }

                    return NextResponse.json(finalData);
                }
            } catch (err) { }
        }


        // LAST RESORT: Check Supabase Archived Logs
        if (supabaseUrl && secretKey) {
            try {
                const headers = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };
                const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/vapi_call_logs?id=eq.${id}&select=*`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data[0]) {
                        const call = data[0];
                        const raw = call.raw_data || {};
                        const assistantId = call.assistantId || raw.assistantId || null;
                        const assistantIdToPhone: Record<string, string> = {
                            '70f05e16-18f3-4f6e-964a-f47b299c6c1d': '97148714150',
                            'b35e3032-7865-4913-ba22-a913b5d4117b': '14782159151',
                            '918c25eb-9882-452e-86df-b4851d464852': '447462179309',
                            '9ac979c3-a0b3-4af6-bb0d-07ddf9c0d1cd': '447462179309',
                            'd91ba874-2522-4d62-adf6-681f2a0bf4fe': '97148714150',
                            '4a7e7a31-0bbc-4fde-831e-2489119ee226': '17624000439',
                            'e66fe46b-9fe2-4628-a32b-08ced680bc04': '97144396291',
                            '4baf3613-ba3d-4860-9ea1-62156686b6f1': '447462179309',
                            '66dff692-d2a5-47d4-bbe0-245509dc7404': '14782159151',
                        };

                        const finalData = {
                            ...raw, // Spreads real Vapi fields back out
                            id: call.id,
                            transcript: call.transcript || raw.transcript || [],
                            analysis: { ...raw.analysis, summary: call.summary },
                            callSummary: call.summary,
                            startedAt: call.started_at,
                            durationSeconds: call.duration_seconds || raw.duration_seconds || raw.durationSeconds || 0,
                            status: call.status || call.vapi_status || raw.status || 'unknown',
                            recordingUrl: call.recording_url,
                            source: 'vapi',
                            customer_number: call.customer_phone,
                            phone: call.customer_phone,
                            phoneNumber: call.assistant_phone || raw.phoneNumber || raw.number || (assistantId ? assistantIdToPhone[assistantId] : null) || "Unknown",
                            assistantId: assistantId
                        };

                        // Add telephony cost
                        try {
                            const { getTelephonyCost } = await import('@/lib/telephony');
                            const telCost = await getTelephonyCost({
                                phone: call.customer_phone,
                                startedAt: call.started_at,
                                durationSeconds: finalData.durationSeconds,
                                isInbound: call.type === 'inboundPhoneCall'
                            });
                            (finalData as any).telephony_cost = telCost;
                            (finalData as any).breakdown = {
                                agent: call.cost_usd || 0,
                                telephony: telCost,
                                total: (call.cost_usd || 0) + telCost
                            };
                        } catch (telErr) { }

                        return NextResponse.json(finalData);
                    }
                }
            } catch (e) { }
        }


        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch conversation details" }, { status: 500 });
    }
}
