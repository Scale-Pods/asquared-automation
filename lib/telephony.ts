import { subDays, format } from 'date-fns';

export function cleanPhoneNumber(num: any): string {
    if (!num) return "Unknown";
    const str = String(num).replace(/\s+/g, '').replace(/\+/g, '').replace(/\D/g, '');
    if (!str || str.length < 5 || str.length > 22) return "Unknown";
    return str;
}

export async function getDidLogicCDRs(from: string, to: string) {
    const API_KEY = process.env.DIDLOGIC_API_KEY;
    if (!API_KEY) return [];

    try {
        const response = await fetch(`https://api.didlogic.com/v1/reports/calls?from=${from}&to=${to}`, {
            headers: { 
                'Accept': 'application/json',
                'X-API-KEY': API_KEY 
            },
            cache: 'no-store'
        });

        if (response.ok) {
            const data = await response.json();
            return data.calls || data.data || [];
        }
    } catch (e) {
        console.error("DIDLogic CDR fetch error:", e);
    }
    return [];
}

export function findMatch(call: { phone: string, startedAt: string, durationSeconds: number }, cdrs: any[]) {
    const pClean = cleanPhoneNumber(call.phone);
    const callTime = new Date(call.startedAt).getTime();
    const durationSeconds = call.durationSeconds || 0;

    return cdrs.find((cdr: any) => {
        const cdrDest = cleanPhoneNumber(cdr.destination || cdr.to);
        if (cdrDest !== pClean) return false;

        const cdrStart = new Date(cdr.start_time || cdr.created_at).getTime();
        const diff = Math.abs(cdrStart - callTime);
        if (diff > 300000) return false; 

        const cdrDur = parseInt(cdr.duration || 0);
        const durDiff = Math.abs(cdrDur - durationSeconds);
        if (durDiff > 20 && durDiff > (durationSeconds * 0.2)) return false;

        return true;
    });
}

export async function getTelephonyCost(call: { phone: string, startedAt: string, durationSeconds: number, isInbound: boolean }) {
    if (call.isInbound) return call.durationSeconds > 0 ? 0.02 : 0;

    const date = new Date(call.startedAt);
    if (isNaN(date.getTime())) return (call.durationSeconds / 60) * 0.05;

    const fromStr = format(subDays(date, 1), 'yyyy-MM-dd');
    const toStr = format(date, 'yyyy-MM-dd');

    const cdrs = await getDidLogicCDRs(fromStr, toStr);
    const matched = findMatch(call, cdrs);

    if (matched) {
        return Math.abs(parseFloat(matched.cost || matched.price || matched.amount || 0));
    }

    // Fallback
    const pClean = cleanPhoneNumber(call.phone);
    let rate = 0.05;
    if (pClean.startsWith('971')) rate = 0.24;
    else if (pClean.startsWith('1')) rate = 0.015;
    else if (pClean.startsWith('44')) rate = 0.03;
    
    return (call.durationSeconds / 60) * rate;
}
