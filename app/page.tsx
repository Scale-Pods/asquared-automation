"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Mail, MessageCircle, Mic } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import { useRouter } from "next/navigation";

export default function LandingPage() {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const router = useRouter();

    // If Supabase redirected a recovery email to root (e.g. because /reset-password
    // wasn't in the allowed redirect URLs), detect it here and forward the user.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const hash = window.location.hash;
        if (hash.includes('type=recovery') && hash.includes('access_token=')) {
            router.replace(`/reset-password${hash}`);
        }
    }, [router]);

    const openAuth = () => {
        setIsAuthModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-emerald-500/30">
            {/* Header */}
            <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-40 h-12 text-white">
                            <Image
                                src="/ASquared Logo White-01.png"
                                alt="Asquared Logo"
                                fill
                                className="object-contain"
                                priority
                            />
                        </div>
                        <div className="h-6 w-[1px] bg-white/20"></div>
                        <span className="text-xs text-zinc-500 font-medium">
                            Powered by <span className="text-emerald-400 font-bold">ScalePods</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            className="text-zinc-400 hover:text-white font-bold text-sm"
                            onClick={openAuth}
                        >
                            Sign In
                        </Button>
                        <Button
                            className="bg-white text-black hover:bg-zinc-200 font-bold rounded-full px-6"
                            onClick={openAuth}
                        >
                            Get Started
                        </Button>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="pt-32 pb-16 px-6">
                <div className="container mx-auto max-w-5xl">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]">
                            Business Automation Platform
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white max-w-4xl leading-[1.1]">
                            Automate Your <br className="hidden md:block" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">Business Growth</span>
                        </h1>

                        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed">
                            A complete suite of intelligent tools to capture leads and automate follow-ups. Manage every channel from one powerful dashboard.
                        </p>
                    </div>

                    {/* Feature Cards Grid */}
                    <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Email Card */}
                        <div className="group rounded-3xl bg-zinc-900/50 border border-white/10 p-8 hover:border-blue-500/30 transition-all duration-300">
                            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Mail className="h-6 w-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Email Marketing</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                Send bulk campaigns, track opens & clicks, and verify bounce rates tailored for high deliverability. Integrate with Gmail & Google Sheets to manage high-volume outreach effortlessly.
                            </p>
                        </div>

                        {/* WhatsApp Card */}
                        <div className="group rounded-3xl bg-zinc-900/50 border border-white/10 p-8 hover:border-emerald-500/30 transition-all duration-300">
                            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <MessageCircle className="h-6 w-6 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">WhatsApp CRM</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                Engage leads instantly with broadcast messages and organized chat lists. Track delivery status, manage customer details, and automate replies to keep conversations active 24/7.
                            </p>
                        </div>

                        {/* Voice Card */}
                        <div className="group rounded-3xl bg-zinc-900/50 border border-white/10 p-8 hover:border-orange-500/30 transition-all duration-300">
                            <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Mic className="h-6 w-6 text-orange-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">AI Voice Agents</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                Deploy human-like AI assistants for inbound support and outbound sales calls. Auto-schedule meetings, verify leads, and analyze call logs with detailed sentiment analytics.
                            </p>
                        </div>
                    </div>

                    <div className="mt-16 text-center">
                        <Button
                            className="h-12 px-8 bg-white text-black hover:bg-zinc-200 font-bold rounded-full gap-2 text-base shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.4)] transition-all"
                            onClick={openAuth}
                        >
                            Get Started Now <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </main>

            {/* Auth Modal */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                defaultMode="login"
            />
        </div>
    );
}
