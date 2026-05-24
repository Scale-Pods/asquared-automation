"use client";

import { ASLoader } from "@/components/as-loader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Mail, ChevronDown, ChevronUp, Reply, Search } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useData } from "@/context/DataContext";

export default function ReceivedEmailsPage() {
    const { leads: allLeads, loadingLeads, refreshLeads } = useData();
    const [replies, setReplies] = useState<any[]>([]);
    const loading = loadingLeads;
    const [loopFilter, setLoopFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [dateRange, setDateRange] = useState<any>(undefined);
    const [sortBy, setSortBy] = useState("newest");

    useEffect(() => {
        const fetchReplies = async () => {
            if (loadingLeads) return;

            try {
                const realReplies: any[] = [];

                allLeads.forEach((lead: any, index: number) => {
                    // Read Email_Replied column value (mapped to email_replied in leads-utils)
                    const emailReply = lead.email_replied;
                    if (!emailReply || emailReply === "No" || String(emailReply).trim() === "") return;

                    const trimmed = String(emailReply).trim();
                    const lines = trimmed.split("\n");
                    const lastLine = lines[lines.length - 1].trim();
                    const lastLineDate = new Date(lastLine);

                    // Default display date is the lead's created_at
                    let displayDate: string = lead.created_at || new Date().toISOString();
                    let cleanContent = trimmed;

                    // If last line of Email_Replied is a timestamp, use it as the reply date
                    if (
                        !isNaN(lastLineDate.getTime()) &&
                        lastLine.includes("-") &&
                        lastLine.includes(":")
                    ) {
                        displayDate = lastLineDate.toISOString();
                        cleanContent = lines.slice(0, -1).join("\n").trim() || "Email Reply Received";
                    }

                    // Last email stage = what they replied to. Stages are now "Email_1" etc.
                    const emailStages = (lead.stages_passed || []).filter((s: string) =>
                        s.startsWith("Email_")
                    );
                    const lastEmailStage = emailStages.length > 0 ? emailStages[emailStages.length - 1] : "";

                    // Stage name IS the column name — no remapping needed
                    const displayRepliedTo = lastEmailStage; // e.g. "Email_1", "Email_2"

                    let formattedTimestamp = "Unknown Date";
                    try {
                        formattedTimestamp = format(new Date(displayDate), "MMM dd, yyyy • p");
                    } catch (_) { }

                    realReplies.push({
                        id: `${lead.id || index}-email-reply`,
                        sender: lead.email || "No Email Provided",
                        senderName: lead.name || "Lead",
                        status: "Replied",
                        subject: displayRepliedTo ? `Reply to ${displayRepliedTo}` : "Email Reply",
                        timestamp: formattedTimestamp,
                        content: cleanContent,
                        originalDate: displayDate,
                        loop: lead.source_loop || "",
                        repliedToStep: displayRepliedTo,
                    });
                });

                // Sort newest first by default
                realReplies.sort(
                    (a, b) =>
                        new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime()
                );
                setReplies(realReplies);
            } catch (e) {
                console.error("Received emails error", e);
            }
        };
        fetchReplies();
    }, [allLeads, loadingLeads]);

    const filteredReplies = useMemo(() => {
        let result = replies.filter((reply) => {
            // Loop filter
            if (loopFilter !== "all") {
                const loop = (reply.loop || "").toLowerCase();
                if (loopFilter === "intro" && !loop.includes("intro")) return false;
                if (loopFilter === "followup" && !loop.includes("follow")) return false;
                if (loopFilter === "nurture" && !loop.includes("nurture")) return false;
            }

            // Search
            const q = searchQuery.toLowerCase();
            if (
                q &&
                !reply.sender.toLowerCase().includes(q) &&
                !reply.content.toLowerCase().includes(q) &&
                !reply.senderName.toLowerCase().includes(q)
            )
                return false;

            // Date range
            if (dateRange?.from) {
                const rd = reply.originalDate ? new Date(reply.originalDate) : null;
                if (!rd || isNaN(rd.getTime())) return false;
                const from = new Date(dateRange.from);
                from.setHours(0, 0, 0, 0);
                const to = dateRange.to ? new Date(dateRange.to) : new Date(from);
                to.setHours(23, 59, 59, 999);
                if (rd < from || rd > to) return false;
            }

            return true;
        });

        // Sort
        return result.sort((a, b) => {
            const da = a.originalDate ? new Date(a.originalDate).getTime() : 0;
            const db = b.originalDate ? new Date(b.originalDate).getTime() : 0;
            return sortBy === "newest" ? db - da : da - db;
        });
    }, [replies, loopFilter, searchQuery, dateRange, sortBy]);

    return (
        <div className="space-y-6 pb-10 max-w-5xl mx-auto relative min-h-[500px]">
            {loading && <ASLoader />}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Received Emails</h1>
                    <p className="text-slate-500">
                        View all received email replies from your campaigns
                    </p>
                </div>
            </div>

            {/* Summary Card */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardContent className="p-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900">
                            {loading ? "..." : filteredReplies.length} replies received
                        </h3>
                        <p className="text-sm font-medium text-slate-500 mt-1">Total Replies</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Mail className="h-6 w-6" />
                    </div>
                </CardContent>
            </Card>

            {/* Search & Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search by sender or content..."
                            className="pl-10 bg-slate-50 border-slate-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <DateRangePicker
                        className="w-full md:w-[260px]"
                        onUpdate={(values) => {
                            setDateRange(values.range);
                            if (values.range?.from) {
                                refreshLeads({ from: values.range.from, to: values.range.to, type: 'email' });
                            }
                        }}
                    />
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={loopFilter} onValueChange={setLoopFilter}>
                        <SelectTrigger className="w-[140px] h-9 text-xs">
                            <SelectValue placeholder="All Loops" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Loops</SelectItem>
                            <SelectItem value="intro">Intro Loop</SelectItem>
                            <SelectItem value="followup">Follow Up</SelectItem>
                            <SelectItem value="nurture">Nurture Loop</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[140px] h-9 text-xs">
                            <SelectValue placeholder="Sort By" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 h-9 text-xs ml-auto bg-slate-100 hover:bg-slate-200"
                        onClick={() => {
                            setSearchQuery("");
                            setDateRange(undefined);
                            setLoopFilter("all");
                            setSortBy("newest");
                        }}
                    >
                        Reset Filters
                    </Button>
                </div>
            </div>

            {/* Reply List */}
            <div className="space-y-4">
                {!loading &&
                    filteredReplies.map((reply) => (
                        <EmailReplyCard key={reply.id} reply={reply} />
                    ))}
                {!loading && filteredReplies.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                        <Mail className="h-8 w-8 mb-2 opacity-50" />
                        <p>No replies found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function EmailReplyCard({ reply }: { reply: any }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="bg-white border border-slate-200 rounded-xl shadow-sm transition-all hover:shadow-md"
        >
            <CollapsibleTrigger asChild>
                <div className="p-6 flex items-center gap-4 cursor-pointer group">
                    <div className="h-12 w-12 shrink-0 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100">
                        <Reply className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-lg font-bold text-slate-900 truncate">
                                    {reply.senderName}
                                </h4>
                                {reply.loop && (
                                    <Badge
                                        variant="outline"
                                        className="text-purple-600 bg-purple-50 border-purple-100 text-[10px] uppercase font-bold"
                                    >
                                        {reply.loop}
                                    </Badge>
                                )}
                                {reply.repliedToStep && (
                                    <Badge
                                        variant="outline"
                                        className="text-indigo-600 bg-indigo-50 border-indigo-100 text-[10px] font-bold gap-1"
                                    >
                                        <Reply className="h-3 w-3" />
                                        {reply.repliedToStep}
                                    </Badge>
                                )}
                                {reply.timestamp && (
                                    <Badge
                                        variant="outline"
                                        className="text-cyan-600 bg-cyan-50 border-cyan-100 text-[10px] font-bold"
                                    >
                                        {reply.timestamp}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <p className="text-xs text-slate-500 font-medium truncate">{reply.sender}</p>
                        </div>
                        {!isOpen && (
                            <p className="text-sm text-slate-400 truncate max-w-md mt-1">
                                {reply.content.substring(0, 80)}...
                            </p>
                        )}
                    </div>

                    <div className="shrink-0 p-2 rounded-full text-slate-400 group-hover:bg-slate-50 group-hover:text-slate-600 transition-colors">
                        {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="px-6 pb-6 pt-0">
                    <div className="pl-[64px] space-y-4 border-t border-slate-100 pt-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {reply.content}
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

