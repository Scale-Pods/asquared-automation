"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    Filter,
    Download,
    UserPlus,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    FileSpreadsheet,
    ArrowUpDown,
    Calendar,
    Briefcase,
    RefreshCw,
    Building2,
    Users
} from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { subDays, startOfDay, endOfDay } from "date-fns";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { consolidateLeads, ConsolidatedLead } from "@/lib/leads-utils";
import { WhatsAppChatDetail } from "@/components/dashboard/whatsapp-chat-detail";
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

export default function WhatsappLeadsPage() {
    const { leads: allLeads, loadingLeads, refreshLeads } = useData();
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const loading = loadingLeads;
    const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedLeadIdForChat, setSelectedLeadIdForChat] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const leadsPerPage = 10;
    const [activeTab, setActiveTab] = useState<"leads" | "owners">("leads");
    const [ownerLeads, setOwnerLeads] = useState<any[]>([]);
    const [loadingOwners, setLoadingOwners] = useState(false);

    // Filter State
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });

    const [activeFilters, setActiveFilters] = useState<{
        replyStatus: string[],
        loops: string[]
    }>({
        replyStatus: [],
        loops: []
    });

    useEffect(() => {
        if (!loadingLeads) {
            const whatsappLeads = allLeads.filter(l => {
                const lead = l as any;
                const wp1 = lead["W.P_1"];
                return (wp1 && wp1 !== "" && wp1 !== "No");
            });
            setLeads(whatsappLeads);
        }
    }, [allLeads, loadingLeads]);

    useEffect(() => {
        if (activeTab === "owners") {
            setLoadingOwners(true);
            const q = new URLSearchParams({
                from: startOfDay(dateRange.from).toISOString(),
                to: endOfDay(dateRange.to).toISOString()
            });
            fetch(`/api/owner-leads?${q}`)
                .then(res => res.json())
                .then(data => setOwnerLeads(data.owner_data || []))
                .catch(err => console.error("Owner fetch error:", err))
                .finally(() => setLoadingOwners(false));
        }
    }, [activeTab, dateRange?.from, dateRange?.to]);

    const filteredLeads = useMemo(() => {
        setCurrentPage(1); // Reset to first page on filter change
        return leads.filter(l => {
            // Search filter
            const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                l.phone.includes(searchQuery);

            if (!matchesSearch) return false;

            // Date range filter using W.P_1 TS specifically
            const parseWPStamp = (tsRaw: any): Date | null => {
                if (!tsRaw || !tsRaw.includes(' - ')) return null;
                const parts = tsRaw.split(' - ');
                const datePart = parts[parts.length - 1].trim(); 
                const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (!match) return null;
                // DD/MM/YYYY
                const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                return isNaN(d.getTime()) ? null : d;
            };

            if (dateRange.from) {
                const wp1 = (l as any)["W.P_1"];
                const wp1Ts = (l as any)["W.P_1 TS"];
                
                // Priority: parse date from content, fallback to W.P_1 TS
                let reachoutDate = parseMsg(wp1).date;
                if (!reachoutDate && wp1Ts && wp1Ts.includes(' - ')) {
                    const parts = wp1Ts.split(' - ');
                    const datePart = parts[parts.length - 1].trim();
                    const match = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    if (match) {
                        reachoutDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    }
                }
                
                if (!reachoutDate) return false; 

                const fromDate = startOfDay(new Date(dateRange.from));
                const toDate = dateRange.to ? endOfDay(new Date(dateRange.to)) : endOfDay(new Date(fromDate));

                if (reachoutDate < fromDate || reachoutDate > toDate) return false;
            }

            // Reply status filter
            const wtR = (l as any).WP_Replied_track;
            let hasReplied = false;
            if (wtR && wtR !== "" && String(wtR).toLowerCase() !== "no") {
                const parsed = parseMsg(wtR);
                if (parsed.date || String(wtR).toLowerCase() === "yes" || String(wtR).toLowerCase() === "replied") {
                    hasReplied = true;
                }
            }
            
            if (activeFilters.replyStatus.length > 0) {
                const matchesReply = (activeFilters.replyStatus.includes("Replied") && hasReplied) ||
                    (activeFilters.replyStatus.includes("Sent") && !hasReplied);
                if (!matchesReply) return false;
            }

            // Loop filter
            if (activeFilters.loops.length > 0) {
                if (!activeFilters.loops.includes(l.source_loop)) return false;
            }

            return true;
        });
    }, [leads, searchQuery, dateRange, activeFilters]);

    const toggleFilter = (type: 'replyStatus' | 'loops', value: string) => {
        setActiveFilters(prev => {
            const current = prev[type];
            if (current.includes(value)) {
                return { ...prev, [type]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [type]: [...current, value] };
            }
        });
    };

    const resetFilters = () => {
        setActiveFilters({ replyStatus: [], loops: [] });
        setDateRange({ from: undefined, to: undefined });
        setSearchQuery("");
    };

    const toggleSelectAll = () => {
        if (selectedLeads.length === filteredLeads.length) {
            setSelectedLeads([]);
        } else {
            setSelectedLeads(filteredLeads.map(l => l.id));
        }
    };

    const toggleSelect = (id: string) => {
        if (selectedLeads.includes(id)) {
            setSelectedLeads(selectedLeads.filter(l => l !== id));
        } else {
            setSelectedLeads([...selectedLeads, id]);
        }
    };

    const filteredOwners = useMemo(() => {
        return ownerLeads.filter(o => {
            const name = (o.Name || o.name || "").toLowerCase();
            const email = (o.Email || o.email || "").toLowerCase();
            const phone = (o.contactNo || o.Phone || o.phone || "");
            const matchesSearch = name.includes(searchQuery.toLowerCase()) || 
                                email.includes(searchQuery.toLowerCase()) ||
                                phone.includes(searchQuery);
            if (!matchesSearch) return false;

            const wtR = o["WTS_Reply_Track"];
            let hasReplied = false;
            if (wtR && wtR !== "" && String(wtR).toLowerCase() !== "no") {
                hasReplied = true;
            }
            if (activeFilters.replyStatus.length > 0) {
                const matchesReply = (activeFilters.replyStatus.includes("Replied") && hasReplied) ||
                    (activeFilters.replyStatus.includes("Sent") && !hasReplied);
                if (!matchesReply) return false;
            }

            return true;
        });
    }, [ownerLeads, searchQuery, activeFilters]);

    // Pagination Logic
    const totalPages = activeTab === "leads" 
        ? Math.ceil(filteredLeads.length / leadsPerPage) 
        : Math.ceil(filteredOwners.length / leadsPerPage);

    const paginatedLeads = filteredLeads.slice(
        (currentPage - 1) * leadsPerPage,
        currentPage * leadsPerPage
    );

    const paginatedOwners = filteredOwners.slice(
        (currentPage - 1) * leadsPerPage,
        currentPage * leadsPerPage
    );

    if (loading) {
        return <ASLoader />;
    }

    return (
        <div className="space-y-6 pb-10 relative min-h-[500px]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">WhatsApp Leads</h1>
                    <p className="text-slate-500 text-sm">Review leads successfully contacted via WhatsApp</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Tab Switcher */}
                    <div className="flex bg-slate-100 rounded-lg p-0.5 mr-2">
                        <button
                            onClick={() => { setActiveTab("leads"); setCurrentPage(1); }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "leads" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <Users className="h-3.5 w-3.5" /> Leads
                        </button>
                        <button
                            onClick={() => { setActiveTab("owners"); setCurrentPage(1); }}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "owners" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            <Building2 className="h-3.5 w-3.5" /> Owners
                        </button>
                    </div>

                    {(activeFilters.replyStatus.length > 0 || activeFilters.loops.length > 0 || dateRange.from || searchQuery) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetFilters}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2"
                        >
                            RESET FILTERS
                        </Button>
                    )}
                    <DateRangePicker onUpdate={({ range }) => {
                        setDateRange({ from: range?.from, to: range?.to });
                        if (range?.from) {
                            refreshLeads({ from: range.from, to: range.to, type: 'whatsapp' });
                        }
                    }} />
                </div>
            </div>

            {/* Search & Simple Filter Bar */}
            <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        className="pl-10 h-10 bg-slate-50/50 border-slate-200"
                        placeholder={`Search ${activeTab}...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className={`gap-2 h-10 border-slate-200 ${activeFilters.replyStatus.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}>
                                <Filter className="h-4 w-4" />
                                {activeFilters.replyStatus.length > 0 ? `Status (${activeFilters.replyStatus.length})` : 'Status'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => toggleFilter('replyStatus', 'Replied')} className="flex items-center justify-between">
                                Replied {activeFilters.replyStatus.includes('Replied') && "✓"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleFilter('replyStatus', 'Sent')} className="flex items-center justify-between">
                                Sent {activeFilters.replyStatus.includes('Sent') && "✓"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className={`gap-2 h-10 border-slate-200 ${activeFilters.loops.length > 0 ? 'bg-purple-50 border-purple-200 text-purple-700' : ''}`}>
                                <Briefcase className="h-4 w-4" />
                                {activeFilters.loops.length > 0 ? `Loops (${activeFilters.loops.length})` : 'Loops'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => toggleFilter('loops', 'Intro')} className="flex items-center justify-between">
                                Intro {activeFilters.loops.includes('Intro') && "✓"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleFilter('loops', 'followup')} className="flex items-center justify-between">
                                Follow Up {activeFilters.loops.includes('followup') && "✓"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleFilter('loops', 'nurture')} className="flex items-center justify-between">
                                Nurture {activeFilters.loops.includes('nurture') && "✓"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="outline" className="gap-2 h-10 border-slate-200" onClick={() => window.location.reload()}>
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                </div>
            </div>

            {/* Bulk Action Context Header */}
            {selectedLeads.length > 0 && (
                <div className="bg-white border border-emerald-100 p-3 rounded-lg flex items-center justify-between shadow-sm">
                    <span className="text-sm font-bold text-slate-700">{selectedLeads.length} leads selected</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 border-slate-200 text-slate-600 hover:text-slate-900">Send Message</Button>
                        <Button size="sm" variant="outline" className="h-8 border-slate-200 text-slate-600 hover:text-slate-900">Export Selected</Button>
                        <Button size="sm" variant="destructive" className="h-8">Remove</Button>
                    </div>
                </div>
            )}

            {/* Leads Table */}
            <Card className="border-slate-200 overflow-hidden shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase border-b border-slate-200">
                                    <th className="px-4 py-4 w-[40px]">
                                        <Checkbox
                                            checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-4">{activeTab === "leads" ? "Name" : "Owner"}</th>
                                    <th className="px-4 py-4">Phone</th>
                                    <th className="px-4 py-4">{activeTab === "leads" ? "Loop" : "Source"}</th>
                                    <th className="px-4 py-4 text-center">Reply Status</th>
                                    <th className="px-4 py-4">{activeTab === "leads" ? "Last Contacted" : "Whatsapp Date"}</th>
                                    <th className="px-4 py-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeTab === "leads" ? (
                                    loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-500" />
                                                Syncing with Supabase...
                                            </td>
                                        </tr>
                                    ) : filteredLeads.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                                No leads with contact history found.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedLeads.map((lead, index) => (
                                            <tr
                                                key={`${lead.id}-${index}`}
                                                className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedLeadIdForChat(lead.id)}
                                            >
                                                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        checked={selectedLeads.includes(lead.id)}
                                                        onCheckedChange={() => toggleSelect(lead.id)}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 font-bold text-slate-900">{lead.name}</td>
                                                <td className="px-4 py-4 text-slate-600 font-mono text-xs">{lead.phone}</td>
                                                <td className="px-4 py-4">
                                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-100 text-[10px] uppercase font-bold">
                                                        {lead.source_loop}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <StatusBadge lead={lead} />
                                                </td>
                                                <td className="px-4 py-4 text-slate-500 text-xs">
                                                    {new Date(lead.last_contacted!).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )
                                ) : (
                                    loadingOwners ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                                                Loading owner leads...
                                            </td>
                                        </tr>
                                    ) : filteredOwners.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                                No owner leads found.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedOwners.map((owner, index) => {
                                            const wtsReply = owner["WTS_Reply_Track"];
                                            const hasReplied = wtsReply && wtsReply !== "" && String(wtsReply).toLowerCase() !== "no";
                                            return (
                                                <tr
                                                    key={owner.id || index}
                                                    className="hover:bg-amber-50/30 transition-colors group cursor-pointer"
                                                >
                                                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox />
                                                    </td>
                                                    <td className="px-4 py-4 font-bold text-slate-900 group-hover:text-amber-700">{owner.Name || owner.name || "—"}</td>
                                                    <td className="px-4 py-4 text-slate-600 font-mono text-xs">{owner.contactNo || owner.Phone || owner.phone || "—"}</td>
                                                    <td className="px-4 py-4">
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] uppercase font-bold">
                                                            OWNER DATA
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {hasReplied ? (
                                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold">REPLIED</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">SENT</Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-500 text-xs">
                                                        {owner["Whatsapp_1_Date"] ? new Date(owner["Whatsapp_1_Date"]).toLocaleString() : "—"}
                                                    </td>
                                                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )
                                )}




                            </tbody>
                        </table>
                    </div>
                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-sm text-slate-500">
                            Showing <span className="font-bold text-slate-900">
                                {activeTab === "leads" ? paginatedLeads.length : paginatedOwners.length}
                            </span> of <span className="font-bold text-slate-900">
                                {activeTab === "leads" ? filteredLeads.length : filteredOwners.length}
                            </span> contacted {activeTab}
                        </p>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            <div className="flex items-center gap-1 mx-2">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalPages <= 5) pageNum = i + 1;
                                    else if (currentPage <= 3) pageNum = i + 1;
                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                    else pageNum = currentPage - 2 + i;

                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`h-8 w-8 p-0 ${currentPage === pageNum ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                                        >
                                            {pageNum}
                                        </Button>
                                    );
                                })}
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages || totalPages === 0}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Chat Detail Modal */}
            <Dialog open={!!selectedLeadIdForChat} onOpenChange={(open) => !open && setSelectedLeadIdForChat(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-6 gap-0">
                    <DialogHeader className="sr-only">
                        <DialogTitle>WhatsApp Chat Detail</DialogTitle>
                    </DialogHeader>
                    {selectedLeadIdForChat && (
                        <WhatsAppChatDetail
                            customerId={selectedLeadIdForChat}
                            onClose={() => setSelectedLeadIdForChat(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function StatusBadge({ lead: leadRaw }: { lead: any }) {
    const lead = leadRaw as any;
    const wtR = lead.WP_Replied_track;
    let hasReplied = false;
    if (wtR && wtR !== "" && String(wtR).toLowerCase() !== "no") {
        const parsed = parseMsg(wtR);
        if (parsed.date || String(wtR).toLowerCase() === "yes" || String(wtR).toLowerCase() === "replied") {
            hasReplied = true;
        }
    }

    const classes = !hasReplied ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700";
    const label = !hasReplied ? "SENT" : "REPLIED";

    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${classes}`}>
            {label}
        </span>
    );
}

