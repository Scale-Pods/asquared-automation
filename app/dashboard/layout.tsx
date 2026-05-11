"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Mail, MessageCircle, Mic, Settings, LogOut, ChevronDown, Wallet, BarChart2, Users, Send, Key, ExternalLink, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataProvider, useData } from "@/context/DataContext";
import { DIDBalanceDetail } from "@/components/dashboard/did-balance-detail";
import { calculateDuration } from "@/lib/utils";
import { useMemo } from "react";
import { logout } from "@/app/actions/auth";

const sidebarItems = [
    {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        title: "Email Marketing",
        href: "/dashboard/email",
        icon: Mail,
    },
    {
        title: "WhatsApp",
        href: "/dashboard/whatsapp",
        icon: MessageCircle,
    },
    {
        title: "Voice Agent",
        href: "/dashboard/voice",
        icon: Mic,
    },
];

function WalletModal({ isOpen, onClose, type, details, calls }: { isOpen: boolean, onClose: () => void, type: 'vapi' | 'elevenlabs' | 'did', details?: any, calls?: any[] }) {
    const { voiceBalance, didBalance } = useData();

    const title = (() => {
        switch (type) {
            case 'vapi': return 'Vapi Wallet';
            case 'elevenlabs': return 'ElevenLabs Credits';
            case 'did': return 'Telephony (DID)';
            default: return 'Balance Detail';
        }
    })();

    const icon = (() => {
        switch (type) {
            case 'vapi': return <Mic className="h-5 w-5 text-blue-600" />;
            case 'elevenlabs': return <Settings className="h-5 w-5 text-amber-600" />;
            case 'did': return <Smartphone className="h-5 w-5 text-blue-600" />;
            default: return <Wallet className="h-5 w-5" />;
        }
    })();

    const vapiAgentUsed = useMemo(() => {
        if (!calls || !Array.isArray(calls)) return 0;
        // Strictly sum 'agent' costs from the logs displayed in the current range
        return calls.filter((c: any) => c.source === 'vapi').reduce((acc: number, call: any) => acc + (call.breakdown?.agent || 0), 0);
    }, [calls]);

    const didUsedCost = useMemo(() => {
        if (!calls || !Array.isArray(calls)) return 0;
        return calls.filter((c: any) => {
            const isDID = c.source === 'did' || c.source === 'didlogic' || c.source === 'maqsam' || c.source === 'twilio';
            const phoneStr = String(c.phone || c.customer_number || "");
            const isUAE = phoneStr.startsWith('+971') || phoneStr.startsWith('971');
            return isDID || isUAE;
        }).reduce((acc: number, call: any) => {
            return acc + (call.breakdown?.telephony || call.costValue || 0);
        }, 0);
    }, [calls]);

    const vapiDetails = voiceBalance?.vapi;
    const elDetails = voiceBalance?.elevenlabs || (voiceBalance?.character_limit ? voiceBalance : null);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={type === 'did' ? "sm:max-w-[550px]" : "sm:max-w-[420px]"}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {icon}
                        <span>{title}</span>
                    </DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-6">
                    {type === 'vapi' && (
                        <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100 flex flex-col gap-4">
                            <div className="flex flex-col text-center bg-white p-8 rounded-lg border border-blue-100 shadow-sm">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Vapi Credits Used</span>
                                <span className="text-5xl font-black text-blue-600">
                                    ${vapiAgentUsed.toFixed(2)}
                                </span>
                                
                            </div>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-12" onClick={() => window.open('https://vapi.ai', '_blank')}>
                                <ExternalLink className="h-4 w-4" /> Add Funds to VAPI
                            </Button>
                        </div>
                    )}

                    

                    {type === 'did' && (
                        <div className="space-y-4">
                            <DIDBalanceDetail initialBalance={didBalance} />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <DataProvider>
            <DashboardContent>
                {children}
            </DashboardContent>
        </DataProvider>
    );
}

function DashboardContent({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    const dashboardConfig = {
        master: {
            label: "Master Overview",
            icon: LayoutDashboard,
            items: [
                { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
                { title: "Email Marketing", href: "/dashboard/email", icon: Mail },
                { title: "WhatsApp CRM", href: "/dashboard/whatsapp", icon: MessageCircle },
                { title: "Voice Agent", href: "/dashboard/voice", icon: Mic },
                { title: "Leads", href: "/dashboard/leads", icon: Users },
                { title: "Credentials", href: "/dashboard/credentials", icon: Key },
            ]
        },
        email: {
            label: "Email Marketing",
            icon: Mail,
            items: [
                { title: "Overview", href: "/dashboard/email", icon: LayoutDashboard },
                { title: "Analytics", href: "/dashboard/email/analytics", icon: BarChart2 },
            ]
        },
        whatsapp: {
            label: "WhatsApp CRM",
            icon: MessageCircle,
            items: [
                { title: "Overview", href: "/dashboard/whatsapp", icon: LayoutDashboard },
                { title: "Leads", href: "/dashboard/whatsapp/leads", icon: Users },
                { title: "Sent Messages", href: "/dashboard/whatsapp/sent", icon: Send },
            ]
        },
        voice: {
            label: "Voice Agent",
            icon: Mic,
            items: [
                { title: "Overview", href: "/dashboard/voice", icon: LayoutDashboard },
                { title: "Call Logs", href: "/dashboard/voice/logs", icon: Mic },
            ]
        }
    };

    // Determine current context
    let currentContext = "master";
    if (pathname.startsWith("/dashboard/email")) currentContext = "email";
    else if (pathname.startsWith("/dashboard/whatsapp")) currentContext = "whatsapp";
    else if (pathname.startsWith("/dashboard/voice")) currentContext = "voice";

    const activeConfig = (dashboardConfig as any)[currentContext];

    const {
        calls,
        voiceBalance,
        didBalance,
        loadingBalances,
        loadingCalls
    } = useData();
    const vapiAgentUsed = useMemo(() => {
        // Prioritize Vapi API's native 'used' value if available
        if (voiceBalance?.vapi?.used !== undefined && voiceBalance?.vapi?.used !== 0) {
            return voiceBalance.vapi.used;
        }
        if (!calls || !Array.isArray(calls)) return 0;
        // Fallback to summing 'agent' costs from logs specifically
        return calls.filter((c: any) => c.source === 'vapi').reduce((acc: number, call: any) => acc + (call.breakdown?.agent || 0), 0);
    }, [calls, voiceBalance]);

    const didUsedCost = useMemo(() => {
        if (!calls || !Array.isArray(calls)) return 0;
        return calls.filter((c: any) => {
            const isDID = c.source === 'did' || c.source === 'didlogic' || c.source === 'maqsam' || c.source === 'twilio';
            const phoneStr = String(c.phone || c.customer_number || "");
            const isUAE = phoneStr.startsWith('+971') || phoneStr.startsWith('971');
            return isDID || isUAE;
        }).reduce((acc: number, call: any) => {
            return acc + (call.breakdown?.telephony || call.costValue || 0);
        }, 0);
    }, [calls]);

    const [walletModal, setWalletModal] = useState<{ isOpen: boolean, type: 'vapi' | 'elevenlabs' | 'did' }>({
        isOpen: false,
        type: 'vapi'
    });


    const content = (() => {
        if (pathname.startsWith("/dashboard/email") || pathname.startsWith("/dashboard/whatsapp") || pathname.startsWith("/dashboard/voice")) {
            return <>{children}</>;
        }

        return (
            <div className="flex h-screen overflow-hidden bg-zinc-50 text-slate-900">
                {/* Sidebar */}
                <aside className="hidden w-64 flex-col bg-zinc-950 border-r border-zinc-800 md:flex font-sans text-zinc-300">
                    {/* Logo Section */}
                    <div className="p-6 pb-4 flex justify-center">
                        <Link href="/" className="relative w-48 h-16 block">
                            <Image
                                src="/ASquared Logo White-01.png"
                                alt="Asquared Logo"
                                fill
                                className="object-contain"
                                priority
                            />
                        </Link>
                    </div>

                    <div className="px-4 pb-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    suppressHydrationWarning
                                    variant="outline"
                                    className="w-full justify-between bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white h-10 shadow-sm"
                                >
                                    <span className="flex items-center gap-2">
                                        <activeConfig.icon className="h-4 w-4 text-blue-400" />
                                        <span className="truncate">{activeConfig.label}</span>
                                    </span>
                                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[220px] bg-zinc-900 border-zinc-800 text-zinc-300">
                                <DropdownMenuItem onClick={() => router.push("/dashboard")} className="hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                                    <LayoutDashboard className="mr-2 h-4 w-4" /> Master Overview
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push("/dashboard/email")} className="hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                                    <Mail className="mr-2 h-4 w-4" /> Email Marketing
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push("/dashboard/whatsapp")} className="hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                                    <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp CRM
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push("/dashboard/voice")} className="hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                                    <Mic className="mr-2 h-4 w-4" /> Voice Agent
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="px-4 py-2">
                        <div className="h-[1px] w-full bg-zinc-800"></div>
                    </div>

                    <nav className="flex-1 overflow-auto px-4 space-y-2">
                        {activeConfig.items.map((item: any, index: number) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={index}
                                    href={item.href}
                                    className={`group flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive
                                        ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20"
                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                        }`}
                                >
                                    <item.icon className={`h-5 w-5 ${isActive ? "text-white" : "text-zinc-500 group-hover:text-white transition-colors"}`} />
                                    {item.title}
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="mt-auto p-4 mb-4 space-y-3">
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 text-zinc-400 hover:text-white hover:bg-zinc-900"
                            onClick={async () => {
                                await logout();
                                router.push('/');
                                router.refresh();
                            }}
                        >
                            <LogOut className="h-4 w-4" />
                            Logout
                        </Button>
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    <header className="flex h-14 items-center gap-4 border-b border-zinc-200 bg-white px-6 lg:h-[60px]">
                        <div className="flex flex-1 items-center justify-between">
                            <h1 className="text-lg font-semibold text-slate-900">
                                {pathname === "/dashboard" ? "" : (activeConfig.items.find((item: any) => item.href === pathname)?.title || activeConfig.label)}
                            </h1>

                            {currentContext === "master" && (
                                <div className="flex items-center gap-2">
                                    {/* Vapi Balance Button */}
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 border-blue-200 bg-blue-50/30 hover:bg-blue-50 text-blue-700 gap-2 flex items-center shadow-sm"
                                        onClick={() => setWalletModal({ isOpen: true, type: 'vapi' })}
                                    >
                                        <Mic className="h-3.5 w-3.5" />
                                        <div className="flex flex-col items-start leading-[1.1]">
                                            <span className="text-[9px] font-bold uppercase opacity-70">Vapi Used</span>
                                            <span className="text-xs font-bold">
                                                {loadingCalls ? "..." : `$${vapiAgentUsed.toFixed(2)}`}
                                            </span>
                                        </div>
                                    </Button>

                                    
                                    {/* Telephony Button */}
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 border-blue-200 bg-blue-50/30 hover:bg-blue-50 text-blue-700 gap-2 flex items-center shadow-sm"
                                        onClick={() => setWalletModal({ isOpen: true, type: 'did' })}
                                    >
                                        <Wallet className="h-3.5 w-3.5" />
                                        <div className="flex flex-col items-start leading-[1.1]">
                                            <span className="text-[9px] font-bold uppercase opacity-70">Telephony Used</span>
                                            <span className="text-xs font-bold">
                                                {loadingCalls ? "..." : `$${didUsedCost.toFixed(2)}`}
                                            </span>
                                        </div>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </header>

                    <WalletModal
                        isOpen={walletModal.isOpen}
                        type={walletModal.type}
                        details={(() => {
                            switch (walletModal.type) {
                                case 'vapi': return voiceBalance?.vapi;
                                case 'elevenlabs': return voiceBalance?.elevenlabs || (voiceBalance?.character_limit ? voiceBalance : null);
                                case 'did': return didBalance;
                                default: return null;
                            }
                        })()}
                        calls={calls}
                        onClose={() => setWalletModal({ ...walletModal, isOpen: false })}
                    />

                    <main className="flex-1 overflow-auto bg-zinc-50 p-6 relative">
                        {children}
                    </main>
                </div>
            </div>
        );
    })();

    return (
        <>{content}</>
    );
}
