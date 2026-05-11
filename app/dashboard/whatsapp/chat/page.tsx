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
import { OwnerChatDetail } from "@/components/dashboard/owner-chat-detail";
import { ConsolidatedLead } from "@/lib/leads-utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Search,
    Filter,
    Users,
    Send,
    MessageCircle,
    MessageSquare,
    RefreshCw,
    Building2
} from "lucide-react";
import { ASLoader } from "@/components/as-loader";
import { useData } from "@/context/DataContext";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

// --- Sorting & Activity Helpers ---
const parseMsg = (raw: any): { date: Date | null, content: string } => {
    if (!raw || !String(raw).trim()) return { date: null, content: "" };
    const content = String(raw).trim();

    // 1. Direct ISO (e.g. "2026-04-29T10:30:00.000Z")
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
            return { date: d, content: content.replace(isoRegex, '').trim() };
        }
    }

    // 3. Space-separated datetime at the end (e.g. "2026-04-29 10:30:00")
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

    // 4. DD/MM/YYYY at end of content
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

// Parse a date from the TS column (e.g. "Delivered - 29/04/2026", "Read - 29/4/2026 10:30:00 AM")
const parseTSDate = (tsValue: string): Date | null => {
    if (!tsValue) return null;
    const str = String(tsValue).trim();

    // Format: "Status - DD/MM/YYYY" or "Status - DD/MM/YYYY HH:MM:SS"
    if (str.includes(' - ')) {
        const parts = str.split(' - ');
        const datePart = parts[parts.length - 1].trim();

        // Try DD/MM/YYYY
        const ddmmMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmmMatch) {
            const day = Number(ddmmMatch[1]);
            const month = Number(ddmmMatch[2]) - 1;
            const year = Number(ddmmMatch[3]);
            // Check for time portion after the date
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

        // Try ISO format
        const isoDate = new Date(datePart.replace(' ', 'T'));
        if (!isNaN(isoDate.getTime())) return isoDate;
    }
    return null;
};

const getMsgDateWithFallback = (lead: any, msgKey: string, tsKey?: string) => {
    // 1. Try parsing from message content
    const msgContent = lead[msgKey] || lead.stage_data?.[msgKey];
    const d = getMsgDate(msgContent);
    if (d) return d;

    // 2. Try parsing from TS column
    const resolvedTsKey = tsKey || `${msgKey} TS`;
    const tsValue = lead[resolvedTsKey];
    const tsDate = parseTSDate(tsValue);
    if (tsDate) return tsDate;

    // 3. If the message EXISTS but we couldn't parse a date from content or TS,
    //    fall back to the lead's "Created At" as the message date.
    //    This is critical: without this, leads with non-timestamped messages
    //    are silently dropped from date-filtered views.
    if (msgContent && String(msgContent).trim() !== "" && String(msgContent).trim().toLowerCase() !== "no") {
        const createdAt = lead.created_at ? new Date(lead.created_at) : null;
        if (createdAt && !isNaN(createdAt.getTime())) return createdAt;
    }

    return null;
};

const getLeadLatestActivity = (lead: any) => {
    let latestDate = new Date(lead.created_at);

    // Check all bot messages (W.P_1 - W.P_12)
    for (let i = 1; i <= 12; i++) {
        const d = getMsgDateWithFallback(lead, `W.P_${i}`);
        if (d && d > latestDate) latestDate = d;
    }

    // Check reply (legacy and new track)
    const rd = getMsgDate(lead.whatsapp_replied || lead.stage_data?.["WhatsApp Replied"]);
    if (rd && rd > latestDate) latestDate = rd;

    const rt = getMsgDate(lead.WP_Replied_track);
    if (rt && rt > latestDate) latestDate = rt;

    // Check followup
    const fd = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
    if (fd && fd > latestDate) latestDate = fd;

    // Check extended history (W.P_Replied 1-10, W.P_FollowUp 1-10)
    for (let i = 1; i <= 10; i++) {
        const dReplied = getMsgDate(lead[`W.P_Replied_${i}`]);
        if (dReplied && dReplied > latestDate) latestDate = dReplied;

        const dFollow = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`, `W.P_FollowUp_${i} TS`);
        if (dFollow && dFollow > latestDate) latestDate = dFollow;
    }
    return latestDate;
};

const getOwnerLatestActivity = (o: any) => {
    let latest = o.createdOn ? new Date(o.createdOn) : (o.created_at ? new Date(o.created_at) : new Date(0));
    
    // Check Whatsapp_1_Date
    if (o.Whatsapp_1_Date) {
        const d = new Date(o.Whatsapp_1_Date);
        if (!isNaN(d.getTime()) && d > latest) latest = d;
    }
    
    // Check WTS_Reply_Track for timestamp
    if (o.WTS_Reply_Track) {
        const { date } = parseMsg(o.WTS_Reply_Track);
        if (date && date > latest) latest = date;
    }
    
    // Check Bot_Replied_X and User_Replied_X
    for (let i = 1; i <= 10; i++) {
        const br = o[`Bot_Replied_${i}`];
        if (br) {
            const { date } = parseMsg(br);
            if (date && date > latest) latest = date;
        }
        const ur = o[`User_Replied_${i}`];
        if (ur) {
            const { date } = parseMsg(ur);
            if (date && date > latest) latest = date;
        }
    }
    
    return latest;
};

export default function WhatsappChatPage() {
    const { leads: allLeads, loadingLeads, ownerLeads, loadingOwners } = useData();
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const loading = loadingLeads;
    const [searchQuery, setSearchQuery] = useState("");

    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [currentPage, setCurrentPage] = useState(1);
    const leadsPerPage = 10;

    // Tab state: "leads" or "owners"
    const [activeTab, setActiveTab] = useState<"leads" | "owners">("leads");

    // URL Sync for chat
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const initialSelectedId = searchParams?.get('chat');
    const initialTab = searchParams?.get('tab');

    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialSelectedId || null);
    const [selectedOwner, setSelectedOwner] = useState<any | null>(null);
    const initialProcessed = useRef(false);

    useEffect(() => {
        const url = new URL(window.location.origin + window.location.pathname);
        if (selectedLeadId) {
            url.searchParams.set('chat', selectedLeadId);
            url.searchParams.set('tab', 'leads');
        } else if (selectedOwner) {
            const ownerId = selectedOwner.id || selectedOwner.contactNo || selectedOwner.Phone || selectedOwner.phone;
            url.searchParams.set('chat', ownerId);
            url.searchParams.set('tab', 'owners');
        } else {
            url.searchParams.delete('chat');
            url.searchParams.delete('tab');
        }
        window.history.replaceState({}, '', url.toString());
    }, [selectedLeadId, selectedOwner]);

    // Handle initial URL parameters
    useEffect(() => {
        if (initialProcessed.current) return;
        
        if (initialTab === 'owners') {
            setActiveTab('owners');
        }
        
        if (initialSelectedId) {
            if (initialTab === 'owners') {
                // Find in global ownerLeads
                if (ownerLeads.length > 0) {
                    const found = ownerLeads.find(o => 
                        String(o.id) === initialSelectedId || 
                        String(o.contactNo) === initialSelectedId || 
                        String(o.Phone) === initialSelectedId || 
                        String(o.phone) === initialSelectedId
                    );
                    if (found) {
                        setSelectedOwner(found);
                        initialProcessed.current = true;
                    }
                }
            } else {
                setSelectedLeadId(initialSelectedId);
                initialProcessed.current = true;
            }
        } else {
            initialProcessed.current = true;
        }
    }, [initialSelectedId, initialTab, ownerLeads]);

    // Filter State
    const [pendingFilters, setPendingFilters] = useState<{
        replyStatus: string[],
        loops: string[],
        messageStatus: string[]
    }>({
        replyStatus: [],
        loops: [],
        messageStatus: []
    });

    const [activeFilters, setActiveFilters] = useState<{
        replyStatus: string[],
        loops: string[],
        messageStatus: string[]
    }>({
        replyStatus: [],
        loops: [],
        messageStatus: []
    });

    useEffect(() => {
        if (loadingLeads) return;

        const wpLeads = allLeads.filter(l => {
            const lead = l as any;
            if (lead.stages_passed.some((s: string) => s.toLowerCase().includes("whatsapp"))) return true;
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
    }, [allLeads, loadingLeads]);

    const filteredLeads = useMemo(() => {
        return leads.filter(l => {
            const lead = l as any;
            const matchesSearch = String(lead.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(lead.phone || "").includes(searchQuery);

            const wtReplied = lead.WP_Replied_track;
            let hasReplied = false;
            if (wtReplied && String(wtReplied).trim() !== "") {
                const s = String(wtReplied).trim().toLowerCase();
                if (s !== "no" && s !== "none") hasReplied = true;
            }

            const matchesReplyStatus = activeFilters.replyStatus.length === 0 ||
                (activeFilters.replyStatus.includes("Replied") && hasReplied) ||
                (activeFilters.replyStatus.includes("No Reply") && !hasReplied);

            const matchesLoop = activeFilters.loops.length === 0 ||
                activeFilters.loops.some(loop => {
                    const lName = (lead.source_loop || "").toLowerCase();
                    const target = loop.toLowerCase();
                    if (target === "follow up") return lName.includes("follow up") || lName.includes("followup");
                    return lName.includes(target);
                });

            const matchesMessageStatus = activeFilters.messageStatus.length === 0 ||
                activeFilters.messageStatus.some(status => {
                    const target = status.toLowerCase();
                    for (let i = 1; i <= 12; i++) {
                        const s = (lead[`W.P_${i} TS`] || "").toLowerCase();
                        if (s.includes(target)) return true;
                    }
                    return false;
                });

            let matchesDate = true;
            if (dateRange?.from) {
                const from = startOfDay(new Date(dateRange.from));
                const to = endOfDay(new Date(dateRange.to || dateRange.from));

                let hasActivityInRange = false;

                // 1. Check if any bot message was sent in range
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
                        const d = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`);
                        if (d && d >= from && d <= to) {
                            hasActivityInRange = true;
                            break;
                        }
                    }
                }

                // 2. Check if any reply was received in range
                if (!hasActivityInRange) {
                    const rt = lead.WP_Replied_track;
                    if (rt) {
                        const parsed = parseMsg(rt);
                        if (parsed.date && parsed.date >= from && parsed.date <= to) {
                            hasActivityInRange = true;
                        } else if ((String(rt).toLowerCase() === "yes" || String(rt).toLowerCase() === "replied") && (new Date(lead.created_at) >= from && new Date(lead.created_at) <= to)) {
                            // Legacy fallback
                            hasActivityInRange = true;
                        }
                    }
                }

                matchesDate = hasActivityInRange;
            }

            return matchesSearch && matchesReplyStatus && matchesLoop && matchesMessageStatus && matchesDate;
        }).sort((a, b) => {
            const dateA = getLeadLatestActivity(a);
            const dateB = getLeadLatestActivity(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [leads, searchQuery, activeFilters, dateRange]);

    // Owner filtering
    const filteredOwners = useMemo(() => {
        return ownerLeads.filter(o => {
            const name = String(o.Name || o.name || "").toLowerCase();
            const phone = String(o.contactNo || o.Phone || o.phone || "");
            const matchesSearch = name.includes(searchQuery.toLowerCase()) || phone.includes(searchQuery);
            if (!matchesSearch) return false;

            // Date Range Filter
            if (dateRange?.from) {
                const wpDate = o["Whatsapp_1_Date"];
                if (wpDate) {
                    const d = new Date(wpDate);
                    if (!isNaN(d.getTime())) {
                        const from = startOfDay(new Date(dateRange.from));
                        const to = endOfDay(new Date(dateRange.to || dateRange.from));
                        if (d < from || d > to) return false;
                    }
                } else {
                    return false;
                }
            }

            // Reply Status Filter
            if (activeFilters.replyStatus.length > 0) {
                const wtsReply = o["WTS_Reply_Track"];
                const hasReplied = wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no";
                const matchesReply = (activeFilters.replyStatus.includes("Replied") && hasReplied) ||
                                     (activeFilters.replyStatus.includes("No Reply") && !hasReplied);
                if (!matchesReply) return false;
            }

            // Message Status Filter (e.g. Read, Delivered, Sent, Failed)
            if (activeFilters.messageStatus.length > 0) {
                const status = (o["Whatsapp_1_status"] || "").toLowerCase();
                const matchesStatus = activeFilters.messageStatus.some(s => status.includes(s.toLowerCase()));
                if (!matchesStatus) return false;
            }

            return true;
        }).sort((a, b) => {
            const dateA = getOwnerLatestActivity(a);
            const dateB = getOwnerLatestActivity(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [ownerLeads, searchQuery, dateRange, activeFilters]);

    // --- Stats derived directly from filteredLeads/filteredOwners so metric card = sum of table rows ---
    const stats = useMemo(() => {
        let sentCount = 0;
        let repliedCount = 0;
        let failedCount = 0;
        let uniqueSentCount = 0;

        const from = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const to = endOfDay(new Date(dateRange?.to || dateRange?.from || new Date()));

        const isWithin = (d: Date | null) => {
            if (!from || !to) return true;
            if (!d) return false;
            return d >= from && d <= to;
        };

        if (activeTab === "leads") {
            filteredLeads.forEach(l => {
                const lead = l as any;
                let leadHadSentInRange = false;

                for (let i = 1; i <= 12; i++) {
                    const tsValue = lead[`W.P_${i} TS`];
                    if (tsValue && String(tsValue).toLowerCase().includes("failed")) {
                        const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                        if (isWithin(d)) failedCount++;
                    }
                }

                // Count bot outgoing messages within range
                for (let i = 1; i <= 12; i++) {
                    const d = getMsgDateWithFallback(lead, `W.P_${i}`);
                    if (d && isWithin(d)) {
                        sentCount++;
                        leadHadSentInRange = true;
                    }
                }
                const fup = getMsgDateWithFallback(lead, "W.P_FollowUp", "W.P_FollowUp TS");
                if (fup && isWithin(fup)) {
                    sentCount++;
                    leadHadSentInRange = true;
                }
                for (let i = 1; i <= 10; i++) {
                    const df = getMsgDateWithFallback(lead, `W.P_FollowUp_${i}`);
                    if (df && isWithin(df)) {
                        sentCount++;
                        leadHadSentInRange = true;
                    }
                }

                if (leadHadSentInRange) uniqueSentCount++;

                // Replied check: lead is already in filteredLeads (had activity in date range),
                // so if it has a reply tracked, count it.
                const rt = lead.WP_Replied_track;
                if (rt && String(rt).trim() !== "" && String(rt).trim().toLowerCase() !== "no" && String(rt).trim().toLowerCase() !== "none") {
                    repliedCount++;
                }
            });
        } else {
            // Owner Stats
            filteredOwners.forEach(o => {
                const wpDate = o["Whatsapp_1_Date"] ? new Date(o["Whatsapp_1_Date"]) : null;
                if (!isWithin(wpDate)) return;

                if (o["Whatsapp_1"]) {
                    sentCount++;
                    uniqueSentCount++;
                }
                if (o["retry_1"]) sentCount++;
                for (let i = 1; i <= 5; i++) {
                    if (o[`Bot_Replied_${i}`]) sentCount++;
                }
                if (o["Whatsapp_1_status"]?.toLowerCase().includes("failed")) failedCount++;

                const wtsReply = o["WTS_Reply_Track"];
                if (wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no") {
                    repliedCount++;
                }
            });
        }

        // Response rate = replies / unique leads contacted (not total filtered leads)
        const responseRate = uniqueSentCount > 0 ? ((repliedCount / uniqueSentCount) * 100).toFixed(1) : "0.0";

        return {
            totalLeads: activeTab === "leads" ? filteredLeads.length : filteredOwners.length,
            sentCount,
            uniqueSentCount,
            repliedCount,
            failedCount,
            responseRate,
        };
    }, [filteredLeads, filteredOwners, activeTab, dateRange]);

    const handleApplyFilters = () => { setActiveFilters(pendingFilters); };
    const handleResetFilters = () => {
        const reset = { replyStatus: [], loops: [], messageStatus: [] };
        setPendingFilters(reset);
        setActiveFilters(reset);
    };

    const toggleFilter = (type: 'replyStatus' | 'loops' | 'messageStatus', value: string) => {
        setPendingFilters(prev => {
            const current = prev[type];
            if (current.includes(value)) {
                return { ...prev, [type]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [type]: [...current, value] };
            }
        });
    };

    const paginatedLeads = useMemo(() => {
        const start = (currentPage - 1) * leadsPerPage;
        return filteredLeads.slice(start, start + leadsPerPage);
    }, [filteredLeads, currentPage]);

    const totalPages = activeTab === "leads" 
        ? Math.ceil(filteredLeads.length / leadsPerPage) 
        : Math.ceil(filteredOwners.length / leadsPerPage);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, activeFilters, dateRange]);

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



    const ownerPages = Math.ceil(filteredOwners.length / leadsPerPage);
    const paginatedOwners = filteredOwners.slice((currentPage - 1) * leadsPerPage, currentPage * leadsPerPage);

    return (
        <div className="space-y-6 pb-10 relative min-h-[500px]">
            {(activeTab === "leads" ? loading : loadingOwners) && <ASLoader />}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">WhatsApp Chats</h1>
                    <p className="text-slate-500 text-sm">Real-time engagement across your leads</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Tab Switcher */}
                    <div className="flex bg-slate-100 rounded-lg p-0.5">
                        <button
                            onClick={() => { setActiveTab("leads"); setCurrentPage(1); }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === "leads" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <Users className="h-3.5 w-3.5 inline mr-1.5" />Leads
                        </button>
                        <button
                            onClick={() => { setActiveTab("owners"); setCurrentPage(1); }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === "owners" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <Building2 className="h-3.5 w-3.5 inline mr-1.5" />Owners
                        </button>
                    </div>
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
                                {(activeFilters.replyStatus.length > 0 || activeFilters.loops.length > 0 || activeFilters.messageStatus.length > 0) && (
                                    <button onClick={handleResetFilters} className="text-[10px] text-emerald-600 font-bold hover:underline">RESET</button>
                                )}
                            </div>

                            <FilterSection title="Reply Status" >
                                <FilterOption label="Replied" checked={pendingFilters.replyStatus.includes("Replied")} onCheckedChange={() => toggleFilter('replyStatus', "Replied")} />
                                <FilterOption label="No Reply" checked={pendingFilters.replyStatus.includes("No Reply")} onCheckedChange={() => toggleFilter('replyStatus', "No Reply")} />
                            </FilterSection>

                            {activeTab === "leads" && (
                                <FilterSection title="Loop">
                                    <FilterOption label="Intro" checked={pendingFilters.loops.includes("Intro")} onCheckedChange={() => toggleFilter('loops', "Intro")} />
                                    <FilterOption label="Follow Up" checked={pendingFilters.loops.includes("Follow Up")} onCheckedChange={() => toggleFilter('loops', "Follow Up")} />
                                    <FilterOption label="Nurture" checked={pendingFilters.loops.includes("Nurture")} onCheckedChange={() => toggleFilter('loops', "Nurture")} />
                                </FilterSection>
                            )}

                            <FilterSection title="Message Status">
                                <FilterOption label="Read" checked={pendingFilters.messageStatus.includes("Read")} onCheckedChange={() => toggleFilter('messageStatus', "Read")} />
                                <FilterOption label="Sent" checked={pendingFilters.messageStatus.includes("Sent")} onCheckedChange={() => toggleFilter('messageStatus', "Sent")} />
                                <FilterOption label="Failed" checked={pendingFilters.messageStatus.includes("Failed")} onCheckedChange={() => toggleFilter('messageStatus', "Failed")} />
                                <FilterOption label="Delivered" checked={pendingFilters.messageStatus.includes("Delivered")} onCheckedChange={() => toggleFilter('messageStatus', "Delivered")} />
                                <FilterOption label="Deleted" checked={pendingFilters.messageStatus.includes("Deleted")} onCheckedChange={() => toggleFilter('messageStatus', "Deleted")} />
                            </FilterSection>

                            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white h-9" size="sm" onClick={handleApplyFilters}>Apply Filters</Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-3 space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <MetricCard title="Messages Sent" value={(activeTab === "leads" ? loading : loadingOwners) ? "..." : stats.sentCount.toLocaleString()} desc="Total outgoing pulses" icon={Send} />
                            <MetricCard title="Unique Msg Sent" value={(activeTab === "leads" ? loading : loadingOwners) ? "..." : stats.uniqueSentCount.toLocaleString()} desc="Unique entities contacted" icon={Users} />
                            <MetricCard title="Total Replies" value={(activeTab === "leads" ? loading : loadingOwners) ? "..." : stats.repliedCount.toLocaleString()} desc={`${stats.responseRate}% Response Rate`} icon={MessageSquare} />
                        </div>
                        <Card className="border-slate-200 shadow-sm bg-white">
                            <CardContent className="p-4 space-y-4">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Delivery Status</h3>
                                    <p className="text-xs text-slate-500">Global outbound health</p>
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

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input className="pl-10 bg-white" placeholder={`Search ${activeTab} by name or phone...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>

                    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                        {activeTab === "leads" ? (
                            <>
                                {loading ? (
                                    <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
                                        Loading real-time chats...
                                    </div>
                                ) : filteredLeads.length === 0 ? (
                                    <div className="p-10 text-center text-slate-500">No WhatsApp chats found.</div>
                                ) : (
                                    <TooltipProvider>
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-3">Lead</th>
                                                    <th className="px-4 py-3 text-center">Loop</th>
                                                    <th className="px-4 py-3 text-center">Messages Sent</th>
                                                    <th className="px-4 py-3 text-center">Status</th>
                                                    <th className="px-4 py-3 text-center">Message Status</th>
                                                    <th className="px-4 py-3 text-right">Last Contacted</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {paginatedLeads.map((lead) => (
                                                    <CustomerRow key={lead.id} lead={lead} onClick={() => {
                                                        setSelectedOwner(null);
                                                        setSelectedLeadId(lead.id);
                                                    }} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </TooltipProvider>
                                )}
                            </>
                        ) : (
                            <>
                                {loadingOwners ? (
                                    <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                                        Loading owner chats...
                                    </div>
                                ) : filteredOwners.length === 0 ? (
                                    <div className="p-10 text-center text-slate-500">No owner chats found.</div>
                                ) : (
                                    <TooltipProvider>
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-3">Owner</th>
                                                    <th className="px-4 py-3 text-center">WTS Reply</th>
                                                    <th className="px-4 py-3 text-center">Status</th>
                                                    <th className="px-4 py-3 text-center">Messages</th>
                                                    <th className="px-4 py-3 text-right">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {paginatedOwners.map((owner, idx) => {
                                                    const wtsReply = owner["WTS_Reply_Track"];
                                                    const hasReply = wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no";
                                                    let msgCount = 0;
                                                    if (owner["Whatsapp_1"]) msgCount++;
                                                    if (owner["retry_1"]) msgCount++;
                                                    for (let i = 1; i <= 5; i++) {
                                                        if (owner[`User_Replied_${i}`]) msgCount++;
                                                        if (owner[`Bot_Replied_${i}`]) msgCount++;
                                                    }
                                                    const wpDate = owner["Whatsapp_1_Date"];
                                                    return (
                                                        <tr key={owner.id || idx} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => {
                                                            setSelectedLeadId(null);
                                                            setSelectedOwner(owner);
                                                        }}>
                                                            <td className="px-4 py-3">
                                                                <div className="font-bold text-slate-900 group-hover:text-amber-700">{owner.Name || owner.name || "—"}</div>
                                                                <div className="text-xs text-slate-500">{owner.contactNo || owner.Phone || owner.phone || "—"}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {hasReply ? (
                                                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold">REPLIED</Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">SENT</Badge>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {owner["Whatsapp_1_status"] ? (
                                                                    <MessageStatusBadge index={1} status={owner["Whatsapp_1_status"]} />
                                                                ) : (
                                                                    <span className="text-slate-300 text-[10px]">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center font-bold text-slate-700">{msgCount}</td>
                                                            <td className="px-4 py-3 text-right text-slate-500 text-xs text-nowrap">
                                                                {wpDate ? new Date(wpDate).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : "—"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </TooltipProvider>
                                )}
                            </>
                        )}

                        {totalPages > 1 && (
                            <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between">
                                <div className="text-xs text-slate-500 font-medium">
                                    Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * leadsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * leadsPerPage, (activeTab === "leads" ? filteredLeads.length : filteredOwners.length))}</span> of <span className="text-slate-900 font-bold">{(activeTab === "leads" ? filteredLeads.length : filteredOwners.length)}</span> {activeTab}
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

            {/* Lead Chat Dialog */}
            <Dialog open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-6 gap-0">
                    <DialogHeader className="sr-only"><DialogTitle>WhatsApp Chat Detail</DialogTitle></DialogHeader>
                    {selectedLeadId && <WhatsAppChatDetail customerId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />}
                </DialogContent>
            </Dialog>

            {/* Owner Chat Dialog */}
            <Dialog open={!!selectedOwner} onOpenChange={(open) => !open && setSelectedOwner(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-6 gap-0">
                    <DialogHeader className="sr-only"><DialogTitle>Owner Chat Detail</DialogTitle></DialogHeader>
                    {selectedOwner && <OwnerChatDetail owner={selectedOwner} onClose={() => setSelectedOwner(null)} />}
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

    let sentCount = 0;
    for (let i = 1; i <= 12; i++) { if (lead[`W.P_${i}`] || lead.stage_data?.[`WhatsApp ${i}`]) sentCount++; }
    if (lead["W.P_FollowUp"] || lead.stage_data?.["WhatsApp FollowUp"]) sentCount++;
    for (let i = 1; i <= 10; i++) { if (lead[`W.P_FollowUp_${i}`]) sentCount++; }

    // Collect all available statuses
    const allStatuses = [];
    for (let i = 1; i <= 12; i++) {
        if (lead[`W.P_${i} TS`]) {
            allStatuses.push({ index: i, status: lead[`W.P_${i} TS`] });
        }
    }
    // Just show the last 2 to keep UI clean, in chronological order
    const displayStatuses = allStatuses.slice(-2);

    // Status now reads from WP_Replied_track (sourced from nr_wf / followup / nurture based on loop)
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

    return (
        <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={onClick}>
            <td className="px-4 py-3">
                <div className="block">
                    <div className="font-bold text-slate-900 group-hover:text-emerald-700">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.phone}</div>
                </div>
            </td>
            <td className="px-4 py-3 text-center">
                <Badge variant="outline" className="text-[10px] uppercase font-bold border-blue-100 text-blue-600 bg-blue-50">{lead.source_loop}</Badge>
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
    const parts = status.split(' - ');
    const statusText = parts[0].trim();
    // If there's no " - ", the entire status string might be the timestamp
    const rawTimestamp = parts.length > 1 ? parts[1].trim() : status.trim();

    const formatTooltipDate = (dateStr: string) => {
        const d = new Date(dateStr.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'));
        const finalDate = isNaN(d.getTime()) ? new Date(dateStr) : d;
        if (isNaN(finalDate.getTime())) return dateStr;
        const now = new Date();
        if (finalDate.toDateString() === now.toDateString()) return finalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return finalDate.toLocaleString([], { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
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

