"use client";

import { ASLoader } from "@/components/as-loader";

import { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UserMinus, Search, Mail, Loader2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function UnsubscribedPage() {
    const { leads: allLeads, loadingLeads, refreshLeads } = useData();
    const [leads, setLeads] = useState<any[]>([]);
    const loading = loadingLeads;

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [dateRange, setDateRange] = useState<any>(undefined);
    const [sourceLoopFilter, setSourceLoopFilter] = useState("all");
    const [repliedFilter, setRepliedFilter] = useState("all");

    useEffect(() => {
        const fetchUnsubscribed = async () => {
            if (loadingLeads) return;
            try {
                const unsubscribed = allLeads.filter((lead: any) =>
                    lead.unsubscribed && String(lead.unsubscribed).toLowerCase().includes("yes")
                );

                // Sort by date mostly recently created desc
                unsubscribed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                setLeads(unsubscribed);
            } catch (err) {
                console.error("Error processing leads:", err);
            }
        };
        fetchUnsubscribed();
    }, [allLeads, loadingLeads]);

    const filteredLeads = leads.filter(l => {
        // Search Filter
        const matchesSearch = l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.email?.toLowerCase().includes(searchTerm.toLowerCase());

        // Loop Filter
        const matchesLoop = sourceLoopFilter === "all" ||
            l.source_loop?.toLowerCase() === sourceLoopFilter.toLowerCase() ||
            l.current_loop?.toLowerCase() === sourceLoopFilter.toLowerCase();

        // Replied Filter
        let matchesReplied = true;
        if (repliedFilter === "yes") {
            matchesReplied = l.replied && l.replied !== "No";
        } else if (repliedFilter === "no") {
            matchesReplied = !l.replied || l.replied === "No";
        }

        // Date Range Filter
        let matchesDate = true;
        if (dateRange?.from && l.created_at) {
            const leadDate = new Date(l.created_at);
            const from = new Date(dateRange.from);
            from.setHours(0, 0, 0, 0);

            // Handle when 'to' is undefined
            const to = dateRange.to ? new Date(dateRange.to) : new Date(from);
            to.setHours(23, 59, 59, 999);

            matchesDate = leadDate >= from && leadDate <= to;
        }

        return matchesSearch && matchesLoop && matchesReplied && matchesDate;
    });

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <UserMinus className="h-6 w-6 text-rose-600" />
                        Unsubscribed Leads
                    </h1>
                    <p className="text-slate-500">View detailed list of users who opted out of email marketing</p>
                </div>
                <DateRangePicker onUpdate={(range: any) => {
                    setDateRange(range.range);
                    if (range.range?.from) {
                        refreshLeads({ from: range.range.from, to: range.range.to, type: 'email' });
                    }
                }} />
            </div>

            <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="pb-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                        <div className="relative w-full sm:w-auto flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search name or email..."
                                className="pl-9 w-full sm:w-[220px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <Select value={sourceLoopFilter} onValueChange={setSourceLoopFilter}>
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue placeholder="Source Loop" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Loops</SelectItem>
                                <SelectItem value="intro">Intro</SelectItem>
                                <SelectItem value="followup">Follow Up</SelectItem>
                                <SelectItem value="nurture">Nurture</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={repliedFilter} onValueChange={setRepliedFilter}>
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue placeholder="Reply Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="yes">Replied</SelectItem>
                                <SelectItem value="no">No Reply</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative min-h-[400px]">
                    {loading ? (
                        <ASLoader fullScreen={false} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-100">
                                    <tr>
                                        <th className="py-4 px-6">Name</th>
                                        <th className="py-4 px-6">Email</th>
                                        <th className="py-4 px-6">Source Loop</th>
                                        <th className="py-4 px-6">Status</th>
                                        <th className="py-4 px-6">Date</th>
                                        <th className="py-4 px-6">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredLeads.length > 0 ? (
                                        filteredLeads.map((lead, idx) => {
                                            const dateObj = lead.created_at ? new Date(lead.created_at) : null;
                                            return (
                                                <tr key={lead.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-4 px-6 font-medium text-slate-900">
                                                        {lead.name || "N/A"}
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-600">
                                                        <div className="flex items-center gap-2">
                                                            <Mail className="h-4 w-4 text-slate-400" />
                                                            {lead.email}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-600 capitalize">
                                                        {lead.source_loop || "Intro"}
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                                                            Unsubscribed
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-600">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="h-4 w-4 text-slate-400" />
                                                            {dateObj ? dateObj.toLocaleDateString() : 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-500">
                                                        {dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="py-12 text-center text-slate-500">
                                                No unsubscribed leads match your search criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

