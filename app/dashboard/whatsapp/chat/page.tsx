"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsAppChatDetail } from "@/components/dashboard/whatsapp-chat-detail";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Search,
    Filter,
    Users,
    Send,
    MessageSquare,
    RefreshCw,
    Globe,
    Flag,
    Leaf,
    Building2
} from "lucide-react";
import { ASLoader } from "@/components/as-loader";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { ConsolidatedLead } from "@/lib/leads-utils";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { OwnerChatDetail } from "@/components/dashboard/owner-chat-detail";

const parseMsg = (raw: any): { date: Date | null, content: string } => {
    if (!raw || !String(raw).trim()) return { date: null, content: "" };
    const content = String(raw).trim();

    if (content.length >= 10 && !isNaN(new Date(content).getTime())) {
        if (content.includes('T') || (content.includes('-') && content.includes(':'))) {
            return { date: new Date(content), content: "" };
        }
    }

    const isoRegex = /[\n\s]+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*)$/;
    const isoMatch = content.match(isoRegex);
    if (isoMatch) {
        const d = new Date(isoMatch[1]);
        if (!isNaN(d.getTime())) {
            return { date: d, content: content.replace(isoRegex, '').trim() };
        }
    }

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

    const ddmmRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
    const ddmmMatch = content.match(ddmmRegex);
    if (ddmmMatch) {
        const d = new Date(Number(ddmmMatch[3]), Number(ddmmMatch[2]) - 1, Number(ddmmMatch[1]));
        if (!isNaN(d.getTime())) {
            return { date: d, content: content.replace(ddmmRegex, '').trim() };
        }
    }

    return { date: null, content: content };
};

const getMsgDate = (raw: any) => {
    return parseMsg(raw).date;
};

const parseTSDate = (tsValue: string): Date | null => {
    if (!tsValue) return null;
    const str = String(tsValue).trim();

    // Plain ISO timestamp (e.g. "2026-06-04T16:50:14.552+05:30")
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    // Nurture format: "SENT at Jun 05 2026, 04:10 PM" / "DELIVERED at ..."
    const nurtureMatch = str.match(/at\s+([A-Za-z]+\s+\d{1,2}\s+\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)/i);
    if (nurtureMatch) {
        const d = new Date(nurtureMatch[1].replace(',', ''));
        if (!isNaN(d.getTime())) return d;
    }

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
    const d = getMsgDate(msgContent);
    if (d) return d;

    const resolvedTsKey = tsKey || `${msgKey} TS`;
    const tsValue = lead[resolvedTsKey];
    const tsDate = parseTSDate(tsValue);
    if (tsDate) return tsDate;

    if (msgContent && String(msgContent).trim() !== "" && String(msgContent).trim().toLowerCase() !== "no") {
        const createdAt = lead.created_at ? new Date(lead.created_at) : null;
        if (createdAt && !isNaN(createdAt.getTime())) return createdAt;
    }

    return null;
};

// Lifetime messages-sent count for a single lead — the same logic the table's
// "Messages Sent" column uses. Kept as one shared function so the per-lead column
// and the aggregate "Messages Sent" metric card never disagree.
const getLeadSentCount = (lead: any) => {
    let count = 0;
    for (let i = 1; i <= 12; i++) { if (lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]) count++; }
    if (lead["W.P_FollowUp"] || lead.stage_data?.["WhatsApp FollowUp"]) count++;
    for (let i = 1; i <= 10; i++) { if (lead[`W.P_FollowUp_${i}`]) count++; }
    return count;
};

const getLeadLatestActivity = (lead: any) => {
    let latestDate = new Date(lead.created_at);

    for (let i = 1; i <= 12; i++) {
        const d = getMsgDateWithFallback(lead, `W.P_${i}`);
        if (d && d > latestDate) latestDate = d;
    }

    const rd = getMsgDate(lead.whatsapp_replied || lead.stage_data?.["WhatsApp Replied"]);
    if (rd && rd > latestDate) latestDate = rd;

    const rt = getMsgDate(lead.WP_Replied_track);
    if (rt && rt > latestDate) latestDate = rt;

    const fd = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
    if (fd && fd > latestDate) latestDate = fd;

    for (let i = 1; i <= 10; i++) {
        const dReplied = getMsgDate(lead[`W.P_Replied_${i}`]);
        if (dReplied && dReplied > latestDate) latestDate = dReplied;

        const dFollow = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`, `W.P_FollowUp_${i} TS`);
        if (dFollow && dFollow > latestDate) latestDate = dFollow;
    }
    return latestDate;
};

const sourceTabs = [
    { key: "intro", label: "Secondary Intro", icon: Globe },
    { key: "intro_uk", label: "Unknown Intro", icon: Flag },
    { key: "follow_up", label: "Secondary Follow Up", icon: Globe },
    { key: "follow_up_uk", label: "Unknown Follow Up", icon: Flag },
    { key: "nurture_leads", label: "Nurture", icon: Leaf },
    { key: "nurture_leads_uk", label: "Nurture UK", icon: Leaf },
    { key: "master_leads", label: "Owners", icon: Building2 },
] as const;

type SourceTabKey = typeof sourceTabs[number]["key"];

export default function WhatsappChatPage() {
    const [allLeads, setAllLeads] = useState<ConsolidatedLead[]>([]);
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const [sourceTab, setSourceTab] = useState<SourceTabKey>("intro");
    const [currentPage, setCurrentPage] = useState(1);
    const leadsPerPage = 10;
    const isOwnersTab = sourceTab === "master_leads";

    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });

    // Owners come from master_leads via a dedicated endpoint — its schema differs
    // too much from the intro/follow_up/nurture tables to share the /api/leads pipeline.
    const [ownerRows, setOwnerRows] = useState<any[]>([]);
    const [ownerTotal, setOwnerTotal] = useState(0);
    const [ownerMetrics, setOwnerMetrics] = useState({ reachouts: 0, replies: 0, msgsSent: 0, replyRate: 0, waitingOnReply: 0 });
    const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);
    const [selectedOwner, setSelectedOwner] = useState<any>(null);

    useEffect(() => {
        if (!isOwnersTab || !dateRange?.from) return;
        setLoading(true);

        const q = new URLSearchParams({
            from: startOfDay(dateRange.from).toISOString(),
            to: endOfDay(dateRange.to || dateRange.from).toISOString(),
            search: searchQuery,
            page: String(currentPage),
            pageSize: String(leadsPerPage),
        });

        fetch(`/api/whatsapp/owners?${q}`)
            .then(r => r.ok ? r.json() : Promise.reject("Fetch failed"))
            .then(data => {
                setOwnerRows(data.owners ?? []);
                setOwnerTotal(data.total ?? 0);
                setOwnerMetrics(data.metrics ?? { reachouts: 0, replies: 0, msgsSent: 0, replyRate: 0, waitingOnReply: 0 });
            })
            .catch(err => console.error("Owners fetch error:", err))
            .finally(() => setLoading(false));
    }, [isOwnersTab, dateRange?.from, dateRange?.to, searchQuery, currentPage]);

    useEffect(() => {
        if (selectedOwnerId == null) { setSelectedOwner(null); return; }
        fetch(`/api/whatsapp/owners/${selectedOwnerId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setSelectedOwner(data && !data.error ? data : null))
            .catch(() => setSelectedOwner(null));
    }, [selectedOwnerId]);

    // Fetch WhatsApp-eligible leads for the active tab (server-side consolidated & filtered)
    useEffect(() => {
        if (isOwnersTab || !dateRange?.from || !sourceTab) return;
        setLoading(true);

        const q = new URLSearchParams({
            from: startOfDay(dateRange.from).toISOString(),
            to: endOfDay(dateRange.to || dateRange.from).toISOString(),
            type: 'whatsapp',
            sourceTable: sourceTab,
            whatsappOnly: 'true'
        });

        fetch(`/api/leads?${q}`)
            .then(r => r.ok ? r.json() : Promise.reject("Fetch failed"))
            .then(data => {
                setAllLeads(data.whatsappLeads ?? []);
            })
            .catch(err => console.error("Tab fetch error:", err))
            .finally(() => setLoading(false));
    }, [isOwnersTab, dateRange?.from, dateRange?.to, sourceTab]);

    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const initialSelectedId = searchParams?.get('chat');
    const initialTab = searchParams?.get('tab');
    const initialOwnerId = searchParams?.get('owner');

    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialSelectedId || null);
    const initialProcessed = useRef(false);

    useEffect(() => {
        const url = new URL(window.location.origin + window.location.pathname);
        if (selectedLeadId) {
            url.searchParams.set('chat', selectedLeadId);
            url.searchParams.set('tab', sourceTab);
        } else {
            url.searchParams.delete('chat');
            url.searchParams.delete('tab');
        }
        window.history.replaceState({}, '', url.toString());
    }, [selectedLeadId, sourceTab]);

    useEffect(() => {
        if (initialProcessed.current) return;

        if (initialTab && sourceTabs.some(t => t.key === initialTab)) {
            setSourceTab(initialTab as SourceTabKey);
        }

        if (initialSelectedId) {
            setSelectedLeadId(initialSelectedId);
        }
        if (initialOwnerId && /^\d+$/.test(initialOwnerId)) {
            setSelectedOwnerId(Number(initialOwnerId));
        }
        initialProcessed.current = true;
    }, [initialSelectedId, initialTab, initialOwnerId]);

    const [activeFilters, setActiveFilters] = useState<{
        replyStatus: string[],
        messageStatus: string[]
    }>({
        replyStatus: [],
        messageStatus: []
    });

    useEffect(() => {
        if (loading) return;

        const wpLeads = allLeads.filter(l => {
            const lead = l as any;
            if (lead.source_table !== sourceTab) return false;
            if (lead.stages_passed?.some((s: string) => s.toLowerCase().includes("whatsapp"))) return true;
            if (lead.whatsapp_replied && lead.whatsapp_replied !== "No" && lead.whatsapp_replied !== "none") return true;
            for (let i = 1; i <= 10; i++) {
                const r = lead[`W.P_Replied_${i}`];
                if (r && String(r).toLowerCase() !== "no" && String(r).toLowerCase() !== "none") return true;
                if (lead[`W.P_FollowUp_${i}`]) return true;
            }
            for (let i = 1; i <= 12; i++) {
                if (lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]) return true;
            }
            return false;
        });

        setLeads(wpLeads);
        setCurrentPage(1);
    }, [allLeads, loading, sourceTab]);

    const filteredLeads = useMemo(() => {
        return leads.filter(l => {
            const lead = l as any;
            const matchesSearch = String(lead.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(lead.phone || "").includes(searchQuery);

            let hasReplied = false;
            const wtReplied = lead.WP_Replied_track;
            if (wtReplied && String(wtReplied).trim() !== "") {
                const s = String(wtReplied).trim().toLowerCase();
                if (s !== "no" && s !== "none") hasReplied = true;
            }
            if (!hasReplied) {
                for (let i = 1; i <= 10; i++) {
                    const r = lead[`W.P_Replied_${i}`];
                    if (r && String(r).trim() !== "" && String(r).trim().toLowerCase() !== "no") {
                        hasReplied = true;
                        break;
                    }
                }
            }

            const matchesReplyStatus = activeFilters.replyStatus.length === 0 ||
                (activeFilters.replyStatus.includes("Replied") && hasReplied) ||
                (activeFilters.replyStatus.includes("No Reply") && !hasReplied);

            const matchesMessageStatus = activeFilters.messageStatus.length === 0 ||
                activeFilters.messageStatus.some(status => {
                    const target = status.toLowerCase();
                    const isIso = (ts: string) => /^\d{4}-\d{2}-\d{2}T/.test(ts);
                    const matches = (ts: string) => {
                        if (!ts) return false;
                        if (isIso(ts)) return target === "sent";
                        return ts.toLowerCase().includes(target);
                    };
                    for (let i = 1; i <= 4; i++) {
                        if (matches(lead[`W.P_${i} TS`] || "")) return true;
                    }
                    for (let i = 1; i <= 10; i++) {
                        if (matches(lead[`w_p_followup_ts_${i}`] || "")) return true;
                    }
                    return false;
                });

            let matchesDate = true;
            if (dateRange?.from) {
                const from = startOfDay(new Date(dateRange.from));
                const to = endOfDay(new Date(dateRange.to || dateRange.from));

                let hasActivityInRange = false;

                for (let i = 1; i <= 12; i++) {
                    const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                    if (d && d >= from && d <= to) {
                        hasActivityInRange = true;
                        break;
                    }
                }

                if (!hasActivityInRange) {
                    const fd = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
                    if (fd && fd >= from && fd <= to) hasActivityInRange = true;
                }

                if (!hasActivityInRange) {
                    for (let i = 1; i <= 10; i++) {
                        const d = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`, `w_p_followup_ts_${i}`);
                        if (d && d >= from && d <= to) {
                            hasActivityInRange = true;
                            break;
                        }
                    }
                }

                if (!hasActivityInRange) {
                    const rt = lead.WP_Replied_track;
                    if (rt) {
                        const parsed = parseMsg(rt);
                        if (parsed.date && parsed.date >= from && parsed.date <= to) {
                            hasActivityInRange = true;
                        } else if ((String(rt).toLowerCase() === "yes" || String(rt).toLowerCase() === "replied") && (new Date(lead.created_at) >= from && new Date(lead.created_at) <= to)) {
                            hasActivityInRange = true;
                        }
                    }
                }

                matchesDate = hasActivityInRange;
            }

            return matchesSearch && matchesReplyStatus && matchesMessageStatus && matchesDate;
        }).sort((a, b) => {
            const dateA = getLeadLatestActivity(a);
            const dateB = getLeadLatestActivity(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [leads, searchQuery, activeFilters, dateRange]);

    const stats = useMemo(() => {
        let sentCount = 0;
        let repliedCount = 0;
        let failedCount = 0;
        let uniqueSentCount = 0;

        filteredLeads.forEach(l => {
            const lead = l as any;

            // Same lifetime per-lead count the table's "Messages Sent" column shows —
            // keeps the metric card and the table in agreement.
            const leadSentCount = getLeadSentCount(lead);
            sentCount += leadSentCount;
            if (leadSentCount > 0) uniqueSentCount++;

            for (let i = 1; i <= 12; i++) {
                const tsValue = lead[`W.P_${i} TS`];
                if (tsValue && String(tsValue).toLowerCase().includes("failed")) failedCount++;
            }

            const rt = lead.WP_Replied_track;
            if (rt && String(rt).trim() !== "" && String(rt).trim().toLowerCase() !== "no" && String(rt).trim().toLowerCase() !== "none") {
                repliedCount++;
            }
        });

        const responseRate = uniqueSentCount > 0 ? ((repliedCount / uniqueSentCount) * 100).toFixed(1) : "0.0";

        return {
            totalLeads: filteredLeads.length,
            sentCount,
            uniqueSentCount,
            repliedCount,
            failedCount,
            responseRate,
        };
    }, [filteredLeads]);

    const handleResetFilters = () => {
        setActiveFilters({ replyStatus: [], messageStatus: [] });
    };

    const toggleFilter = (type: 'replyStatus' | 'messageStatus', value: string) => {
        setActiveFilters(prev => {
            const current = prev[type];
            if (current.includes(value)) {
                return { ...prev, [type]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [type]: [...current, value] };
            }
        });
    };

    const paginatedLeads = useMemo(() => {
        if (isOwnersTab) return [];
        const start = (currentPage - 1) * leadsPerPage;
        return filteredLeads.slice(start, start + leadsPerPage);
    }, [filteredLeads, currentPage, isOwnersTab]);

    const totalPages = isOwnersTab ? Math.max(1, Math.ceil(ownerTotal / leadsPerPage)) : Math.ceil(filteredLeads.length / leadsPerPage);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, activeFilters, dateRange, sourceTab]);

    const renderPaginationItems = () => {
        const items = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible + 2) {
            for (let i = 1; i <= totalPages; i++) {
                items.push(renderPageButton(i));
            }
        } else {
            items.push(renderPageButton(1));

            if (currentPage > 3) {
                items.push(<span key="dots-1" className="flex items-center justify-center w-8 h-8 text-slate-400"><MoreHorizontal className="h-4 w-4" /></span>);
            }

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                if (i > 1 && i < totalPages) {
                    items.push(renderPageButton(i));
                }
            }

            if (currentPage < totalPages - 2) {
                items.push(<span key="dots-2" className="flex items-center justify-center w-8 h-8 text-slate-400"><MoreHorizontal className="h-4 w-4" /></span>);
            }

            items.push(renderPageButton(totalPages));
        }
        return items;
    };

    const renderPageButton = (page: number) => (
        <Button
            key={page}
            variant={currentPage === page ? "default" : "outline"}
            size="sm"
            className={`h-8 w-8 text-xs font-bold ${currentPage === page ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
            onClick={() => setCurrentPage(page)}
        >
            {page}
        </Button>
    );

    const currentTabLabel = sourceTabs.find(t => t.key === sourceTab)?.label || sourceTab;

    return (
        <div className="space-y-6 pb-10 relative min-h-[500px]">
            {loading && <ASLoader />}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">WhatsApp Chats</h1>
                    <p className="text-slate-500 text-sm">Real-time engagement across your source tables</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Select value={sourceTab} onValueChange={(val) => { setSourceTab(val as SourceTabKey); setCurrentPage(1); }}>
                        <SelectTrigger className="w-[200px] bg-white border-slate-200 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sourceTabs.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <SelectItem key={tab.key} value={tab.key}>
                                        <span className="flex items-center gap-2">
                                            <Icon className="h-3.5 w-3.5 text-slate-500" />
                                            {tab.label}
                                        </span>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    <DateRangePicker onUpdate={(values) => setDateRange(values.range)} />
                    <Button variant="outline" size="sm" onClick={() => { window.location.reload(); }} className="gap-2 h-9">
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <Card className="border-slate-200 shadow-sm bg-white h-auto">
                        <CardContent className="p-4 space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2 text-slate-900 font-bold">
                                    <Filter className="h-4 w-4" /> Filters
                                </div>
                                {(activeFilters.replyStatus.length > 0 || activeFilters.messageStatus.length > 0) && (
                                    <button onClick={handleResetFilters} className="text-[10px] text-emerald-600 font-bold hover:underline">RESET</button>
                                )}
                            </div>

                            {!isOwnersTab && (
                                <>
                                    <FilterSection title="Reply Status" >
                                        <FilterOption label="Replied" checked={activeFilters.replyStatus.includes("Replied")} onCheckedChange={() => toggleFilter('replyStatus', "Replied")} />
                                        <FilterOption label="No Reply" checked={activeFilters.replyStatus.includes("No Reply")} onCheckedChange={() => toggleFilter('replyStatus', "No Reply")} />
                                    </FilterSection>

                                    <FilterSection title="Message Status">
                                        <FilterOption label="Read" checked={activeFilters.messageStatus.includes("Read")} onCheckedChange={() => toggleFilter('messageStatus', "Read")} />
                                        <FilterOption label="Sent" checked={activeFilters.messageStatus.includes("Sent")} onCheckedChange={() => toggleFilter('messageStatus', "Sent")} />
                                        <FilterOption label="Failed" checked={activeFilters.messageStatus.includes("Failed")} onCheckedChange={() => toggleFilter('messageStatus', "Failed")} />
                                        <FilterOption label="Delivered" checked={activeFilters.messageStatus.includes("Delivered")} onCheckedChange={() => toggleFilter('messageStatus', "Delivered")} />
                                        <FilterOption label="Deleted" checked={activeFilters.messageStatus.includes("Deleted")} onCheckedChange={() => toggleFilter('messageStatus', "Deleted")} />
                                    </FilterSection>
                                </>
                            )}

                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[10px] text-slate-400 font-medium">Active Source</p>
                                <p className="text-xs font-bold text-slate-700 mt-1">{currentTabLabel}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-3 space-y-4">
                    {isOwnersTab ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <MetricCard title="Messages Sent" value={loading ? "..." : ownerMetrics.msgsSent.toLocaleString()} desc="Total outgoing pulses" icon={Send} />
                                <MetricCard title="Unique Owners Contacted" value={loading ? "..." : ownerMetrics.reachouts.toLocaleString()} desc="Unique entities contacted" icon={Building2} />
                                <MetricCard title="Total Replies" value={loading ? "..." : ownerMetrics.replies.toLocaleString()} desc={`${ownerMetrics.replyRate}% Response Rate`} icon={MessageSquare} />
                            </div>
                            <Card className="border-slate-200 shadow-sm bg-white">
                                <CardContent className="p-4 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Delivery Status</h3>
                                        <p className="text-xs text-slate-500">Outbound health for {currentTabLabel}</p>
                                    </div>
                                    <div className="space-y-3">
                                        <StatusBar label="Sent" value={ownerMetrics.msgsSent} total={ownerMetrics.msgsSent || 1} color="bg-amber-400" />
                                        <StatusBar label="Replied" value={ownerMetrics.replies} total={ownerMetrics.reachouts || 1} color="bg-emerald-500" />
                                        <StatusBar label="Awaiting Reply" value={ownerMetrics.waitingOnReply} total={ownerMetrics.reachouts || 1} color="bg-slate-400" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <MetricCard title="Messages Sent" value={loading ? "..." : stats.sentCount.toLocaleString()} desc="Total outgoing pulses" icon={Send} />
                                <MetricCard title="Unique Msg Sent" value={loading ? "..." : stats.uniqueSentCount.toLocaleString()} desc="Unique entities contacted" icon={Users} />
                                <MetricCard title="Total Replies" value={loading ? "..." : stats.repliedCount.toLocaleString()} desc={`${stats.responseRate}% Response Rate`} icon={MessageSquare} />
                            </div>
                            <Card className="border-slate-200 shadow-sm bg-white">
                                <CardContent className="p-4 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Delivery Status</h3>
                                        <p className="text-xs text-slate-500">Outbound health for {currentTabLabel}</p>
                                    </div>
                                    <div className="space-y-3">
                                        <StatusBar label="Sent" value={stats.sentCount} total={stats.sentCount || 1} color="bg-blue-400" />
                                        <StatusBar label="Replied" value={stats.repliedCount} total={stats.uniqueSentCount || 1} color="bg-emerald-500" />
                                        {stats.failedCount > 0 && (
                                            <StatusBar label="Failed" value={stats.failedCount} total={stats.sentCount || 1} color="bg-rose-500" />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input className="pl-10 bg-white" placeholder={`Search ${currentTabLabel} by name or phone...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>

                    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                        {loading ? (
                            <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
                                <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
                                Loading real-time chats...
                            </div>
                        ) : isOwnersTab ? (
                            ownerRows.length === 0 ? (
                                <div className="p-10 text-center text-slate-500">No owner leads found.</div>
                            ) : (
                                <TooltipProvider>
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-3">Owner</th>
                                                <th className="px-4 py-3 text-center">Source</th>
                                                <th className="px-4 py-3 text-center">Messages Sent</th>
                                                <th className="px-4 py-3 text-center">Status</th>
                                                <th className="px-4 py-3 text-center">Message Status</th>
                                                <th className="px-4 py-3 text-right">Last Contacted</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {ownerRows.map((owner) => (
                                                <tr key={owner.id} className="hover:bg-amber-50/30 transition-colors cursor-pointer group" onClick={() => setSelectedOwnerId(owner.id)}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-900 group-hover:text-amber-700">{owner.name}</div>
                                                        <div className="text-xs text-slate-500">{owner.phone}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-100 text-amber-600 bg-amber-50">Owners</Badge>
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-slate-700">{owner.sentCount}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div>
                                                                    {owner.replied ? (
                                                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold">REPLIED</Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">SENT</Badge>
                                                                    )}
                                                                </div>
                                                            </TooltipTrigger>
                                                            {owner.replied && owner.lastContacted && (
                                                                <TooltipContent side="top" className="bg-slate-800/40 backdrop-blur-md text-white text-[10px] border-none px-2 py-1 shadow-xl">
                                                                    {new Date(owner.lastContacted).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                                                                </TooltipContent>
                                                            )}
                                                        </Tooltip>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex flex-col items-center gap-1.5">
                                                            {(owner.messageStatuses || []).map((s: any) => (
                                                                <MessageStatusBadge key={s.index} index={s.index} status={s.status} />
                                                            ))}
                                                            {(!owner.messageStatuses || owner.messageStatuses.length === 0) && <span className="text-slate-300 text-[10px]">—</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-500 text-xs text-nowrap">
                                                        {owner.lastContacted ? new Date(owner.lastContacted).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </TooltipProvider>
                            )
                        ) : filteredLeads.length === 0 ? (
                            <div className="p-10 text-center text-slate-500">No WhatsApp chats found for {currentTabLabel}.</div>
                        ) : (
                            <TooltipProvider>
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3">Lead</th>
                                            <th className="px-4 py-3 text-center">Source</th>
                                            <th className="px-4 py-3 text-center">Messages Sent</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-center">Message Status</th>
                                            <th className="px-4 py-3 text-right">Last Contacted</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedLeads.map((lead) => (
                                            <CustomerRow key={lead.id} lead={lead} onClick={() => {
                                                setSelectedLeadId(lead.id);
                                            }} />
                                        ))}
                                    </tbody>
                                </table>
                            </TooltipProvider>
                        )}

                        {totalPages > 1 && (
                            <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                                <div className="text-xs text-slate-500 font-medium">
                                    {isOwnersTab ? (
                                        <>Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * leadsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * leadsPerPage, ownerTotal)}</span> of <span className="text-slate-900 font-bold">{ownerTotal}</span> owners</>
                                    ) : (
                                        <>Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * leadsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * leadsPerPage, filteredLeads.length)}</span> of <span className="text-slate-900 font-bold">{filteredLeads.length}</span> leads</>
                                    )}
                                </div>
                                <div className="flex gap-1 items-center">
                                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="flex gap-1">
                                        {renderPaginationItems()}
                                    </div>
                                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <Dialog open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-6 gap-0" aria-describedby={undefined}>
                    <DialogHeader className="sr-only"><DialogTitle>WhatsApp Chat Detail</DialogTitle></DialogHeader>
                    {selectedLeadId && <WhatsAppChatDetail customerId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />}
                </DialogContent>
            </Dialog>

            <Dialog open={selectedOwnerId != null} onOpenChange={(open) => !open && setSelectedOwnerId(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-6 gap-0" aria-describedby={undefined}>
                    <DialogHeader className="sr-only"><DialogTitle>Owner Chat Detail</DialogTitle></DialogHeader>
                    <OwnerChatDetail owner={selectedOwner} onClose={() => setSelectedOwnerId(null)} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MetricCard({ title, value, desc, icon: Icon, dots }: any) {
    return (
        <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg w-fit mb-2"><Icon className="h-5 w-5" /></div>
                <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
                <p className="text-xs font-medium text-slate-500">{title}</p>
                <p className="text-[10px] text-slate-400 mt-1">{desc}</p>
                {dots && (
                    <div className="flex gap-1 mt-2">
                        <div className="h-2 w-2 rounded-full bg-blue-400" /><div className="h-2 w-2 rounded-full bg-emerald-500" /><div className="h-2 w-2 rounded-full bg-rose-500" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StatusBar({ label, value, total, color }: any) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-medium text-slate-600">
                <span>{label}</span><span>{value} ({((value / total) * 100).toFixed(1)}%)</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${(value / total) * 100}%` }} />
            </div>
        </div>
    );
}

function FilterSection({ title, children }: any) {
    return (
        <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-400">{title}</h4>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
}

function FilterOption({ label, checked, onCheckedChange }: any) {
    return (
        <div className="flex items-center gap-2">
            <Checkbox id={label} className="h-3.5 w-3.5 border-slate-300" checked={checked} onCheckedChange={onCheckedChange} />
            <label htmlFor={label} className="text-sm font-medium text-slate-600 cursor-pointer">{label}</label>
        </div>
    );
}

function CustomerRow({ lead: leadRaw, onClick }: { lead: ConsolidatedLead; onClick: () => void }) {
    const lead = leadRaw as any;
    const latestDate = getLeadLatestActivity(lead);

    const sentCount = getLeadSentCount(lead);

    const allStatuses = [];
    for (let i = 1; i <= 12; i++) {
        if (lead[`W.P_${i} TS`]) {
            allStatuses.push({ index: i, status: lead[`W.P_${i} TS`] });
        }
    }
    const displayStatuses = allStatuses.slice(-2);

    const wtRepliedTrack = lead.WP_Replied_track;
    let hasReplied = false;
    if (wtRepliedTrack && String(wtRepliedTrack).trim() !== "") {
        const s = String(wtRepliedTrack).trim().toLowerCase();
        if (s !== "no" && s !== "none") hasReplied = true;
    }

    const formatTooltipDate = (date: Date | string) => {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return String(date);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleString([], { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const sourceLabel = sourceTabs.find(t => t.key === lead.source_table)?.label || lead.source_table || "—";

    return (
        <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={onClick}>
            <td className="px-4 py-3">
                <div className="block">
                    <div className="font-bold text-slate-900 group-hover:text-emerald-700">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.phone}</div>
                </div>
            </td>
            <td className="px-4 py-3 text-center">
                <Badge variant="outline" className="text-[10px] uppercase font-bold border-blue-100 text-blue-600 bg-blue-50">{sourceLabel}</Badge>
            </td>
            <td className="px-4 py-3 text-center font-bold text-slate-700">{sentCount}</td>
            <td className="px-4 py-3 text-center">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div>
                                {hasReplied ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold">REPLIED</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">SENT</Badge>
                                )}
                            </div>
                        </TooltipTrigger>
                        {hasReplied && (
                            <TooltipContent side="top" className="bg-slate-800/40 backdrop-blur-md text-white text-[10px] border-none px-2 py-1 shadow-xl">
                                {formatTooltipDate(latestDate)}
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            </td>
            <td className="px-4 py-3 text-center">
                <div className="flex flex-col items-center gap-1.5">
                    {displayStatuses.map((s) => (
                        <MessageStatusBadge key={s.index} index={s.index} status={s.status} />
                    ))}
                    {displayStatuses.length === 0 && <span className="text-slate-300 text-[10px]">—</span>}
                </div>
            </td>
            <td className="px-4 py-3 text-right text-slate-500 text-xs text-nowrap">
                {latestDate.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
            </td>
        </tr>
    );
}

function MessageStatusBadge({ index, status }: { index: number, status: string }) {
    if (!status) return null;

    const isIsoTs = /^\d{4}-\d{2}-\d{2}T/.test(status.trim());
    // Nurture format: "SENT at Jun 05 2026, 04:10 PM" — extract status word before " at"
    const isNurtureTs = !isIsoTs && /\bat\s+[A-Za-z]+\s+\d{1,2}\s+\d{4}/i.test(status.trim());
    const parts = (isIsoTs || isNurtureTs) ? [] : status.split(' - ');
    let statusText: string;
    let rawTimestamp: string;
    if (isIsoTs) {
        statusText = 'Sent';
        rawTimestamp = status.trim();
    } else if (isNurtureTs) {
        const atIdx = status.toLowerCase().indexOf(' at ');
        statusText = atIdx > 0 ? status.slice(0, atIdx).trim() : status.trim();
        rawTimestamp = status.trim();
    } else {
        statusText = parts[0].trim();
        rawTimestamp = parts.length > 1 ? parts[1].trim() : '';
    }

    const formatTooltipDate = (dateStr: string) => {
        const d = new Date(dateStr.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'));
        const finalDate = isNaN(d.getTime()) ? new Date(dateStr) : d;
        if (isNaN(finalDate.getTime())) return dateStr;
        const now = new Date();
        if (finalDate.toDateString() === now.toDateString()) return finalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return finalDate.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const formatted = statusText.charAt(0).toUpperCase() + statusText.slice(1).toLowerCase();
    let badgeClass = "bg-slate-100 text-slate-600 border-slate-200";
    if (formatted.includes("Delivered")) badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (formatted.includes("Read")) badgeClass = "bg-blue-50 text-blue-700 border-blue-100";
    if (formatted.includes("Failed")) badgeClass = "bg-red-50 text-red-700 border-red-100";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 w-full justify-center cursor-help">
                        <span className="text-[9px] text-slate-400 font-mono select-none">{index}</span>
                        <Badge variant="outline" className={`h-5 px-1.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}>{formatted}</Badge>
                    </div>
                </TooltipTrigger>
                {rawTimestamp && (
                    <TooltipContent side="top" className="bg-slate-800/40 backdrop-blur-md text-white text-[10px] border-none px-2 py-1 shadow-xl">{formatTooltipDate(rawTimestamp)}</TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
}
