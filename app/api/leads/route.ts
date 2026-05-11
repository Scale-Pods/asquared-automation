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
    const commonHeaders = {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };

    // Helper for fast counts
    const getTableCount = async (tableName: string, filter = "") => {
        try {
            let url = `${baseUrl}/${tableName}?select=count&limit=0`;
            if (filter) {
                // Ensure spaces and quotes are encoded for the URL
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
            
            const contentRange = response.headers.get("content-range");
            if (contentRange) {
                const count = contentRange.split('/')[1];
                return parseInt(count) || 0;
            }
            return 0;
        } catch (e) {
            return 0;
        }
    };

    // Helper for fetching table data
    const fetchTableData = async (tableName: string, filterRange = true, select = "*") => {
        let allData: any[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            let url = `${baseUrl}/${tableName}?select=${select}&offset=${offset}&limit=${limit}`;
            
            // Only apply Created At filter to Master Leads or if requested
            if (filterRange && from) url += `&"Created At"=gte.${from}`;
            if (filterRange && to) url += `&"Created At"=lte.${to}`;

            try {
                const response = await fetch(url, { headers: commonHeaders, cache: 'no-store' });
                if (!response.ok) {
                    const errMsg = await response.text();
                    console.error(`Fetch error for ${tableName}:`, errMsg);
                    break;
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    allData = allData.concat(data);
                    if (data.length < limit) hasMore = false;
                    else offset += limit;
                } else { hasMore = false; }
            } catch (err) { break; }
            
            if (offset > 20000) break; // Safety cap
        }
        return allData;
    };

    try {
        // Parallel execution
        const [leadsData, followup, nurture, master_leads, v1_nw, v2_nw, v1_fu, v2_fu, v1_own, v2_own] = await Promise.all([
            // Workflows: No date limit, all columns, ensures WhatsApp works
            fetchTableData("leads", false),
            fetchTableData("owner_reachout", false),
            fetchTableData("owner_outreach", false),
            
            // Master Leads: Filtered by date for dashboard performance
            fetchTableData("master_leads", false, '*'),
            
            // Background counts for All-Time Voice metric
            getTableCount("leads", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("leads", '"Voice 2"=not.is.null&"Voice 2"=not.eq.'),
            getTableCount("owner_reachout", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("owner_reachout", '"Voice 2"=not.is.null&"Voice 2"=not.eq.'),
            getTableCount("owner_outreach", '"Voice 1"=not.is.null&"Voice 1"=not.eq.'),
            getTableCount("owner_outreach", '"Voice 2"=not.is.null&"Voice 2"=not.eq.')
        ]);

        return new NextResponse(JSON.stringify({
            nr_wf: leadsData,
            followup,
            nurture,
            master_leads,
            allTimeVoiceCount: (v1_nw || 0) + (v2_nw || 0) + (v1_fu || 0) + (v2_fu || 0),
            allTimeOwnerVoiceCount: (v1_own || 0) + (v2_own || 0)
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
