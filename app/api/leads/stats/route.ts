import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

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

    const getCount = async (table: string, dateColumn: string) => {
        try {
            let url = `${baseUrl}/${table}?select=count&limit=0`;
            if (dateColumn && from) url += `&"${dateColumn}"=gte.${from}`;
            if (dateColumn && to) url += `&"${dateColumn}"=lte.${to}`;

            const res = await fetch(url, { headers: { ...headers, "Prefer": "count=exact" }, cache: 'no-store' });
            if (!res.ok) return 0;
            const cr = res.headers.get("content-range");
            return cr ? parseInt(cr.split('/')[1]) || 0 : 0;
        } catch { return 0; }
    };

    try {
        const [intro, intro_uk, follow_up, follow_up_uk, leads] = await Promise.all([
            getCount("intro", "WP_last_contacted"),
            getCount("intro_uk", "WP_last_contacted"),
            getCount("follow_up", "WP_last_contacted"),
            getCount("follow_up_uk", "WP_last_contacted"),
            getCount("leads", "last_outreach_at")
        ]);

        return NextResponse.json({
            sourceCounts: { intro, intro_uk, follow_up, follow_up_uk, leads }
        }, {
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
