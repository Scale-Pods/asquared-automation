/**
 * Normalises a raw WhatsApp delivery-status string into a short badge label
 * plus the full provider detail.
 *
 * Providers do not return a single keyword for failures. Meta sends a whole
 * sentence, e.g.
 *   "Failed: This message was not delivered to maintain healthy ecosystem
 *    engagement. (in order to maintain a healthy ecosystem engagement, the
 *    message failed to be delivered.)"
 *
 * Rendering that raw inside a table badge destroys the row layout, so the badge
 * must always show ONE word and the sentence belongs in a tooltip.
 */
export type MessageStatusLabel =
    | 'Sent'
    | 'Delivered'
    | 'Read'
    | 'Failed'
    | 'Pending'
    | string;

export interface ParsedMessageStatus {
    /** Short word for the badge, e.g. "Failed". Never a full sentence. */
    label: MessageStatusLabel;
    /** Full provider text when it says more than the label; '' otherwise. */
    detail: string;
    /** Timestamp portion when the status carried one; '' otherwise. */
    timestamp: string;
}

export function parseMessageStatus(rawInput: string): ParsedMessageStatus | null {
    if (!rawInput) return null;
    const status = String(rawInput).trim();
    if (!status) return null;

    const isIsoTs = /^\d{4}-\d{2}-\d{2}T/.test(status);
    // Nurture format: "SENT at Jun 05 2026, 04:10 PM"
    const isNurtureTs = !isIsoTs && /\bat\s+[A-Za-z]+\s+\d{1,2}\s+\d{4}/i.test(status);

    let statusText: string;
    let timestamp: string;

    if (isIsoTs) {
        statusText = 'Sent';
        timestamp = status;
    } else if (isNurtureTs) {
        const atIdx = status.toLowerCase().indexOf(' at ');
        statusText = atIdx > 0 ? status.slice(0, atIdx).trim() : status;
        timestamp = status;
    } else {
        const parts = status.split(' - ');
        statusText = parts[0].trim();
        timestamp = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
    }

    const lower = statusText.toLowerCase();
    let label: string;
    if (lower.includes('fail') || lower.includes('undeliver') || lower.includes('not delivered')) label = 'Failed';
    else if (lower.includes('deliver')) label = 'Delivered';
    else if (lower.includes('read')) label = 'Read';
    else if (lower.includes('sent')) label = 'Sent';
    else if (lower.includes('pending') || lower.includes('queue')) label = 'Pending';
    else {
        // Unknown status: keep only the first word so the layout still holds.
        const firstWord = statusText.split(/[\s:,.]+/)[0] || statusText;
        label = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    }

    // Anything longer than the keyword is the provider's reason -> tooltip only.
    const detail = statusText.length > label.length ? statusText : '';

    return { label, detail, timestamp };
}
