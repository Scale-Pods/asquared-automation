"use client";

import React from "react";
import { Wallet, ExternalLink, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DIDBalanceDetail({ initialBalance }: { initialBalance?: any }) {
    const balance = initialBalance?.balance ?? 0;

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-8 border border-blue-100 shadow-sm relative overflow-hidden text-center">
                <div className="flex flex-col items-center">
                    <div className="p-3 bg-blue-50 rounded-full text-blue-600 mb-4">
                        <Wallet className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                        Telephony Balance (USD)
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-blue-600">$</span>
                        <span className="text-6xl font-black tracking-tighter text-slate-900">
                            {balance.toFixed(2)}
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
        </div>
    );
}
