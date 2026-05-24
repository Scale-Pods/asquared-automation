import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : undefined;
    const pageSize = Math.min(10000, Math.max(1, parseInt(pageSizeParam ?? "1000", 10) || 1000));

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        return NextResponse.json({ error: "Config missing" }, { status: 500 });
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const commonHeaders: Record<string, string> = {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };

    const fetchTableData = async (tableName: string) => {
        const buildUrl = (offset: number, limit: number) => {
            let url = `${baseUrl}/${tableName}?select=*&offset=${offset}&limit=${limit}`;
            if (from) url += `&"Last Contacted"=gte.${from}`;
            if (to) url += `&"Last Contacted"=lte.${to}`;
            return url;
        };

        const fetchPage = async (offset: number, limit: number, preferCount: boolean) => {
            const url = buildUrl(offset, limit);
            const headers: Record<string, string> = { ...commonHeaders };
            if (preferCount) headers["Prefer"] = "count=exact";

            try {
                const response = await fetch(url, { headers, cache: 'no-store' });
                if (!response.ok) {
                    console.error(`Fetch error for ${tableName}:`, await response.text());
                    return { data: [], contentRange: null };
                }
                const data = await response.json();
                const contentRange = response.headers.get("content-range");
                return { data: Array.isArray(data) ? data : [], contentRange };
            } catch (err) {
                console.error(`Fetch exception for ${tableName}:`, err);
                return { data: [], contentRange: null };
            }
        };

        if (page !== undefined) {
            const offset = (page - 1) * pageSize;
            const { data, contentRange } = await fetchPage(offset, pageSize, true);
            const total = contentRange ? parseInt(contentRange.split('/')[1]) || 0 : data.length;
            return { data, total };
        }

        let allData: any[] = [];
        let total = 0;
        let offset = 0;
        let first = true;

        while (true) {
            const { data, contentRange } = await fetchPage(offset, pageSize, first);

            if (data.length === 0) break;

            if (first && contentRange) {
                total = parseInt(contentRange.split('/')[1]) || 0;
                first = false;
            }

            allData = allData.concat(data);

            if (data.length < pageSize) break;
            offset += pageSize;

            if (total > 0 && offset >= total) break;
        }

        if (total === 0) total = allData.length;

        return { data: allData, total };
    };

    const getTableCount = async (tableName: string, filter = "") => {
        try {
            let url = `${baseUrl}/${tableName}?select=count&limit=0`;
            if (filter) url += `&${filter}`;

            const response = await fetch(url, {
                headers: { ...commonHeaders, "Prefer": "count=exact" },
                cache: 'no-store'
            });
            if (!response.ok) return 0;

            const cr = response.headers.get("content-range");
            return cr ? parseInt(cr.split('/')[1]) || 0 : 0;
        } catch {
            return 0;
        }
    };

    try {
        const [result, awaitingAvailabilityCount] = await Promise.all([
            fetchTableData("master_leads"),
            getTableCount("vapi_call_logs", '"voice_call_status"=eq.Awaiting%20availability')
        ]);

        return new NextResponse(JSON.stringify({
            owner_data: result.data,
            total: result.total,
            page: page ?? null,
            pageSize,
            voiceCallStatusWaitingCount: awaitingAvailabilityCount
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
