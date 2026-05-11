import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { summaries } = await req.json();
        
        if (!summaries || !Array.isArray(summaries) || summaries.length === 0) {
            return NextResponse.json({ results: {} });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        const vapiKey = process.env.VAPI_PRIVATE_KEY;
        
        // Extract Summaries via REST Single Call for VAPI if missing - Execute Sequentially to avoid VAPI rate limits
        const enrichedList = [];
        for (const item of summaries) {
            let text = item.text || "";
            let evalPassed = false;
            
            if (!text && item.source === 'vapi' && vapiKey) {
                try {
                    const r = await fetch(`https://api.vapi.ai/call/${item.id}`, {
                        headers: { "Authorization": `Bearer ${vapiKey}` }
                    });
                    if (r.ok) {
                        const data = await r.json();
                        text = data.analysis?.summary || data.summary || "";
                        
                        // Option B Fallback Check (Structured Outputs)
                        if (!text && data.analysis?.structuredData) {
                            for (const key of Object.keys(data.analysis.structuredData)) {
                                const entry = data.analysis.structuredData[key];
                                if (entry && (entry.name === "Call Summary" || entry.name?.toLowerCase().includes("summary"))) {
                                    text = entry.result || entry.value || "";
                                    break;
                                }
                            }
                        }
                        const se = data.analysis?.successEvaluation;
                        evalPassed = se === true || String(se).toLowerCase() === 'true' || String(se).toLowerCase() === 'success';
                    }
                } catch(e) {}
            }
            enrichedList.push({ id: item.id, text, evalPassed });
        }

        // If no API key, use fallback keyword extraction
        if (!apiKey) {
            const results: Record<string, string> = {};
            const detailedSummaries: Record<string, string> = {}; // Track fetched summaries
            
            enrichedList.forEach(({ id, text, evalPassed }) => {
                const sl = text.toLowerCase();
                const posKeywords = ['interested', 'positive', 'callback', 'schedule', 'book', 'follow-up', 'yes', 'agreed', 'confirmed'];
                const negKeywords = ['not interested', 'no thank', 'wrong number', "don't call", 'do not call', 'busy', 'refused', 'declined', 'voicemail'];
                
                let intent = "none";
                const hasPositive = posKeywords.some(kw => sl.includes(kw));
                const hasNegative = negKeywords.some(kw => sl.includes(kw));
                
                // ONLY evaluate and cache if we actually have text or an explicit true evalPassed. 
                // If it's empty, VAPI hasn't generated it yet – so we leave it out of results so it retries later!
                if (!text && !evalPassed) return;
                
                if (text && hasPositive && !hasNegative) intent = "positive";
                else if (text && hasNegative) intent = "negative";
                else if (evalPassed || text.length > 10) intent = "qualified";
                
                results[id] = intent;
                if (text) detailedSummaries[id] = text;
            });
            return NextResponse.json({ results, updatedSummaries: detailedSummaries });
        }

        // Use LLM to define positive, negative, or qualified
        const prompt = `Analyze the following call summaries and classify the intent of each interaction.
For each summary, output the ID and its classification.
The classification MUST be one of exactly four values: "positive", "negative", "qualified", or "none".
Rules:
- "positive": User showed clear interest, agreed to a callback/meeting, or was positively engaged.
- "negative": User was not interested, refused, requested DNC (Do Not Call), or conversation was hostile/abrupt. 
- "qualified": The conversation reached a meaningful stage or exchanged defined qualification details, but neither purely positive nor negative.
- "none": A generic voicemail, silence, instant hangup, or un-evaluable.

Respond using a JSON object containing a "results" key mapping each ID to its intent. Example: {"results": {"id1": "positive", "id2": "negative"}}

Summaries:
${enrichedList.filter(s => s.text || s.evalPassed).map((s) => `ID: ${s.id}\nSummary: ${s.text || "N/A"}\n`).join('---\n')}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        if (!response.ok) {
            console.error("OpenAI API failed:", await response.text());
            return NextResponse.json({ error: "LLM evaluation failed" }, { status: 500 });
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        const results = content.results || {};
        
        // Save globally to Supabase
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
        const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
        
        if (supabaseUrl && secretKey && Object.keys(results).length > 0) {
            try {
                const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
                const headers = { 
                    "apikey": secretKey, 
                    "Authorization": `Bearer ${secretKey}`,
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                };
                
                // Filter out 'none' if it was a ghost result so we only persist valid eval intents
                const validIds = Object.keys(results).filter(id => results[id] !== "none");
                const insertData = validIds.map(id => ({
                    id,
                    intent: results[id]
                }));
                
                if (insertData.length > 0) {
                    fetch(`${baseUrl}/call_evaluations`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(insertData)
                    }).catch(e => console.error("Could not save to Supabase call_evaluations table", e));
                }
            } catch(e) {}
        }
        
        // Also return the enriched summaries so the frontend can display them properly
        const detailedSummaries: Record<string, string> = {};
        enrichedList.forEach(s => { if (s.text) detailedSummaries[s.id] = s.text; });
        
        return NextResponse.json({ results, updatedSummaries: detailedSummaries });
    } catch (error) {
        console.error("LLM Eval API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
