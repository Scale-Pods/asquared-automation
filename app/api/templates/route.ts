import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const [emailRes, whatsappRes] = await Promise.all([
            fetch(process.env.TEMPLATES_EMAIL_WEBHOOK_URL || 'https://n8n.srv1010832.hstgr.cloud/webhook/template-email', { cache: 'no-store' }),
            fetch(process.env.TEMPLATES_WHATSAPP_WEBHOOK_URL || 'https://n8n.srv1010832.hstgr.cloud/webhook/template-whatsapp', { cache: 'no-store' })
        ]);

        const templates: any[] = [];

        // Process Email Templates
        if (emailRes.ok) {
            const data = await emailRes.json();
            const rawContent = data[0]?.cleaned_content || "";

            // Regex-based parsing for Email Templates
            const chunks = rawContent.split(/(?=Email \d+ –)/);
            let currentLoop = "Intro Loop";

            chunks.forEach((chunk: string) => {
                if (!chunk.trim()) return;

                if (chunk.includes("INTRO EMAIL LOOP")) currentLoop = "Intro Loop";
                if (chunk.includes("FOLLOW-UP LOOP")) currentLoop = "Follow-Up Loop";
                if (chunk.includes("NURTURE EMAIL LOOP")) currentLoop = "Nurture Loop";

                const emailMatch = chunk.match(/Email (\d+) –/);
                if (emailMatch) {
                    const emailNum = emailMatch[1];
                    const key = `Email ${emailNum}`;

                    const subjectMatch = chunk.match(/Subject: (.*)/);
                    const subject = subjectMatch ? subjectMatch[1].trim() : "No Subject";

                    const subjectIndex = chunk.indexOf("Subject:");
                    let body = "";
                    if (subjectIndex !== -1) {
                        const afterSubject = chunk.substring(subjectIndex);
                        const firstNewLine = afterSubject.indexOf('\n');
                        if (firstNewLine !== -1) {
                            body = afterSubject.substring(firstNewLine).trim();
                        }
                    }
                    body = body.replace(/Week \d+/g, "").trim();

                    templates.push({
                        id: `email-${emailNum}`,
                        name: key,
                        type: 'email',
                        category: currentLoop,
                        subject: subject,
                        body: body,
                        content: body // for backward compatibility
                    });
                }
            });
        }

        // Process WhatsApp Templates
        if (whatsappRes.ok) {
            const whatsappData = await whatsappRes.json();
            // The webhook returns an array where the first item contains the big text blob
            const rawWhatsappContent = whatsappData[0]?.cleaned_content || "";

            if (rawWhatsappContent) {
                const lines = rawWhatsappContent.split('\n');
                let currentType = "WhatsApp"; // Intro Loop, Nurture Loop etc
                let currentTitle = "";
                let currentBodyBuffer: string[] = [];

                const flush = () => {
                    if (currentTitle && currentBodyBuffer.length > 0) {
                        const body = currentBodyBuffer.join('\n').trim();
                        if (body) {
                            templates.push({
                                id: `whatsapp-${templates.length}`,
                                name: currentTitle,
                                type: 'whatsapp', // for icon/badge
                                category: currentType,
                                subject: currentTitle, // reuse title as subject?
                                body: body,
                                content: body
                            });
                        }
                    }
                    currentTitle = "";
                    currentBodyBuffer = [];
                };

                const sectionHeaders = [
                    "INTRO Loop", "Call Attempt", "Follow-Up Loop", "Nurture Loop"
                ];

                // Regex for message headers like "Cold Message #1 (Day 0)" or "Nurture Message 1"
                const messageHeaderRegex = /^(Cold Message|Follow-Up Message|Nurture Message|WP - Nurture Message|Call Not Answered)(.*)/i;

                lines.forEach((line: string) => {
                    const trimmed = line.trim();
                    if (!trimmed) return;

                    // Check for Section Headers
                    const isSectionHeader = sectionHeaders.some(h => trimmed.toLowerCase().includes(h.toLowerCase()));
                    if (isSectionHeader) {
                        if (trimmed.toLowerCase().includes("intro")) currentType = "Intro Loop";
                        if (trimmed.toLowerCase().includes("follow-up")) currentType = "Follow-Up Loop";
                        if (trimmed.toLowerCase().includes("nurture")) currentType = "Nurture Loop";
                        return;
                    }

                    if (trimmed.startsWith("Week")) return; // Skip "Week 1" markers

                    // Check for Message Header
                    if (messageHeaderRegex.test(trimmed)) {
                        flush();
                        currentTitle = trimmed;
                        // Sometimes title and body are on same line?
                        // e.g. "Nurture Message 1 (Day 0) Hi [Name]..."
                        // Use simple heuristic: formatting usually puts body on next line, 
                        // but if line is very long, it might be mixed.
                    } else {
                        if (currentTitle) {
                            currentBodyBuffer.push(trimmed);
                        }
                    }
                });
                flush();
            } else if (Array.isArray(whatsappData)) {
                // Fallback if structure is different
                whatsappData.forEach((item: any, idx: number) => {
                    templates.push({
                        id: `whatsapp-raw-${idx}`,
                        name: item.name || `WhatsApp ${idx + 1}`,
                        type: 'whatsapp',
                        category: 'General',
                        body: item.content || item.body || JSON.stringify(item),
                        content: item.content || item.body || JSON.stringify(item)
                    });
                });
            }
        }

        return NextResponse.json(templates);

    } catch (error) {
        console.error('Template fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}


