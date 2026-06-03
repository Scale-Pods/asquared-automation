"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, CheckCircle, PhoneIncoming, Crown } from "lucide-react";
import { ASLoader } from "@/components/as-loader";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
} from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { subDays } from "date-fns";
import { useData } from "@/context/DataContext";

export default function VoiceAnalyticsPage() {
    const { voiceBalance } = useData();
    const [accountFilter, setAccountFilter] = useState("vapi");
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });

    const [volumeData, setVolumeData] = useState<any[]>([]);
    const [durationData, setDurationData] = useState<any[]>([]);
    const [_costData, setCostData] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalCalls: 0,
        avgDuration: 0,
        totalCost: 0,
        successRate: 0,
        typesData: [],
        vapiBalance: 0,
        inboundDuration: 0,
        outboundDuration: 0,
        pickupRate: 0,
        completionRate: 0,
        secondaryCalls: 0,
        unknownCalls: 0,
        ownersCalls: 0,
        unknownPickupRate: 0,
        unknownCompletionRate: 0,
        ownerPickupRate: 0,
        ownerCompletionRate: 0,
        waitingAvailabilityCount: 0,
        ownerWaitingAvailabilityCount: 0,
        secondaryHotQualified: 0,
        secondaryForecastReady: 0,
        unknownHotQualified: 0,
        unknownForecastReady: 0,
    });

    useEffect(() => {
        if (voiceBalance) {
            setStats(prev => ({ ...prev, vapiBalance: voiceBalance.vapi?.balance || 0 }));
        }
    }, [voiceBalance]);

    useEffect(() => {
        if (!dateRange?.from) return;
        setLoadingLocal(true);

        const q = new URLSearchParams({
            from: new Date(dateRange.from).toISOString(),
            to: new Date(dateRange.to || dateRange.from).toISOString(),
            account: accountFilter === 'vapi' ? 'all' : accountFilter
        });

        fetch(`/api/calls/stats?${q}`)
            .then(r => r.ok ? r.json() : Promise.reject("Fetch failed"))
            .then(data => {
                setStats(prev => ({
                    ...prev,
                    totalCalls: data.totalCalls,
                    avgDuration: data.avgDuration,
                    totalCost: data.totalCost,
                    successRate: data.successRate,
                    typesData: data.typesData || [],
                    inboundDuration: data.inboundDuration,
                    outboundDuration: data.outboundDuration,
                    pickupRate: data.pickupRate,
                    completionRate: data.completionRate,
                    secondaryCalls: data.secondaryCalls,
                    unknownCalls: data.unknownCalls,
                    ownersCalls: data.ownersCalls,
                    unknownPickupRate: data.unknownPickupRate,
                    unknownCompletionRate: data.unknownCompletionRate,
                    ownerPickupRate: data.ownerPickupRate,
                    ownerCompletionRate: data.ownerCompletionRate,
                    waitingAvailabilityCount: data.waitingAvailabilityCount,
                    ownerWaitingAvailabilityCount: data.ownerWaitingAvailabilityCount,
                    secondaryHotQualified: data.secondaryHotQualified ?? 0,
                    secondaryForecastReady: data.secondaryForecastReady ?? 0,
                    unknownHotQualified: data.unknownHotQualified ?? 0,
                    unknownForecastReady: data.unknownForecastReady ?? 0,
                }));
                setVolumeData(data.volumeData || []);
                setDurationData(data.durationData || []);
                setCostData(data.costData || []);
            })
            .catch(err => console.error("Call stats fetch error:", err))
            .finally(() => setLoadingLocal(false));
    }, [dateRange, accountFilter]);

    return (
        <div className="space-y-8 pb-10 relative min-h-[500px]">
            {loadingLocal && <ASLoader />}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Voice Analytics</h1>
                    <p className="text-slate-500">Comprehensive insights across all voice accounts.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={accountFilter} onValueChange={setAccountFilter}>
                        <SelectTrigger className="w-[190px] h-10">
                            <SelectValue placeholder="Account / Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="vapi">All Vapi Calls</SelectItem>
                            <SelectItem value="secondary">Secondary Leads</SelectItem>
                            <SelectItem value="unknown">Unknown Leads</SelectItem>
                            <SelectItem value="owners">Owner Leads</SelectItem>
                        </SelectContent>
                    </Select>
                    <DateRangePicker onUpdate={(values) => setDateRange(values.range)} />
                </div>
            </div>


            {/* Secondary Leads Analytics */}
            <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 rounded-lg"><PhoneIncoming className="h-4 w-4 text-white" /></span>
                    Secondary Leads Analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="Calls in Range"
                        value={stats.secondaryCalls.toLocaleString()}
                        change="Selected Dates"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-indigo-600"
                        bg="bg-indigo-50"
                    />
                    <StatCard
                        title="Call Pick-up Rate"
                        value={`${stats.pickupRate.toFixed(1)}%`}
                        change="Picked & duration > 18 sec"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-indigo-600"
                        bg="bg-indigo-50"
                    />
                    <StatCard
                        title="Call Completion Rate"
                        value={`${stats.completionRate.toFixed(1)}%`}
                        change="Completed Conversation"
                        icon={<CheckCircle className="h-5 w-5" />}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                    />
                    <SentimentCard
                        hotQualified={stats.secondaryHotQualified}
                        forecastReady={stats.secondaryForecastReady}
                        totalCalls={stats.secondaryCalls}
                    />
                </div>
            </div>
            {/* Unknown Leads Analytics */}
            <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-amber-600 rounded-lg"><Crown className="h-4 w-4 text-white" /></span>
                    Unknown Leads Analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="Calls in Range"
                        value={stats.unknownCalls.toLocaleString()}
                        change="Selected Dates"
                        icon={<Crown className="h-5 w-5" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
                    />
                    <StatCard
                        title="Call Pick-up Rate"
                        value={`${stats.unknownPickupRate.toFixed(1)}%`}
                        change="Picked & duration > 18 sec"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
                    />
                    <StatCard
                        title="Call Completion Rate"
                        value={`${stats.unknownCompletionRate.toFixed(1)}%`}
                        change="Completed Conversation"
                        icon={<CheckCircle className="h-5 w-5" />}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                    />
                    <SentimentCard
                        hotQualified={stats.unknownHotQualified}
                        forecastReady={stats.unknownForecastReady}
                        totalCalls={stats.unknownCalls}
                    />
                </div>
            </div>

            {/* Owner Leads Analytics */}
            <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-blue-600 rounded-lg"><Crown className="h-4 w-4 text-white" /></span>
                    Owner Leads Analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="Calls in Range"
                        value={stats.ownersCalls.toLocaleString()}
                        change="Selected Dates"
                        icon={<Crown className="h-5 w-5" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
                    />
                    <StatCard
                        title="Call Pick-up Rate"
                        value={`${stats.ownerPickupRate.toFixed(1)}%`}
                        change="Picked & duration > 18 sec"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
                    />
                    <StatCard
                        title="Call Completion Rate"
                        value={`${stats.ownerCompletionRate.toFixed(1)}%`}
                        change="Completed Conversation"
                        icon={<CheckCircle className="h-5 w-5" />}
                        color="text-emerald-600"
                        bg="bg-emerald-50"
                    />
                    <StatCard
                        title="Awaiting Availability"
                        value={`${stats.ownersCalls > 0 ? ((stats.ownerWaitingAvailabilityCount / stats.ownersCalls) * 100).toFixed(1) : 0}%`}
                        change={`${stats.ownerWaitingAvailabilityCount.toLocaleString()} / ${stats.ownersCalls.toLocaleString()} calls`}
                        icon={<CheckCircle className="h-5 w-5" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
                    />
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg">Call Volume-Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={volumeData.length ? volumeData : [{ name: 'No data', value: 0 }]}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg">Duration Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={durationData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function SentimentCard({ hotQualified, forecastReady, totalCalls }: { hotQualified: number; forecastReady: number; totalCalls: number }) {
    const total = hotQualified + forecastReady;
    const rate = totalCalls > 0 ? ((total / totalCalls) * 100).toFixed(1) : '0.0';
    const hotRate = totalCalls > 0 ? ((hotQualified / totalCalls) * 100).toFixed(1) : '0.0';
    const forecastRate = totalCalls > 0 ? ((forecastReady / totalCalls) * 100).toFixed(1) : '0.0';
    return (
        <Card className="border-slate-200">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Positive Response Rate</p>
                    <span className="text-lg font-bold text-emerald-600">{rate}%</span>
                </div>
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Hot / Qualified</span>
                        <div className="text-right">
                            <span className="text-sm font-bold text-slate-900">{hotQualified.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 ml-1.5">({hotRate}%)</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Forecast / Ready To Buy</span>
                        <div className="text-right">
                            <span className="text-sm font-bold text-slate-900">{forecastReady.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 ml-1.5">({forecastRate}%)</span>
                        </div>
                    </div>
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                        <span className="text-sm font-bold text-slate-700">{total.toLocaleString()}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatCard({ title, value, change, icon, color, bg, isNegative }: any) {
    return (
        <Card className="border-slate-200">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{title}</p>
                        <h3 className="text-2xl font-bold text-slate-950 mt-1">{value}</h3>
                        <span className={`text-xs font-bold ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {change} {isNegative ? '↓' : '↑'}
                        </span>
                    </div>
                    {icon && <div className={`p-4 rounded-2xl ${bg} ${color}`}>{icon}</div>}
                </div>
            </CardContent>
        </Card>
    );
}

