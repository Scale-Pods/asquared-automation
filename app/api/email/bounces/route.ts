import { NextResponse } from 'next/server';
import dns from 'node:dns';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {
    // ignore
}

export async function GET() {
    const apiKey = process.env.INSTANTLY_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: true, message: 'Configuration error: INSTANTLY_API_KEY is missing', status: 500 },
            { status: 500 }
        );
    }

    try {
        // STEP A — First get your Account ID
        const accountsResponse = await fetch('https://api.instantly.ai/api/v2/accounts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!accountsResponse.ok) {
            const errorText = await accountsResponse.text();
            console.error('Instantly Accounts API Error:', accountsResponse.status, errorText);
            return NextResponse.json(
                { error: true, message: `Instantly Accounts API error: ${accountsResponse.status}`, status: accountsResponse.status.toString() },
                { status: accountsResponse.status }
            );
        }

        const accountsData = await accountsResponse.json();

        // Handle structure: { items: [...], next_starting_after: ... } or just [...]
        // API v2 often uses 'items' for pagination lists
        let accounts = [];
        if (Array.isArray(accountsData)) {
            accounts = accountsData;
        } else if (accountsData.items && Array.isArray(accountsData.items)) {
            accounts = accountsData.items;
        } else if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
            accounts = accountsData.accounts;
        } else if (accountsData.data && Array.isArray(accountsData.data)) {
            accounts = accountsData.data;
        }

        if (!accounts || accounts.length === 0) {
            console.error('Instantly API: No accounts found to fetch bounces for.');
            return NextResponse.json(
                { error: true, message: 'No accounts found in Instantly.', status: '404' },
                { status: 404 }
            );
        }

        // Filter for specific emails
        const targetEmails = ["info@asquared.me", "sales@asquared.me"];
        const filteredAccounts = accounts.filter((acc: any) => targetEmails.includes(acc.email));

        if (filteredAccounts.length === 0) {
            console.log("DEBUG: No matching accounts found for target emails.");
            // Optional: return empty instead of error, or keep 404? 
            // Returning empty valid structure is better for UI.
            return NextResponse.json({
                summary: { total_bounces: 0, hard_bounces: 0, soft_bounces: 0, technical_bounces: 0 },
                bounced_emails: []
            });
        }

        let allBounces: any[] = [];

        // Parallel execution to be faster
        const bouncePromises = filteredAccounts.map(async (account: any) => {
            const accountId = account.id;
            if (!accountId) return [];

            const bouncesUrl = `https://api.instantly.ai/api/v2/accounts/${accountId}/bounces`;
            try {
                const res = await fetch(bouncesUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) return data;
                    if (data.items && Array.isArray(data.items)) return data.items;
                    if (data.bounces && Array.isArray(data.bounces)) return data.bounces;
                    if (data.emails && Array.isArray(data.emails)) return data.emails;
                    return [];
                }
                return [];
            } catch (e) {
                console.error(`Failed to fetch bounces for account ${accountId}`, e);
                return [];
            }
        });

        const results = await Promise.all(bouncePromises);
        results.forEach(accountBounces => {
            allBounces = [...allBounces, ...accountBounces];
        });

        // STEP 3 — Extract and Transform
        const total_bounces = allBounces.length;
        const hard_bounces = allBounces.filter((b: any) => b.type?.toLowerCase().includes('hard')).length;
        const soft_bounces = allBounces.filter((b: any) => b.type?.toLowerCase().includes('soft')).length;
        const technical_bounces = allBounces.filter((b: any) => b.type?.toLowerCase().includes('tech')).length;

        // Sort by date desc
        allBounces.sort((a: any, b: any) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        const bounced_emails = allBounces.map((b: any) => ({
            email: b.email,
            type: b.type || "Unknown",
            from: b.sender || b.from || "Unknown",
            date: b.date ? new Date(b.date).toISOString().split('T')[0] : "Unknown"
        }));

        // STEP 4 — Return ONLY structured JSON
        return NextResponse.json({
            summary: {
                total_bounces,
                hard_bounces,
                soft_bounces,
                technical_bounces
            },
            bounced_emails
        });

    } catch (error) {
        console.error('Bounces API Route Error:', error);
        return NextResponse.json(
            { error: true, message: 'Internal Server Error', status: '500' },
            { status: 500 }
        );
    }
}
