"use client";

import { ASLoader } from "@/components/as-loader";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    RefreshCw,
    Mail,
    AlertCircle,
    Info,
    ChevronUp,
    ChevronDown,
    ArrowUp,
    Search
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface BounceEmail {
    email: string;
    type: string;
    from: string;
    date: string;
}

interface BounceSummary {
    total_bounces: number;
    hard_bounces: number;
    soft_bounces: number;
    technical_bounces: number;
}

export default function BouncedEmailsPage() {
    const [bounces, setBounces] = useState<BounceEmail[]>([]);
    const [summary, setSummary] = useState<BounceSummary>({
        total_bounces: 0,
        hard_bounces: 0,
        soft_bounces: 0,
        technical_bounces: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchBounces = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/email/bounces');
            const data = await res.json();

            if (data.error) {
                throw new Error(data.message || "Bounces API failed");
            }

            if (!res.ok) {
                throw new Error("Failed to fetch bounces");
            }

            setSummary(data.summary || {
                total_bounces: 0,
                hard_bounces: 0,
                soft_bounces: 0,
                technical_bounces: 0
            });
            setBounces(data.bounced_emails || []);

        } catch (e: any) {
            console.error("Bounces fetch error", e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBounces();
    }, []);

    // Filter
    const filteredBounces = bounces.filter(b =>
        b.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.from.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <TooltipProvider>
            <div className="space-y-6 pb-10 relative min-h-[500px]">
                {loading && <ASLoader />}
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Bounced Emails</h1>
                        <p className="text-slate-500">Real-time bounce tracking from Instantly.ai</p>
                    </div>
                    <Button
                        onClick={fetchBounces}
                        variant="outline"
                        className="gap-2"
                        disabled={loading}
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        {loading ? "Refreshing..." : "Refresh List"}
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="Total Bounces" value={summary.total_bounces.toString()} />
                    <StatCard
                        title="Hard Bounces"
                        value={summary.hard_bounces.toString()}
                        color="text-rose-600"
                        tooltip="Permanent failures. Remove these contacts."
                    />
                    <StatCard
                        title="Soft Bounces"
                        value={summary.soft_bounces.toString()}
                        color="text-orange-600"
                        tooltip="Temporary failures. Worth retrying later."
                    />
                    <StatCard
                        title="Technical Bounces"
                        value={summary.technical_bounces.toString()}
                        color="text-yellow-600"
                        tooltip="Failures due to connection or server issues."
                    />
                </div>

                {/* Search */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            className="pl-10"
                            placeholder="Search by recipient email or sender..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Bounced Email List */}
                <div className="space-y-4">
                    {!loading && filteredBounces.length === 0 ? (
                        <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-slate-500">No bounces found.</p>
                        </div>
                    ) : (
                        filteredBounces.map((bounce, index) => (
                            <BounceCard key={index} bounce={bounce} />
                        ))
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}

function StatCard({ title, value, color, tooltip }: any) {
    return (
        <Card className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</span>
                    {tooltip && (
                        <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                                <span className="cursor-pointer">
                                    <Info className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">{tooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <span className={`text-2xl font-bold ${color || 'text-slate-900'}`}>{value}</span>
            </CardContent>
        </Card>
    );
}

function BounceCard({ bounce }: { bounce: BounceEmail }) {
    const [isOpen, setIsOpen] = useState(false);

    let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
    if (bounce.type?.toLowerCase().includes("hard")) badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
    else if (bounce.type?.toLowerCase().includes("soft")) badgeColor = "bg-orange-50 text-orange-700 border-orange-200";
    else if (bounce.type?.toLowerCase().includes("tech")) badgeColor = "bg-yellow-50 text-yellow-700 border-yellow-200";

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="bg-white border border-slate-200 rounded-xl shadow-sm transition-all hover:shadow-md">
            <CollapsibleTrigger asChild>
                <div className="p-4 flex items-center gap-4 cursor-pointer group">
                    <div className="h-10 w-10 shrink-0 bg-red-50 text-red-600 rounded-lg flex items-center justify-center border border-red-100">
                        <Mail className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div className="md:col-span-4">
                            <h4 className="font-bold text-slate-900 truncate">{bounce.email}</h4>
                            <p className="text-xs text-slate-500 truncate">From: {bounce.from}</p>
                        </div>
                        <div className="md:col-span-3">
                            <Badge variant="outline" className={`font-bold ${badgeColor} border`}>
                                {bounce.type}
                            </Badge>
                        </div>
                        <div className="md:col-span-5 text-right md:text-right">
                            <span className="text-xs text-slate-400 font-medium">{bounce.date}</span>
                        </div>
                    </div>

                    <div className="shrink-0 p-1 rounded-full text-slate-400 group-hover:bg-slate-50 group-hover:text-slate-600 transition-colors">
                        {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                </div>
            </CollapsibleTrigger>

            {/* Expanded Content - Kept simple as refined spec didn't ask for detailed body */}
            <CollapsibleContent>
                <div className="px-4 pb-4 pt-0 border-t border-slate-50 bg-slate-50/30 rounded-b-xl">
                    <div className="pt-4 flex justify-end">
                        <Button variant="ghost" className="text-slate-500 hover:text-slate-900 flex items-center gap-1">
                            View Campaign <ArrowUp className="h-3 w-3 rotate-45" />
                        </Button>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}


