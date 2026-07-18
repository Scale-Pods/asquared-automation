import { parseMsg, parseTSDate, isWithinRange } from '@/lib/server-parsers';

// Column names as defined in the real `master_leads` Postgres schema.
export const REPLY_ROUNDS = 10;

// Minimal column set needed for list rows + metrics (NOT the full chat timeline, which needs
// every W.P_Replied/FollowUp text column). master_leads has 60+ columns including 10 rounds of
// free-text replies/follow-ups — fetching select=* for list/metrics views pulls all of that
// unnecessarily and is the main cause of slow owners-tab loads. Keep this in sync with the
// fields actually read by ownerHasWhatsappActivity/ownerHasReplied/computeOwnerMetrics/etc.
export const OWNER_LIST_COLUMNS = [
    'master_leads_id',
    '"Owner Name"',
    '"Contact Number"',
    '"Location"',
    '"Project Name"',
    '"Unit Number"',
    '"Property Type"',
    'voice_call_status',
    'note',
    'wa_sentiment',
    'whatsapp_last_contacted',
    'WP_Replied_track',
    'Whatsapp_1',
    '"Whatsapp 2"',
    ...Array.from({ length: REPLY_ROUNDS }, (_, i) => `"W.P_FollowUp ${i + 1}"`),
    ...Array.from({ length: REPLY_ROUNDS }, (_, i) => `"W.P_FollowUp ${i + 1}_TS"`),
    ...Array.from({ length: REPLY_ROUNDS }, (_, i) => `"W.P_Replied ${i + 1}"`),
].join(',');

export interface OwnerMessage {
    type: 'bot' | 'user';
    label: string;
    content: string;
    date: string | null;
    sequence: number;
    tsStatus?: string | null;
}

function parseOwnerField(raw: any, label: string, type: 'bot' | 'user', sequence: number): OwnerMessage | null {
    if (!raw || !String(raw).trim()) return null;
    const { date, content } = parseMsg(raw);
    return {
        type,
        label,
        content: content || String(raw).trim(),
        date: date ? date.toISOString() : null,
        sequence,
    };
}

export function getOwnerName(o: any): string {
    return o["Owner Name"] || o.name || o.Name || "Guest";
}

export function getOwnerPhone(o: any): string {
    return o["Contact Number"] || o.contactNo || o.Phone || o.phone || "Unknown";
}

// The one column that reliably marks a WhatsApp reply, per the real schema.
export function ownerHasReplied(o: any): boolean {
    const track = o["WP_Replied_track"];
    return !!(track && String(track).trim() !== "" && String(track).trim().toLowerCase() !== "no");
}

// A row only counts as a WhatsApp-engaged owner lead if the bot side (Whatsapp_1 / Whatsapp 2)
// or a follow-up round actually has content — not just any row in master_leads.
export function ownerHasWhatsappActivity(o: any): boolean {
    if (o["Whatsapp_1"] && String(o["Whatsapp_1"]).trim() !== "") return true;
    const wp2 = o["Whatsapp 2"] ?? o["Whatsapp_2"];
    if (wp2 && String(wp2).trim() !== "") return true;
    for (let i = 1; i <= REPLY_ROUNDS; i++) {
        const followUp = o[`W.P_FollowUp ${i}`];
        if (followUp && String(followUp).trim() !== "") return true;
        const replied = o[`W.P_Replied ${i}`];
        if (replied && String(replied).trim() !== "") return true;
    }
    return false;
}

export function getOwnerLastContactedDate(o: any): Date | null {
    if (o["whatsapp_last_contacted"]) {
        const d = new Date(o["whatsapp_last_contacted"]);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

// Builds the full owner chat timeline from the real master_leads columns:
// Whatsapp_1 -> Whatsapp 2 -> (W.P_Replied i / W.P_FollowUp i) x10, in that flow order.
export function buildOwnerTimeline(o: any): OwnerMessage[] {
    const timeline: OwnerMessage[] = [];
    let seq = 1;

    const wp1 = parseOwnerField(o["Whatsapp_1"], "Whatsapp 1", "bot", seq++);
    if (wp1) {
        if (!wp1.date) {
            const d = parseTSDate(o["whatsapp_last_contacted"]);
            if (d) wp1.date = d.toISOString();
        }
        timeline.push(wp1);
    }

    const wp2Raw = o["Whatsapp 2"] ?? o["Whatsapp_2"];
    const wp2 = parseOwnerField(wp2Raw, "Whatsapp 2", "bot", seq++);
    if (wp2) timeline.push(wp2);

    for (let i = 1; i <= REPLY_ROUNDS; i++) {
        const repliedRaw = o[`W.P_Replied ${i}`];
        const repliedMsg = parseOwnerField(repliedRaw, `Replied ${i}`, "user", seq++);
        if (repliedMsg) {
            if (!repliedMsg.date && o[`W.P_Replied ${i}_TS`]) {
                const d = parseTSDate(o[`W.P_Replied ${i}_TS`]);
                if (d) repliedMsg.date = d.toISOString();
            }
            timeline.push(repliedMsg);
        }

        const followUpRaw = o[`W.P_FollowUp ${i}`];
        const followUpMsg = parseOwnerField(followUpRaw, `Follow Up ${i}`, "bot", seq++);
        if (followUpMsg) {
            followUpMsg.tsStatus = o[`W.P_FollowUp ${i}_TS`] || null;
            if (!followUpMsg.date && o[`W.P_FollowUp ${i}_TS`]) {
                const d = parseTSDate(o[`W.P_FollowUp ${i}_TS`]);
                if (d) followUpMsg.date = d.toISOString();
            }
            timeline.push(followUpMsg);
        }
    }

    return timeline;
}

// Mirrors CustomerRow's sentCount logic on the Intro/Follow Up tabs,
// adapted to master_leads' Whatsapp_1/"Whatsapp 2"/"W.P_FollowUp N" column naming.
export function getOwnerMessagesSentCount(o: any): number {
    let count = 0;
    if (o["Whatsapp_1"]) count++;
    if (o["Whatsapp 2"] ?? o["Whatsapp_2"]) count++;
    for (let i = 1; i <= REPLY_ROUNDS; i++) {
        if (o[`W.P_FollowUp ${i}`]) count++;
    }
    return count;
}

export interface OwnerMessageStatus {
    index: number;
    status: string;
}

// Most recent delivery-status pills, in the same shape CustomerRow renders for Intro/Follow Up.
export function getOwnerMessageStatuses(o: any): OwnerMessageStatus[] {
    const all: OwnerMessageStatus[] = [];
    for (let i = 1; i <= REPLY_ROUNDS; i++) {
        const ts = o[`W.P_FollowUp ${i}_TS`];
        if (ts) all.push({ index: i, status: String(ts) });
    }
    return all.slice(-2);
}

export interface OwnerMetrics {
    totalOwners: number;
    reachouts: number;
    replies: number;
    msgsSent: number;
    replyRate: number;
    waitingOnReply: number;
    sentiment: { positive: number; neutral: number; negative: number; unknown: number };
    trend: { date: string; sent: number; replied: number }[];
}

// Only owners with real WhatsApp activity (bot side: Whatsapp_1/Whatsapp 2/follow-ups) whose
// whatsapp_last_contacted falls inside the selected range are counted — mirrors how the
// intro/follow_up tables are scoped to "WhatsApp-eligible" rows before computing stats.
export function getWhatsappEligibleOwners(owners: any[], fromDate: Date | null, toDate: Date | null): any[] {
    const isInRange = (d: Date | null) => {
        if (!fromDate || !toDate) return true;
        if (!d) return false;
        return isWithinRange(d, fromDate, toDate);
    };
    return owners.filter((o: any) => {
        if (!ownerHasWhatsappActivity(o)) return false;
        return isInRange(getOwnerLastContactedDate(o));
    });
}

export function computeOwnerMetrics(owners: any[], fromDate: Date | null, toDate: Date | null): OwnerMetrics {
    const eligible = getWhatsappEligibleOwners(owners, fromDate, toDate);

    let reachouts = 0;
    let replies = 0;
    let msgsSent = 0;
    let waitingOnReply = 0;
    const sentiment = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    const dailyGroups: Record<string, { date: string; sent: number; replied: number }> = {};

    eligible.forEach((o: any) => {
        reachouts++;

        const sentCount = getOwnerMessagesSentCount(o);
        msgsSent += sentCount;

        const replied = ownerHasReplied(o);
        if (replied) {
            replies++;
        } else {
            waitingOnReply++;
        }

        const s = String(o["wa_sentiment"] || "").toLowerCase().trim();
        if (s === "positive") sentiment.positive++;
        else if (s === "neutral") sentiment.neutral++;
        else if (s === "negative") sentiment.negative++;
        else sentiment.unknown++;

        const activityDate = getOwnerLastContactedDate(o);
        if (activityDate) {
            const dStr = activityDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
            if (!dailyGroups[dStr]) dailyGroups[dStr] = { date: dStr, sent: 0, replied: 0 };
            dailyGroups[dStr].sent += sentCount;
            if (replied) dailyGroups[dStr].replied += 1;
        }
    });

    const trend = Object.values(dailyGroups)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-7);

    return {
        totalOwners: eligible.length,
        reachouts,
        replies,
        msgsSent,
        replyRate: reachouts > 0 ? Math.round((replies / reachouts) * 1000) / 10 : 0,
        waitingOnReply,
        sentiment,
        trend,
    };
}
