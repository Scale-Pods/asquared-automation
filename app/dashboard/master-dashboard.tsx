"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Users,
    Mail,
    MessageCircle,
    Phone,
    TrendingUp,
    Zap,
    BarChart3,
    PieChart as PieChartIcon,
    ArrowUpRight,
    ArrowDownRight,
    Activity,
    Maximize2,
    Minimize2,
    X,
    Expand,
    Wallet,
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
    BarChart,
    Bar,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TotalRepliesView } from "@/components/dashboard/total-replies-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { calculateDuration, formatDuration } from "@/lib/utils";
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
    // Matches YYYY-MM-DDTHH:MM:SS.sssZ or similar
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

    // 3. Space-separated date at the end (YYYY-MM-DD HH:MM:SS)
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


export default function MasterDashboard() {
    const [isRepliesModalOpen, setIsRepliesModalOpen] = useState(false);
    const [isRepliesExpanded, setIsRepliesExpanded] = useState(false);
    const [dateLabel, setDateLabel] = useState("Last 7 Days");
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date()
    });

    const { 
        leads: allLeads, 
        calls: allCalls, 
        ownerLeads,
        allTimeVoiceCount, 
        loadingLeads, 
        loadingCalls, 
        loadingOwners,
        refreshLeads, 
        refreshCalls, 
        refreshOwners,
        refreshAll, 
        loadingBalances 
    } = useData();
    const [leads, setLeads] = useState<any[]>([]);
    const [acquisitionChartData, setAcquisitionChartData] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalLeads: 0,
        totalEmails: 0,
        totalWhatsApp: 0,
        totalVoice: 0,
        totalReplies: 0,
        voiceMinutesString: "0m",
        totalVoiceSeconds: 0,
        totalVoiceCalls: 0,
        whatsappUniqueSent: 0,
        oldestLeadDate: "",
        oldestEmailDate: "",
        oldestWPDate: "",
        // Owner stats
        totalOwnerLeads: 0,
        ownerWhatsappReachouts: 0,
        ownerVoiceCalls: 0,
        ownerTotalReplies: 0,
        ownerLeadsSince: "Real-time",
        ownerWhatsappSince: "Real-time",
        ownerVoiceSince: "Real-time",
        ownerRepliesSince: "Real-time"
    });
    const [replyLeads, setReplyLeads] = useState<any[]>([]);
    const loading = loadingLeads || loadingCalls || loadingOwners;

    // Trigger server-side refresh when date range changes
    useEffect(() => {
        if (!refreshCalls || !refreshLeads) return;
        
        const params = {
            from: dateRange?.from,
            to: dateRange?.to,
            provider: 'vapi'
        };
        
        refreshCalls(params);
        refreshLeads(params);
        refreshOwners(params);
    }, [dateRange, refreshCalls, refreshLeads, refreshOwners]);

    const handleDateUpdate = ({ range, label }: { range: any, label?: string }) => {
        if (label) {
            setDateLabel(label);
        }
        setDateRange(range);
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

                    // Standard time comparison
                    if (d >= fromDate && d <= toDate) return true;

                    // Local day comparison (YYYY-MM-DD) to handle timezone boundaries correctly
                    const toYYYYMMDD = (date: Date) => {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        return `${y}-${m}-${day}`;
                    };
                    
                    const dStr = toYYYYMMDD(d);
                    const fStr = toYYYYMMDD(fromDate);
                    const tStr = toYYYYMMDD(toDate);
                    return dStr >= fStr && dStr <= tStr;
                };

                const parseWPStamp = (tsRaw: any): Date | null => {
                    if (!tsRaw || !tsRaw.includes(' - ')) return null;
                    const parts = tsRaw.split(' - ');
                    const datePart = parts[parts.length - 1].trim(); 
                    const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    if (!match) return null;
                    // Format is DD/MM/YYYY (match[1]=D, match[2]=M, match[3]=Y)
                    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    return isNaN(d.getTime()) ? null : d;
                };

                const getLeadLatestWPActivity = (lead: any) => {
                    const wp1Ts = lead["W.P_1 TS"];
                    const wp1Parsed = parseWPStamp(wp1Ts);
                    if (wp1Parsed) return wp1Parsed;

                    let latest = new Date(lead.created_at);
                    const stageData = lead.stage_data || {};
                    const getD = (raw: any) => parseMsg(raw).date;

                    for (let i = 1; i <= 12; i++) {
                        let d = getD(lead[`W.P_${i}`] || stageData[`WhatsApp ${i}`]);
                        const tsRaw = lead[`W.P_${i} TS`];
                        if (!d && tsRaw && tsRaw.includes(' - ')) {
                            const tsDate = parseWPStamp(tsRaw);
                            if (tsDate) d = tsDate;
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

                // Apply Date Filtering for Leads (Created In Range)
                const filteredLeads = allLeads.filter((lead: any) => {
                    const leadDate = new Date(lead.created_at || 0);
                    return isWithinRange(leadDate);
                });

                setLeads(filteredLeads);

                // Acquisition Chart
                const acquisitionMap: { [key: string]: number } = {};
                let startDate = dateRange?.from ? new Date(dateRange.from) : null;
                let endDate = dateRange?.to ? new Date(dateRange.to) : new Date();

                if (!startDate) {
                    startDate = subDays(new Date(), 7);
                }

                const current = new Date(startDate);
                current.setHours(0, 0, 0, 0);
                const end = new Date(endDate);
                end.setHours(0, 0, 0, 0);

                while (current <= end) {
                    const dateStr = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    acquisitionMap[dateStr] = 0;
                    current.setDate(current.getDate() + 1);
                }

                filteredLeads.forEach((lead: any) => {
                    const date = new Date(lead.created_at || Date.now());
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    if (acquisitionMap[dateStr] !== undefined) acquisitionMap[dateStr]++;
                });

                setAcquisitionChartData(Object.entries(acquisitionMap).map(([name, leads]) => ({ name, leads })));

                // 1. Total Leads (Normal: Intro, Followup, Nurture)
                const normalLeads = allLeads.filter((l: any) => 
                    l.source_loop !== "Master Leads" && 
                    l.source_loop !== "Master" && 
                    isWithinRange(new Date(l.created_at))
                );

                // Find oldest lead date for the label
                let oldestLeadStr = "Real-time";
                if (normalLeads.length > 0) {
                    const oldest = normalLeads.reduce((min, lead) => {
                        const d = new Date(lead.created_at);
                        return d < min ? d : min;
                    }, new Date(normalLeads[0].created_at));
                    oldestLeadStr = `Since ${oldest.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                }

                // 2. Total Whatsapp Reachouts (W.P_1 from loops) - STRICT
                let whatsappChatsCount = 0;
                let minWPDate: Date | null = null;
                allLeads.forEach((lead: any) => {
                    // Only for normal loops
                    if (lead.source_loop === "Master Leads" || lead.source_loop === "Master") return;

                    const wp1Val = lead["W.P_1"];
                    if (!wp1Val || wp1Val === "" || wp1Val === "No") return;

                    const trimmed = String(wp1Val).trim();
                    let reachoutDate: Date | null = null;
                    
                    // Try parsing as direct ISO timestamp
                    const dObj = new Date(trimmed);
                    if (!isNaN(dObj.getTime()) && (trimmed.includes('T') || (trimmed.includes('-') && trimmed.includes(':')))) {
                        reachoutDate = dObj;
                    } else {
                        reachoutDate = parseMsg(trimmed).date;
                    }

                    // Fallback to W.P_1 TS if still no date
                    if (!reachoutDate) {
                        const wp1Ts = lead["W.P_1 TS"];
                        reachoutDate = parseWPStamp(wp1Ts);
                    }
                    
                    if (reachoutDate && isWithinRange(reachoutDate)) {
                        whatsappChatsCount++;
                        if (!minWPDate || reachoutDate < minWPDate) minWPDate = reachoutDate;
                    }
                });

                const _minWPDate = minWPDate as Date | null;
                const oldestWPStr = _minWPDate
                    ? `Since ${_minWPDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : "Real-time";

                // 3. Total Replies (WP_Replied_track from loops)
                let totalRepliesCount = 0;
                const leadsWhoRepliedInRange: any[] = [];
                allLeads.forEach((lead: any) => {
                    // Only from Intro, Followup, Nurture loops
                    if (lead.source_loop === "Master Leads" || lead.source_loop === "Master") return;

                    const replyVal = lead["WP_Replied_track"];
                    if (replyVal && replyVal !== "" && String(replyVal).toLowerCase() !== "no") {
                        const parsed = parseMsg(replyVal);
                        let isRepliedInRange = false;

                        // If it has a timestamp, use it for the date filter
                        if (parsed.date) {
                            if (isWithinRange(parsed.date)) isRepliedInRange = true;
                        } else if (String(replyVal).toLowerCase() === "yes" || String(replyVal).toLowerCase() === "replied") {
                            // Legacy "yes" - connect to lead creation date for filtering
                            if (isWithinRange(new Date(lead.created_at))) isRepliedInRange = true;
                        }

                        if (isRepliedInRange) {
                            totalRepliesCount++;
                            leadsWhoRepliedInRange.push(lead);
                        }
                    }
                });

                // 4. Total Voice Calls (from Call Logs for accuracy)
                let totalVoiceCallsCount = 0;
                let ownerVoiceCallsCount = 0;
                let totalVoiceSeconds = 0;

                if (!loadingCalls && Array.isArray(allCalls)) {
                    allCalls.forEach(call => {
                        // Only count Vapi calls for these metrics
                        if (call.source === 'vapi') {
                            if (call.vapiAccount === 'owners') {
                                ownerVoiceCallsCount++;
                            } else {
                                totalVoiceCallsCount++;
                            }
                        }
                        totalVoiceSeconds += calculateDuration(call);
                    });
                }

                // Outreach (Emails - keeping existing logic but simplified)
                let emailCount = 0;
                let minEmailDate: Date | null = null;
                allLeads.forEach((lead: any) => {
                    const stages = lead.stages_passed || [];
                    const stageData = lead.stage_data || {};
                    stages.forEach((stage: string) => {
                        if (stage.toLowerCase().trim().startsWith("email_")) {
                            const d = parseMsg(stageData[stage]).date || new Date(lead.updated_at || lead.created_at);
                            if (isWithinRange(d)) {
                                emailCount++;
                                if (!minEmailDate || d < minEmailDate) minEmailDate = d;
                            }
                        }
                    });
                });

                const _minEmailDate = minEmailDate as Date | null;
                const oldestEmailStr = _minEmailDate
                    ? `Since ${_minEmailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : "Real-time";

                setLeads(normalLeads);
                setReplyLeads(leadsWhoRepliedInRange);
                
                setStats(prev => ({
                    ...prev,
                    totalLeads: normalLeads.length,
                    totalEmails: emailCount,
                    totalWhatsApp: whatsappChatsCount,
                    whatsappUniqueSent: whatsappChatsCount,
                    totalVoice: totalVoiceCallsCount,
                    voiceMinutesString: formatDuration(totalVoiceSeconds),
                    totalVoiceSeconds: totalVoiceSeconds,
                    totalVoiceCalls: totalVoiceCallsCount,
                    totalReplies: totalRepliesCount,
                    oldestLeadDate: oldestLeadStr,
                    oldestEmailDate: oldestEmailStr,
                    oldestWPDate: oldestWPStr,
                }));

                // Calculate Owner Stats
                let ownerLeadsCount = 0;
                let ownerWhatsappReachoutsCount = 0;
                let ownerTotalRepliesCount = 0;
                
                let minOwnerLeadDate: Date | null = null;
                let minOwnerWPDate: Date | null = null;
                let minOwnerVoiceDate: Date | null = null;
                let minOwnerReplyDate: Date | null = null;

                (ownerLeads || []).forEach((o: any) => {
                    // 1. Total Owner Leads
                    ownerLeadsCount++;
                    
                    // 2. Whatsapp Reachouts (Check 'Whatsapp 1', 'Whatsapp 2')
                    const wp1 = o["Whatsapp 1"] || o["Whatsapp_1"];
                    const wp2 = o["Whatsapp 2"] || o["Whatsapp_2"];
                    const wp1Date = parseMsg(wp1).date;
                    const wp2Date = parseMsg(wp2).date;

                    if ((wp1Date && isWithinRange(wp1Date)) || (wp2Date && isWithinRange(wp2Date))) {
                        ownerWhatsappReachoutsCount++;
                        const d = wp1Date || wp2Date;
                        if (d && (!minOwnerWPDate || d < minOwnerWPDate)) minOwnerWPDate = d;
                    }

                    // 4. Replies (Check 'Replied' column)
                    if (o.Replied && (String(o.Replied).toLowerCase() === 'yes' || String(o.Replied).toLowerCase() === 'replied')) {
                        // Match based on contact date if possible, otherwise count
                        ownerTotalRepliesCount++;
                    }
                });

                const formatDateLabel = (d: Date | null) => d ? `Since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : "Real-time";

                setStats(prev => ({
                    ...prev,
                    totalOwnerLeads: ownerLeadsCount,
                    ownerWhatsappReachouts: ownerWhatsappReachoutsCount,
                    ownerVoiceCalls: ownerVoiceCallsCount,
                    ownerTotalReplies: ownerTotalRepliesCount,
                    ownerLeadsSince: formatDateLabel(minOwnerLeadDate),
                    ownerWhatsappSince: formatDateLabel(minOwnerWPDate),
                    ownerVoiceSince: formatDateLabel(minOwnerVoiceDate),
                    ownerRepliesSince: formatDateLabel(minOwnerReplyDate)
                }));

            } catch (e) {
                console.error("Dashboard calculation error", e);
            }
        };

        calculateStats();
    }, [dateRange, allLeads, allCalls, ownerLeads, loadingLeads, loadingCalls, loadingOwners]);

    const router = useRouter();

    // Derived Pie Chart Data
    const realServiceDistribution = [
        { name: 'Email', value: stats.totalEmails, color: '#3b82f6' },
        { name: 'WhatsApp', value: stats.totalWhatsApp, color: '#10b981' },
        { name: 'Voice', value: stats.totalVoice, color: '#8b5cf6' },
    ];

    return (
        <div className="space-y-8 pb-10 relative min-h-[500px]">
            {loading && leads.length === 0 && <ASLoader />}
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Master Overview</h1>
                    <p className="text-slate-500">Holistic view of all your marketing channels performance.</p>
                </div>
                <DateRangePicker onUpdate={handleDateUpdate} />
            </div>

            {/* Top Metric Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

                <MetricCard
                    title="Total Leads"
                    value={loading ? "..." : stats.totalLeads.toLocaleString()}
                    change={stats.oldestLeadDate}
                    isUp={true}
                    icon={<Users className="h-6 w-6" />}
                    color="text-blue-600"
                    bg="bg-blue-50"
                    border="border-blue-100"
                    onClick={() => router.push('/dashboard/leads')}
                />
                <MetricCard
                    title="Total Emails Sent"
                    value={loading ? "..." : stats.totalEmails.toLocaleString()}
                    change={stats.oldestEmailDate}
                    isUp={true}
                    icon={<Mail className="h-6 w-6" />}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    border="border-emerald-100"
                    onClick={() => router.push('/dashboard/email/sent')}
                />
                <MetricCard
                    title="Total Whatsapp Reachouts"
                    value={loading ? "..." : stats.totalWhatsApp.toLocaleString()}
                    change={stats.oldestWPDate}
                    isUp={true}
                    icon={<MessageCircle className="h-6 w-6" />}
                    color="text-purple-600"
                    bg="bg-purple-50"
                    border="border-purple-100"
                    onClick={() => router.push('/dashboard/whatsapp/chat')}
                />
                <MetricCard
                    title="Total Voice Calls"
                    value={loading ? "..." : stats.totalVoiceCalls.toLocaleString()}
                    change={stats.voiceMinutesString}
                    isUp={true}
                    icon={<Activity className="h-6 w-6" />}
                    color="text-orange-600"
                    bg="bg-orange-50"
                    border="border-orange-100"
                    onClick={() => router.push('/dashboard/voice')}
                    info="This shows Normal calls containing US, UK, UAE, and 1731 leads."
                />
                
                <MetricCard
                    title="Total Replies"
                    value={loading ? "..." : stats.totalReplies.toLocaleString()}
                    change={`${stats.totalWhatsApp > 0 ? ((stats.totalReplies / stats.totalWhatsApp) * 100).toFixed(1) : 0}% Rate`}
                    isUp={true}
                    icon={<Expand className="h-6 w-6" />}
                    color="text-indigo-600"
                    bg="bg-indigo-50"
                    border="border-indigo-100"
                    onClick={() => setIsRepliesModalOpen(true)}
                    info="This rate is calculated as (Total Replies / Total WhatsApp Reachouts). Disclaimer: This feature has been installed now. To check original replies and rates, please select the 'Last 3 Months' filter."
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

            {/* Owner Leads Data Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                        <Users className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Owner Leads Data</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                        title="Total Owner Leads"
                        value={loading ? "..." : stats.totalOwnerLeads.toLocaleString()}
                        change={stats.ownerLeadsSince}
                        isUp={true}
                        icon={<Users className="h-6 w-6" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
                        border="border-amber-100"
                    />
                    <MetricCard
                        title="Total Whatsapp Reachouts (owner)"
                        value={loading ? "..." : stats.ownerWhatsappReachouts.toLocaleString()}
                        change={stats.ownerWhatsappSince}
                        isUp={true}
                        icon={<MessageCircle className="h-6 w-6" />}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                        border="border-emerald-100"
                    />
                    <MetricCard
                        title="Total Voice Calls (owner)"
                        value={loading ? "..." : stats.ownerVoiceCalls.toLocaleString()}
                        change={stats.ownerVoiceSince}
                        isUp={true}
                        icon={<Phone className="h-6 w-6" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
                        border="border-blue-100"
                        info="This count is derived from real-time Vapi call logs for the 'owners' account."
                    />
                    <MetricCard
                        title="Total Replies (owner)"
                        value={loading ? "..." : stats.ownerTotalReplies.toLocaleString()}
                        change={stats.ownerRepliesSince}
                        isUp={true}
                        icon={<MessageCircle className="h-6 w-6" />}
                        color="text-purple-600"
                        bg="bg-purple-50"
                        border="border-purple-100"
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
                    <TotalRepliesView leads={replyLeads} />
                </div>
            )}

            {/* Replies Modal */}
            <Dialog open={isRepliesModalOpen} onOpenChange={setIsRepliesModalOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Total Replies - Detailed View</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <TotalRepliesView leads={replyLeads} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Charts Row 1: Lead Acquisition & Service Distribution */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Lead Acquisition Area Chart */}
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
                                <AreaChart data={acquisitionChartData}>
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

                {/* Service Distribution Pie Chart */}
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

