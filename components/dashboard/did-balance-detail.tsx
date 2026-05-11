"use client";

import React, { useMemo } from "react";
import { Wallet, ExternalLink, CreditCard } from "lucide-react";
import { calculateDuration } from "@/lib/utils";
import { useData } from "@/context/DataContext";
import { Button } from "@/components/ui/button";

export function DIDBalanceDetail({ initialBalance }: { initialBalance?: any }) {
    const { calls, loadingCalls } = useData();

    const stats = useMemo(() => {
        if (!calls || calls.length === 0) return { inbound: 0, outbound: 0, total: 0, cost: 0 };

        const filtered = calls.filter((call: any) => {
            // Updated logic to detect DID/Telephony calls
            const isDID = call.source === 'did' || call.source === 'didlogic' || call.source === 'maqsam' || call.source === 'twilio';
            const provisionedNum = String(call.phoneNumber || "");
            
            // Detection based on common prefixes or specific flags
            const phoneStr = String(call.phone || call.customer_number || "");
            const isUAE = phoneStr.startsWith('+971') || phoneStr.startsWith('971');

            return isDID || isUAE;
        });

        let inbound = 0;
        let outbound = 0;
        let totalCost = 0;

        filtered.forEach((call: any) => {
            const duration = calculateDuration(call);
            const isInbound = call.isInbound === true || (typeof call.type === 'string' && call.type.toLowerCase() === "inbound");

            if (isInbound) {
                inbound += duration;
            } else {
                outbound += duration;
            }
            // Use the specific telephony breakdown cost, fallback to costValue
            totalCost += (call.breakdown?.telephony || call.costValue || 0);
        });

        const total = inbound + outbound;

        return { inbound, outbound, total, cost: totalCost };
    }, [calls]);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-8 border border-blue-100 shadow-sm relative overflow-hidden text-center">
                <div className="flex flex-col items-center">
                    <div className="p-3 bg-blue-50 rounded-full text-blue-600 mb-4">
                        <Wallet className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                        Telephony Consumption (USD)
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-blue-600">$</span>
                        <span className="text-6xl font-black tracking-tighter text-slate-900">
                            {stats.cost.toFixed(2)}
                        </span>
                    </div>

                </div>
            </div>

            <Button
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold gap-2 shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
                onClick={() => window.open('https://didlogic.com', '_blank')}
            >
                <CreditCard className="h-4 w-4" />
                Add Funds to Telephony
                <ExternalLink className="h-3 w-3 opacity-50" />
            </Button>

            {loadingCalls && (
                <p className="text-center text-xs text-slate-400 animate-pulse">Syncing lifetime logs...</p>
            )}
        </div>
    );
}
