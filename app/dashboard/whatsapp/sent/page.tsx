"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, CheckCheck, Clock, XCircle, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import React, { useState, useEffect } from "react";
import { consolidateLeads } from "@/lib/leads-utils";
import { ASLoader } from "@/components/as-loader";
import { useData } from "@/context/DataContext";

export default function WhatsappSentPage() {
    const { leads: allLeads, loadingLeads, refreshLeads } = useData();
    const [dateRange, setDateRange] = useState<any>(undefined);
    const [messages, setMessages] = useState<any[]>([]);
    const loading = loadingLeads;
    const [searchQuery, setSearchQuery] = useState("");
    const [stats, setStats] = useState({
        total: 0,
        delivered: 0,
        read: 0,
        failed: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            if (loadingLeads) return;
            try {
                // We still fetch templates as they're small and not in global context yet
                const templatesRes = await fetch('/api/templates');
                const templates = templatesRes.ok ? await templatesRes.json() : [];

                const waMessages: any[] = [];
                let deliveredCount = 0;
                let readCount = 0;

                // Apply Date Filtering
                const leads = allLeads.filter((lead: any) => {
                    if (!dateRange?.from) return true;
                    if (!lead.created_at) return false;

                    const leadDate = new Date(lead.created_at);
                    const from = new Date(dateRange.from);
                    from.setHours(0, 0, 0, 0);
                    const to = dateRange.to ? new Date(dateRange.to) : from;
                    to.setHours(23, 59, 59, 999);

                    return leadDate >= from && leadDate <= to;
                });

                leads.forEach((l: any) => {
                    const lead = l as any;
                    const stages = lead.stages_passed || [];
                    stages.forEach((stage: string) => {
                        if (stage.toLowerCase().includes("whatsapp")) {
                            // Find matching template if any
                            const template = templates.find((t: any) =>
                                t.type === 'whatsapp' && (t.name === stage || stage.includes(t.name))
                            );

                            const hasReplied = lead.whatsapp_replied && lead.whatsapp_replied !== "No" && lead.whatsapp_replied !== "none";

                            waMessages.push({
                                id: `${lead.id}-${stage}-${Math.random()}`,
                                recipient: lead.phone || lead.name || "Unknown",
                                message: template ? template.body : `WhatsApp Message: ${stage}`,
                                status: hasReplied ? "Read" : "Delivered",
                                time: lead.created_at ? new Date(lead.created_at).toLocaleTimeString() : "Unknown",
                                rawDate: lead.created_at
                            });

                            if (hasReplied) readCount++;
                            deliveredCount++;
                        }
                    });
                });

                setMessages(waMessages);
                setStats({
                    total: waMessages.length,
                    delivered: deliveredCount,
                    read: readCount,
                    failed: 0
                });
            } catch (e) {
                console.error("WhatsApp sent processing error", e);
            }
        };
        fetchData();
    }, [dateRange, allLeads, loadingLeads]);

    const filteredMessages = messages.filter(msg =>
        msg.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.message.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return <ASLoader />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Total Sent Messages</h1>
                    <p className="text-slate-500">History of all outbound WhatsApp communications</p>
                </div>
                <DateRangePicker onUpdate={(val) => {
                    setDateRange(val.range);
                    if (val.range?.from) {
                        refreshLeads({ from: val.range.from, to: val.range.to, type: 'whatsapp' });
                    }
                }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Total Sent" value={loading ? "..." : stats.total.toLocaleString()} icon={<Send className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50" />
                <StatCard title="Delivered" value={loading ? "..." : stats.delivered.toLocaleString()} icon={<CheckCheck className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50" />
                <StatCard title="Read" value={loading ? "..." : stats.read.toLocaleString()} icon={<CheckCheck className="h-4 w-4 text-blue-500" />} color="text-amber-600" bg="bg-amber-50" />
                <StatCard title="Failed" value={loading ? "..." : stats.failed.toLocaleString()} icon={<XCircle className="h-4 w-4" />} color="text-rose-600" bg="bg-rose-50" />
            </div>

            <Card className="border-slate-200">
                <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between py-4">
                    <CardTitle className="text-lg">Message History</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            className="pl-10 h-9"
                            placeholder="Search recipients..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative min-h-[300px]">
                    <div className="divide-y divide-slate-100">
                        {loading ? (
                            <ASLoader />
                        ) : filteredMessages.length > 0 ? (
                            filteredMessages.map((msg) => (
                                <div key={msg.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="font-bold text-slate-950">{msg.recipient}</p>
                                        <p className="text-sm text-slate-600 max-w-xl">{msg.message}</p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold">{msg.time}</span>
                                            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase ${msg.status === 'Read' ? 'text-blue-500' :
                                                msg.status === 'Delivered' ? 'text-emerald-500' :
                                                    msg.status === 'Failed' ? 'text-rose-500' : 'text-slate-400'
                                                }`}>
                                                {(msg.status === 'Read' || msg.status === 'Delivered') && <CheckCheck className="h-3 w-3" />}
                                                {msg.status === 'Sent' && <Clock className="h-3 w-3" />}
                                                {msg.status === 'Failed' && <XCircle className="h-3 w-3" />}
                                                {msg.status}
                                            </span>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm">Details</Button>
                                </div>
                            ))
                        ) : (
                            <div className="p-12 text-center text-slate-400">
                                No messages found.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({ title, value, icon, color, bg }: any) {
    return (
        <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-lg ${bg} ${color}`}>{icon}</div>
                <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
                    <p className="text-xl font-bold text-slate-900">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}


