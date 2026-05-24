import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const type = searchParams.get('type');
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

    const fetchTableData = async (tableName: string, dateColumn?: string) => {
        const buildUrl = (offset: number, limit: number) => {
            let url = `${baseUrl}/${tableName}?select=*&offset=${offset}&limit=${limit}`;
            if (dateColumn && from) url += `&"${dateColumn}"=gte.${from}`;
            if (dateColumn && to) url += `&"${dateColumn}"=lte.${to}`;
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
            if (filter) {
                const encodedFilter = filter.split('&').map(part => {
                    const [key, val] = part.split('=');
                    return `${encodeURIComponent(key.replace(/"/g, ''))}=${val}`;
                }).join('&');
                url += `&${encodedFilter}`;
            }

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
        if (type === 'whatsapp') {
            const [intro, intro_uk, follow_up, follow_up_uk] = await Promise.all([
                fetchTableData("intro", "WP_last_contacted"),
                fetchTableData("intro_uk", "WP_last_contacted"),
                fetchTableData("follow_up", "WP_last_contacted"),
                fetchTableData("follow_up_uk", "WP_last_contacted")
            ]);

            return new NextResponse(JSON.stringify({
                intro: intro.data,
                intro_uk: intro_uk.data,
                follow_up: follow_up.data,
                follow_up_uk: follow_up_uk.data,
                master_leads: [],
                total_intro: intro.total,
                total_intro_uk: intro_uk.total,
                total_follow_up: follow_up.total,
                total_follow_up_uk: follow_up_uk.total
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                }
            });
        }

        if (type === 'email') {
            const [intro, intro_uk, follow_up, follow_up_uk] = await Promise.all([
                fetchTableData("intro", "Email_last_contacted"),
                fetchTableData("intro_uk", "Email_last_contacted"),
                fetchTableData("follow_up", "Email_last_contacted"),
                fetchTableData("follow_up_uk", "Email_last_contacted")
            ]);

            return new NextResponse(JSON.stringify({
                intro: intro.data,
                intro_uk: intro_uk.data,
                follow_up: follow_up.data,
                follow_up_uk: follow_up_uk.data,
                master_leads: [],
                total_intro: intro.total,
                total_intro_uk: intro_uk.total,
                total_follow_up: follow_up.total,
                total_follow_up_uk: follow_up_uk.total
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                }
            });
        }

        const [leadsResult, masterLeadsResult, introResult, introUkResult, followUpResult, followUpUkResult] = await Promise.all([
            fetchTableData("leads", "last_outreach_at"),
            fetchTableData("master_leads", "Last Contacted"),
            fetchTableData("intro", "WP_last_contacted"),
            fetchTableData("intro_uk", "WP_last_contacted"),
            fetchTableData("follow_up", "WP_last_contacted"),
            fetchTableData("follow_up_uk", "WP_last_contacted")
        ]);

        const [v1_i, v2_i, v1_iu, v2_iu, v1_fu, v2_fu, v1_fuu, v2_fuu] = await Promise.all([
            getTableCount("intro", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("intro", '"Voice 2"=not.is.null&"Voice 2"=not.eq.'),
            getTableCount("intro_uk", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("intro_uk", '"Voice 2"=not.is.null&"Voice 2"=not.eq.'),
            getTableCount("follow_up", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("follow_up", '"Voice 2"=not.is.null&"Voice 2"=not.eq.'),
            getTableCount("follow_up_uk", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("follow_up_uk", '"Voice 2"=not.is.null&"Voice 2"=not.eq.')
        ]);

        return new NextResponse(JSON.stringify({
            leads: leadsResult.data,
            master_leads: masterLeadsResult.data,
            intro: introResult.data,
            intro_uk: introUkResult.data,
            follow_up: followUpResult.data,
            follow_up_uk: followUpUkResult.data,
            total_leads: leadsResult.total,
            total_master_leads: masterLeadsResult.total,
            total_intro: introResult.total,
            total_intro_uk: introUkResult.total,
            total_follow_up: followUpResult.total,
            total_follow_up_uk: followUpUkResult.total,
            allTimeVoiceCount: (v1_i || 0) + (v2_i || 0) + (v1_iu || 0) + (v2_iu || 0) + (v1_fu || 0) + (v2_fu || 0) + (v1_fuu || 0) + (v2_fuu || 0),
            allTimeOwnerVoiceCount: 0
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
