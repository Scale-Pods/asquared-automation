"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, ChevronLeft, ChevronRight, User, Download, Search, Info, Activity, Crown, Phone, FileSpreadsheet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ASLoader } from "@/components/as-loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import React, { useState, useEffect } from "react";
import { CallDetailsModal } from "@/components/voice/call-details-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format, subDays } from "date-fns";
import { formatDuration } from "@/lib/utils";
import { useData } from "@/context/DataContext";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const DynamicRowCells = ({ call, leads, telephonyCost }: { call: any, leads: any[], telephonyCost?: number }) => {
    let guestName = call.name || "Guest";
    const guestNum = call.phone || "Unknown";
    const realType = call.type || (call.isInbound ? "Inbound" : "Outbound");
    const isInboundState = call.isInbound;
    const voiceCallStatus = call.voiceCallStatus;
    const note = call.note;

    if ((!guestName || guestName === "Guest" || guestName === "Unknown") && call.phone && leads) {
        const targetPhone = call.phone.replace(/\D/g, '');
        if (targetPhone && targetPhone.length > 5) {
            const foundLead = leads.find((l: any) => l.phone && l.phone.replace(/\D/g, '') === targetPhone);
            if (foundLead && foundLead.name) guestName = foundLead.name;
        }
    }

    return (
        <>
            <TableCell className="font-semibold text-slate-900">
                <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {guestName}
                </div>
            </TableCell>
            <TableCell className="font-medium text-slate-800">{guestNum}</TableCell>
            <TableCell>
                <div className="flex flex-col gap-1">
                    <Badge 
                        variant="outline" 
                        className={`text-[10px] uppercase font-bold tracking-wider w-fit px-2 py-0.5 ${
                            isInboundState 
                                ? 'text-blue-600 border-blue-200' 
                                : 'text-indigo-600 border-indigo-200'
                        }`}
                    >
                        {realType}
                    </Badge>
                    {call.vapiAccount === 'owners' && (
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                            <Crown className="h-2.5 w-2.5 text-amber-500" />
                            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter">Owner Leads</span>
                        </div>
                    )}
                    {call.assistantId === '560ca61b-8cd3-4b5f-996b-2966abfa37fd' && (
                        <div className="text-[8px] font-bold text-purple-600 uppercase tracking-tight mt-0.5 px-1">
                            Secondary Reachout
                        </div>
                    )}

                </div>
            </TableCell>
            <TableCell className="text-slate-600 font-medium">{formatDuration(call.durationSeconds)}</TableCell>
            <TableCell className="text-slate-500 text-xs">{call.country || 'Unknown'}</TableCell>
            <TableCell className="font-bold text-emerald-600">
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="hover:underline flex items-center gap-1 cursor-help" onClick={(e) => e.stopPropagation()}>
                            {telephonyCost !== undefined && telephonyCost !== -1 
                                ? `$${((call.breakdown?.agent || 0) + telephonyCost).toFixed(3)}` 
                                : call.cost}
                            <Info className="h-3 w-3 text-slate-300" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-4 bg-white shadow-xl border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <Activity className="h-4 w-4 text-blue-600" />
                                <h4 className="font-bold text-sm text-slate-900">Cost Breakdown</h4>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] text-slate-500">
                                    <span>Agent (Vapi/AI):</span>
                                    <span className="font-mono text-slate-700">${(call.breakdown?.agent || 0).toFixed(3)}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                    <span>Telephony (Provider):</span>
                                    {telephonyCost === -1 ? (
                                        <span className="font-mono text-slate-400 italic">loading...</span>
                                    ) : (
                                        <span className="font-mono text-slate-700">${(telephonyCost !== undefined ? telephonyCost : (call.breakdown?.telephony || 0)).toFixed(3)}</span>
                                    )}
                                </div>
                            </div>
                            <div className="border-t pt-2 mt-2 flex justify-between text-xs font-bold text-slate-900">
                                <span>Total Estimated:</span>
                                <span className="text-emerald-600">
                                    {telephonyCost !== undefined && telephonyCost !== -1 
                                        ? `$${((call.breakdown?.agent || 0) + telephonyCost).toFixed(3)}` 
                                        : call.cost}
                                </span>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </TableCell>
            <TableCell>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge 
                                variant="outline" 
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border-slate-200 ${
                                    voiceCallStatus ? 'text-indigo-700 border-indigo-200' : 'text-slate-400'
                                }`}
                            >
                                {voiceCallStatus || "N/A"}
                            </Badge>

                        </TooltipTrigger>
                        {note && (
                            <TooltipContent className="bg-slate-900 text-white border-none p-3 max-w-[250px]">
                                <p className="text-xs">{note}</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            </TableCell>
        </>
    );
};

export default function VoiceLogsPage() {
    const { calls: globalCalls, loadingCalls, refreshCalls, leads, loadingLeads } = useData();
    const [allCallsMapped, setAllCallsMapped] = useState<any[]>([]);
    const [calls, setCalls] = useState<any[]>([]);
    const loading = loadingCalls;
    const [selectedCall, setSelectedCall] = useState<any>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [dateRange, setDateRange] = useState<any>(undefined);
    const [statusFilter, setStatusFilter] = useState("all");
    const [voiceStatusFilter, setVoiceStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [sortBy, setSortBy] = useState("newest");
    const [costModalOpen, setCostModalOpen] = useState(false);
    const [telephonyCosts, setTelephonyCosts] = useState<Record<string, number>>({});

    const [accountFilter, setAccountFilter] = useState("vapi");
    const [phoneFilter, setPhoneFilter] = useState("");
    
    useEffect(() => {
        setDateRange({
            from: subDays(new Date(), 7),
            to: new Date(),
        });
    }, []);

    // Server-side refresh when filters change
    useEffect(() => {
        if (!refreshCalls) return;
        const isDefaultRange = !dateRange;
        refreshCalls({
            from: isDefaultRange ? undefined : dateRange?.from,
            to: isDefaultRange ? undefined : (dateRange?.to || dateRange?.from),
            provider: 'vapi'
        });
    }, [dateRange, accountFilter, refreshCalls]);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        if (loadingLeads || !globalCalls) return;

        const mappedCalls = globalCalls.map((c: any) => {
            let resolvedName = c.name;
            let voiceCallStatus = "";
            let note = "";

            if (c.phone && leads) {
                const targetPhone = c.phone.replace(/\D/g, '');
                if (targetPhone && targetPhone.length > 5) {
                    const foundLead = leads.find((l: any) => l.phone && l.phone.replace(/\D/g, '') === targetPhone);
                    if (foundLead) {
                        if (!resolvedName || resolvedName === "Guest" || resolvedName === "Unknown") {
                            resolvedName = foundLead.name;
                        }
                        voiceCallStatus = foundLead.voice_call_status;
                        note = foundLead.note;
                    }
                }
            }
            const UAE_BOT_ID = '70f05e16-18f3-4f6e-964a-f47b299c6c1d';
            const UAE_BUSINESS_NUMBER = '+97148714150';
            let resolvedType = c.type || (c.isInbound ? "Inbound" : "Outbound");
            
            // If the call is from the UAE bot or the UAE business number to a customer, it's Outbound.
            if (resolvedType === "Inbound") {
                const isFromUAEBot = c.assistantId === UAE_BOT_ID;
                const isFromUAENumber = c.fromNumber === UAE_BUSINESS_NUMBER || c.phoneNumber === UAE_BUSINESS_NUMBER;
                
                if ((isFromUAEBot || isFromUAENumber) && c.phone) {
                    resolvedType = "Outbound";
                }
            }

            return {
                ...c,
                name: resolvedName,
                type: resolvedType,
                displayDate: c.startedAt ? format(new Date(c.startedAt), 'PPp') : 'N/A',
                displayDuration: formatDuration(c.durationSeconds || 0),
                voiceCallStatus,
                note
            };
        });

        setAllCallsMapped(mappedCalls);
    }, [globalCalls, leads, loadingLeads]);



    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, statusFilter, voiceStatusFilter, typeFilter, accountFilter, phoneFilter, sortBy]);

    useEffect(() => {
        const filteredCalls = allCallsMapped.filter((call: any) => {
            // 1. Account / provider filter (must pass first)
            if (accountFilter === 'vapi' && call.source !== 'vapi') return false;
            if (accountFilter === 'vapi-normal' && (call.source !== 'vapi' || call.vapiAccount !== 'normal')) return false;
            if (accountFilter === 'vapi-owners' && (call.source !== 'vapi' || call.vapiAccount !== 'owners')) return false;

            // 2. Status filter (Vapi) - Removed UI dropdown, but keeping logic for safety
            if (statusFilter !== "all" && call.status !== statusFilter) return false;

            // 2b. Voice Status filter (Lead)
            if (voiceStatusFilter !== "all") {
                const target = String(call.voiceCallStatus || "").toLowerCase();
                const filter = voiceStatusFilter.toLowerCase();
                
                if (filter === "did not answer") {
                    // Match all variations of no answer
                    if (target !== "no answer" && target !== "did_not_answer" && target !== "no_answer") return false;
                } else if (target !== filter) {

                    return false;
                }
            }


            // 3. Type filter
            if (typeFilter !== "all") {
                const normalizedCallType = (call.type || (call.isInbound ? "Inbound" : "Outbound")).toLowerCase();
                const isSecondaryLeads = call.assistantId === '560ca61b-8cd3-4b5f-996b-2966abfa37fd';

                if (typeFilter === "secondary-leads") {
                    if (!isSecondaryLeads) return false;
                } else if (typeFilter === "normal") {
                    if (isSecondaryLeads) return false;
                } else if (normalizedCallType !== typeFilter.toLowerCase()) {
                    return false;
                }
            }

            // 4. Phone / name search
            if (phoneFilter) {
                const searchStr = phoneFilter.toLowerCase().trim();
                const phoneSearch = searchStr.replace(/\D/g, '');
                const phoneTarget = (call.phone || "").replace(/\D/g, '');
                const matchesPhone = phoneSearch && phoneTarget.includes(phoneSearch);
                const matchesName = (call.name || "Guest").toLowerCase().includes(searchStr);
                if (!matchesPhone && !matchesName) return false;
            }

            return true;
        });

        const sortedCalls = [...filteredCalls].sort((a, b) => {
            if (sortBy === "longest") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
            if (sortBy === "shortest") return (a.durationSeconds || 0) - (b.durationSeconds || 0);
            if (sortBy === "oldest") {
                return (a.startedAt ? new Date(a.startedAt).getTime() : 0) - (b.startedAt ? new Date(b.startedAt).getTime() : 0);
            }
            return (b.startedAt ? new Date(b.startedAt).getTime() : 0) - (a.startedAt ? new Date(a.startedAt).getTime() : 0);
        });

        setCalls(sortedCalls);
    }, [allCallsMapped, dateRange, statusFilter, voiceStatusFilter, typeFilter, accountFilter, phoneFilter, sortBy]);

    const handleRefresh = () => {
        refreshCalls({
            from: dateRange?.from,
            to: dateRange?.to || dateRange?.from,
            provider: 'vapi',
            force: true
        });
    };

    const handleDownloadExcel = () => {
        if (!calls || calls.length === 0) return;

        // CSV Header
        const headers = ["Name", "Guest Number", "Type", "Duration", "Country", "Cost", "Voice Status", "Status", "Date & Time", "Notes"];
        
        // CSV Rows
        const rows = calls.map(c => [
            `"${(c.name || "Guest").replace(/"/g, '""')}"`,
            `"${(c.phone || "Unknown").replace(/"/g, '""')}"`,
            `"${(c.type || (c.isInbound ? "Inbound" : "Outbound")).replace(/"/g, '""')}"`,
            `"${formatDuration(c.durationSeconds || 0)}"`,
            `"${(c.country || "Unknown").replace(/"/g, '""')}"`,
            `"${(c.cost || "$0.00").replace(/"/g, '""')}"`,
            `"${(c.voiceCallStatus || "N/A").replace(/"/g, '""')}"`,
            `"${(c.status || "Unknown").replace(/"/g, '""')}"`,
            `"${(c.displayDate || "N/A").replace(/"/g, '""')}"`,
            `"${(c.note || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `voice_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const paginatedCalls = calls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    useEffect(() => {
        if (!paginatedCalls || paginatedCalls.length === 0) return;

        const callsToFetch = paginatedCalls.filter(c => telephonyCosts[c.id] === undefined && c.source !== 'elevenlabs');
        if (callsToFetch.length === 0) return;

        setTelephonyCosts(prev => {
            const fetching = { ...prev };
            callsToFetch.forEach(c => fetching[c.id] = -1);
            return fetching;
        });

        fetch('/api/calls/telephony-cost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calls: callsToFetch.map(c => ({
                    id: c.id,
                    phoneNumber: c.phoneNumber,
                    phone: c.phone,
                    durationSeconds: c.durationSeconds,
                    isInbound: c.isInbound,
                    startedAt: c.startedAt
                }))
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.costs) {
                setTelephonyCosts(prev => ({ ...prev, ...data.costs }));
            }
        })
        .catch(err => console.error("Error fetching telephony costs", err));
    }, [paginatedCalls]);

    return (
        <div className="space-y-6 pb-10 relative min-h-[500px]">
            {/* Absolute Full-Screen Loader for Initial Load */}
            {loading && allCallsMapped.length === 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-sm">
                    <ASLoader transparent />
                </div>
            )}
            
            {/* Subtle Overlay Loader for Background Refreshes (Filtering) */}
            {loading && allCallsMapped.length > 0 && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-transparent backdrop-blur-[1px] pointer-events-none">
                    <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-3">
                        <ASLoader transparent />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Updating Logs...</span>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Call Logs</h1>
                        <p className="text-slate-500">Comprehensive history across all accounts and providers.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        
                        <DateRangePicker onUpdate={(values) => setDateRange(values.range)} />
                        <Button 
                            variant="outline" 
                            className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                            onClick={handleDownloadExcel}
                            disabled={loading || calls.length === 0}
                        >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Download Excel
                        </Button>
                        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="relative w-[220px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search name or phone..."
                            className="pl-9 h-9"
                            value={phoneFilter}
                            onChange={(e) => setPhoneFilter(e.target.value)}
                        />
                    </div>

                    <Select value={accountFilter} onValueChange={setAccountFilter}>
                        <SelectTrigger className="w-[200px] h-9">
                            <SelectValue placeholder="Account / Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="vapi">All Vapi Calls</SelectItem>
                            <SelectItem value="vapi-owners">Owner Leads</SelectItem>
                            <SelectItem value="vapi-normal">Normal Calls</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Call Type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="Inbound">Inbound</SelectItem>
                            <SelectItem value="Outbound">Outbound</SelectItem>
                        </SelectContent>
                    </Select>



                    <Select value={voiceStatusFilter} onValueChange={setVoiceStatusFilter}>
                        <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Voice Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Voice Status</SelectItem>
                            <SelectItem value="did not answer">Did Not Answer</SelectItem>
                            <SelectItem value="Contacted">Contacted</SelectItem>

                            <SelectItem value="Awaiting availability">Awaiting availability</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Sort By" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                            <SelectItem value="longest">Longest Duration</SelectItem>
                            <SelectItem value="shortest">Shortest Duration</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card className="border-slate-200 overflow-hidden shadow-sm bg-white">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                <TableHead className="w-[150px]">Name</TableHead>
                                <TableHead>Guest Number</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Country</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Voice Status</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[200px]">Date &amp; Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calls.length === 0 && !loading ? (
                                <TableRow><TableCell colSpan={9} className="h-24 text-center text-slate-500 font-medium">No calls matching filters.</TableCell></TableRow>
                            ) : (
                                (paginatedCalls as any[]).map((call) => (
                                    <TableRow
                                        key={call.id}
                                        className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                                        onClick={() => { setSelectedCall(call); setModalOpen(true); }}
                                    >
                                        <DynamicRowCells call={call} leads={leads} telephonyCost={telephonyCosts[call.id]} />
                                        <TableCell>
                                            <Badge 
                                                variant="outline" 
                                                className={`text-[10px] uppercase ${
                                                    call.status === 'answered' ? 'border-emerald-200 text-emerald-600' : 
                                                    call.status === 'no-answer' ? 'border-amber-200 text-amber-600' :
                                                    call.status === 'busy' ? 'border-orange-200 text-orange-600' :
                                                    call.status === 'failed' ? 'border-rose-200 text-rose-600' :
                                                    'border-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {call.status}
                                            </Badge>

                                        </TableCell>
                                        <TableCell className="text-slate-500 text-xs">{call.displayDate}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Showing <span className="font-bold text-slate-900">{calls.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, calls.length)}</span> of {calls.length} calls
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium px-3 py-1">Page {currentPage}</span>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.min(Math.ceil(calls.length / itemsPerPage), p + 1))} disabled={currentPage >= Math.ceil(calls.length / itemsPerPage)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </Card>

            <CallDetailsModal open={modalOpen} onOpenChange={setModalOpen} call={selectedCall} />

            {/* Cost Info Modal */}
            <Dialog open={costModalOpen} onOpenChange={setCostModalOpen}>
                <DialogContent className="sm:max-w-[500px] bg-white border-slate-200 shadow-xl overflow-hidden p-0">
                    <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                                <Info className="h-5 w-5" />
                            </div>
                            How Costing is Calculated
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Understanding our automated billing and rate matching logic.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            {[
                                { n: 1, title: "Normalization", desc: "System cleans phone numbers by removing all symbols and spaces, ensuring consistent lookup against our global rate database." },
                                { n: 2, title: "Longest-Prefix Matching", desc: "We use high-precision matching. If a number matches multiple regions (e.g. UAE General vs Dubai Fixed), we prioritize the most specific prefix for maximum accuracy." },
                                { n: 3, title: "Per-Minute Computation", desc: "Duration is tracked in seconds and converted to minutes. For outbound calls, the matched rate is applied. Inbound calls are always computed at $0.02." },
                            ].map(({ n, title, desc }) => (
                                <div key={n} className="flex gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm">{n}</div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm mb-1">{title}</h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
                        <a href="/billing-plan.pdf" download className="w-full">
                            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200">
                                <Download className="h-4 w-4 mr-2" />
                                Download Billing Plan PDF
                            </Button>
                        </a>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

