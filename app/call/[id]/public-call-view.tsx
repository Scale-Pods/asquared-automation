"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, Clock, Calendar, ArrowRight, User, FileText, Copy, Check } from "lucide-react";
import Image from "next/image";
import { ModernAudioPlayer } from "@/components/voice/call-details-modal";

const ASSISTANT_MAP: Record<string, string> = {
    '70f05e16-18f3-4f6e-964a-f47b299c6c1d': 'Asquared (UAE - 150)',
    'd91ba874-2522-4d62-adf6-681f2a0bf4fe': 'Asquared (UAE - 150)',
    '4a7e7a31-0bbc-4fde-831e-2489119ee226': 'Asquared (US - 439)',
    'e66fe46b-9fe2-4628-a32b-08ced680bc04': 'Asquared (UAE - 291)',
    '4baf3613-ba3d-4860-9ea1-62156686b6f1': 'Asquared (UK - 309)',
    '66dff692-d2a5-47d4-bbe0-245509dc7404': 'Asquared (US - 151)',
    'b35e3032-7865-4913-ba22-a913b5d4117b': 'US AI Bot',
    '918c25eb-9882-452e-86df-b4851d464852': 'UK AI Bot',
    '9ac979c3-a0b3-4af6-bb0d-07ddf9c0d1cd': 'UK AI Bot 2',
    '560ca61b-8cd3-4b5f-996b-2966abfa37fd': 'Secondary Leads Bot',
    '1ef6ea66-0a75-45f5-b025-1743e048dc90': 'Open House Bot',
};

function getMessages(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data.transcript) && data.transcript.length > 0) return data.transcript;
    if (Array.isArray(data.messages)) return data.messages;
    if (data.analysis && Array.isArray(data.analysis.transcript)) return data.analysis.transcript;
    if (typeof data.transcript === 'string' && data.transcript.trim()) {
        const parts = data.transcript.split(/(?=(?:AI|User|Assistant|Agent|Bot|Guest|Customer|Caller|System):)/i);
        if (parts.length > 1) {
            return parts.filter(Boolean).map((part: string) => {
                const m = part.trim().match(/^(AI|User|Assistant|Agent|Bot|Guest|Customer|Caller|System):\s*([\s\S]*)/i);
                if (!m) return { role: 'assistant', message: part.trim() };
                const roleLabel = m[1].toLowerCase();
                return {
                    role: (roleLabel === 'ai' || roleLabel === 'assistant' || roleLabel === 'agent' || roleLabel === 'bot') ? 'assistant' : 'user',
                    message: m[2].trim(),
                };
            });
        }
        return [{ role: 'assistant', message: data.transcript }];
    }
    return [];
}

function getDurationDisplay(data: any): { formatted: string; seconds: number } {
    let seconds = 0;
    if (typeof data.durationSeconds === 'number' && data.durationSeconds > 0) seconds = data.durationSeconds;
    else if (typeof data.call_duration_secs === 'number') seconds = data.call_duration_secs;
    else if (data.endedAt && data.startedAt) {
        seconds = (new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime()) / 1000;
    }
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(Math.max(0, seconds % 60));
    return { formatted: `${min}m ${sec}s`, seconds };
}

function MessageBubble({ role, message }: { role: string; message: string }) {
    const isAssistant = role === 'assistant' || role === 'agent' || role === 'bot' || role === 'model';
    let cleanText = (message || '').trim();
    cleanText = cleanText.replace(/^(AI|User|Assistant|Agent|Bot|Guest|Customer|Caller|System):\s*/i, '').trim();
    if (!cleanText) return null;
    return (
        <div className={`flex gap-3 mb-4 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
            {isAssistant && (
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200 shadow-sm">
                    <span className="text-[10px] font-black text-indigo-700">AI</span>
                </div>
            )}
            <div className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} max-w-[85%]`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${isAssistant
                    ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                    : 'bg-blue-600 text-white rounded-tr-none'
                }`}>
                    {cleanText}
                </div>
            </div>
            {!isAssistant && (
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200 shadow-sm">
                    <User className="h-4 w-4 text-blue-600" />
                </div>
            )}
        </div>
    );
}

export default function PublicCallView({ callId }: { callId: string }) {
    const [call, setCall] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetch(`/api/calls/${callId}`)
            .then(res => {
                if (!res.ok) { setNotFound(true); return null; }
                return res.json();
            })
            .then(data => {
                if (data) setCall(data);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [callId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                    <p className="text-sm text-slate-500 font-medium">Loading call details...</p>
                </div>
            </div>
        );
    }

    if (notFound || !call) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center space-y-2">
                    <p className="text-lg font-bold text-slate-700">Call not found</p>
                    <p className="text-sm text-slate-500">This shared link may be invalid or expired.</p>
                </div>
            </div>
        );
    }

    const messages = getMessages(call).filter((m: any) => m.role !== 'system');
    const { formatted: durationDisplay, seconds: durationSeconds } = getDurationDisplay(call);
    const assistantId = call.assistantId || call.assistant_id || "N/A";
    const assistantName = call.agent_name || ASSISTANT_MAP[assistantId] || (assistantId !== "N/A" ? `Agent: ${assistantId.substring(0, 8)}...` : "AI Assistant");
    const assistantNumber = call.phoneNumber || call.fromNumber || "Unknown";
    const guestNumber = call.customer_number || call.phone || "Unknown";
    const rawType = call.type || "unknown";
    const isInbound = rawType === 'inbound' || rawType?.toLowerCase?.().includes('inbound');
    const guestName = (call.name && call.name !== "Guest" && call.name !== "Unknown") ? call.name : "Guest";
    const audioUrl = call.audio_url || call.recordingUrl || call.recording_url || null;
    const startedAtDisplay = call.startedAt ? new Date(call.startedAt).toLocaleString() : 'N/A';

    const fromName = isInbound ? guestName : assistantName;
    const fromSubInfo = isInbound ? guestNumber : assistantNumber;
    const fromLabel = isInbound ? "From (Customer)" : "From (Assistant)";
    const toName = isInbound ? assistantName : guestName;
    const toSubInfo = isInbound ? assistantNumber : guestNumber;
    const toLabel = isInbound ? "To (Assistant)" : "To (Customer)";

    const analysis = call.analysis || {};
    const summaryText: string = call.callSummary || analysis.summary || call.summary || "";

    const handleCopyTranscript = () => {
        const text = messages.map((m: any) => {
            const role = (m.role === 'assistant' || m.role === 'agent') ? 'AI' : 'User';
            return `${role}: ${m.message || m.content || ''}`;
        }).join('\n\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Minimal branded header */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
                <div className="relative w-32 h-9">
                    <Image src="/ASquared Logo White-01.png" alt="Asquared" fill className="object-contain invert" priority />
                </div>
                <div className="h-5 w-[1px] bg-slate-200" />
                <span className="text-xs text-slate-500 font-medium">Shared Call Details</span>
            </header>

            <main className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Card header */}
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h1 className="text-xl font-semibold text-slate-900">Call Details</h1>
                        <span className="text-xs text-slate-400 font-mono">{callId.substring(0, 16)}...</span>
                    </div>

                    {/* Overview grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-slate-50/50 border-b border-slate-100">
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Status</p>
                                <Badge className={`${call.status === 'done' || call.status === 'ended' || call.status === 'success' || call.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} border-none shadow-none uppercase text-[10px] px-2.5 py-0.5`}>
                                    {call.status || 'Unknown'}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Type</p>
                                <Badge variant="outline" className="border-slate-300 text-slate-600 uppercase text-[10px] px-2.5 py-0.5">
                                    {isInbound ? "Inbound" : "Outbound"}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Agent / Bot</p>
                                <span className="font-bold text-slate-900 text-sm block truncate max-w-[150px]">{assistantName}</span>
                                {assistantNumber !== "Unknown" && (
                                    <span className="text-[10px] text-slate-500 font-bold mt-0.5 tracking-wider block">+{assistantNumber.replace(/\+/g, '')}</span>
                                )}
                            </div>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Duration</p>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    <span className="font-bold text-slate-900">{durationDisplay}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Date & Time</p>
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <span className="text-sm text-slate-700">{startedAtDisplay}</span>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Guest Name</p>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span className="font-bold text-slate-900">{guestName}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Call direction */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Call Information</h3>
                            <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm">
                                <div className="flex justify-between items-center mb-3 px-2">
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">{fromLabel}</p>
                                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">{toLabel}</p>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${fromLabel.includes('Assistant') ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {fromLabel.includes('Assistant') ? <Avatar><AvatarFallback>AI</AvatarFallback></Avatar> : <Phone className="h-5 w-5" />}
                                        </div>
                                        <div className="flex-1 font-semibold text-slate-900 border border-slate-200 bg-slate-50/50 rounded-lg px-4 py-3">
                                            <span className="block text-sm">{fromName}</span>
                                            {fromSubInfo !== "Unknown" && (
                                                <span className="block text-xs font-normal text-slate-500 mt-0.5">+{fromSubInfo.replace(/\+/g, '')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center px-4 shrink-0">
                                        <span className="text-[10px] uppercase font-bold text-blue-600 tracking-widest mb-2">{isInbound ? "INBOUND" : "OUTBOUND"}</span>
                                        <div className="h-0.5 w-20 bg-blue-200 relative">
                                            <ArrowRight className="w-4 h-4 text-blue-600 absolute -right-1.5 -top-[7px]" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="flex-1 font-semibold text-slate-900 border border-slate-200 bg-slate-50/50 rounded-lg px-4 py-3 text-right">
                                            <span className="block text-sm">{toName}</span>
                                            {toSubInfo !== "Unknown" && (
                                                <span className="block text-xs font-normal text-slate-500 mt-0.5">+{toSubInfo.replace(/\+/g, '')}</span>
                                            )}
                                        </div>
                                        <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${toLabel.includes('Assistant') ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {toLabel.includes('Assistant') ? <Avatar><AvatarFallback>AI</AvatarFallback></Avatar> : <Phone className="h-5 w-5" />}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Audio player */}
                            {audioUrl && (
                                <div className="mt-4">
                                    <ModernAudioPlayer audioUrl={audioUrl} initialDuration={durationSeconds} />
                                </div>
                            )}
                        </div>

                        {/* Summary */}
                        {summaryText && (
                            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                                        <FileText className="h-4 w-4 text-white" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Conversation Summary</h3>
                                </div>
                                <div className="space-y-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    {summaryText}
                                </div>
                            </div>
                        )}

                        {/* Transcript */}
                        {messages.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Transcript</h3>
                                    <button
                                        onClick={handleCopyTranscript}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200"
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 max-h-[500px] overflow-y-auto">
                                    {messages.map((msg: any, i: number) => (
                                        <MessageBubble key={i} role={msg.role} message={msg.message || msg.content || msg.text || ''} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Powered by <span className="font-semibold text-slate-500">Asquared</span> · ScalePods
                </p>
            </main>
        </div>
    );
}
