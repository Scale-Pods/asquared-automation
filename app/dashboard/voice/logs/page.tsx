"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, ChevronLeft, ChevronRight, User, Download, Search, Info, Activity, Crown, FileSpreadsheet, Phone } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ASLoader } from "@/components/as-loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CallDetailsModal } from "@/components/voice/call-details-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { fetchCached } from "@/lib/use-cached-fetch";
import { format, subDays } from "date-fns";
import { formatDuration } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const DynamicRowCells = ({ call, telephonyCost }: { call: any, telephonyCost?: number }) => {
    const guestName = call.name || "Guest";
    const guestNum = call.phone || "Unknown";
    const realType = call.type || (call.isInbound ? "Inbound" : "Outbound");
    const isInboundState = call.isInbound;
    const voiceCallStatus = call.voiceCallStatus;
    const note = call.note;

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
                    {call.vapiAccount === 'secondary' && (
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                            <Phone className="h-2.5 w-2.5 text-indigo-500" />
                            <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">Secondary Leads</span>
                        </div>
                    )}
                    {call.vapiAccount === 'unknown' && (
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                            <Crown className="h-2.5 w-2.5 text-amber-500" />
                            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter">Unknown Leads</span>
                        </div>
                    )}
                    {call.vapiAccount === 'owners' && (
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                            <Crown className="h-2.5 w-2.5 text-blue-500" />
                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter">Owner Leads</span>
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
    const searchParams = useSearchParams();
    const router = useRouter();

    const [calls, setCalls] = useState<any[]>([]);
    const [totalCalls, setTotalCalls] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedCall, setSelectedCall] = useState<any>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [statusFilter, setStatusFilter] = useState("all");
    const [voiceStatusFilter, setVoiceStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [sortBy, setSortBy] = useState("newest");
    const [costModalOpen, setCostModalOpen] = useState(false);
    const [telephonyCosts, setTelephonyCosts] = useState<Record<string, number>>({});

    const [accountFilter, setAccountFilter] = useState("vapi");
    const [phoneFilter, setPhoneFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const sharedCallHandled = useRef(false);

    // Auto-open modal when ?call=<id> is in the URL
    useEffect(() => {
        const callId = searchParams.get("call");
        if (!callId || sharedCallHandled.current) return;
        sharedCallHandled.current = true;
        fetch(`/api/calls/${callId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setSelectedCall(data);
                    setModalOpen(true);
                    // Remove the query param without a full navigation
                    const url = new URL(window.location.href);
                    url.searchParams.delete("call");
                    router.replace(url.pathname + (url.search || ""), { scroll: false });
                }
            })
            .catch(() => {});
    }, [searchParams]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateRange?.from) params.set('from', dateRange.from.toISOString());
            if (dateRange?.to) params.set('to', dateRange.to.toISOString());
            if (accountFilter !== 'vapi') params.set('account', accountFilter);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (voiceStatusFilter !== 'all') params.set('voiceStatus', voiceStatusFilter);
            if (typeFilter !== 'all') params.set('type', typeFilter);
            if (phoneFilter) params.set('search', phoneFilter);
            if (sortBy !== 'newest') {
                params.set('sort', sortBy);
                params.set('order', sortBy === 'oldest' ? 'asc' : 'desc');
            }
            params.set('page', String(currentPage));
            params.set('pageSize', String(itemsPerPage));

            const data = await fetchCached(`/api/calls/logs?${params.toString()}`);
            const mappedCalls = (data.calls || []).map((c: any) => ({
                id: c.id,
                startedAt: c.startedAt,
                durationSeconds: c.durationSeconds || 0,
                costValue: c.costUsd || 0,
                cost: `$${Number(c.costUsd || 0).toFixed(3)}`,
                phone: c.customerPhone || 'Unknown',
                name: c.customerName || 'Guest',
                phoneNumber: '',
                status: c.status || 'answered',
                type: c.isInbound ? "Inbound" : "Outbound",
                isInbound: c.isInbound,
                country: c.country || 'Unknown',
                source: 'vapi',
                vapiAccount: c.vapiAccount || 'other',
                vapiStatus: c.vapiStatus || '',
                assistantId: c.assistantId || null,
                breakdown: { agent: c.costUsd || 0, telephony: 0, total: c.costUsd || 0 },
                displayDate: c.startedAt ? format(new Date(c.startedAt), 'PPp') : 'N/A',
                displayDuration: formatDuration(c.durationSeconds || 0),
                voiceCallStatus: c.voiceCallStatus || '',
                note: c.note || '',
                transcript: c.transcript || '',
                summary: c.summary || '',
                recordingUrl: c.recordingUrl || '',
            }));
            setCalls(mappedCalls);
            setTotalCalls(data.total || 0);
        } catch (err) {
            console.error("Failed to fetch call logs", err);
            setCalls([]);
            setTotalCalls(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!dateRange) return;
        setCurrentPage(1);
        fetchLogs();
    }, [dateRange, accountFilter, statusFilter, voiceStatusFilter, typeFilter, phoneFilter, sortBy]);

    useEffect(() => {
        if (dateRange) fetchLogs();
    }, [currentPage]);

    const handleRefresh = () => {
        fetchLogs();
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

    useEffect(() => {
        if (!calls || calls.length === 0) return;

        const callsToFetch = calls.filter(c => telephonyCosts[c.id] === undefined && c.source !== 'elevenlabs');
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
    }, [calls]);

    return (
        <div className="space-y-6 pb-10 relative min-h-[500px]">
            {/* Absolute Full-Screen Loader for Initial Load */}
            {loading && calls.length === 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-sm">
                    <ASLoader transparent />
                </div>
            )}
            
            {/* Subtle Overlay Loader for Background Refreshes (Filtering) */}
            {loading && calls.length > 0 && (
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
                            <SelectItem value="secondary">Secondary Leads</SelectItem>
                            <SelectItem value="unknown">Unknown Leads</SelectItem>
                            <SelectItem value="owners">Owner Leads</SelectItem>
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
                                (calls as any[]).map((call) => (
                                    <TableRow
                                        key={call.id}
                                        className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                                        onClick={() => { setSelectedCall(call); setModalOpen(true); }}
                                    >
                                        <DynamicRowCells call={call} telephonyCost={telephonyCosts[call.id]} />
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
                        Showing <span className="font-bold text-slate-900">{totalCalls > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, totalCalls)}</span> of {totalCalls} calls
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium px-3 py-1">Page {currentPage}</span>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCalls / itemsPerPage), p + 1))} disabled={currentPage >= Math.ceil(totalCalls / itemsPerPage)}>
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

