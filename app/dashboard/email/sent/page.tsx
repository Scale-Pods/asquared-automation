"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    Mail,
    ChevronDown,
    ChevronUp,
    ArrowRight,
    ArrowLeft,
    Reply,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format, subDays } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useData } from "@/context/DataContext";
import { ASLoader } from "@/components/as-loader";

const ITEMS_PER_PAGE = 7;

export default function SentEmailsPage() {
    const { leads: allLeads, loadingLeads } = useData();
    const [page, setPage] = useState(1);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [sentEmails, setSentEmails] = useState<any[]>([]);
    const loading = loadingLeads;
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState({
        campaign: "all",
        sender: "all",
        type: "all",
    });

    useEffect(() => {
        const fetchData = async () => {
            if (loadingLeads) return;

            try {
                const emails: any[] = [];

                allLeads.forEach((lead: any, leadIndex: number) => {
                    const stages = lead.stages_passed || [];

                    // --- Build sender display string ---
                    let sEmail = (lead.sender_email || lead["Sender Email"] || "").trim();
                    let sName = (lead.sender_name || lead["Sender Name"] || "").trim();
                    let extractedEmail = sEmail;
                    let extractedNameFromEmail = "";
                    if (sEmail.includes("<") && sEmail.includes(">")) {
                        const m = sEmail.match(/^(.*?)<(.*?)>$/);
                        if (m) {
                            extractedNameFromEmail = m[1].trim().replace(/^"|"$/g, "");
                            extractedEmail = m[2].trim();
                        }
                    }
                    const displayName = sName || extractedNameFromEmail || "";
                    const displayEmail = extractedEmail || sEmail || "";
                    let fullSender = "";
                    if (displayName && displayEmail && displayEmail.includes("@")) {
                        fullSender =
                            displayName.toLowerCase() === displayEmail.toLowerCase()
                                ? displayEmail
                                : `${displayName} (${displayEmail})`;
                    } else {
                        fullSender = displayName || displayEmail || "Unknown Sender";
                    }
                    if (fullSender.includes("<>")) fullSender = fullSender.replace("<>", "").trim();

                    // --- Has this lead replied via email? ---
                    const emailReply = lead.email_replied;
                    const hasReplied = !!(
                        emailReply &&
                        emailReply !== "No" &&
                        String(emailReply).trim() !== ""
                    );

                    // --- Iterate email stages in order ---
                    // stages_passed only contains stages where the column had a value (see leads-utils.ts)
                    // So simply iterating covers the "stop at last filled email" rule automatically.
                    stages.forEach((stage: string) => {
                        if (!stage.startsWith("Email_")) return; // only Email_N underscore stages

                        const rawContent = lead.stage_data?.[stage];

                        let rawDateValue: string | null = lead.created_at || null;
                        let emailBody = "Email sent – no content stored.";
                        let sentDate: string | null = null;

                        if (rawContent && typeof rawContent === "string") {
                            const trimmed = rawContent.trim();
                            const lines = trimmed.split("\n");
                            const lastLine = lines[lines.length - 1].trim();
                            const fullDate = new Date(trimmed);
                            const lastLineDate = new Date(lastLine);

                            if (!isNaN(fullDate.getTime()) && trimmed.length < 50) {
                                // Entire column is a timestamp
                                rawDateValue = fullDate.toISOString();
                                sentDate = format(fullDate, "MMM dd, yyyy • p");
                                emailBody = "Email sent";
                            } else if (
                                !isNaN(lastLineDate.getTime()) &&
                                lastLine.includes("-") &&
                                lastLine.includes(":")
                            ) {
                                // Last line is a timestamp; rest is body
                                rawDateValue = lastLineDate.toISOString();
                                sentDate = format(lastLineDate, "MMM dd, yyyy • p");
                                emailBody = lines.slice(0, -1).join("\n").trim() || "Email sent";
                            } else {
                                emailBody = rawContent;
                            }
                        }

                        // Stage name IS the column name — show it directly as the label
                        const displayStageType = stage; // e.g. "Email_1", "Email_2"

                        emails.push({
                            id: `${lead.id || `lead-${leadIndex}`}-${stage.replace(/\s+/g, "-")}-${Math.random()
                                .toString(36)
                                .substr(2, 9)}`,
                            recipient: lead.email || lead.name || `Lead ${leadIndex + 1}`,
                            sender: fullSender,
                            type: displayStageType,
                            sentDate,
                            subject: displayStageType,
                            content: emailBody,
                            loop: lead.source_loop || "Intro",
                            rawDate: rawDateValue,
                            hasReplied,
                        });
                    });
                });

                // Sort newest first
                emails.sort(
                    (a, b) =>
                        new Date(b.rawDate || 0).getTime() - new Date(a.rawDate || 0).getTime()
                );
                setSentEmails(emails);
            } catch (err) {
                console.error("Sent emails processing error", err);
            }
        };
        fetchData();
    }, [allLeads, loadingLeads]);

    // Unique senders for filter dropdown
    const uniqueSenders = Array.from(new Set(sentEmails.map((e) => e.sender))).sort();

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const filteredEmails = sentEmails.filter((email) => {
        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (
                !email.recipient.toLowerCase().includes(q) &&
                !email.subject.toLowerCase().includes(q) &&
                !email.content.toLowerCase().includes(q)
            )
                return false;
        }

        // Date range
        if (dateRange?.from) {
            const ed = email.rawDate ? new Date(email.rawDate) : null;
            if (!ed || isNaN(ed.getTime())) return false;
            const from = new Date(dateRange.from);
            from.setHours(0, 0, 0, 0);
            const to = dateRange.to ? new Date(dateRange.to) : new Date(from);
            to.setHours(23, 59, 59, 999);
            if (ed < from || ed > to) return false;
        }

        // Campaign
        if (filters.campaign !== "all") {
            const loop = (email.loop || "").toLowerCase();
            if (filters.campaign === "intro" && !loop.includes("intro")) return false;
            if (filters.campaign === "nurture" && !loop.includes("nurture")) return false;
            if (filters.campaign === "followup" && !loop.includes("follow")) return false;
        }

        // Sender
        if (filters.sender !== "all" && email.sender !== filters.sender) return false;

        // Type
        if (filters.type !== "all") {
            const typeMap: Record<string, string> = {
                email1: "email 1", email2: "email 2", email3: "email 3",
                email4: "email 4", email5: "email 5", email6: "email 6",
                email7: "email 7", email8: "email 8", email9: "email 9",
                email10: "email 10",
            };
            const expected = typeMap[filters.type];
            if (expected && !email.type.toLowerCase().includes(expected)) return false;
        }

        return true;
    });

    const totalPages = Math.ceil(filteredEmails.length / ITEMS_PER_PAGE);
    const paginatedEmails = filteredEmails.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
    );

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto relative min-h-[500px]">
            {loading && <ASLoader />}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sent Emails</h1>
                    <p className="text-slate-500">View and manage your sent email history.</p>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search recipients, subjects..."
                            className="pl-9 bg-slate-50 border-slate-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <DateRangePicker
                        className="w-full md:w-[260px]"
                        onUpdate={(values) => setDateRange(values.range)}
                    />
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <Filter className="h-4 w-4 text-slate-400 mr-2" />

                    <Select value={filters.campaign} onValueChange={(val) => handleFilterChange("campaign", val)}>
                        <SelectTrigger className="w-[140px] h-9 text-xs">
                            <SelectValue placeholder="Campaign" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Campaigns</SelectItem>
                            <SelectItem value="intro">Intro Loop</SelectItem>
                            <SelectItem value="followup">Follow Up</SelectItem>
                            <SelectItem value="nurture">Nurture Loop</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={filters.sender} onValueChange={(val) => handleFilterChange("sender", val)}>
                        <SelectTrigger className="w-[160px] h-9 text-xs">
                            <SelectValue placeholder="Sender" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Senders</SelectItem>
                            {uniqueSenders.map((sender) => (
                                <SelectItem key={sender} value={sender}>
                                    {sender}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filters.type} onValueChange={(val) => handleFilterChange("type", val)}>
                        <SelectTrigger className="w-[140px] h-9 text-xs">
                            <SelectValue placeholder="Email Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="email1">Email 1</SelectItem>
                            <SelectItem value="email2">Email 2</SelectItem>
                            <SelectItem value="email3">Email 3</SelectItem>
                            <SelectItem value="email4">Email 4</SelectItem>
                            <SelectItem value="email5">Email 5</SelectItem>
                            <SelectItem value="email6">Email 6</SelectItem>
                            <SelectItem value="email7">Email 7</SelectItem>
                            <SelectItem value="email8">Email 8</SelectItem>
                            <SelectItem value="email9">Email 9</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 h-9 text-xs ml-auto bg-slate-100 hover:bg-slate-200"
                        onClick={() => {
                            setSearchQuery("");
                            setDateRange(undefined);
                            setFilters({ campaign: "all", sender: "all", type: "all" });
                            setPage(1);
                        }}
                    >
                        Reset All Filters
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                {!loading && paginatedEmails.length > 0 ? (
                    paginatedEmails.map((email) => <SentEmailCard key={email.id} email={email} />)
                ) : !loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                        <Mail className="h-8 w-8 mb-2 opacity-50" />
                        <p>No emails found matching your filters</p>
                    </div>
                ) : null}
            </div>

            {/* Pagination */}
            {!loading && filteredEmails.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-500">
                        Showing{" "}
                        <span className="font-medium">{(page - 1) * ITEMS_PER_PAGE + 1}</span>–
                        <span className="font-medium">
                            {Math.min(page * ITEMS_PER_PAGE, filteredEmails.length)}
                        </span>{" "}
                        of <span className="font-medium">{filteredEmails.length}</span> results
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="gap-1"
                        >
                            <ArrowLeft className="h-4 w-4" /> Previous
                        </Button>
                        <span className="text-sm font-medium text-slate-600">
                            Page {page} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="gap-1"
                        >
                            Next <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SentEmailCard({ email }: { email: any }) {
    const [isOpen, setIsOpen] = useState(false);

    // Simple helper to strip HTML tags for the text preview
    const stripHtml = (html: string) => {
        if (!html) return "";
        // Replace <br> and other block tags with spaces for better truncation
        const spaced = html.replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, " ").replace(/<\/?[^>]+(>|$)/g, "");
        return spaced;
    };

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="bg-white border border-slate-200 rounded-xl shadow-sm transition-all hover:shadow-md"
        >
            <CollapsibleTrigger asChild>
                <div className="p-6 cursor-pointer group">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 shrink-0 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100">
                                <Mail className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                        variant="secondary"
                                        className="bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] tracking-wider font-bold uppercase"
                                    >
                                        {email.type}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className="text-purple-600 border-purple-200 bg-purple-50 text-[10px] uppercase font-bold"
                                    >
                                        {email.loop}
                                    </Badge>
                                    {email.hasReplied && (
                                        <Badge
                                            variant="outline"
                                            className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] font-bold gap-1"
                                        >
                                            <Reply className="h-3 w-3" /> Replied
                                        </Badge>
                                    )}
                                    {email.sentDate && (
                                        <Badge
                                            variant="outline"
                                            className="text-cyan-600 border-cyan-200 bg-cyan-50 text-[10px]"
                                        >
                                            {email.sentDate}
                                        </Badge>
                                    )}
                                </div>
                                <h4 className="text-lg font-bold text-slate-900">{email.recipient}</h4>
                                {!isOpen && (
                                    <p className="text-sm text-slate-500 truncate max-w-md" >
                                        {stripHtml(email.content).substring(0, 80)}...
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="shrink-0">
                            {isOpen ? (
                                <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                            )}
                        </div>
                    </div>
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="px-6 pb-6 pt-0">
                    <div className="pl-[56px] space-y-4 border-t border-slate-100 pt-4">
                        {email.sender && (
                            <p className="text-xs text-slate-400">
                                <span className="font-semibold text-slate-600">From:</span> {email.sender}
                            </p>
                        )}
                        <div className="mt-4 text-sm text-slate-700 leading-relaxed font-sans overflow-auto max-w-full">
                            <div
                                className="email-content"
                                dangerouslySetInnerHTML={{ __html: email.content }}
                            />
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

