import { NextResponse } from 'next/server';
import { consolidateLeads } from '@/lib/leads-utils';

export const dynamic = 'force-dynamic';

// Only the columns consolidateLeads()/isWhatsAppEligible() actually read on intro/follow_up
// family tables — select=* was pulling every column (60+, including long free-text bodies)
// on every Chat-page tab load, which was the single most-called route in the app.
const INTRO_FAMILY_COLUMNS = [
    '"ID"', '"Name"', '"Phone"', '"Email"', '"Replied"', '"Last Contacted"', '"Created At"', '"Updated At"',
    '"Email_1"', '"Email_2"', '"Email_3"', '"Email_Replied"', '"Dropped"', '"Unsubscribed"',
    '"Voice 1"', '"Voice 2"', '"FollowUp 48 Hr"',
    '"W.P_1"', '"W.P_2"', '"W.P_3"', '"W.P_4"',
    '"W.P_1 TS"', '"W.P_2 TS"', '"W.P_3 TS"', '"W.P_4 TS"',
    '"WP_Replied_track"', '"WP_last_contacted"', '"Email_last_contacted"',
    ...Array.from({ length: 10 }, (_, i) => `"W.P_Replied ${i + 1}"`),
    ...Array.from({ length: 10 }, (_, i) => `"W.P_FollowUp ${i + 1}"`),
    ...Array.from({ length: 10 }, (_, i) => `w_p_followup_ts_${i + 1}`),
].join(',');

const NURTURE_COLUMNS = [
    'id', 'name', '"Phone"', '"Replied"', 'created_at',
    '"WP_Replied_track"', 'wp_last_contacted', '"Last Contacted"',
    ...['week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
        'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
        'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4'],
    ...['week1_wp_1_ts','week1_wp_2_ts','week1_wp_3_ts','week1_wp_4_ts',
        'week2_wp_1_ts','week2_wp_2_ts','week2_wp_3_ts','week2_wp_4_ts',
        'week3_wp_1_ts','week3_wp_2_ts','week3_wp_3_ts','week3_wp_4_ts'],
    ...Array.from({ length: 10 }, (_, i) => `"W.P_Replied ${i + 1}"`),
    ...Array.from({ length: 10 }, (_, i) => `"W.P_FollowUp ${i + 1}"`),
    ...Array.from({ length: 10 }, (_, i) => `"W.P_FollowUp TS ${i + 1}"`),
].join(',');

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const type = searchParams.get('type');
    const sourceTable = searchParams.get('sourceTable');
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const whatsappOnly = searchParams.get('whatsappOnly') === 'true';

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

    const fetchTableData = async (tableName: string, dateColumn?: string, columns?: string) => {
        const buildUrl = (offset: number, limit: number) => {
            let url = `${baseUrl}/${tableName}?select=${encodeURIComponent(columns || '*')}&offset=${offset}&limit=${limit}`;
            if (dateColumn && from) url += `&%22${dateColumn}%22=gte.${from}`;
            if (dateColumn && to) url += `&%22${dateColumn}%22=lte.${to}`;
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

    function isWhatsAppEligible(lead: any): boolean {
        if (lead.stages_passed?.some((s: string) => s.toLowerCase().includes("whatsapp"))) return true;
        if (lead.whatsapp_replied && lead.whatsapp_replied !== "No" && lead.whatsapp_replied !== "none") return true;
        for (let i = 1; i <= 10; i++) {
            const r = lead[`W.P_Replied_${i}`];
            if (r && String(r).toLowerCase() !== "no" && String(r).toLowerCase() !== "none") return true;
            if (lead[`W.P_FollowUp_${i}`]) return true;
        }
        for (let i = 1; i <= 12; i++) {
            if (lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]) return true;
        }
        return false;
    }

    try {
        if (type === 'whatsapp') {
            const tables = sourceTable ? [sourceTable] : ["intro", "intro_uk", "follow_up", "follow_up_uk", "nurture_leads", "nurture_leads_uk"];
            const validTables = ["intro", "intro_uk", "follow_up", "follow_up_uk"];
            const nurtureTables = ["nurture_leads", "nurture_leads_uk"];
            const selected = tables.filter(t => validTables.includes(t));
            const selectedNurture = tables.filter(t => nurtureTables.includes(t));

            const [results, nurtureResults] = await Promise.all([
                // No DB-level date filter on TEXT columns; in-memory isWhatsAppEligible handles it
                Promise.all(selected.map(t => fetchTableData(t, undefined, INTRO_FAMILY_COLUMNS))),
                Promise.all(selectedNurture.map(t => fetchTableData(t, undefined, NURTURE_COLUMNS)))
            ]);

            const NURTURE_WP_COLS = [
                'week1_wp_1','week1_wp_2','week1_wp_3','week1_wp_4',
                'week2_wp_1','week2_wp_2','week2_wp_3','week2_wp_4',
                'week3_wp_1','week3_wp_2','week3_wp_3','week3_wp_4',
            ];
            const nurtureKeys = NURTURE_WP_COLS;
            const NURTURE_TO_WP: Record<string, string> = {};
            nurtureKeys.forEach((key, i) => { NURTURE_TO_WP[key] = `W.P_${i + 1}`; });
            const NURTURE_TS_TO_WP: Record<string, string> = {};
            nurtureKeys.forEach((key, i) => { NURTURE_TS_TO_WP[`${key}_ts`] = `W.P_${i + 1} TS`; });
            // nurture_leads/nurture_leads_uk use the same "W.P_Replied N"/"W.P_FollowUp N"/
            // "W.P_FollowUp TS N" (capitalized, spaced) column convention as intro/follow_up —
            // not lowercase snake_case.
            const REPLIED_MAP: Record<string, string> = {};
            const FOLLOWUP_MAP: Record<string, string> = {};
            const FOLLOWUP_TS_MAP: Record<string, string> = {};
            for (let i = 1; i <= 10; i++) {
                REPLIED_MAP[`W.P_Replied ${i}`] = `W.P_Replied_${i}`;
                FOLLOWUP_MAP[`W.P_FollowUp ${i}`] = `W.P_FollowUp_${i}`;
                FOLLOWUP_TS_MAP[`W.P_FollowUp TS ${i}`] = `W.P_FollowUp_${i} TS`;
            }

            if (whatsappOnly) {
                const rawResponse: Record<string, any> = { master_leads: [] };
                selected.forEach((t, i) => { rawResponse[t] = results[i].data; });
                validTables.forEach(t => {
                    if (!selected.includes(t)) rawResponse[t] = [];
                });
                const consolidated = consolidateLeads(rawResponse).filter(isWhatsAppEligible);

                // Normalise and add nurture rows
                const nurtureLeads: any[] = [];
                selectedNurture.forEach((t, i) => {
                    (nurtureResults[i].data || []).forEach((l: any) => {
                        const mapped: any = { ...l, id: `${t}-${l.id}`, source_table: t, source_loop: t === 'nurture_leads' ? 'Nurture' : 'Nurture UK' };
                        nurtureKeys.forEach((nk) => {
                            const wpKey = NURTURE_TO_WP[nk];
                            if (l[nk] && String(l[nk]).trim() !== '') mapped[wpKey] = l[nk];
                        });
                        nurtureKeys.forEach((nk) => {
                            const tsKey = `${nk}_ts`;
                            const wpTsKey = NURTURE_TS_TO_WP[tsKey];
                            if (l[tsKey]) mapped[wpTsKey] = String(l[tsKey]);
                        });
                        Object.entries(REPLIED_MAP).forEach(([src, dest]) => {
                            if (l[src] && String(l[src]).trim() !== '') mapped[dest] = l[src];
                        });
                        Object.entries(FOLLOWUP_MAP).forEach(([src, dest]) => {
                            if (l[src] && String(l[src]).trim() !== '') mapped[dest] = l[src];
                        });
                        Object.entries(FOLLOWUP_TS_MAP).forEach(([src, dest]) => {
                            if (l[src]) mapped[dest] = String(l[src]);
                        });
                        mapped.phone = l.Phone || l.phone || '';
                        mapped.name = l.name || l.Name || '';
                        mapped["WP_Replied_track"] = l.WP_Replied_track || l.wp_replied_track || (l.replied === true ? 'Yes' : '') || '';
                        mapped["WP_last_contacted"] = l.wp_last_contacted || l["Last Contacted"] || '';
                        mapped.replied = l.replied === true ? 'Yes' : (l.Replied || l.replied || '');
                        if (isWhatsAppEligible(mapped)) nurtureLeads.push(mapped);
                    });
                });

                const filtered = [...consolidated, ...nurtureLeads];
                return new NextResponse(JSON.stringify({ whatsappLeads: filtered, totalWhatsappLeads: filtered.length }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                    }
                });
            }

            const response: Record<string, any> = { master_leads: [] };
            selected.forEach((t, i) => {
                response[t] = results[i].data;
                response[`total_${t}`] = results[i].total;
            });
            selectedNurture.forEach((t, i) => {
                response[t] = nurtureResults[i].data;
                response[`total_${t}`] = nurtureResults[i].total;
            });
            validTables.forEach(t => {
                if (!selected.includes(t)) {
                    response[t] = [];
                    response[`total_${t}`] = 0;
                }
            });
            nurtureTables.forEach(t => {
                if (!selectedNurture.includes(t)) {
                    response[t] = [];
                    response[`total_${t}`] = 0;
                }
            });

            return new NextResponse(JSON.stringify(response), {
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
            const tables = sourceTable ? [sourceTable] : ["intro", "intro_uk", "follow_up", "follow_up_uk"];
            const validTables = ["intro", "intro_uk", "follow_up", "follow_up_uk"];
            const selected = tables.filter(t => validTables.includes(t));

            const results = await Promise.all(
                selected.map(t => fetchTableData(t, "Email_last_contacted", INTRO_FAMILY_COLUMNS))
            );

            const response: Record<string, any> = { master_leads: [] };
            selected.forEach((t, i) => {
                response[t] = results[i].data;
                response[`total_${t}`] = results[i].total;
            });
            validTables.forEach(t => {
                if (!selected.includes(t)) {
                    response[t] = [];
                    response[`total_${t}`] = 0;
                }
            });

            return new NextResponse(JSON.stringify(response), {
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
            fetchTableData("master_leads", "created_at"),
            // No DB-level date filter on TEXT columns
            fetchTableData("intro", undefined, INTRO_FAMILY_COLUMNS),
            fetchTableData("intro_uk", undefined, INTRO_FAMILY_COLUMNS),
            fetchTableData("follow_up", undefined, INTRO_FAMILY_COLUMNS),
            fetchTableData("follow_up_uk", undefined, INTRO_FAMILY_COLUMNS)
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
