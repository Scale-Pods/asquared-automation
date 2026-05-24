"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Clock, DollarSign, CheckCircle, PhoneIncoming, Crown } from "lucide-react";
import { calculateDuration, formatDuration } from "@/lib/utils";
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
    AreaChart,
    Area,
} from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { useData } from "@/context/DataContext";

export default function VoiceAnalyticsPage() {
    const { calls: globalCalls, loadingCalls, voiceBalance, leads: globalLeads, loadingLeads, refreshCalls, ownerLeads, allTimeVoiceCount, allTimeOwnerVoiceCount, waitingAvailabilityCount } = useData();
    const [statusFilter, setStatusFilter] = useState("all");
    // accountFilter: 'vapi' | 'vapi-owners' | 'vapi-normal' | 'elevenlabs'
    const [accountFilter, setAccountFilter] = useState("vapi");
    const [calls, setCalls] = useState<any[]>([]);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const loading = loadingLocal || loadingCalls;
    const [dateRange, setDateRange] = useState<any>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });

    // Processed Data States
    const [volumeData, setVolumeData] = useState<any[]>([]);
    const [durationData, setDurationData] = useState<any[]>([]);
    const [costData, setCostData] = useState<any[]>([]);
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
        positiveRate: 0,
        positiveCount: 0,
        qualifiedCount: 0,
        connectedCount: 0,
        normalCalls: 0,
        ownersCalls: 0,
        ownerPickupRate: 0,
        ownerCompletionRate: 0,
        ownerPositiveRate: 0,
        ownerPositiveCount: 0,
    });

    useEffect(() => {
        if (voiceBalance) {
            setStats(prev => ({
                ...prev,
                vapiBalance: voiceBalance.vapi?.balance || 0
            }));
        }
    }, [voiceBalance]);

    // Server-side refresh when filters/date change
    useEffect(() => {
        if (!dateRange?.from) return;
        refreshCalls({
            from: dateRange.from,
            to: dateRange.to || dateRange.from,
            provider: 'vapi'
        });
    }, [dateRange, accountFilter, refreshCalls]);

    useEffect(() => {
        // Show data instantly if it exists in the global cache from the master dashboard
        if (globalCalls.length === 0 && loadingCalls) return;

        // Apply account/provider filter
        const filteredCalls = globalCalls.filter((call: any) => {
            if (accountFilter === 'vapi') return call.source === 'vapi';
            if (accountFilter === 'vapi-normal') return call.source === 'vapi' && call.vapiAccount === 'normal';
            if (accountFilter === 'vapi-owners') return call.source === 'vapi' && call.vapiAccount === 'owners';
            return true;
        });

        setCalls(filteredCalls);
        processAnalytics(filteredCalls);
    }, [globalCalls, loadingCalls, globalLeads, loadingLeads, accountFilter]);

    const parseLeadDate = (val: any): Date | null => {
        if (!val || typeof val !== 'string' || val.toLowerCase() === 'no' || val.toLowerCase() === 'yes') return null;
        try {
            // Handle various formats: '2026-05-04 05:39...' or ISO strings
            const sanitized = val.trim().replace(/\s+/, 'T');
            const d = new Date(sanitized);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) {
            return null;
        }
    };

    const processAnalytics = (data: any[]) => {
        const totalCalls = data.length;
        let totalDuration = 0;
        let totalCredits = 0;
        let successCount = 0;
        let normalConnectedCount = 0;
        let normalQualifiedCount = 0;
        let ownerConnectedCount = 0;
        let ownerQualifiedCount = 0;
        let ownerPositiveCount = 0;

        const dayMap = new Map();
        const durationBuckets = { '0-30s': 0, '30s-1m': 0, '1m-2m': 0, '2m-5m': 0, '5m+': 0 };
        const typesMap = new Map();

        let inboundSum = 0;
        let outboundSum = 0;
        let connectedCount = 0;
        let qualifiedCount = 0;
        
        let normalCallsInRange = 0;
        let ownersCallsInRange = 0;

        const from = dateRange?.from ? new Date(dateRange.from).setHours(0,0,0,0) : 0;
        const to = dateRange?.to ? new Date(dateRange.to).setHours(23,59,59,999) : Date.now();

        // Calculate Positive Counts from Owner Leads (as this data isn't in call logs)
        ownerLeads.forEach((o: any) => {
            const v1 = parseLeadDate(o.Voice_1);
            const v2 = parseLeadDate(o.Voice_2);
            const status = String(o["call Lead Status"] || "").toLowerCase();
            const isPositive = status.includes("expression of interest") || status.includes("callback");

            [v1, v2].forEach(d => {
                if (d && d.getTime() >= from && d.getTime() <= to) {
                    if (isPositive) ownerPositiveCount++;
                }
            });
        });

        // Lifetime calculations (all global calls)
        let lifetimeVapiUsedSum = 0;
        globalCalls.forEach(call => {
            let cost = 0;
            if (typeof call.cost === 'string') cost = parseFloat(call.cost.replace(/[^\d.]/g, '')) || 0;
            else if (typeof call.cost === 'number') cost = call.cost;
            if (call.source === 'vapi') lifetimeVapiUsedSum += (call.breakdown?.agent !== undefined) ? call.breakdown.agent : cost;
        });

        // Funnel and Chart calculation inside the main data loop to ensure numerators and denominators are synced
        data.forEach(call => {
            const dateStr = call.startedAt || null;
            const time = dateStr ? format(new Date(dateStr), 'MMM dd') : 'N/A';
            const dur = call.durationSeconds || 0;
            const isOwner = call.vapiAccount === 'owners';
            const isNormal = call.vapiAccount === 'normal' || !call.vapiAccount;

            if (isOwner) ownersCallsInRange++;
            else if (isNormal) normalCallsInRange++;

            let cost = 0;
            if (typeof call.cost === 'string') cost = parseFloat(call.cost.replace(/[^\d.]/g, '')) || 0;
            else if (typeof call.cost === 'number') cost = call.cost;

            if (call.status === 'done' || call.status === 'ended' || call.status === 'completed' || call.status === 'success' || call.status === 'answered') {
                successCount++;
            }

            totalDuration += dur;
            totalCredits += cost;

            const raw = call.raw || call;
            const directionProp = (raw.telephony?.direction || raw.direction || "").toLowerCase();
            const isInbound = call.isInbound === true || directionProp.includes('inbound') || directionProp.includes('incoming');
            const isWebCall = (typeof call.type === 'string' && call.type.toLowerCase() === 'web call') || (call.phone === 'Website/API');

            if (isInbound) inboundSum += dur;
            else outboundSum += dur;

            const typeLabel = isInbound ? 'Inbound' : (isWebCall ? 'Web Call' : 'Outbound');
            typesMap.set(typeLabel, (typesMap.get(typeLabel) || 0) + 1);

            const dayObj = dayMap.get(time) || { calls: 0, credits: 0 };
            dayMap.set(time, { calls: dayObj.calls + 1, credits: dayObj.credits + cost });

            if (dur < 30) durationBuckets['0-30s']++;
            else if (dur < 60) durationBuckets['30s-1m']++;
            else if (dur < 120) durationBuckets['1m-2m']++;
            else if (dur < 300) durationBuckets['2m-5m']++;
            else durationBuckets['5m+']++;

            const isConnected = (call.status === 'answered' || call.status === 'done' || call.status === 'completed') && dur > 0;

            if (isConnected) {
                const vStatus = (call.vapiStatus || "").toLowerCase();
                const status = (call.status || "").toLowerCase();
                const isCompleted =
                    vStatus.includes("assistant-ended-call") || vStatus.includes("customer-ended-call");

                if (isOwner) {
                    ownerConnectedCount++;
                    if (isCompleted) ownerQualifiedCount++;
                } else if (isNormal) {
                    normalConnectedCount++;
                    if (isCompleted) normalQualifiedCount++;
                }
            }
        });

        setStats(prev => ({
            ...prev,
            totalCalls,
            avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
            totalCost: totalCredits,
            successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0,
            typesData: Array.from(typesMap.entries()) as any,
            inboundDuration: inboundSum,
            outboundDuration: outboundSum,
            lifetimeVapiUsed: (voiceBalance?.vapi?.used !== undefined && voiceBalance?.vapi?.used !== 0) ? voiceBalance.vapi.used : lifetimeVapiUsedSum,
            pickupRate: normalCallsInRange > 0 ? (normalConnectedCount / normalCallsInRange) * 100 : 0,
            completionRate: normalCallsInRange > 0 ? (normalQualifiedCount / normalCallsInRange) * 100 : 0,
            qualifiedCount,
            connectedCount,
            normalCalls: normalCallsInRange,
            ownersCalls: ownersCallsInRange,
            ownerPickupRate: ownersCallsInRange > 0 ? (ownerConnectedCount / ownersCallsInRange) * 100 : 0,
            ownerCompletionRate: ownersCallsInRange > 0 ? (ownerQualifiedCount / ownersCallsInRange) * 100 : 0,
            ownerPositiveRate: ownersCallsInRange > 0 ? (ownerPositiveCount / ownersCallsInRange) * 100 : 0,
            ownerPositiveCount,
        }));

        const sortedDays = Array.from(dayMap.entries()).sort((a, b) => {
            const dateA = new Date(`${a[0]} ${new Date().getFullYear()}`).getTime();
            const dateB = new Date(`${b[0]} ${new Date().getFullYear()}`).getTime();
            return dateA - dateB;
        });

        setVolumeData(sortedDays.map(([name, obj]) => ({ name, value: obj.calls })));
        setDurationData(Object.entries(durationBuckets).map(([name, value]) => ({ name, value })));
        setCostData(sortedDays.map(([name, obj]) => ({ name, value: obj.credits })));
    };

    return (
        <div className="space-y-8 pb-10 relative min-h-[500px]">
            {loading && <ASLoader />}

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
                            <SelectItem value="vapi-owners">Owner Leads</SelectItem>
                            <SelectItem value="vapi-normal">Normal Calls</SelectItem>
                        </SelectContent>
                    </Select>
                    <DateRangePicker onUpdate={(values) => setDateRange(values.range)} />
                </div>
            </div>


            {/* Key Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard title="Total Normal Calls" value={allTimeVoiceCount.toLocaleString()} change="All Time" icon={<Phone className="h-5 w-5" />} color="text-blue-600" bg="bg-blue-50" />
                <StatCard title="Total Owner Calls" value={allTimeOwnerVoiceCount.toLocaleString()} change="All Time" icon={<Crown className="h-5 w-5" />} color="text-amber-600" bg="bg-amber-50" />
            </div>

            {/* AI Voice Call Funnel */}
            <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-blue-600 rounded-lg"><PhoneIncoming className="h-4 w-4 text-white" /></span>
                    Normal Calls Analytics 
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard
                        title="Calls in Range"
                        value={stats.normalCalls.toLocaleString()}
                        change="Selected Dates"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-blue-600"
                        bg="bg-blue-50"
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
                </div>
            </div>
            {/* Owner Data Analytics */}
            <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="p-1.5 bg-amber-600 rounded-lg"><Crown className="h-4 w-4 text-white" /></span>
                    Owner Data Analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="Calls in Range"
                        value={stats.ownersCalls.toLocaleString()}
                        change="Selected Dates"
                        icon={<Crown className="h-5 w-5" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
                    />
                    <StatCard
                        title="Call Pick-up Rate"
                        value={`${stats.ownerPickupRate.toFixed(1)}%`}
                        change="Picked & duration > 18 sec"
                        icon={<Phone className="h-5 w-5" />}
                        color="text-amber-600"
                        bg="bg-amber-50"
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
                        value={`${stats.ownersCalls > 0 ? ((waitingAvailabilityCount / stats.ownersCalls) * 100).toFixed(1) : 0}%`}
                        change={`${waitingAvailabilityCount.toLocaleString()} / ${stats.ownersCalls.toLocaleString()} calls`}
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

