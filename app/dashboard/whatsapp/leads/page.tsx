"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    RefreshCw,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { subDays, startOfDay, endOfDay } from "date-fns";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConsolidatedLead } from "@/lib/leads-utils";
import { WhatsAppChatDetail } from "@/components/dashboard/whatsapp-chat-detail";
import { ASLoader } from "@/components/as-loader";

export default function WhatsappLeadsPage() {
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedLeadIdForChat, setSelectedLeadIdForChat] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const leadsPerPage = 10;

    // Stable ISO string dates — avoids Object reference inequality re-firing effects
    const [dateFrom, setDateFrom] = useState(() => startOfDay(subDays(new Date(), 7)).toISOString());
    const [dateTo, setDateTo] = useState(() => endOfDay(new Date()).toISOString());

    // Table filter — 'all' shows every table; any other value is a specific source table key
    const [tableFilter, setTableFilter] = useState<string>('all');

    const TABLE_OPTIONS = [
        { key: 'all',            label: 'All' },
        { key: 'intro',          label: 'Intro' },
        { key: 'intro_uk',       label: 'Intro UK' },
        { key: 'follow_up',      label: 'Follow Up' },
        { key: 'follow_up_uk',   label: 'Follow Up UK' },
        { key: 'leads',          label: 'Leads' },
        { key: 'nurture_leads',  label: 'Nurture' },
        { key: 'nurture_leads_uk', label: 'Nurture UK' },
    ];

    const [activeFilters, setActiveFilters] = useState<{
        replyStatus: string[],
        loops: string[]
    }>({
        replyStatus: [],
        loops: []
    });

    const replyStatusToApi = (statuses: string[]): string => {
        if (statuses.includes("Replied") && statuses.includes("Sent")) return 'all';
        if (statuses.includes("Replied")) return 'replied';
        if (statuses.includes("Sent")) return 'sent';
        return 'all';
    };

    const loopsToApi = (loops: string[]): string => {
        if (loops.length !== 1) return 'all';
        if (loops.includes("Intro")) return 'intro';
        if (loops.includes("followup")) return 'follow_up';
        if (loops.includes("nurture")) return 'nurture';
        return 'all';
    };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);

        const q = new URLSearchParams();
        if (dateFrom) q.set('from', dateFrom);
        if (dateTo) q.set('to', dateTo);
        if (searchQuery) q.set('search', searchQuery);
        q.set('replyStatus', replyStatusToApi(activeFilters.replyStatus));
        q.set('loop', loopsToApi(activeFilters.loops));
        if (tableFilter !== 'all') q.set('table', tableFilter);
        q.set('page', String(currentPage));
        q.set('pageSize', String(leadsPerPage));

        fetch(`/api/whatsapp/leads?${q}`, { signal: controller.signal })
            .then(r => r.json())
            .then(data => {
                setLeads(data.leads || []);
                setTotal(data.total || 0);
            })
            .catch(e => {
                if (e.name !== 'AbortError') {
                    setLeads([]);
                    setTotal(0);
                }
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        dateFrom,
        dateTo,
        searchQuery,
        activeFilters.replyStatus.join(','),
        activeFilters.loops.join(','),
        tableFilter,
        currentPage
    ]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const toggleFilter = (type: 'replyStatus' | 'loops', value: string) => {
        setActiveFilters(prev => {
            const current = prev[type];
            if (current.includes(value)) {
                return { ...prev, [type]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [type]: [...current, value] };
            }
        });
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setActiveFilters({ replyStatus: [], loops: [] });
        setTableFilter('all');
        setDateFrom(startOfDay(subDays(new Date(), 7)).toISOString());
        setDateTo(endOfDay(new Date()).toISOString());
        setSearchQuery("");
        setCurrentPage(1);
    };

    const toggleSelectAll = () => {
        if (selectedLeads.length === leads.length) {
            setSelectedLeads([]);
        } else {
            setSelectedLeads(leads.map(l => l.id));
        }
    };

    const toggleSelect = (id: string) => {
        if (selectedLeads.includes(id)) {
            setSelectedLeads(selectedLeads.filter(l => l !== id));
        } else {
            setSelectedLeads([...selectedLeads, id]);
        }
    };

    const totalPages = Math.ceil(total / leadsPerPage);

    if (loading && leads.length === 0) {
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
                    {(activeFilters.replyStatus.length > 0 || activeFilters.loops.length > 0 || searchQuery || tableFilter !== 'all') && (
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
                        setDateFrom(range?.from ? startOfDay(range.from).toISOString() : '');
                        setDateTo(range?.to ? endOfDay(range.to).toISOString() : '');
                        setCurrentPage(1);
                    }} />
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="space-y-3">
                {/* Table filter pills — server-side, no heavy logic */}
                <div className="flex flex-wrap gap-2">
                    {TABLE_OPTIONS.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => { setTableFilter(opt.key); setCurrentPage(1); }}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                tableFilter === opt.key
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Search + status/reply filters */}
                <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            className="pl-10 h-10 bg-slate-50/50 border-slate-200"
                            placeholder="Search leads..."
                            value={searchQuery}
                            onChange={handleSearchChange}
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

                        <Button variant="outline" className="gap-2 h-10 border-slate-200" onClick={() => window.location.reload()}>
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </Button>
                    </div>
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
                                            checked={selectedLeads.length === leads.length && leads.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-4">Name</th>
                                    <th className="px-4 py-4">Phone</th>
                                    <th className="px-4 py-4">Loop</th>
                                    <th className="px-4 py-4 text-center">Reply Status</th>
                                    <th className="px-4 py-4">Last Contacted</th>
                                    <th className="px-4 py-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-500" />
                                            Syncing with Supabase...
                                        </td>
                                    </tr>
                                ) : leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-20 text-center text-slate-400">
                                            No leads with contact history found.
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead, index) => (
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
                                                {(lead as any).last_contacted ? new Date((lead as any).last_contacted).toLocaleString() : "—"}
                                            </td>
                                            <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-sm text-slate-500">
                            Showing <span className="font-bold text-slate-900">{leads.length}</span> of <span className="font-bold text-slate-900">{total}</span> contacted leads
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
    const hasReplied = !!(wtR && wtR !== "" && String(wtR).toLowerCase() !== "no");

    const classes = !hasReplied ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700";
    const label = !hasReplied ? "SENT" : "REPLIED";

    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${classes}`}>
            {label}
        </span>
    );
}
