"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, CheckCheck, Clock, XCircle, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import React, { useState, useEffect } from "react";
import { consolidateLeads } from "@/lib/leads-utils";
import { ASLoader } from "@/components/as-loader";
import { startOfDay, endOfDay, subDays } from "date-fns";

export default function WhatsappSentPage() {
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date()
    });
    const [messages, setMessages] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [stats, setStats] = useState({
        total: 0,
        delivered: 0,
        read: 0,
        failed: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const q = new URLSearchParams({ type: 'whatsapp', whatsappOnly: 'true' });
                if (dateRange?.from) {
                    q.set('from', startOfDay(dateRange.from).toISOString());
                    q.set('to', endOfDay(dateRange.to || dateRange.from).toISOString());
                }

                const [leadsRes, templatesRes] = await Promise.all([
                    fetch(`/api/leads?${q}`),
                    fetch('/api/templates')
                ]);
                const leadsData = await leadsRes.json();
                const templates = templatesRes.ok ? await templatesRes.json() : [];

                const waMessages: any[] = [];
                let deliveredCount = 0;
                let readCount = 0;

                (leadsData.whatsappLeads || []).forEach((l: any) => {
                    const stages = l.stages_passed || [];
                    stages.forEach((stage: string) => {
                        if (stage.toLowerCase().includes("whatsapp")) {
                            const template = templates.find((t: any) =>
                                t.type === 'whatsapp' && (t.name === stage || stage.includes(t.name))
                            );

                            const hasReplied = l.whatsapp_replied && l.whatsapp_replied !== "No" && l.whatsapp_replied !== "none";

                            waMessages.push({
                                id: `${l.id}-${stage}-${Math.random()}`,
                                recipient: l.phone || l.name || "Unknown",
                                message: template ? template.body : `WhatsApp Message: ${stage}`,
                                status: hasReplied ? "Read" : "Delivered",
                                time: l.created_at ? new Date(l.created_at).toLocaleTimeString() : "Unknown",
                                rawDate: l.created_at
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
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [dateRange?.from, dateRange?.to]);

    const filteredMessages = messages.filter(msg =>
        msg.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.message.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading && !dateRange?.from) {
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
