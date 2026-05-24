"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Users,
    Activity,
    MessageCircle,
    Calendar,
    TrendingUp,
    BarChart3,
    Settings,
    Megaphone,
    Send,
    Building2,
    MessageSquare,
    Info
} from "lucide-react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    LineChart,
    Line
} from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { useData } from "@/context/DataContext";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { TotalRepliesView } from "@/components/dashboard/total-replies-view";
import {
    Tooltip as UITooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import { ASLoader } from "@/components/as-loader";

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

const parseTSDate = (tsValue: string): Date | null => {
    if (!tsValue) return null;
    const str = String(tsValue).trim();
    if (str.includes(' - ')) {
        const parts = str.split(' - ');
        const datePart = parts[parts.length - 1].trim();
        const ddmmMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmmMatch) {
            const day = Number(ddmmMatch[1]);
            const month = Number(ddmmMatch[2]) - 1;
            const year = Number(ddmmMatch[3]);
            const timeMatch = datePart.match(/(\d{1,2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i);
            if (timeMatch) {
                let hours = Number(timeMatch[1]);
                const mins = Number(timeMatch[2]);
                const secs = Number(timeMatch[3] || 0);
                if (timeMatch[4]?.toUpperCase() === 'PM' && hours < 12) hours += 12;
                if (timeMatch[4]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
                return new Date(year, month, day, hours, mins, secs);
            }
            return new Date(year, month, day);
        }
        const isoDate = new Date(datePart.replace(' ', 'T'));
        if (!isNaN(isoDate.getTime())) return isoDate;
    }
    return null;
};

const getMsgDateWithFallback = (lead: any, msgKey: string, tsKey?: string) => {
    const msgContent = lead[msgKey] || lead.stage_data?.[msgKey];
    const d = parseMsg(msgContent).date;
    if (d) return d;

    const resolvedTsKey = tsKey || `${msgKey} TS`;
    const tsDate = parseTSDate(lead[resolvedTsKey]);
    if (tsDate) return tsDate;

    if (msgContent && String(msgContent).trim() !== "" && String(msgContent).trim().toLowerCase() !== "no") {
        const createdAt = lead.created_at ? new Date(lead.created_at) : null;
        if (createdAt && !isNaN(createdAt.getTime())) return createdAt;
    }
    return null;
};

export default function WhatsappDashboardPage() {
    const router = useRouter();
    const { leads: allLeads, loadingLeads, ownerLeads, loadingOwners, computeWPReplies, refreshLeads } = useData();
    const [leads, setLeads] = useState<any[]>([]);
    const [isRepliesOpen, setIsRepliesOpen] = useState(false);
    const [stats, setStats] = useState({
        totalLeads: 0,
        contactedLeads: 0,
        totalReplies: 0,
        replied: 0,
        waiting: 0,
        nurture: 0,
        unresponsive: 0
    });
    const [donutData, setDonutData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const loading = loadingLeads;
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date()
    });

    useEffect(() => {
        if (dateRange?.from) {
            refreshLeads({ from: dateRange.from, to: dateRange.to, type: 'whatsapp' });
        }
    }, [dateRange?.from, dateRange?.to]);


    const ownerStats = useMemo(() => {
        const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);
        const isInRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            return d >= fromDate && d <= toDate;
        };

        let reachouts = 0, replies = 0, msgsSent = 0;
        ownerLeads.forEach((o: any) => {
            const wp1 = o["Whatsapp_1"];
            if (!wp1 || wp1 === "") return;

            const wpDate = o["Whatsapp_1_Date"] ? new Date(o["Whatsapp_1_Date"]) : null;
            if (!isInRange(wpDate)) return;

            reachouts++;
            if (wp1) msgsSent++;
            if (o["retry_1"]) msgsSent++;
            for (let i = 1; i <= 5; i++) {
                if (o[`Bot_Replied_${i}`]) msgsSent++;
            }

            const wtsReply = o["WTS_Reply_Track"];
            if (wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no") {
                replies++;
            }
        });
        return { reachouts, replies, msgsSent };
    }, [ownerLeads, dateRange]);

    // --- Sorting & Activity Helpers ---
    const getMsgDate = (raw: any) => {
        if (!raw || !String(raw).trim()) return null;
        const content = String(raw).trim();
        const isoRegex = /\n\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.+)$/;
        const isoMatch = content.match(isoRegex);
        if (isoMatch) return new Date(isoMatch[1]);
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1].trim();
        const lastLineDate = new Date(lastLine.replace(' ', 'T'));
        if (lines.length > 1 && !isNaN(lastLineDate.getTime()) && lastLine.includes('-') && lastLine.includes(':')) {
            return lastLineDate;
        }
        return null;
    };

    const getLeadLatestActivity = (lead: any) => {
        let latestDate = new Date(lead.created_at);
        for (let i = 1; i <= 12; i++) {
            const tsRaw = lead[`W.P_${i} TS`];
            let d = getMsgDate(lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]);
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
            if (d && d > latestDate) latestDate = d;
        }
        const rd = getMsgDate(lead.whatsapp_replied || lead.stage_data?.["WhatsApp Replied"]);
        if (rd && rd > latestDate) latestDate = rd;
        const fd = getMsgDate(lead["W.P_FollowUp"] || lead.stage_data?.["WhatsApp FollowUp"]);
        if (fd && fd > latestDate) latestDate = fd;
        for (let i = 1; i <= 10; i++) {
            const dReplied = getMsgDate(lead[`W.P_Replied_${i}`]);
            if (dReplied && dReplied > latestDate) latestDate = dReplied;
            const dFollow = getMsgDate(lead[`W.P_FollowUp_${i}`]);
            if (dFollow && dFollow > latestDate) latestDate = dFollow;
        }
        return latestDate;
    };

    useEffect(() => {
        const calculateStats = async () => {
            if (loadingLeads) return;

            try {
                const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
                const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);

                const isWithinRange = (d: Date | null) => {
                    if (!fromDate || !toDate) return true;
                    if (!d) return false;
                    return d >= fromDate && d <= toDate;
                };

                // Strict Reachout Filter: W.P_1 must exist AND its date must be in range
                const filteredLeads = allLeads.filter((lead: any) => {
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

                const dailyGroups: Record<string, { date: string, sent: number, replied: number }> = {};

                const finalStats = {
                    totalLeads: filteredLeads.length,
                    messagesSent: 0,
                    uniqueLeadsContacted: 0,
                    totalReplies: 0,
                    waiting: 0,
                    unresponsive: 0
                };

                filteredLeads.forEach((lead: any) => {
                    const stageData = lead.stage_data || {};
                    let leadSentCount = 0;
                    let hasWPInDate = false;

                    // Message Sent Detection (Matching Master Dashboard Logic)
                    // Check if lead was actually sent a message in this range
                    for (let i = 1; i <= 12; i++) {
                        const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                        if (d && isWithinRange(d)) {
                            leadSentCount++;
                            hasWPInDate = true;
                        }
                    }
                    const fup = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
                    if (fup && isWithinRange(fup)) {
                        leadSentCount++;
                        hasWPInDate = true;
                    }
                    for (let i = 1; i <= 10; i++) {
                        const d = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`);
                        if (d && isWithinRange(d)) {
                            leadSentCount++;
                            hasWPInDate = true;
                        }
                    }

                    if (hasWPInDate) {
                        finalStats.messagesSent += leadSentCount;
                        finalStats.uniqueLeadsContacted++;
                    }

                    // Improved Reply Detection using WP_Replied_track
                    const replyVal = lead["WP_Replied_track"];
                    let isRepliedInRange = false;
                    
                    if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                        const parsed = parseMsg(replyVal);
                        // If it has a timestamp, use it for the date filter
                        if (parsed.date) {
                            if (isWithinRange(parsed.date)) isRepliedInRange = true;
                        } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                            // Legacy "yes" - count if the lead's creation date matches the filter (or just count it)
                            // User said: "count if it contains 'yes' and if contain date filter then connect it to date filter"
                            // We connect it to the lead's creation date for the filter.
                            if (isWithinRange(new Date(lead.created_at))) isRepliedInRange = true;
                        }
                    }
                    
                    if (isRepliedInRange) {
                        finalStats.totalReplies++;
                    } else if (hasWPInDate) {
                        finalStats.waiting++;
                    }

                    // Trend
                    const latestAct = getLeadLatestActivity(lead);
                    if (latestAct) {
                        const dStr = latestAct.toLocaleDateString([], { month: 'short', day: 'numeric' });
                        if (!dailyGroups[dStr]) dailyGroups[dStr] = { date: dStr, sent: 0, replied: 0 };
                        dailyGroups[dStr].sent += leadSentCount;
                        if (isRepliedInRange) dailyGroups[dStr].replied += 1;
                    }
                });

                const wpReplies = computeWPReplies(dateRange);

                setStats({
                    totalLeads: finalStats.totalLeads,
                    contactedLeads: finalStats.messagesSent,
                    totalReplies: wpReplies,
                    replied: wpReplies,
                    waiting: finalStats.waiting,
                    nurture: 0,
                    unresponsive: finalStats.totalLeads - finalStats.uniqueLeadsContacted
                });

                setDonutData([
                    { name: 'Total Leads', value: finalStats.totalLeads, color: '#8b5cf6' },
                    { name: 'Messages Sent', value: finalStats.messagesSent, color: '#3b82f6' },
                    { name: 'Total Replies', value: wpReplies, color: '#10b981' },
                ]);

                setTrendData(Object.values(dailyGroups)
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .slice(-7));

                // Sync the actual filtered leads to state for the modal/sheet 
                setLeads(filteredLeads);

            } catch (e) {
                console.error("Dashboard calculation error", e);
            }
        };

        calculateStats();
    }, [dateRange, allLeads, loadingLeads, computeWPReplies]);

    const repliedLeads = useMemo(() => {
        // Now accurately filters by the leads active in range that have a reply in range
        return leads.filter(lead => {
            const replyVal = lead["WP_Replied_track"];
            if (!replyVal || replyVal === "" || String(replyVal).toLowerCase() === "no") return false;

            const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
            const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);
            const isWithinRange = (d: Date | null) => {
                if (!fromDate || !toDate) return true;
                if (!d) return false;
                return d >= fromDate && d <= toDate;
            };

            const parsed = parseMsg(replyVal);
            if (parsed.date) {
                return isWithinRange(parsed.date);
            } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                return isWithinRange(new Date(lead.created_at));
            }
            return false;
        });
    }, [leads, dateRange]);

    return (
        <div className="space-y-3 pb-3 relative min-h-[500px]">
            {loading && <ASLoader />}
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">WhatsApp Overview</h1>
                    <p className="text-slate-500 text-sm">Real-time engagement insights and campaign totals</p>
                </div>
                <DateRangePicker onUpdate={(range) => setDateRange(range.range)} />
            </div>

            {/* Overview Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <MetricCard
                    title="Total Whatsapp Reachouts"
                    value={loading ? "..." : stats.totalLeads.toLocaleString()}
                    icon={Users}
                    theme="purple"
                    onClick={() => router.push('/dashboard/whatsapp/leads')}
                />
                <MetricCard
                    title="Total Replies"
                    value={loading ? "..." : stats.totalReplies.toLocaleString()}
                    icon={MessageCircle}
                    theme="emerald"
                    onClick={() => setIsRepliesOpen(true)}
                    info="This count is derived from the 'WP_Replied_track' column. Disclaimer: This feature has been installed now. To check original reply counts, please select the 'Last 3 Months' filter."
                />
                <MetricCard
                    title="Messages Sent"
                    value={loading ? "..." : stats.contactedLeads.toLocaleString()}
                    icon={Send}
                    theme="blue"
                />
            </div>

            {/* Owner Metrics Section */}
            <div>
                <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-500" /> Owner Metrics
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <MetricCard
                        title="Owner Reachouts"
                        value={loadingOwners ? "..." : ownerStats.reachouts.toLocaleString()}
                        icon={Building2}
                        theme="amber"
                        onClick={() => router.push('/dashboard/whatsapp/chat?tab=owners')}
                    />
                    <MetricCard
                        title="Owner Replies"
                        value={loadingOwners ? "..." : ownerStats.replies.toLocaleString()}
                        icon={MessageSquare}
                        theme="emerald"
                        onClick={() => router.push('/dashboard/whatsapp/chat?tab=owners')}
                    />
                    <MetricCard
                        title="Owner Messages Sent"
                        value={loadingOwners ? "..." : ownerStats.msgsSent.toLocaleString()}
                        icon={Send}
                        theme="amber"
                    />
                </div>
            </div>

            {/* Main Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Engagement Donut */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-slate-500" />
                            <CardTitle className="text-sm font-bold text-slate-700 uppercase">Conversion Funnel</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <div className="w-full" style={{ height: 200, minHeight: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={65}
                                        outerRadius={95}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {donutData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                            <SummaryPill label="Total Leads" value={stats.totalLeads} color="bg-purple-600" />
                            <SummaryPill label="Messages Sent" value={stats.contactedLeads} color="bg-blue-600" />
                            <SummaryPill label="Total Replies" value={stats.replied} color="bg-emerald-600" />
                        </div>
                    </CardContent>
                </Card>

                {/* Right: Activity Trend Line Chart */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-slate-500" />
                            <CardTitle className="text-sm font-bold text-slate-700 uppercase">Activity Trend</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <div className="w-full" style={{ height: 200, minHeight: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    <Line type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="replied" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-8 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="h-1 w-4 bg-blue-600 rounded-full" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Messages Sent</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-1 w-4 bg-emerald-600 rounded-full" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Replies Received</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Replies Sheet */}
            <Sheet open={isRepliesOpen} onOpenChange={setIsRepliesOpen}>
                <SheetContent side="right" className="sm:max-w-[800px] w-[90vw] overflow-y-auto">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="text-2xl font-bold">Recent WhatsApp Replies</SheetTitle>
                        <SheetDescription>
                            A detailed breakdown of all leads who have engaged with your campaigns.
                        </SheetDescription>
                    </SheetHeader>
                    <TotalRepliesView leads={repliedLeads} />
                </SheetContent>
            </Sheet>
        </div>
    );
}

function MetricCard({ title, value, icon: Icon, theme, desc, onClick, info }: any) {
    const themes: any = {
        purple: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100", iconBg: "bg-purple-100/50" },
        blue: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", iconBg: "bg-blue-100/50" },
        emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", iconBg: "bg-emerald-100/50" },
        orange: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-100", iconBg: "bg-orange-100/50" },
        amber: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100", iconBg: "bg-amber-100/50" },
    };

    const t = themes[theme] || themes.purple;

    return (
        <Card
            className={`border ${t.border} shadow-sm bg-white overflow-hidden relative ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 transition-all active:scale-[0.98]' : ''}`}
            onClick={onClick}
        >
            {info && (
                <div className="absolute top-2 right-2">
                    <TooltipProvider>
                        <UITooltip>
                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <div className="p-1 cursor-help hover:scale-110 transition-transform">
                                    <Info className="h-7 w-7 text-red-500 fill-red-50" strokeWidth={2.5} />
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
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${t.iconBg} ${t.text}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function SummaryPill({ label, value, color }: any) {
    return (
        <div className={`p-3 rounded-xl flex flex-col items-center justify-center text-white ${color} shadow-sm`}>
            <span className="text-xl font-black">{value}</span>
            <span className="text-[9px] uppercase font-bold opacity-90 text-center leading-tight tracking-wider">{label}</span>
        </div>
    );
}

function StatusCard({ title, value, borderColor, accentColor }: any) {
    return (
        <Card className={`bg-white border-l-4 ${borderColor} border-y border-r border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all`}>
            <CardContent className="p-5">
                <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor} mb-2`}>{title}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
            </CardContent>
        </Card>
    );
}

