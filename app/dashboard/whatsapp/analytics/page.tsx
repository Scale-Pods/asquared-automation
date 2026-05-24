"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    Cell
} from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TrendingUp, Users, MessageSquare, Send, RefreshCw, BarChart3, Building2, Info } from "lucide-react";
import {
    Tooltip as UITooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { ConsolidatedLead } from "@/lib/leads-utils";
import { Button } from "@/components/ui/button";
import { ASLoader } from "@/components/as-loader";
import { useData } from "@/context/DataContext";

const parseMsg = (raw: any): { date: Date | null, content: string } => {
    if (!raw || !String(raw).trim()) return { date: null, content: "" };
    const content = String(raw).trim();

    // 1. Direct ISO
    if (content.length >= 10 && !isNaN(new Date(content).getTime())) {
        if (content.includes('T') || (content.includes('-') && content.includes(':'))) {
            return { date: new Date(content), content: "" };
        }
    }

    // 2. ISO at the end (with any number of newlines/spaces)
    const isoRegex = /[\n\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*)$/;
    const isoMatch = content.match(isoRegex);
    if (isoMatch) {
        const d = new Date(isoMatch[1]);
        if (!isNaN(d.getTime())) {
            return {
                date: d,
                content: content.replace(isoRegex, '').trim()
            };
        }
    }

    // 3. Space-separated date at the end
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.includes('-') && lastLine.includes(':')) {
        const lastLineDate = new Date(lastLine.replace(' ', 'T'));
        if (!isNaN(lastLineDate.getTime())) {
            return {
                date: lastLineDate,
                content: lines.length > 1 ? lines.slice(0, -1).join('\n').trim() : content
            };
        }
    }

    return { date: null, content: content };
};

export default function WhatsappAnalyticsPage() {
    const { leads: allLeads, loadingLeads, computeWPReplies, refreshLeads } = useData();
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const loading = loadingLeads;
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: subDays(new Date(), 7),
        to: new Date()
    });

    useEffect(() => {
        if (dateRange?.from) {
            refreshLeads({ from: dateRange.from, to: dateRange.to, type: 'whatsapp' });
        }
    }, [dateRange?.from, dateRange?.to]);

    // Owner data from master_leads table with server-side date filtering
    const [ownerLeads, setOwnerLeads] = useState<any[]>([]);
    const [loadingOwners, setLoadingOwners] = useState(true);
    useEffect(() => {
        if (!dateRange?.from || !dateRange?.to) return;
        const q = new URLSearchParams({
            from: startOfDay(dateRange.from).toISOString(),
            to: endOfDay(dateRange.to).toISOString()
        });
        setLoadingOwners(true);
        fetch(`/api/owner-leads?${q}`)
            .then(res => res.json())
            .then(data => setOwnerLeads(data.owner_data || []))
            .catch(err => console.error("Owner fetch error:", err))
            .finally(() => setLoadingOwners(false));
    }, [dateRange?.from, dateRange?.to]);

    const ownerStats = useMemo(() => {
        let reachouts = 0, replies = 0, msgsSent = 0;
        ownerLeads.forEach((o: any) => {
            const wp1 = o["Whatsapp_1"];
            if (!wp1 || wp1 === "" || String(wp1).toLowerCase() === "no") return;

            reachouts++;
            if (wp1) msgsSent++;
            if (o["retry_1"]) msgsSent++;
            for (let i = 1; i <= 10; i++) {
                if (o[`Bot_Replied_${i}`]) msgsSent++;
            }

            const wtsReply = o["WTS_Reply_Track"];
            if (wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no") {
                replies++;
            }
        });
        return { reachouts, replies, msgsSent };
    }, [ownerLeads]);

    const getLeadLatestActivity = (lead: any) => {
        // PRIORITY: Use the specific reachout timestamp for Analytics
        const wp1Ts = lead["W.P_1 TS"];
        if (wp1Ts && wp1Ts.includes(' - ')) {
            const parts = wp1Ts.split(' - ');
            const datePart = parts[parts.length - 1].trim();
            const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
                const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                if (!isNaN(d.getTime())) return d;
            }
        }

        let latest = new Date(lead.updated_at || lead.created_at);
        const stageData = lead.stage_data || {};
        const getD = (raw: any) => parseMsg(raw).date;
        for (let i = 1; i <= 12; i++) {
            let d = getD(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]);
            const tsRaw = lead[`W.P_${i} TS`];
            if (!d && tsRaw && tsRaw.includes(' - ')) {
                const parts = tsRaw.split(' - ');
                const datePart = parts[parts.length - 1].trim();
                const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (match) {
                    const tsDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    if (!isNaN(tsDate.getTime())) {
                        const rawLower = tsRaw.toLowerCase();
                        if (rawLower.includes('read') || rawLower.includes('delivered') || rawLower.includes('failed')) {
                            tsDate.setHours(0, 0, 0, 0); 
                        }
                        d = tsDate;
                    }
                }
            }
            if (d && d > latest) latest = d;
        }
        const rd = getD(lead.whatsapp_replied || stageData["WhatsApp Replied"]);
        if (rd && rd > latest) latest = rd;
        const fd = getD(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]);
        if (fd && fd > latest) latest = fd;
        for (let i = 1; i <= 10; i++) {
            const d1 = getD(lead[`W.P_Replied_${i}`]);
            if (d1 && d1 > latest) latest = d1;
            const d2 = getD(lead[`W.P_FollowUp_${i}`]);
            if (d2 && d2 > latest) latest = d2;
        }
        return latest;
    };

    useEffect(() => {
        if (!loadingLeads) {
            setLeads(allLeads);
        }
    }, [allLeads, loadingLeads]);

    const filteredLeads = useMemo(() => {
        const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);
        const isWithinRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            return d >= fromDate && d <= toDate;
        };

        return leads.filter(l => {
            const lead = l as any;
            
            // Identify WhatsApp Reachout (W.P_1 not null/No) - STRICT Date Filter
            const wp1 = lead["W.P_1"];
            if (!wp1 || wp1 === "" || wp1 === "No") return false;

            // Try to parse from content first
            let reachoutDate = parseMsg(wp1).date;
            
            // Fallback to W.P_1 TS
            if (!reachoutDate) {
                const wp1Ts = lead["W.P_1 TS"];
                if (wp1Ts && wp1Ts.includes(' - ')) {
                    const parts = wp1Ts.split(' - ');
                    const datePart = parts[parts.length - 1].trim();
                    const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    if (match) {
                        reachoutDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    }
                }
            }

            if (!reachoutDate) return false;
            return isWithinRange(reachoutDate);
        });
    }, [leads, dateRange]);

    const stats = useMemo(() => {
        let totalSent = 0;

        const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);
        const isWithinRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            if (d >= fromDate && d <= toDate) return true;
            const toYYYYMMDD = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            return toYYYYMMDD(d) >= toYYYYMMDD(fromDate) && toYYYYMMDD(d) <= toYYYYMMDD(toDate);
        };

        filteredLeads.forEach(l => {
            const lead = l as any;
            const stageData = lead.stage_data || {};
            for (let i = 1; i <= 12; i++) {
                const d = parseMsg(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]).date;
                if (d && isWithinRange(d)) totalSent++;
            }
            const df = parseMsg(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]).date;
            if (df && isWithinRange(df)) totalSent++;
            for (let i = 1; i <= 10; i++) {
                const ds = parseMsg(lead[`W.P_FollowUp_${i}`]).date;
                if (ds && isWithinRange(ds)) totalSent++;
            }
        });

        // Total Replies: single source of truth from context (same logic as master dashboard)
        const sharedRepliedCount = computeWPReplies(dateRange);
        const replyRate = filteredLeads.length > 0 ? (sharedRepliedCount / filteredLeads.length * 100).toFixed(1) + "%" : "0%";

        return {
            totalSent,
            repliedCount: sharedRepliedCount,
            totalLeads: filteredLeads.length,
            replyRate,
            loopData: []
        };
    }, [filteredLeads, dateRange, computeWPReplies]);

    const trendData = useMemo(() => {
        const groups: Record<string, { date: string, sent: number, replied: number }> = {};
        
        const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);
        const isWithinRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            return d >= fromDate && d <= toDate;
        };

        filteredLeads.forEach(l => {
            const lead = l as any;
            const stageData = lead.stage_data || {};
            const latestAct = getLeadLatestActivity(lead);
            if (!latestAct) return;

            const dStr = latestAct.toLocaleDateString([], { month: 'short', day: 'numeric' });
            if (!groups[dStr]) groups[dStr] = { date: dStr, sent: 0, replied: 0 };

            // Sent
            for (let i = 1; i <= 12; i++) {
                const d = parseMsg(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]).date;
                if (d && isWithinRange(d)) groups[dStr].sent++;
            }
            const df = parseMsg(lead["W.P_FollowUp"] || stageData["WhatsApp FollowUp"]).date;
            if (df && isWithinRange(df)) groups[dStr].sent++;
            for (let i = 1; i <= 10; i++) {
                const ds = parseMsg(lead[`W.P_FollowUp_${i}`]).date;
                if (ds && isWithinRange(ds)) groups[dStr].sent++;
            }

            // Improved Reply Detection using WP_Replied_track
            const replyVal = lead["WP_Replied_track"];
            let isRepliedInRange = false;
            
            if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                const parsed = parseMsg(replyVal);
                if (parsed.date) {
                    if (isWithinRange(parsed.date)) isRepliedInRange = true;
                } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                    if (isWithinRange(new Date(lead.created_at))) isRepliedInRange = true;
                }
            }

            if (isRepliedInRange) {
                groups[dStr].replied += 1;
            }
        });
        return Object.values(groups).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
    }, [filteredLeads, dateRange]);

    return (
        <div className="space-y-4 pb-4 relative min-h-[500px]">
            {loading && <ASLoader />}
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">WhatsApp Analytics</h1>
                    <p className="text-slate-500 text-sm">Track campaign performance and lead engagement</p>
                </div>
                <div className="flex items-center gap-2">
                    <DateRangePicker onUpdate={({ range }) => setDateRange({ from: range?.from, to: range?.to })} />
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="h-10">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Core Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                    title="Total Messages Sent"
                    value={stats.totalSent.toLocaleString()}
                    icon={Send}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard
                    title="Total Replies"
                    value={stats.repliedCount.toLocaleString()}
                    icon={MessageSquare}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    info="This count is derived from the 'WP_Replied_track' column. Disclaimer: This feature has been installed now. To check original reply counts, please select the 'Last 3 Months' filter."
                />
                <StatCard
                    title="Response Rate"
                    value={stats.replyRate}
                    icon={TrendingUp}
                    color="text-purple-600"
                    bg="bg-purple-50"
                />
                <StatCard
                    title="Unique Whatsapp Reachouts"
                    value={stats.totalLeads.toLocaleString()}
                    icon={Users}
                    color="text-slate-600"
                    bg="bg-slate-50"
                />
            </div>

            {/* Owner Analytics Section */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-500" /> Owner Analytics
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <StatCard
                        title="Owner Reachouts"
                        value={loadingOwners ? "..." : ownerStats.reachouts.toLocaleString()}
                        icon={Building2}
                        color="text-amber-600"
                        bg="bg-amber-50"
                    />
                    <StatCard
                        title="Owner Replies"
                        value={loadingOwners ? "..." : ownerStats.replies.toLocaleString()}
                        icon={MessageSquare}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                    />
                    <StatCard
                        title="Owner Messages Sent"
                        value={loadingOwners ? "..." : ownerStats.msgsSent.toLocaleString()}
                        icon={Send}
                        color="text-amber-600"
                        bg="bg-amber-50"
                    />
                </div>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-slate-200 shadow-sm bg-white">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold text-slate-900">Engagement Trend</CardTitle>
                        <CardDescription className="text-xs">Outbound messages vs Incoming replies</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3">
                        <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Area type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} fill="url(#colorSent)" />
                                    <Area type="monotone" dataKey="replied" stroke="#10b981" strokeWidth={2} fill="url(#colorReplied)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm bg-white">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold text-slate-900">Loop Breakdown</CardTitle>
                        <CardDescription className="text-xs">Replies distribution by campaign</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3">
                        <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.loopData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={5} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30}>
                                        {stats.loopData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#8b5cf6'][index % 3]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, bg, info }: any) {
    return (
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden relative">
            {info && (
                <div className="absolute top-2 right-2">
                    <TooltipProvider>
                        <UITooltip>
                            <TooltipTrigger asChild>
                                <div className="p-1 cursor-help hover:scale-110 transition-transform">
                                    <Info className="h-6 w-6 text-red-500 fill-red-50" strokeWidth={2.5} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[250px] p-3 text-xs bg-slate-900 text-white border-none shadow-2xl rounded-xl">
                                <p className="font-bold mb-1">Important Note</p>
                                <p className="opacity-90 leading-relaxed">{info}</p>
                            </TooltipContent>
                        </UITooltip>
                    </TooltipProvider>
                </div>
            )}
            <CardContent className="p-3.5 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                    <h3 className="text-lg font-bold text-slate-900">{value}</h3>
                </div>
            </CardContent>
        </Card>
    );
}



