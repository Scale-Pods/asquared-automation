"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Phone, Clock, TrendingUp, Timer, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASLoader } from "@/components/as-loader";
import React, { useEffect, useState } from "react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDuration } from "@/lib/utils";
import { subDays } from "date-fns";
import { fetchCached } from "@/lib/use-cached-fetch";

export default function VoiceDashboardPage() {
    const [providerFilter, setProviderFilter] = useState("vapi");
    const [stats, setStats] = useState<any>({
        totalCalls: 0,
        totalDuration: 0,
        avgDuration: 0,
        secondaryCalls: 0,
        unknownCalls: 0,
        ownersCalls: 0,
    });
    const [dailyVolume, setDailyVolume] = useState<any[]>([]);
    const [hourlyDistribution, setHourlyDistribution] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date()
    });

    const fetchOverview = async (range: any) => {
        setLoading(true);
        try {
            const from = range?.from || subDays(new Date(), 30);
            const to = range?.to || new Date();
            const data = await fetchCached(`/api/voice/overview?from=${from.toISOString()}&to=${to.toISOString()}`);
            setStats({
                totalCalls: data.totalCalls || 0,
                totalDuration: data.totalDuration || 0,
                avgDuration: data.avgDuration || 0,
                secondaryCalls: data.secondaryCalls || 0,
                unknownCalls: data.unknownCalls || 0,
                ownersCalls: data.ownersCalls || 0,
            });
            setDailyVolume((data.volumeData || []).map((d: any) => ({ name: d.name, calls: d.value })));
            setHourlyDistribution(
                (data.hourlyData || [])
                    .filter((_: any, i: number) => i % 3 === 0)
                    .map((d: any) => ({ name: `${String(d.hour).padStart(2, '0')}:00`, calls: d.count }))
            );
        } catch (err) {
            console.error("Failed to fetch voice overview", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview(dateRange);
    }, [dateRange]);

    return (
        <div className="flex flex-col gap-4 p-6 bg-slate-50/30 min-h-screen relative">
            {/* Background refresh loader for consistency */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-[1px] pointer-events-none">
                    <div className="bg-white/80 p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center gap-3">
                        <ASLoader />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Updating Analytics...</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Voice Agent Dashboard</h1>
                    <p className="text-slate-500">Monitor your AI voice agent performance across all accounts.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={providerFilter} onValueChange={setProviderFilter}>
                        <SelectTrigger className="w-[160px] h-10 border-slate-200">
                            <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="vapi">Vapi</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        className="flex items-center gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 h-10"
                        onClick={() => fetchOverview(dateRange)}
                        disabled={loading}
                    >
                        <TrendingUp className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <DateRangePicker onUpdate={(values) => setDateRange(values.range)} />
                </div>
            </div>

            {/* Vapi Account Split Banner */}
            {providerFilter === 'vapi' && !loading && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
                        <div className="p-1.5 bg-indigo-100 rounded-lg">
                            <Phone className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">Secondary Leads</p>
                            <p className="text-xl font-bold text-indigo-700">{stats.secondaryCalls.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
                        <div className="p-1.5 bg-amber-100 rounded-lg">
                            <Crown className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Unknown Leads</p>
                            <p className="text-xl font-bold text-amber-700">{stats.unknownCalls.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2">
                        <div className="p-1.5 bg-blue-100 rounded-lg">
                            <Crown className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Owner Leads</p>
                            <p className="text-xl font-bold text-blue-700">{stats.ownersCalls.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricCard
                    title="Total Calls"
                    value={`${stats.totalCalls} calls`}
                    icon={<Phone className="h-5 w-5 text-slate-600" />}
                />
                <MetricCard
                    title="Total Duration"
                    value={formatDuration(stats.totalDuration)}
                    icon={<Clock className="h-5 w-5 text-slate-600" />}
                />
                <MetricCard
                    title="Average Duration"
                    value={`${Math.round(stats.avgDuration)}s`}
                    icon={<Timer className="h-5 w-5 text-slate-600" />}
                />
                
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Daily Call Volume</h3>
                        <div className="w-full" style={{ height: 250, minHeight: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyVolume.length > 0 ? dailyVolume : [{ name: 'No Data', calls: 0 }]}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                    <Bar dataKey="calls" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Hourly Call Distribution</h3>
                        <div className="w-full" style={{ height: 250, minHeight: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={hourlyDistribution.length > 0 ? hourlyDistribution : [{ name: '00:00', calls: 0 }]}>
                                    <defs>
                                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                    <Area type="monotone" dataKey="calls" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCalls)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function MetricCard({ title, value, badge, icon }: any) {
    return (
        <Card className="bg-white border-slate-200 text-slate-900 shadow-sm relative group hover:shadow-md transition-all duration-300">
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-[10px] font-medium text-slate-500 mb-0.5">{title}</p>
                        <h3 className="text-xl font-bold text-slate-900">{value}</h3>
                        {badge && (
                            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                                {badge}
                            </div>
                        )}
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 group-hover:bg-slate-100 transition-colors">
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

