"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Users,
    MessageCircle,
    Phone,
    TrendingUp,
    PieChart as PieChartIcon,
    Activity,
    Crown,
    Expand,
    Maximize2,
    Minimize2,
    X,
    Info
} from "lucide-react";
import {
    Tooltip as UITooltip,
    TooltipContent as UITooltipContent,
    TooltipProvider as UITooltipProvider,
    TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TotalRepliesView, type ReplyData } from "@/components/dashboard/total-replies-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { subDays } from "date-fns";
import { ASLoader } from "@/components/as-loader";
import { fetchCached } from "@/lib/use-cached-fetch";

interface AnalyticsResponse {
    normalLeadsCount: number;
    emailCount: number;
    whatsappReachouts: number;
    totalVoiceCalls: number;
    secondaryVoiceCalls: number;
    unknownVoiceCalls: number;
    ownerVoiceCalls: number;
    totalVoiceSeconds: number;
    voiceMinutesString: string;
    secondaryVoiceDurationString: string;
    unknownVoiceDurationString: string;
    ownerVoiceDurationString: string;
    totalReplies: number;
    totalOwnerLeads: number;
    ownerWhatsappReachouts: number;
    ownerTotalReplies: number;
    oldestLeadDate: string;
    oldestEmailDate: string;
    oldestWPDate: string;
    ownerLeadsSince: string;
    ownerWhatsappSince: string;
    ownerRepliesSince: string;
    acquisitionChartData: { name: string; leads: number }[];
    replyLeads: any[];
    replyData?: ReplyData[];
}

interface SourceStats {
    intro: number;
    intro_uk: number;
    follow_up: number;
    follow_up_uk: number;
    leads: number;
}

export default function MasterDashboard() {
    const [isRepliesModalOpen, setIsRepliesModalOpen] = useState(false);
    const [isRepliesExpanded, setIsRepliesExpanded] = useState(false);
    const [dateLabel, setDateLabel] = useState("Last 7 Days");
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date()
    });
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [sourceStats, setSourceStats] = useState<SourceStats>({ intro: 0, intro_uk: 0, follow_up: 0, follow_up_uk: 0, leads: 0 });
    const [voiceBalance, setVoiceBalance] = useState<any>(null);
    const [didBalance, setDidBalance] = useState<any>(null);

    useEffect(() => {
        if (!dateRange?.from) return;
        setLoading(true);
        const q = new URLSearchParams({
            from: new Date(dateRange.from).toISOString(),
            to: new Date(dateRange.to || dateRange.from).toISOString()
        });
        Promise.all([
            fetchCached(`/api/dashboard/analytics?${q}`),
            fetch('/api/vapi/balance').then(r => r.ok ? r.json() : null),
            fetch('/api/did/balance').then(r => r.ok ? r.json() : null)
        ]).then(([analyticsData, vapiData, didData]) => {
            setAnalytics(analyticsData);
            if (vapiData) setVoiceBalance(vapiData);
            if (didData) setDidBalance(didData);
        }).catch(err => console.error("Analytics fetch error:", err))
        .finally(() => setLoading(false));
    }, [dateRange]);

    useEffect(() => {
        if (!dateRange?.from) return;
        const q = new URLSearchParams({
            from: new Date(dateRange.from).toISOString(),
            to: new Date(dateRange.to || dateRange.from).toISOString()
        });
        fetchCached(`/api/leads/stats?${q}`)
            .then(data => {
                if (data?.sourceCounts) setSourceStats(data.sourceCounts);
            })
            .catch(() => {});
    }, [dateRange]);

    const handleDateUpdate = ({ range, label }: { range: any, label?: string }) => {
        if (label) setDateLabel(label);
        setDateRange(range);
    };

    const router = useRouter();
    const s = analytics;

    const secondaryVoiceTotal = (s?.secondaryVoiceCalls || 0) + (s?.unknownVoiceCalls || 0);
    const secondaryVoiceDuration = s?.secondaryVoiceDurationString && s?.unknownVoiceDurationString
        ? `${s.secondaryVoiceDurationString} + ${s.unknownVoiceDurationString}`
        : (s?.voiceMinutesString ?? "...");

    const realServiceDistribution = [
        { name: 'Email', value: s?.emailCount || 0, color: '#3b82f6' },
        { name: 'WhatsApp', value: s?.whatsappReachouts || 0, color: '#10b981' },
        { name: 'Voice', value: s?.totalVoiceCalls || 0, color: '#8b5cf6' },
    ];

    return (
        <div className="space-y-8 pb-10 relative min-h-[500px]">
            {loading && <ASLoader />}
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Master Overview</h1>
                    <p className="text-slate-500">Holistic view of all your marketing channels performance.</p>
                </div>
                <DateRangePicker onUpdate={handleDateUpdate} />
            </div>

            {/* Source Table Breakdown - Secondary & Unknown */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <MetricCard
                    title="Secondary Intro"
                    value={loading ? "..." : sourceStats.intro.toLocaleString()}
                    change="source: intro"
                    isUp={true}
                    icon={<Users className="h-6 w-6" />}
                    color="text-blue-600"
                    bg="bg-blue-50"
                    border="border-blue-100"
                />
                <MetricCard
                    title="Unknown Intro"
                    value={loading ? "..." : sourceStats.intro_uk.toLocaleString()}
                    change="source: intro_uk"
                    isUp={true}
                    icon={<Users className="h-6 w-6" />}
                    color="text-sky-600"
                    bg="bg-sky-50"
                    border="border-sky-100"
                />
                <MetricCard
                    title="Secondary Follow Up"
                    value={loading ? "..." : sourceStats.follow_up.toLocaleString()}
                    change="source: follow_up"
                    isUp={true}
                    icon={<MessageCircle className="h-6 w-6" />}
                    color="text-purple-600"
                    bg="bg-purple-50"
                    border="border-purple-100"
                />
                <MetricCard
                    title="Unknown Follow Up"
                    value={loading ? "..." : sourceStats.follow_up_uk.toLocaleString()}
                    change="source: follow_up_uk"
                    isUp={true}
                    icon={<MessageCircle className="h-6 w-6" />}
                    color="text-violet-600"
                    bg="bg-violet-50"
                    border="border-violet-100"
                />
                <MetricCard
                    title="Leads"
                    value={loading ? "..." : sourceStats.leads.toLocaleString()}
                    change="source: leads"
                    isUp={true}
                    icon={<Users className="h-6 w-6" />}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    border="border-emerald-100"
                />
            </div>

            {/* Owner Leads Data Row */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                        <Crown className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Owner Leads Data</h2>
                    <p className="text-sm text-slate-400">Source: master_leads | Voice: vapi_call_logs</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                        title="Total Owner Leads"
                        value={loading ? "..." : (s?.totalOwnerLeads ?? 0).toLocaleString()}
                        change={s?.ownerLeadsSince ?? "..."}
                        isUp={true}
                        icon={<Users className="h-6 w-6" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
                        border="border-amber-100"
                    />
                    <MetricCard
                        title="WhatsApp Reachouts (Owner)"
                        value={loading ? "..." : (s?.ownerWhatsappReachouts ?? 0).toLocaleString()}
                        change={s?.ownerWhatsappSince ?? "..."}
                        isUp={true}
                        icon={<MessageCircle className="h-6 w-6" />}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                        border="border-emerald-100"
                    />
                    <MetricCard
                        title="Voice Calls (Owner)"
                        value={loading ? "..." : (s?.ownerVoiceCalls ?? 0).toLocaleString()}
                        change={s?.ownerVoiceDurationString ?? "..."}
                        isUp={true}
                        icon={<Phone className="h-6 w-6" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
                        border="border-blue-100"
                        info="From vapi_call_logs (owners assistant)."
                    />
                    <MetricCard
                        title="Total Replies (Owner)"
                        value={loading ? "..." : (s?.ownerTotalReplies ?? 0).toLocaleString()}
                        change={s?.ownerRepliesSince ?? "..."}
                        isUp={true}
                        icon={<MessageCircle className="h-6 w-6" />}
                        color="text-purple-600"
                        bg="bg-purple-50"
                        border="border-purple-100"
                    />
                </div>
            </div>

            {/* Unknown + Secondary Leads Data Row */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                        <Users className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Unknown & Secondary Leads Data</h2>
                    <p className="text-sm text-slate-400">Source: leads, intro, intro_uk, follow_up, follow_up_uk | Voice: vapi_call_logs_nf</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                        title="Total Leads"
                        value={loading ? "..." : (s?.normalLeadsCount ?? 0).toLocaleString()}
                        change={s?.oldestLeadDate ?? "..."}
                        isUp={true}
                        icon={<Users className="h-6 w-6" />}
                        color="text-indigo-600"
                        bg="bg-indigo-50"
                        border="border-indigo-100"
                        onClick={() => router.push('/dashboard/leads')}
                    />
                    <MetricCard
                        title="WhatsApp Reachouts"
                        value={loading ? "..." : (s?.whatsappReachouts ?? 0).toLocaleString()}
                        change={s?.oldestWPDate ?? "..."}
                        isUp={true}
                        icon={<MessageCircle className="h-6 w-6" />}
                        color="text-purple-600"
                        bg="bg-purple-50"
                        border="border-purple-100"
                        onClick={() => router.push('/dashboard/whatsapp/chat')}
                    />
                    <MetricCard
                        title="Voice Calls (Sec. + Unk.)"
                        value={loading ? "..." : secondaryVoiceTotal.toLocaleString()}
                        change={secondaryVoiceDuration}
                        isUp={true}
                        icon={<Activity className="h-6 w-6" />}
                        color="text-orange-600"
                        bg="bg-orange-50"
                        border="border-orange-100"
                        onClick={() => router.push('/dashboard/voice')}
                        info="Combined secondary + unknown calls from vapi_call_logs_nf."
                    />
                    <MetricCard
                        title="Total Replies"
                        value={loading ? "..." : (s?.totalReplies ?? 0).toLocaleString()}
                        change={`${(s?.whatsappReachouts ?? 0) > 0 ? (((s?.totalReplies ?? 0) / (s?.whatsappReachouts ?? 1)) * 100).toFixed(1) : 0}% Rate`}
                        isUp={true}
                        icon={<Expand className="h-6 w-6" />}
                        color="text-indigo-600"
                        bg="bg-indigo-50"
                        border="border-indigo-100"
                        onClick={() => setIsRepliesModalOpen(true)}
                        info="Rate = Total Replies / Total WhatsApp Reachouts."
                        action={<Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-600"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsRepliesExpanded(!isRepliesExpanded);
                            }}
                        >
                            {isRepliesExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>}
                    />
                </div>
            </div>

            {/* Expanded View Section */}
            {isRepliesExpanded && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Total Replies Details</h2>
                            <p className="text-sm text-slate-500">Detailed view of all replies across channels</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setIsRepliesExpanded(false)}>
                            <X className="h-4 w-4 mr-2" />
                            Close
                        </Button>
                    </div>
                    <TotalRepliesView leads={s?.replyLeads ?? []} replyData={s?.replyData} />
                </div>
            )}

            {/* Replies Modal */}
            <Dialog open={isRepliesModalOpen} onOpenChange={setIsRepliesModalOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Total Replies - Detailed View</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <TotalRepliesView leads={s?.replyLeads ?? []} replyData={s?.replyData} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <TrendingUp className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-lg">Lead Acquisition</CardTitle>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="w-full" style={{ height: 350, minHeight: 350 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={s?.acquisitionChartData ?? []}>
                                    <defs>
                                        <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                    <Area type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                <PieChartIcon className="h-5 w-5" />
                            </div>
                            <CardTitle className="text-lg">Response Performance!</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4 flex flex-col items-center justify-center">
                        <div className="w-full" style={{ height: 300, minHeight: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={realServiceDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {realServiceDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
}

function MetricCard({ title, value, change, isUp, icon, color, bg, border, onClick, action, subtitle, info }: {
    title: string,
    value: string,
    change: string,
    isUp: boolean,
    icon: React.ReactNode,
    color: string,
    bg: string,
    border: string,
    onClick?: () => void,
    action?: React.ReactNode,
    subtitle?: string,
    info?: string
}) {
    return (
        <Card
            className={`bg-white border ${border} shadow-sm overflow-hidden relative group hover:shadow-md transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
            onClick={onClick}
        >
            <CardContent className="p-6">
                <div className="flex items-start justify-between relative z-10">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mr-2">
                            <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-slate-500 mb-1">{title}</p>
                                {info && (
                                    <UITooltipProvider>
                                    <UITooltip>
                                        <UITooltipTrigger asChild>
                                            <Info className="h-7 w-7 text-red-500 mb-1 cursor-help hover:text-red-600 transition-colors" />
                                        </UITooltipTrigger>
                                        <UITooltipContent className="max-w-[250px] bg-slate-900 text-white border-none p-3 shadow-xl">
                                            <p className="text-[11px] leading-relaxed">{info}</p>
                                        </UITooltipContent>
                                    </UITooltip>
                                </UITooltipProvider>
                                )}
                            </div>
                            {subtitle && <p className="text-xs text-slate-400 mb-2">{subtitle}</p>}
                            {action && <div className="z-20">{action}</div>}
                        </div>
                        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
                        <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {change}
                        </div>
                    </div>
                    <div className={`p-4 rounded-2xl ${bg} ${color} shadow-sm`}>
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
