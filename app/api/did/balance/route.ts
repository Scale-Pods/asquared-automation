import { NextResponse } from "next/server";

export async function GET() {
  try {
    const API_KEY = process.env.DIDLOGIC_API_KEY;

    if (!API_KEY) {
      return NextResponse.json({ balance: 0, error: "DIDLOGIC_API_KEY not set" });
    }

    const response = await fetch("https://api.didlogic.com/v1/account/balance", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-API-KEY": API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`DIDLogic API error: ${response.status}`);
    }

    const data = await response.json();
    
    // DIDLogic response format usually has balance at root or in a specific field
    // Adjust based on actual API response if known
    const balanceValue = data.balance ?? data.amount ?? 0;

    return NextResponse.json({
      ...data,
      balance: parseFloat(balanceValue)
    });

  } catch (err: any) {
    console.error("DIDLogic Balance Error:", err);
    return NextResponse.json({
      error: err.message,
      balance: 0
    }, { status: 500 });
  }
}
