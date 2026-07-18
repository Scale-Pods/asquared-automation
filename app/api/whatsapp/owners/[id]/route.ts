import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers: Record<string, string> = {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };

    try {
        const cleanId = id.toLowerCase().startsWith('master-') ? id.split('-')[1] : id;
        const isNumericId = /^\d+$/.test(cleanId);

        let url = `${baseUrl}/master_leads?select=*&limit=1`;
        if (isNumericId) {
            url += `&master_leads_id=eq.${cleanId}`;
        } else {
            const digits = cleanId.replace(/\D/g, '');
            url += `&or=("Contact Number".eq.${cleanId},"Contact Number".eq.${digits})`;
        }

        const res = await fetch(url, { headers, cache: 'no-store' });
        if (!res.ok) {
            return NextResponse.json({ error: "Owner not found" }, { status: 404 });
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: "Owner not found" }, { status: 404 });
        }

        return NextResponse.json(data[0], {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
