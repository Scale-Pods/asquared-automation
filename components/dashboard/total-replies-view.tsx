"use client";

import { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Search, Mail, MessageCircle, Phone } from "lucide-react";

interface ReplyData {
    id: string;
    contactName: string;
    contactInfo: string;
    mode: 'Email' | 'WhatsApp' | 'Voice';
    date: string;
    time: string;
    status: 'Replied' | 'Pending' | 'Follow-up';
    preview: string;
}



export function TotalRepliesView({ leads = [] }: { leads?: any[] }) {
    const [search, setSearch] = useState("");
    const [modeFilter, setModeFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    const parseMsg = (raw: any): { date: Date | null, content: string } => {
        if (!raw || !String(raw).trim()) return { date: null, content: "" };
        const content = String(raw).trim();
        const isoRegex = /\n\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.+)$/;
        const isoMatch = content.match(isoRegex);
        if (isoMatch) {
            return {
                date: new Date(isoMatch[1]),
                content: content.replace(isoRegex, '').trim()
            };
        }
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1].trim();
        const lastLineDate = new Date(lastLine.replace(' ', 'T'));
        if (lines.length > 1 && !isNaN(lastLineDate.getTime()) && lastLine.includes('-') && lastLine.includes(':')) {
            return {
                date: lastLineDate,
                content: lines.slice(0, -1).join('\n').trim()
            };
        }
        return { date: null, content: content };
    };

    // Map real leads to ReplyData format
    const realData: (ReplyData & { link: string; sortDate: Date })[] = [];

    leads.forEach((lead: any, idx: number) => {
        // --- WhatsApp Logic ---
        let wpReplyObj = { content: "Lead replied via WhatsApp", date: new Date(lead.updated_at || lead.created_at || 0) };
        let hasWP = false;

        const wtR = String(lead.WP_Replied_track || "").toLowerCase();
        if (wtR === "yes" || wtR === "replied") {
            hasWP = true;
        }

        const addWpReply = (raw: any) => {
            if (!raw || String(raw).toLowerCase() === "no" || String(raw).toLowerCase() === "none" || String(raw).trim() === "") return;
            hasWP = true;
            const parsed = parseMsg(raw);
            const msgDate = parsed.date || new Date(lead.updated_at || lead.created_at || 0);
            if (msgDate >= wpReplyObj.date) {
                wpReplyObj = { content: parsed.content || wpReplyObj.content, date: msgDate };
            }
        };

        addWpReply(lead.whatsapp_replied);
        for (let i = 1; i <= 10; i++) addWpReply(lead[`W.P_Replied_${i}`]);

        if (hasWP) {
            realData.push({
                id: `${lead.id || `lead-${idx}`}-wp`,
                contactName: lead.name || "Unknown",
                contactInfo: lead.phone || "No info",
                mode: 'WhatsApp',
                date: wpReplyObj.date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: wpReplyObj.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied',
                preview: wpReplyObj.content.substring(0, 70) + (wpReplyObj.content.length > 70 ? "..." : ""),
                link: `/dashboard/whatsapp/chat?chat=${lead.id}`,
                sortDate: wpReplyObj.date
            });
        }

        // --- Email Logic ---
        const hasEmail = lead.email_replied && !["no", "none", ""].includes(String(lead.email_replied).toLowerCase().trim());

        if (hasEmail) {
            const parsed = parseMsg(lead.email_replied);
            const msgDate = parsed.date || new Date(lead.updated_at || lead.created_at || 0);
            const emailReplyObj = { content: parsed.content || "Lead replied via Email", date: msgDate };

            realData.push({
                id: `${lead.id || `lead-${idx}`}-email`,
                contactName: lead.name || "Unknown",
                contactInfo: lead.email || "No info",
                mode: 'Email',
                date: emailReplyObj.date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
                time: emailReplyObj.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Replied',
                preview: emailReplyObj.content.substring(0, 70) + (emailReplyObj.content.length > 70 ? "..." : ""),
                link: `/dashboard/email/received`,
                sortDate: emailReplyObj.date
            });
        }
    });

    // Sort heavily by newest reply first
    realData.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

    // Filter logic
    const filteredData = realData.filter(item => {
        const matchesSearch = item.contactName.toLowerCase().includes(search.toLowerCase()) ||
            item.contactInfo.toLowerCase().includes(search.toLowerCase());
        const matchesMode = modeFilter === "all" || item.mode.toLowerCase() === modeFilter;
        return matchesSearch && matchesMode;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const displayedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-1 items-center gap-2 w-full md:max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search contacts..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Select value={modeFilter} onValueChange={setModeFilter}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Modes</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            <TableHead>Contact</TableHead>
                            <TableHead>Mode</TableHead>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Preview</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayedData.length > 0 ? (
                            displayedData.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium">{item.contactName}</div>
                                        <div className="text-xs text-slate-500">{item.contactInfo}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {item.mode === 'Email' && <Mail className="h-4 w-4 text-sky-500" />}
                                            {item.mode === 'WhatsApp' && <MessageCircle className="h-4 w-4 text-green-500" />}
                                            {item.mode === 'Voice' && <Phone className="h-4 w-4 text-purple-500" />}
                                            <span>{item.mode}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{item.date}</div>
                                        <div className="text-xs text-slate-500">{item.time}</div>
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={item.preview}>
                                        {item.preview}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={item.status === 'Replied' ? 'default' : item.status === 'Pending' ? 'secondary' : 'outline'}>
                                            {item.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700" onClick={() => window.location.href = item.link}>
                                            View
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No results found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-sm font-medium">Page {currentPage} of {Math.max(1, totalPages)}</div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
