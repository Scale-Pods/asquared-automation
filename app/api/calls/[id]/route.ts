import { NextRequest, NextResponse } from 'next/server';

const OWNER_AGENT_ID = process.env.VAPI_OWNER_DATA_AGENT_ID || '682cf6ae-23fd-44f3-a4a3-756998cd62c1';
const SEC_AGENT_ID   = process.env.VAPI_SECONDARY_LEADS_AGENT_ID || 'c552e5b3-6c41-41d2-83b4-7c820e0d14bb';
const UNK_AGENT_ID   = process.env.VAPI_UNKNOWN_LEADS_AGENT_ID || '3266ea3f-336e-436a-bd2a-63f196aab37f';

// Tries to fetch a call from Vapi using the given private key.
// Returns the parsed JSON body or null if not found / key wrong.
async function tryVapiFetch(id: string, privateKey: string): Promise<any | null> {
    try {
        const res = await fetch(`https://api.vapi.ai/call/${id}`, {
            headers: { 'Authorization': `Bearer ${privateKey}`, 'Content-Type': 'application/json' },
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
        const ownerKey  = process.env.VAPI_PRIVATE_KEY;
        const normalKey = process.env.VAPI_NORMAL_LEADS_PRIVATE_KEY;
        const { id } = await context.params;

        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
        const secretKey   = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

        // Build leads name map for phone → name resolution
        const leadsMap = new Map<string, string>();
        if (supabaseUrl && secretKey) {
            try {
                const h = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };
                const tables = ["leads", "master_leads", "intro", "intro_uk", "follow_up", "follow_up_uk"];
                const results = await Promise.all(
                    tables.map(t => fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${t}?select=name,phone`, { headers: h }).then(r => r.ok ? r.json() : []))
                );
                results.flat().forEach((l: any) => {
                    const clean = String(l.phone || "").replace(/\D/g, '');
                    if (clean && l.name) leadsMap.set(clean, l.name);
                });
            } catch {}
        }

        // Phone number map for bot-side identification
        const vapiPhoneMap = new Map<string, string>([
            ['4a7e7a31-0bbc-4fde-831e-2489119ee226', '17624000439'],
            ['e66fe46b-9fe2-4628-a32b-08ced680bc04', '97144396291'],
            ['4baf3613-ba3d-4860-9ea1-62156686b6f1', '447462179309'],
            ['66dff692-d2a5-47d4-bbe0-245509dc7404', '14782159151'],
            ['d91ba874-2522-4d62-adf6-681f2a0bf4fe', '97148714150'],
        ]);

        // Enrich phone map from both Vapi accounts
        const enrichPhoneMap = async (privKey: string) => {
            try {
                const res = await fetch('https://api.vapi.ai/phone-number', {
                    headers: { 'Authorization': `Bearer ${privKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    (Array.isArray(data) ? data : (data.data || [])).forEach((p: any) => {
                        if (p.id && (p.number || p.phoneNumber))
                            vapiPhoneMap.set(p.id, String(p.number || p.phoneNumber).replace(/\D/g, ''));
                    });
                }
            } catch {}
        };

        await Promise.all([
            ownerKey  ? enrichPhoneMap(ownerKey)  : Promise.resolve(),
            normalKey ? enrichPhoneMap(normalKey) : Promise.resolve(),
        ]);

        const resolveName = (rawName: string, phone: string) => {
            const cleanPhone = String(phone || "").replace(/\D/g, '');
            if (leadsMap.has(cleanPhone)) return leadsMap.get(cleanPhone);
            if (rawName && /^\d+$/.test(rawName.replace(/\D/g, '')) && rawName.length > 5) return "Guest";
            return rawName || "Guest";
        };

        const buildResponse = (data: any) => {
            const customer = data.customer || {};
            const isInbound = data.type?.toLowerCase().includes('inbound');
            let customerPhone = String(customer.number || "Unknown").replace(/\D/g, '');
            if (customerPhone.length > 15) customerPhone = "Unknown";
            const rawAssistant = data.phoneNumber?.number || vapiPhoneMap.get(data.phoneNumberId) || data.phoneNumberId || "Unknown";
            let assistantPhone = String(rawAssistant).replace(/\D/g, '');
            if (assistantPhone.length > 15) assistantPhone = "Internal-Line";

            return {
                ...data,
                id: data.id,
                name: resolveName(customer.name, customerPhone),
                startedAt: data.startedAt,
                durationSeconds: data.durationSeconds || 0,
                cost: typeof data.cost === 'number' ? `$${data.cost.toFixed(3)}` : (data.cost || "$0.00"),
                phoneNumber: assistantPhone,
                customer_number: customerPhone,
                phone: customerPhone !== "Unknown" ? `+${customerPhone}` : "Unknown",
                type: isInbound ? "Inbound" : "Outbound",
                isInbound,
                source: 'vapi',
                audio_url: data.recordingUrl ? `/api/calls/${data.id}/audio` : null,
                recordingUrl: data.recordingUrl ? `/api/calls/${data.id}/audio` : null,
            };
        };

        // ── 1. Try owner account, then normal leads account via Vapi API ──────────
        // Owner account handles calls with VAPI_OWNER_DATA_AGENT_ID
        // Normal leads account handles secondary/unknown/normal calls
        // We don't know upfront which account owns this call ID, so try both.
        let vapiData: any = null;
        let usedKey: string | undefined;

        if (ownerKey) {
            vapiData = await tryVapiFetch(id, ownerKey);
            if (vapiData) usedKey = ownerKey;
        }
        if (!vapiData && normalKey) {
            vapiData = await tryVapiFetch(id, normalKey);
            if (vapiData) usedKey = normalKey;
        }

        if (vapiData) {
            const finalData = buildResponse(vapiData);
            try {
                const { getTelephonyCost } = await import('@/lib/telephony');
                const telCost = await getTelephonyCost({
                    phone: finalData.customer_number,
                    startedAt: vapiData.startedAt,
                    durationSeconds: vapiData.durationSeconds,
                    isInbound: finalData.isInbound,
                });
                (finalData as any).telephony_cost = telCost;
                (finalData as any).breakdown = {
                    agent: vapiData.cost || 0,
                    telephony: telCost,
                    total: (vapiData.cost || 0) + telCost,
                };
            } catch {}
            return NextResponse.json(finalData);
        }

        // ── 2. Fall back to Supabase archived logs (both tables) ─────────────────
        if (supabaseUrl && secretKey) {
            try {
                const h = { "apikey": secretKey, "Authorization": `Bearer ${secretKey}` };
                const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;

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

                // Check NF table first (more calls), then owner table
                let row: any = null;
                for (const table of ['vapi_call_logs_nf', 'vapi_call_logs']) {
                    const res = await fetch(`${base}/${table}?id=eq.${id}&select=*`, { headers: h });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.[0]) { row = data[0]; break; }
                    }
                }

                if (row) {
                    const raw = row.raw_data || {};
                    const assistantId = row.assistantId || raw.assistantId || null;
                    const finalData: any = {
                        ...raw,
                        id: row.id,
                        transcript: row.transcript || raw.transcript || [],
                        analysis: { ...raw.analysis, summary: row.summary },
                        callSummary: row.summary,
                        startedAt: row.started_at,
                        durationSeconds: row.duration_seconds || raw.duration_seconds || raw.durationSeconds || 0,
                        status: row.status || row.vapi_status || raw.status || 'unknown',
                        recordingUrl: row.recording_url ? `/api/calls/${row.id}/audio` : null,
                        audio_url: row.recording_url ? `/api/calls/${row.id}/audio` : null,
                        source: 'vapi',
                        customer_number: row.customer_phone,
                        phone: row.customer_phone,
                        phoneNumber: row.assistant_phone || raw.phoneNumber || raw.number || (assistantId ? assistantIdToPhone[assistantId] : null) || "Unknown",
                        assistantId,
                    };
                    try {
                        const { getTelephonyCost } = await import('@/lib/telephony');
                        const telCost = await getTelephonyCost({
                            phone: row.customer_phone,
                            startedAt: row.started_at,
                            durationSeconds: finalData.durationSeconds,
                            isInbound: row.type === 'inboundPhoneCall',
                        });
                        finalData.telephony_cost = telCost;
                        finalData.breakdown = { agent: row.cost_usd || 0, telephony: telCost, total: (row.cost_usd || 0) + telCost };
                    } catch {}
                    return NextResponse.json(finalData);
                }
            } catch {}
        }

        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch conversation details" }, { status: 500 });
    }
}
