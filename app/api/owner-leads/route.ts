import { NextResponse } from 'next/server';
import { subDays, startOfDay } from "date-fns";

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

    const fetchTableData = async (tableName: string, filterRange = true, select = "*") => {
        let allData: any[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            let url = `${baseUrl}/${tableName}?select=${select}&offset=${offset}&limit=${limit}`;
            
            // Match the logic of the main leads API
            if (filterRange && from) url += `&createdOn=gte.${from}`;
            if (filterRange && to) url += `&createdOn=lte.${to}`;

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
            
            if (offset > 20000) break; // Safety cap matching leads API
        }
        return allData;
    };

    try {
        // Fetch owner data with filterRange=false to get "complete data" as requested
        // similar to nr_wf and followup in the main leads API
        const ownerData = await fetchTableData("master_leads", false);

        return new NextResponse(JSON.stringify({ owner_data: ownerData }), {
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
