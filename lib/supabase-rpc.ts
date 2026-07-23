// Thin server-only helper for calling Postgres RPC functions via PostgREST's
// /rest/v1/rpc/<function> endpoint — mirrors the raw-fetch pattern already used
// by fetchAllRows in lib/server-parsers.ts (this codebase doesn't use the
// @supabase/supabase-js client for server routes, so RPC calls go through the
// same REST surface for consistency).
export async function callRpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !secretKey) {
        throw new Error("Supabase config missing");
    }

    const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const res = await fetch(`${baseUrl}/rpc/${fn}`, {
        method: 'POST',
        headers: {
            "apikey": secretKey,
            "Authorization": `Bearer ${secretKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`RPC ${fn} failed (${res.status}): ${text}`);
    }

    return res.json();
}
