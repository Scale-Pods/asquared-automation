import { NextResponse } from "next/server";

export async function GET() {
  try {
    const API_KEY = process.env.DIDLOGIC_API_KEY;

    if (!API_KEY) {
      return NextResponse.json({ balance: 0, error: "DIDLOGIC_API_KEY not set" });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch("https://api.didlogic.com/v1/account/balance", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-API-KEY": API_KEY
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json({ balance: 0, error: `DIDLogic API error: ${response.status}` });
      }

      const data = await response.json();
      const balanceValue = data.balance ?? data.amount ?? 0;

      return NextResponse.json({
        ...data,
        balance: parseFloat(balanceValue)
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.error("DIDLogic Fetch Error:", fetchErr);
      return NextResponse.json({ balance: 0, error: "DIDLogic Connection failed" });
    }

  } catch (err: any) {
    console.error("Global DIDLogic API Error:", err);
    return NextResponse.json({ balance: 0, error: err.message }, { status: 500 });
  }
}
