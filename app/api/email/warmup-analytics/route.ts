import { NextResponse } from 'next/server';
import dns from 'node:dns';

// Force IPv4 to avoid Cloudflare IPv6 connection timeouts
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {
    // ignore
}

export async function POST() {
    try {
        const apiKey = process.env.INSTANTLY_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Configuration error: INSTANTLY_API_KEY is missing' },
                { status: 500 }
            );
        }

        const targetEmails = [
            "info@asquared.me",
            "sales@asquared.me"
        ];

        const response = await fetch('https://api.instantly.ai/api/v2/accounts/warmup-analytics', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emails: targetEmails
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Instantly API Error:', response.status, errorText);
            return NextResponse.json(
                { error: `Instantly API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        // Helper to process individual stats
        const processStats = (stats: any, email: string, historyData: any = {}) => {
            const total_sent = Number(stats.total_sent) || Number(stats.sent) || 0;
            const landed_inbox = Number(stats.landed_inbox) || 0;
            const landed_spam = Number(stats.landed_spam) || 0;
            const received = Number(stats.received) || 0;
            const health_score = Number(stats.health_score) || 0;

            const inbox_rate = total_sent > 0 ? (landed_inbox / total_sent) * 100 : 0;
            const spam_rate = total_sent > 0 ? (landed_spam / total_sent) * 100 : 0;

            let status = "Poor";
            if (health_score >= 80) status = "Healthy";
            else if (health_score >= 60) status = "Medium";

            // Process history if available
            let history: any[] = [];
            if (historyData && historyData[email]) {
                const dates = Object.keys(historyData[email]).sort(); // Ensure chronological order
                history = dates.map(date => {
                    const dayStats = historyData[email][date];
                    return {
                        date,
                        sent: Number(dayStats.sent) || 0,
                        inbox: Number(dayStats.landed_inbox) || 0,
                        spam: Number(dayStats.landed_spam) || 0,
                    };
                });
            }

            return {
                email,
                total_sent,
                landed_inbox,
                landed_spam,
                received,
                health_score,
                health_label: `${health_score}%`,
                inbox_rate: Number(inbox_rate.toFixed(2)),
                spam_rate: Number(spam_rate.toFixed(2)),
                status,
                history // Added history array
            };
        };

        let structuredData: any[] = [];

        // Handle the structure: { aggregate_data: { [email]: { ... } }, email_date_data: { ... } }
        if (data.aggregate_data) {
            const emails = Object.keys(data.aggregate_data);
            structuredData = emails.map(email => {
                return processStats(data.aggregate_data[email], email, data.email_date_data);
            });
        }
        // Fallback for array response (if API changes behavior)
        else if (Array.isArray(data)) {
            structuredData = data.map((item: any) => processStats(item, item.email));
        }
        else if (data && Array.isArray(data.data)) {
            structuredData = data.data.map((item: any) => processStats(item, item.email));
        }

        return NextResponse.json(structuredData);

    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
