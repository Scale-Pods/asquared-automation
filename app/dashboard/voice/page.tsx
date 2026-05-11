"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Phone, Clock, DollarSign, TrendingUp, Timer, Users, Crown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { format, getHours, subDays } from "date-fns";
import { calculateDuration, formatDuration } from "@/lib/utils";
import { useData } from "@/context/DataContext";

export default function VoiceDashboardPage() {
    // providerFilter: 'vapi' | 'elevenlabs'
    const [providerFilter, setProviderFilter] = useState("vapi");
    const [stats, setStats] = useState({
        totalCalls: 0,
        totalDuration: 0,
        avgDuration: 0,
        totalCost: 0,
        avgCost: 0,
        successRate: 0,
        completedCalls: 0,
        vapiBalance: 0,
        lifetimeCostVapi: 0,
        normalCalls: 0,
        ownersCalls: 0,
    });
    const [dailyVolume, setDailyVolume] = useState<any[]>([]);
    const [hourlyDistribution, setHourlyDistribution] = useState<any[]>([]);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [dateRange, setDateRange] = useState<any>(undefined);


    const { calls: globalCalls, loadingCalls, voiceBalance, refreshCalls } = useData();

    // Refresh on filter/date change
    useEffect(() => {
        if (!refreshCalls) return;
        refreshCalls({
            from: dateRange?.from,
            to: dateRange?.to,
            provider: 'vapi'
        });
    }, [dateRange, providerFilter, refreshCalls]);

    useEffect(() => {
        if (voiceBalance) {
            setStats(prev => ({
                ...prev,
                vapiBalance: voiceBalance.vapi?.balance || 0
            }));
        }
    }, [voiceBalance]);

    const loading = loadingCalls;

    useEffect(() => {
        // Calculate stats whenever globalCalls changes, even if still technically "loading"
        // so that pre-fetched data from Master Dashboard shows up instantly.
        if (globalCalls.length === 0 && loading) return;

        let totalDuration = 0;
        let totalCost = 0;
        let completed = 0;
        let successCount = 0;

        const dayMap = new Map();
        const hourMap = new Array(24).fill(0);

        // Apply provider filter
        const filteredCalls = globalCalls.filter((call: any) => {
            if (providerFilter === 'vapi') return call.source === 'vapi';
            return true;
        });

        let lifetimeCostVapiSum = 0;
        let lifetimeCostELSum = 0;
        let normalCallsCount = 0;
        let ownersCallsCount = 0;

        // Combined loop for efficiency
        filteredCalls.forEach((call: any) => {
            const status = (call.status || "").toLowerCase();
            const vStatus = (call.vapiStatus || "").toLowerCase();
            const startedAtDate = call.startedAt ? new Date(call.startedAt) : null;
            const duration = call.durationSeconds || 0;

            let cost = 0;
            if (typeof call.cost === 'string') cost = parseFloat(call.cost.replace(/[^\d.]/g, '')) || 0;
            else if (typeof call.cost === 'number') cost = call.cost;

            // Lifetime Cost Tracking (provider specific within filtered set)
            if (call.source === 'vapi') {
                lifetimeCostVapiSum += (call.breakdown?.agent !== undefined) ? call.breakdown.agent : cost;
                if (call.vapiAccount === 'owners') ownersCallsCount++;
                else normalCallsCount++;
            }

            // Completion Logic (Consistent with Analytics Page)
            const isCompleted = 
                vStatus.includes("assistant-ended-call") || vStatus.includes("customer-ended-call");

            if (isCompleted || status === 'answered') {
                successCount++;
                if (isCompleted) completed++;
            }

            totalDuration += duration;
            totalCost += cost;

            if (startedAtDate) {
                const dayKey = format(startedAtDate, 'yyyy-MM-dd');
                const displayKey = format(startedAtDate, 'MMM dd');
                if (!dayMap.has(dayKey)) dayMap.set(dayKey, { count: 0, display: displayKey });
                dayMap.get(dayKey).count++;

                const hour = getHours(startedAtDate);
                hourMap[hour]++;
            }
        });

        const totalCalls = filteredCalls.length;
        const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
        const avgCost = totalCalls > 0 ? totalCost / totalCalls : 0;
        const successRate = totalCalls > 0 ? (successCount / totalCalls) * 100 : 0;

        setStats(prev => ({
            ...prev,
            totalCalls,
            totalDuration,
            avgDuration,
            totalCost,
            avgCost,
            successRate,
            completedCalls: completed,
            lifetimeCostVapi: (voiceBalance?.vapi?.used !== undefined && voiceBalance?.vapi?.used !== 0) ? voiceBalance.vapi.used : lifetimeCostVapiSum,
            normalCalls: normalCallsCount,
            ownersCalls: ownersCallsCount,
        }));

        const dailyData = Array.from(dayMap.entries())
            .map(([dayKey, data]) => ({ dayKey, name: data.display, calls: data.count }))
            .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

        setDailyVolume(dailyData);

        const hourlyData = hourMap.map((calls, hour) => ({
            name: `${hour.toString().padStart(2, '0')}:00`,
            calls
        })).filter((_, i) => i % 3 === 0);

        setHourlyDistribution(hourlyData);
    }, [globalCalls, dateRange, providerFilter, loading]);

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
                        onClick={() => refreshCalls({
                            from: dateRange?.from,
                            to: dateRange?.to,
                            provider: 'vapi',
                            force: true
                        })}
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
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2">
                        <div className="p-1.5 bg-blue-100 rounded-lg">
                            <Phone className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Normal Calls</p>
                            <p className="text-xl font-bold text-blue-700">{stats.normalCalls.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
                        <div className="p-1.5 bg-amber-100 rounded-lg">
                            <Crown className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Owner Leads</p>
                            <p className="text-xl font-bold text-amber-700">{stats.ownersCalls.toLocaleString()}</p>
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

