"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Mail, MessageCircle, Mic, ExternalLink, Copy, Eye, EyeOff, ShieldCheck, Wallet, Phone, BarChart3, Settings, Smartphone, DollarSign, Users, Activity } from "lucide-react";
import React, { useState, useEffect } from "react";
import { DIDBalanceDetail } from "@/components/dashboard/did-balance-detail";
import { useRouter } from "next/navigation";

export default function CredentialsPage() {
    const [voiceBalance, setVoiceBalance] = useState<any>(null);
    const [didBalance, setDidBalance] = useState<any>(null);
    const [loadingBalances, setLoadingBalances] = useState(true);
    const [totalCosts, setTotalCosts] = useState<any>(null);
    const router = useRouter();

    React.useEffect(() => {
        async function fetchData() {
            try {
                const [vapiRes, didRes, costRes] = await Promise.all([
                    fetch('/api/vapi/balance'),
                    fetch('/api/did/balance'),
                    fetch('/api/calls/total-cost')
                ]);
                if (vapiRes.ok) setVoiceBalance(await vapiRes.json());
                if (didRes.ok) setDidBalance(await didRes.json());
                if (costRes.ok) setTotalCosts(await costRes.json());
            } catch (err) {
                console.error("Failed to fetch balances", err);
            } finally {
                setLoadingBalances(false);
            }
        }
        fetchData();
    }, []);

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
                

                {/* WhatsApp Section */}
                <CredentialSection
                    title="WhatsApp Business API"
                    description="Meta Business API credentials for WhatsApp CRM."
                    icon={MessageCircle}
                    iconColor="text-emerald-600"
                    iconBg="bg-emerald-50"
                >
                    <div className="grid gap-6 md:grid-cols-2">
                        <ReadOnlyField label="WhatsApp Account 1 " value="+971 58 916 5893" />
                        
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
                    <div className="grid gap-8 md:grid-cols-5">
                        {/* UK Section */}
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="DID Logic ( owners data 1  )" value="+44 (20) 8097 0399" />
                            <ReadOnlyField label="Agent ID" value="f99e8e9a-48b1-411f-806e-6cb7d1dde58b" />
                        </div>
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="DID Logic ( owners data 2 )" value=" +44 (20) 8097 8341" />
                            <ReadOnlyField label="Agent ID" value="682cf6ae-23fd-44f3-a4a3-756998cd62c1" />
                        </div>
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="DID Logic ( owners data 3 )" value="+44 (20) 8097 1901  " />
                            <ReadOnlyField label="Agent ID" value="91732d4e-3b60-4950-8aa6-4060c0803119" />
                        </div>
                        {/* US Section */}
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="( Secondary leads )" value="+44 (20) 8638 2632" />
                            <ReadOnlyField label="Agent ID" value="c552e5b3-6c41-41d2-83b4-7c820e0d14bb " />
                        </div>
                        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <ReadOnlyField label="DID Logic ( unknown leads )" value="NOT CONNECTED" />
                            <ReadOnlyField label="Agent ID" value="3266ea3f-336e-436a-bd2a-63f196aab37f" />
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
                    <div className="grid md:grid-cols-1 gap-4">
                        
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <div className="flex items-center gap-2 mb-3">
                                <Wallet className="h-4 w-4 text-blue-500" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cost Breakdown by Account</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Owners</span>
                                    <span className="font-bold text-amber-600">${(totalCosts?.ownerAgentCost || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Secondary</span>
                                    <span className="font-bold text-indigo-600">${(totalCosts?.secondaryAgentCost || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Unknown</span>
                                    <span className="font-bold text-violet-600">${(totalCosts?.unknownAgentCost || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-1 flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-800">Total</span>
                                    <span className="text-slate-900">${(totalCosts?.totalAgentCost || 0).toFixed(2)}</span>
                                </div>
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
