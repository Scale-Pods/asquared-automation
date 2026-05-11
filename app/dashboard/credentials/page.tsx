"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Mail, MessageCircle, Mic, ExternalLink, Copy, Eye, EyeOff, ShieldCheck, Wallet, Phone, BarChart3, Settings, Smartphone } from "lucide-react";
import React, { useState } from "react";
import { DIDBalanceDetail } from "@/components/dashboard/did-balance-detail";
import { useRouter } from "next/navigation";

import { useData } from "@/context/DataContext";

export default function CredentialsPage() {
    const { calls, voiceBalance, didBalance, loadingBalances } = useData();

    const vapiAgentUsed = React.useMemo(() => {
        if (!calls || !Array.isArray(calls)) return 0;
        return calls.filter((c: any) => c.source === 'vapi').reduce((acc: number, call: any) => acc + (call.breakdown?.agent || 0), 0);
    }, [calls]);

    const didUsedCost = React.useMemo(() => {
        if (!calls || !Array.isArray(calls)) return 0;
        return calls.filter((c: any) => {
            const isDID = c.source === 'did' || c.source === 'didlogic' || c.source === 'maqsam' || c.source === 'twilio';
            const phoneStr = String(c.phone || c.customer_number || "");
            const isUAE = phoneStr.startsWith('+971') || phoneStr.startsWith('971');
            return isDID || isUAE;
        }).reduce((acc: number, call: any) => acc + (call.costValue || 0), 0);
    }, [calls]);

    const [senderEmails, setSenderEmails] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    React.useEffect(() => {
        const fetchEmails = async () => {
            try {
                const res = await fetch('/api/email/warmup-analytics', { method: 'POST' });
                if (!res.ok) throw new Error("Failed to fetch analytics");
                const data = await res.json();

                // Extract emails from the warmup account objects
                if (Array.isArray(data)) {
                    const emails = data.map((account: any) => account.email);
                    setSenderEmails(emails);
                }
            } catch (err) {
                console.error("Error fetching sender emails:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchEmails();
    }, []);

    const vapiDetails = voiceBalance?.vapi;
    const elDetails = voiceBalance?.elevenlabs || (voiceBalance?.character_limit ? voiceBalance : null);

    return (
        <div className="space-y-8 pb-10 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Credentials Management</h1>
                    <p className="text-slate-500">View your active integrations and manageable accounts.</p>
                </div>
            </div>

            <div className="grid gap-6">
                {/* Email Section */}
                <CredentialSection
                    title="Email Integration"
                    description="Active sender accounts detected from your campaigns."
                    icon={Mail}
                    iconColor="text-rose-600"
                    iconBg="bg-rose-50"
                >
                    <div className="grid gap-6 md:grid-cols-2">
                        {loading ? (
                            <div className="md:col-span-2 text-slate-400 text-sm animate-pulse">Detecting active email accounts...</div>
                        ) : senderEmails.length > 0 ? (
                            senderEmails.map((email, idx) => (
                                <ReadOnlyField key={idx} label={`Project Email ${idx + 1}`} value={email} />
                            ))
                        ) : (
                            <ReadOnlyField label="Connected Email" value="No active emails detected" />
                        )}
                    </div>
                </CredentialSection>

                {/* WhatsApp Section */}
                <CredentialSection
                    title="WhatsApp Business API"
                    description="Meta Business API credentials for WhatsApp CRM."
                    icon={MessageCircle}
                    iconColor="text-emerald-600"
                    iconBg="bg-emerald-50"
                >
                    <div className="grid gap-6 md:grid-cols-2">
                        <ReadOnlyField label="WhatsApp Account 1 " value="xxx" />
                        <ReadOnlyField label="WhatsApp Account 2" value="xxx" />
                    </div>
                </CredentialSection>

                {/* Provisioned Numbers Section */}
                <CredentialSection
                    title="Provisioned Phone Numbers"
                    description="Active telephony lines for Voice and WhatsApp."
                    icon={Phone}
                    iconColor="text-cyan-600"
                    iconBg="bg-cyan-50"
                >
                    <div className="grid gap-8 md:grid-cols-3">
                        {/* UK Section */}
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="DID Logic ( owners data )" value="+44 (20) 8097 8341" />
                            <ReadOnlyField label="Agent ID" value="682cf6ae-23fd-44f3-a4a3-756998cd62c1" />
                        </div>

                        {/* US Section */}
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="( normal leads )" value=" " />
                            <ReadOnlyField label="Agent ID" value=" " />
                        </div>

                        
                    </div>
                </CredentialSection>

                {/* Voice Section */}
                <CredentialSection
                    title="Voice Agent (Vapi & ElevenLabs)"
                    description="AI Voice configuration and wallet balances."
                    icon={Mic}
                    iconColor="text-blue-600"
                    iconBg="bg-blue-50"
                    action={
                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 gap-2" onClick={() => router.push('/dashboard/voice/logs')}>
                                <BarChart3 className="h-4 w-4" />
                                Detailed Cost Analysis
                            </Button>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={() => window.open('https://dashboard.vapi.ai/login', '_blank')}>
                                <Wallet className="h-4 w-4" />
                                Vapi Wallet
                            </Button>
                        </div>
                    }
                >
                    <div className="grid gap-6">
                        {/* Vapi Details */}
                        <div className="bg-blue-50/50 rounded-lg p-5 border border-blue-100 flex flex-col gap-4">
                            <div className="flex flex-col text-center bg-white p-8 rounded-lg border border-blue-100 shadow-sm">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Vapi Credits Used</span>
                                <span className="text-5xl font-black text-blue-600">
                                    ${vapiAgentUsed.toFixed(2)}
                                </span>
                                <p className="text-[10px] text-blue-500 mt-4 font-semibold bg-blue-50 px-3 py-1 rounded-full self-center border border-blue-100 italic">
                                    Total Lifetime Consumption
                                </p>
                            </div>
                        </div>

                        
                    </div>
                </CredentialSection>

                <CredentialSection
                    title="DID Telephony"
                    description="Real-time balance and usage records for Telephony providers."
                    icon={Smartphone}
                    iconColor="text-blue-600"
                    iconBg="bg-blue-50"
                    action={
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={() => window.open('https://didlogic.com', '_blank')}>
                            <ExternalLink className="h-4 w-4" />
                            Manage Billing
                        </Button>
                    }
                >
                    <DIDBalanceDetail initialBalance={didBalance} />
                </CredentialSection>
            </div>
        </div>
    );
}

function CredentialSection({ title, description, icon: Icon, iconColor, iconBg, children, action }: any) {
    return (
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b border-slate-50 bg-slate-50/30 pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${iconBg} ${iconColor}`}>
                            <Icon className="h-6 w-6" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-900">{title}</CardTitle>
                            <CardDescription className="mt-1">{description}</CardDescription>
                        </div>
                    </div>
                    {action && <div>{action}</div>}
                </div>
            </CardHeader>
            <CardContent className="p-6">
                {children}
            </CardContent>
        </Card>
    );
}

function ReadOnlyField({ label, value, isPassword }: { label: string, value: string, isPassword?: boolean }) {
    const [show, setShow] = useState(false);

    // Simple masking logic
    const displayValue = isPassword && !show
        ? "••••••••••••••••••••••••"
        : value;

    return (
        <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</Label>
            <div className="relative group">
                <div className="flex items-center w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm">
                    <span className={`flex-1 truncate ${isPassword && !show ? 'font-mono tracking-widest' : 'font-sans'}`}>
                        {displayValue}
                    </span>
                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isPassword && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-600" onClick={() => setShow(!show)}>
                                {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-slate-600"
                            onClick={() => navigator.clipboard.writeText(value)}
                        >
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
