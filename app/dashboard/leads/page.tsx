"use client";

import { useEffect, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertCircle, Loader2, RefreshCw, Mail, MessageCircle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASLoader } from "@/components/as-loader";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { subDays, startOfDay } from "date-fns";
import { fetchCached } from "@/lib/use-cached-fetch";

interface Lead {
    id?: string;
    name: string;
    phone: string;
    email: string;
    replied: string;
    current_loop: string;
    lead_id?: string;
    source_loop?: string;
    status?: string;
    lead_status?: string;
    lead_type?: string;
    sentiment?: string;
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<any[]>([]);
    const [totalLeads, setTotalLeads] = useState(0);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [view, setView] = useState<"leads" | "templates">("leads");
    const [templateFilter, setTemplateFilter] = useState<"email" | "whatsapp">("email");
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [searchQuery, setSearchQuery] = useState("");
    const [loopFilter, setLoopFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [regionFilter, setRegionFilter] = useState("all");
    const [channelFilter, setChannelFilter] = useState("all");
    const [activeTab, setActiveTab] = useState("normal");

    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: startOfDay(subDays(new Date(), 7)),
        to: new Date()
    });

    const handleDateUpdate = ({ range }: { range: any }) => {
        setDateRange(range);
        setCurrentPage(1);
    };

    const fetchLeads = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateRange?.from) params.set('from', dateRange.from.toISOString());
            if (dateRange?.to) params.set('to', dateRange.to.toISOString());
            if (searchQuery) params.set('search', searchQuery);
            if (activeTab) params.set('type', activeTab);
            if (loopFilter !== 'all') params.set('loop', loopFilter);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (regionFilter !== 'all') params.set('region', regionFilter);
            if (channelFilter !== 'all') params.set('channel', channelFilter);
            params.set('page', String(currentPage));
            params.set('pageSize', String(itemsPerPage));

            const data = await fetchCached(`/api/leads/overview?${params.toString()}`);
            setLeads(data.leads || []);
            setTotalLeads(data.total || 0);
        } catch (err) {
            console.error(err);
            setLeads([]);
            setTotalLeads(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (view === "leads") {
            fetchLeads();
        }
    }, [view, dateRange, searchQuery, loopFilter, statusFilter, regionFilter, channelFilter, activeTab, currentPage]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, loopFilter, statusFilter, regionFilter, channelFilter, activeTab, dateRange]);

    const fetchTemplates = async () => {
        setError(null);
        try {
            const response = await fetch("/api/templates");
            if (!response.ok) {
                throw new Error("Failed to fetch templates");
            }
            const data = await response.json();
            setTemplates(data);
        } catch (err) {
            console.error(err);
            setError("Could not load templates. Please try again later.");
        }
    };

    useEffect(() => {
        if (view === "templates") {
            fetchTemplates();
        }
    }, [view]);


    if (error) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative min-h-[500px]">
            {loading && leads.length === 0 && <ASLoader />}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
                    <p className="text-slate-500">Manage and track your leads across all loops.</p>
                </div>
                <div className="flex items-center gap-2">
                    <DateRangePicker onUpdate={handleDateUpdate} />
                    <Button
                        variant={view === "leads" ? "outline" : "ghost"}
                        onClick={() => setView("leads")}
                        className={view === "leads" ? "bg-slate-50" : ""}
                    >
                        Leads
                    </Button>
                    <Button
                        variant={view === "templates" ? "outline" : "ghost"}
                        onClick={() => setView("templates")}
                        className={view === "templates" ? "bg-slate-50" : ""}
                    >
                        Templates
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => view === "leads" ? fetchLeads() : fetchTemplates()}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <div className="bg-white p-2 rounded-md border shadow-sm text-sm font-medium text-slate-600">
                        {view === "leads" ? `Total Leads: ${totalLeads}` : `Templates: ${templates.length}`}
                    </div>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {view === "leads" ? <Users className="h-5 w-5 text-blue-600" /> : <AlertCircle className="h-5 w-5 text-purple-600" />}
                            <CardTitle>{view === "leads" ? (activeTab === "normal" ? "Normal Leads" : "Owners") : "Templates Library"}</CardTitle>
                        </div>
                        {view === "leads" && (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                                <TabsList>
                                    <TabsTrigger value="normal">Normal</TabsTrigger>
                                    <TabsTrigger value="owners">Owners</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}
                    </div>
                    <CardDescription>
                        {view === "leads" ? (activeTab === "normal" ? "Data from the leads table." : "Data from the master_leads table.") : "Manage your messaging templates."}
                    </CardDescription>
                </CardHeader>

                {view === "leads" && (
                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by name, email, or phone..."
                                className="pl-10 h-10 bg-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Select value={loopFilter} onValueChange={setLoopFilter}>
                                <SelectTrigger className="w-[140px] h-10 bg-white">
                                    <SelectValue placeholder="Loop Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Loops</SelectItem>
                                    <SelectItem value="intro">Intro Loop</SelectItem>
                                    <SelectItem value="followup">Follow Up</SelectItem>
                                    <SelectItem value="master">Master Leads</SelectItem>

                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px] h-10 bg-white">
                                    <SelectValue placeholder="Reply Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="replied">Replied</SelectItem>
                                    <SelectItem value="sent">Sent Only</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={regionFilter} onValueChange={setRegionFilter}>
                                <SelectTrigger className="w-[140px] h-10 bg-white">
                                    <SelectValue placeholder="Region" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Regions</SelectItem>
                                    <SelectItem value="usa">USA Leads</SelectItem>
                                    <SelectItem value="global">Global Leads</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={channelFilter} onValueChange={setChannelFilter}>
                                <SelectTrigger className="w-[140px] h-10 bg-white">
                                    <SelectValue placeholder="Channel" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Channels</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                </SelectContent>
                            </Select>

                            {(searchQuery || loopFilter !== "all" || statusFilter !== "all" || regionFilter !== "all" || channelFilter !== "all") && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-500 hover:text-rose-600 h-10 px-3"
                                    onClick={() => {
                                        setSearchQuery("");
                                        setLoopFilter("all");
                                        setStatusFilter("all");
                                        setRegionFilter("all");
                                        setChannelFilter("all");
                                    }}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <CardContent className="p-0">
                    {view === "leads" ? (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/50">
                                        <TableHead className="w-[200px]">Name</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead className="text-center">Channel</TableHead>
                                        <TableHead>Email</TableHead>
                                        {activeTab === "normal" ? (
                                            <>
                                                <TableHead>Current Loop</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Reply Status</TableHead>
                                                <TableHead>Sentiment</TableHead>
                                            </>
                                        ) : (
                                            <>
                                                <TableHead>Lead Status</TableHead>
                                                <TableHead>Voice Status</TableHead>
                                                <TableHead>Note</TableHead>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading && leads.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">
                                                <div className="flex items-center justify-center gap-2 text-slate-500">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Loading leads...
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : leads.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                                                No leads matching these filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        leads.map((lead, index) => {
                                            return (
                                                <TableRow key={index} className="hover:bg-slate-50/50 transition-colors">
                                                    <TableCell className="font-medium text-slate-900">{lead.name}</TableCell>
                                                    <TableCell className="text-slate-600">{lead.phone}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex flex-col items-center gap-1.5">
                                                            {lead.email && lead.email !== "No Email" && (
                                                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100 text-[12px] font-medium h-5 px-1.5 w-full justify-center">
                                                                    Email
                                                                </Badge>
                                                            )}
                                                            {(lead.phone && lead.phone !== "undefined" && lead.phone !== "") && (
                                                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 text-[12px] font-medium h-5 px-1.5 w-full justify-center">
                                                                    WhatsApp
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={`text-sm ${lead.email === "No Email" || !lead.email ? "text-slate-300 italic" : "text-slate-600"}`}>
                                                        {lead.email === "No Email" || !lead.email ? "No Email" : lead.email}
                                                    </TableCell>
                                                    {activeTab === "normal" ? (
                                                        <>
                                                            <TableCell>
                                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-200 uppercase text-[10px] font-bold tracking-wider">
                                                                    {(lead.current_loop || lead.source_loop || "—").toUpperCase()}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-slate-600 text-sm capitalize">
                                                                {lead.status || lead.lead_status || "—"}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={lead.replied === "Yes" ? "default" : "secondary"}
                                                                    className={lead.replied === "Yes" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 shadow-none font-bold capitalize" : "capitalize text-slate-500 bg-slate-100"}>
                                                                    {lead.replied === "Yes" ? "Replied" : "Sent"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-slate-600 text-sm">
                                                                {lead.sentiment || <span className="text-slate-300 italic">No sentiment</span>}
                                                            </TableCell>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TableCell>
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                                    {lead.lead_status || "Pending"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-slate-600 text-sm">
                                                                {lead.voice_call_status || "N/A"}
                                                            </TableCell>
                                                            <TableCell className="text-slate-500 text-xs italic max-w-[200px] truncate">
                                                                {lead.note || "No notes"}
                                                            </TableCell>
                                                        </>
                                                    )}
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                            <PaginationFooter
                                totalItems={totalLeads}
                                currentPage={currentPage}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                            />
                        </>
                    ) : (
                        <div className="p-6 space-y-6">
                            {/* Template Type Toggles */}
                            <div className="flex justify-center">
                                <div className="bg-slate-100 p-1 rounded-lg inline-flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTemplateFilter("email")}
                                        className={`text-xs h-8 px-4 rounded-md transition-all ${templateFilter === "email" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-900"}`}
                                    >
                                        Email Templates
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTemplateFilter("whatsapp")}
                                        className={`text-xs h-8 px-4 rounded-md transition-all ${templateFilter === "whatsapp" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-900"}`}
                                    >
                                        WhatsApp Templates
                                    </Button>
                                </div>
                            </div>

                            {loading && templates.length === 0 ? (
                                <div className="flex items-center justify-center h-24 text-slate-500 gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading templates...
                                </div>
                            ) : templates.filter(t => t.type === templateFilter).length === 0 ? (
                                <div className="text-center text-slate-500 py-10">No {templateFilter} templates found.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
                                        {templates
                                            .filter(t => t.type === templateFilter)
                                            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                            .map((template: any, idx) => (
                                                <Card key={template.id || idx} className="border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4 flex flex-row items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-md ${template.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                                {template.type === 'email' ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                                                            </div>
                                                            <div className="font-semibold text-slate-700">
                                                                {template.name || `Template ${idx + 1}`}
                                                            </div>
                                                        </div>
                                                        {template.category && (
                                                            <Badge variant="secondary" className="text-xs bg-white border border-slate-200">
                                                                {template.category}
                                                            </Badge>
                                                        )}
                                                    </CardHeader>
                                                    <CardContent className="p-6 bg-white prose prose-slate max-w-none">
                                                        <div className="whitespace-pre-wrap text-slate-700 font-sans leading-relaxed">
                                                            {typeof template.body === 'string' ? template.body :
                                                                typeof template.components === 'object' ? JSON.stringify(template.components, null, 2) :
                                                                    JSON.stringify(template, null, 2)}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                    </div>
                                    <PaginationFooter
                                        totalItems={templates.filter(t => t.type === templateFilter).length}
                                        currentPage={currentPage}
                                        itemsPerPage={itemsPerPage}
                                        onPageChange={setCurrentPage}
                                    />
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function PaginationFooter({ totalItems, currentPage, itemsPerPage, onPageChange }: any) {
    if (totalItems <= itemsPerPage) return null;

    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return (
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-sm text-slate-500">
                Showing <span className="font-bold text-slate-900">{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, totalItems)}</span> of {totalItems} items
            </p>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                            <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="h-8 w-8 p-0 text-xs"
                                onClick={() => onPageChange(pageNum)}
                            >
                                {pageNum}
                            </Button>
                        );
                    })}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

