import { NextResponse } from 'next/server';

export async function GET() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;

    const headers = {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };

    const fetchTable = async (tableName: string) => {
        const url = `${baseUrl}${tableName}?select=*`;

        // Stable timeout for Node 22
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(url, {
                headers,
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                console.error(`Error: HTML returned from ${url}. Endpoint might be wrong.`);
                return [];
            }

            if (!response.ok) {
                console.error(`Error fetching ${tableName}:`, await response.text());
                return [];
            }

            return response.json();
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error(`Timeout error for ${tableName}: Request aborted after 60s.`);
            } else {
                console.error(`Fetch error for ${tableName}:`, err);
            }
            return [];
        }
    };

    try {
        const [nr_wf, followup, nurture] = await Promise.all([
            fetchTable("nr_wf"),
            fetchTable("followup"),
            fetchTable("nurture")
        ]);

        return NextResponse.json({
            nr_wf,
            followup,
            nurture
        });

    } catch (error: any) {
        console.error('Raw fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
