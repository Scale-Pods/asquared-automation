export function parseMsg(raw: any): { date: Date | null; content: string } {
    if (!raw || !String(raw).trim()) return { date: null, content: "" };
    const content = String(raw).trim();
    // Only treat the whole string as "just a date" when it has no other lines/text —
    // `new Date(...)` is lenient and will parse a multi-line string that merely ends
    // with a date, which previously caused message text to be discarded entirely.
    if (!content.includes('\n') && content.length >= 10 && !isNaN(new Date(content).getTime())) {
        if (content.includes('T') || (content.includes('-') && content.includes(':'))) {
            return { date: new Date(content), content: "" };
        }
    }
    const isoRegex = /[\n\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*)$/;
    const isoMatch = content.match(isoRegex);
    if (isoMatch) {
        const d = new Date(isoMatch[1]);
        if (!isNaN(d.getTime())) {
            return { date: d, content: content.replace(isoRegex, '').trim() };
        }
    }
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.includes('-') && lastLine.includes(':')) {
        const lastLineDate = new Date(lastLine.replace(' ', 'T'));
        if (!isNaN(lastLineDate.getTime())) {
            return { date: lastLineDate, content: lines.length > 1 ? lines.slice(0, -1).join('\n').trim() : content };
        }
    }
    return { date: null, content: content };
}

export function parseWPStamp(tsRaw: any): Date | null {
    if (!tsRaw || !tsRaw.includes(' - ')) return null;
    const parts = tsRaw.split(' - ');
    const datePart = parts[parts.length - 1].trim();
    const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return isNaN(d.getTime()) ? null : d;
}

export function parseTSDate(tsValue: string): Date | null {
    if (!tsValue) return null;
    const str = String(tsValue).trim();
    if (str.includes(' - ')) {
        const parts = str.split(' - ');
        const datePart = parts[parts.length - 1].trim();
        const ddmmMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmmMatch) {
            const day = Number(ddmmMatch[1]);
            const month = Number(ddmmMatch[2]) - 1;
            const year = Number(ddmmMatch[3]);
            const timeMatch = datePart.match(/(\d{1,2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i);
            if (timeMatch) {
                let hours = Number(timeMatch[1]);
                const mins = Number(timeMatch[2]);
                const secs = Number(timeMatch[3] || 0);
                if (timeMatch[4]?.toUpperCase() === 'PM' && hours < 12) hours += 12;
                if (timeMatch[4]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
                return new Date(year, month, day, hours, mins, secs);
            }
            return new Date(year, month, day);
        }
        const isoDate = new Date(datePart.replace(' ', 'T'));
        if (!isNaN(isoDate.getTime())) return isoDate;
    }
    // Handle nurture style "DELIVERED at Jun 05 2026, 04:00 PM"
    const m = str.match(/at\s+([A-Za-z]+\s+\d{1,2}\s+\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)/i);
    if (m) {
        const d = new Date(m[1].replace(',', ''));
        if (!isNaN(d.getTime())) return d;
    }
    // Handle plain ISO timestamp (e.g. 2026-06-04T16:50:14.552+05:30)
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    }
    // Generic date parse fallback
    const genericDate = new Date(str);
    if (!isNaN(genericDate.getTime())) return genericDate;
    return null;
}

export function calculateDuration(call: any): number {
    return call.duration_seconds || call.durationSeconds || 0;
}

export function formatDuration(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

export function isWithinRange(d: Date | null, fromDate: Date | null, toDate: Date | null): boolean {
    if (!fromDate || !toDate) return true;
    if (!d) return false;
    if (d >= fromDate && d <= toDate) return true;
    const toYYYYMMDD = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    return toYYYYMMDD(d) >= toYYYYMMDD(fromDate) && toYYYYMMDD(d) <= toYYYYMMDD(toDate);
}

export function getMsgDateWithFallback(lead: any, msgKey: string, tsKey?: string): Date | null {
    const msgContent = lead[msgKey] || lead.stage_data?.[msgKey];
    const d = parseMsg(msgContent).date;
    if (d) return d;
    const resolvedTsKey = tsKey || `${msgKey} TS`;
    const tsDate = parseTSDate(lead[resolvedTsKey]);
    if (tsDate) return tsDate;
    if (msgContent && String(msgContent).trim() !== "" && String(msgContent).trim().toLowerCase() !== "no") {
        const createdAt = lead.created_at ? new Date(lead.created_at) : null;
        if (createdAt && !isNaN(createdAt.getTime())) return createdAt;
    }
    return null;
}

export type ReplyDataItem = {
    id: string;
    contactName: string;
    contactInfo: string;
    mode: 'Email' | 'WhatsApp' | 'Voice';
    date: string;
    time: string;
    status: 'Replied' | 'Pending' | 'Follow-up';
    preview: string;
    link: string;
    sortDate: Date;
};

export function processReplyLeads(leads: any[]): ReplyDataItem[] {
    const result: ReplyDataItem[] = [];
    leads.forEach((lead: any, idx: number) => {
        let wpReplyObj = { content: "Lead replied via WhatsApp", date: new Date(lead.updated_at || lead.created_at || 0) };
        let hasWP = false;
        const wtR = String(lead.WP_Replied_track || "").toLowerCase();
        if (wtR === "yes" || wtR === "replied") hasWP = true;
        const addWpReply = (raw: any) => {
            if (!raw || String(raw).toLowerCase() === "no" || String(raw).toLowerCase() === "none" || String(raw).trim() === "") return;
            hasWP = true;
            const parsed = parseMsg(raw);
            const msgDate = parsed.date || new Date(lead.updated_at || lead.created_at || 0);
            if (msgDate >= wpReplyObj.date) {
                wpReplyObj = { content: parsed.content || wpReplyObj.content, date: msgDate };
            }
        };
        addWpReply(lead.whatsapp_replied);
        for (let i = 1; i <= 10; i++) addWpReply(lead[`W.P_Replied_${i}`]);
        if (hasWP) {
            result.push({
                id: `${lead.id || `lead-${idx}`}-wp`,
                contactName: lead.name || "Unknown",
                contactInfo: lead.phone || "No info",
                mode: 'WhatsApp',
                date: wpReplyObj.date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: wpReplyObj.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied',
                preview: wpReplyObj.content.substring(0, 70) + (wpReplyObj.content.length > 70 ? "..." : ""),
                link: `/dashboard/whatsapp/chat?chat=${lead.id}`,
                sortDate: wpReplyObj.date
            });
        }
        const hasEmail = lead.email_replied && !["no", "none", ""].includes(String(lead.email_replied).toLowerCase().trim());
        if (hasEmail) {
            const parsed = parseMsg(lead.email_replied);
            const msgDate = parsed.date || new Date(lead.updated_at || lead.created_at || 0);
            const emailReplyObj = { content: parsed.content || "Lead replied via Email", date: msgDate };
            result.push({
                id: `${lead.id || `lead-${idx}`}-email`,
                contactName: lead.name || "Unknown",
                contactInfo: lead.email || "No info",
                mode: 'Email',
                date: emailReplyObj.date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: emailReplyObj.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied',
                preview: emailReplyObj.content.substring(0, 70) + (emailReplyObj.content.length > 70 ? "..." : ""),
                link: `/dashboard/email/received`,
                sortDate: emailReplyObj.date
            });
        }
    });
    result.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    return result;
}

export async function fetchAllRows(baseUrl: string, headers: Record<string, string>, table: string, dateColumn: string | null, from: string | null, to: string | null, extraParams?: URLSearchParams, columns?: string): Promise<any[]> {
    // Supabase PostgREST silently caps responses at 1000 rows per request.
    // We must use PAGE_SIZE = 1000 so that receiving exactly 1000 signals "there may be more rows".
    // Receiving < 1000 signals we've reached the last page.
    const PAGE_SIZE = 1000;

    const buildUrl = (offset: number) => {
        const params = new URLSearchParams({
            select: columns || '*',
            offset: String(offset),
            limit: String(PAGE_SIZE),
        });
        if (dateColumn && from) {
            params.append(dateColumn, `gte.${from}`);
        }
        if (dateColumn && to) {
            const endDate = new Date(to);
            if (endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
                endDate.setUTCHours(23, 59, 59, 999);
            }
            params.append(dateColumn, `lte.${endDate.toISOString()}`);
        }
        if (extraParams) {
            extraParams.forEach((val, key) => params.append(key, val));
        }
        return `${baseUrl}/${table}?${params.toString()}`;
    };

    const fetchPage = async (offset: number): Promise<any[]> => {
        const pageHeaders = {
            ...headers,
            // Use Range header for reliable pagination alongside limit/offset
            'Range-Unit': 'items',
            'Range': `${offset}-${offset + PAGE_SIZE - 1}`,
        };
        try {
            const res = await fetch(buildUrl(offset), { headers: pageHeaders, cache: 'no-store' });
            // 206 Partial Content = more pages exist; 200 = last page
            if (!res.ok && res.status !== 206) { console.error(`fetchAllRows: ${table} returned ${res.status}`); return []; }
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) { console.error(`fetchAllRows: ${table} threw`, e); return []; }
    };

    // Fetch the first page, then — if it's full — fetch remaining pages in parallel using the
    // Content-Range total instead of looping sequentially page-by-page.
    const firstPageHeaders = { ...headers, 'Range-Unit': 'items', 'Range': `0-${PAGE_SIZE - 1}`, 'Prefer': 'count=exact' };
    let firstData: any[];
    let total: number | null = null;
    try {
        const res = await fetch(buildUrl(0), { headers: firstPageHeaders, cache: 'no-store' });
        if (!res.ok && res.status !== 206) { console.error(`fetchAllRows: ${table} returned ${res.status}`); return []; }
        firstData = await res.json();
        if (!Array.isArray(firstData)) firstData = [];
        const cr = res.headers.get('content-range');
        if (cr) { const m = cr.match(/\/(\d+)$/); if (m) total = parseInt(m[1], 10); }
    } catch (e) { console.error(`fetchAllRows: ${table} threw`, e); return []; }

    if (firstData.length < PAGE_SIZE) return firstData;

    const remainingPages: number[] = [];
    if (total !== null) {
        for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) remainingPages.push(offset);
    }

    if (remainingPages.length > 0) {
        const restResults = await Promise.all(remainingPages.map(offset => fetchPage(offset)));
        return [firstData, ...restResults].flat();
    }

    // Total unknown (no content-range) — fall back to sequential paging as before.
    let allData = firstData;
    let offset = PAGE_SIZE;
    while (true) {
        const data = await fetchPage(offset);
        if (data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return allData;
}

