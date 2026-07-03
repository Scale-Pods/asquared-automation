"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Mail, MessageCircle, Mic, Settings, LogOut, ChevronDown, Wallet, BarChart2, Users, Send, Key, ExternalLink, Smartphone, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataProvider } from "@/context/DataContext";
import { DIDBalanceDetail } from "@/components/dashboard/did-balance-detail";
import { logout } from "@/app/actions/auth";

function WalletModal({ isOpen, onClose, type, voiceBalance, didBalance, totalCosts }: { isOpen: boolean, onClose: () => void, type: 'vapi' | 'elevenlabs' | 'did', voiceBalance?: any, didBalance?: any, totalCosts?: any }) {
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

    const vapiAgentUsed = totalCosts?.totalAgentCost || voiceBalance?.vapi?.used || 0;
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
                { title: "WhatsApp CRM", href: "/dashboard/whatsapp", icon: MessageCircle },
                { title: "Voice Agent", href: "/dashboard/voice", icon: Mic },
                { title: "Leads", href: "/dashboard/leads", icon: Users },
                { title: "Credentials", href: "/dashboard/credentials", icon: Key },
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

    let currentContext = "master";
    if (pathname.startsWith("/dashboard/whatsapp")) currentContext = "whatsapp";
    else if (pathname.startsWith("/dashboard/voice")) currentContext = "voice";

    const activeConfig = (dashboardConfig as any)[currentContext];

    const [voiceBalance, setVoiceBalance] = useState<any>(null);
    const [didBalance, setDidBalance] = useState<any>(null);
    const [totalCosts, setTotalCosts] = useState<any>(null);
    const [loadingBalances, setLoadingBalances] = useState(true);

    const [walletModal, setWalletModal] = useState<{ isOpen: boolean, type: 'vapi' | 'elevenlabs' | 'did' }>({
        isOpen: false,
        type: 'vapi'
    });

    useEffect(() => {
        async function fetchBalances() {
            setLoadingBalances(true);
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
        fetchBalances();
    }, []);

    const ownerCost = totalCosts?.ownerAgentCost || 0;
    const secondaryUnknownCost = (totalCosts?.secondaryAgentCost || 0) + (totalCosts?.unknownAgentCost || 0);


    const content = (() => {
        if (pathname.startsWith("/dashboard/whatsapp") || pathname.startsWith("/dashboard/voice")) {
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
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 border-amber-200 bg-amber-50/30 hover:bg-amber-50 text-amber-700 gap-2 flex items-center shadow-sm"
                                        onClick={() => setWalletModal({ isOpen: true, type: 'vapi' })}
                                    >
                                        <Users className="h-3.5 w-3.5" />
                                        <div className="flex flex-col items-start leading-[1.1]">
                                            <span className="text-[9px] font-bold uppercase opacity-70">Owners Cost</span>
                                            <span className="text-xs font-bold">
                                                {loadingBalances ? "..." : `$${ownerCost.toFixed(2)}`}
                                            </span>
                                        </div>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 text-indigo-700 gap-2 flex items-center shadow-sm"
                                        onClick={() => setWalletModal({ isOpen: true, type: 'vapi' })}
                                    >
                                        <Activity className="h-3.5 w-3.5" />
                                        <div className="flex flex-col items-start leading-[1.1]">
                                            <span className="text-[9px] font-bold uppercase opacity-70">Sec+Unk Cost</span>
                                            <span className="text-xs font-bold">
                                                {loadingBalances ? "..." : `$${secondaryUnknownCost.toFixed(2)}`}
                                            </span>
                                        </div>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 border-blue-200 bg-blue-50/30 hover:bg-blue-50 text-blue-700 gap-2 flex items-center shadow-sm"
                                        onClick={() => setWalletModal({ isOpen: true, type: 'did' })}
                                    >
                                        <Wallet className="h-3.5 w-3.5" />
                                        <div className="flex flex-col items-start leading-[1.1]">
                                            <span className="text-[9px] font-bold uppercase opacity-70">Telephony Balance</span>
                                            <span className="text-xs font-bold">
                                                {loadingBalances ? "..." : `$${(didBalance?.balance || 0).toFixed(2)}`}
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
                        voiceBalance={voiceBalance}
                        didBalance={didBalance}
                        totalCosts={totalCosts}
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
