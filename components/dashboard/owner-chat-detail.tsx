"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    MessageSquare,
    User,
    Bot,
    Link as LinkIcon,
    Check,
    Mic,
} from "lucide-react";
import { buildOwnerTimeline } from "@/lib/master-leads-utils";

interface OwnerChatDetailProps {
    owner: any;
    onClose?: () => void;
}

export function OwnerChatDetail({ owner, onClose }: OwnerChatDetailProps) {
    const [messages, setMessages] = useState<any[]>([]);
    const [copied, setCopied] = useState(false);

    const handleCopyLink = () => {
        if (!owner) return;
        const baseUrl = window.location.origin;
        const phone = owner["Contact Number"] || owner.contactNo || owner.phone || "";
        const shareId = owner.master_leads_id ? `master-${owner.master_leads_id}` : phone;
        const shareUrl = `${baseUrl}/dashboard/whatsapp/chat/${encodeURIComponent(shareId)}`;

        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    };

    useEffect(() => {
        if (!owner) return;
        setMessages(buildOwnerTimeline(owner));
    }, [owner]);

    if (!owner) {
        return (
            <div className="h-[500px] flex flex-col items-center justify-center space-y-4 text-slate-400">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="font-medium">Owner not found</p>
                {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
            </div>
        );
    }

    const name = owner["Owner Name"] || owner.name || "Owner";
    const phone = owner["Contact Number"] || owner.contactNo || owner.phone || "—";

    return (
        <div className="space-y-6 flex flex-col h-full overflow-hidden max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">{name}</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{phone}</span>
                        <span>•</span>
                        <span className="text-amber-600 font-bold">Owner Lead</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={`gap-2 text-[10px] font-bold uppercase transition-all ${copied ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-900'}`}
                        onClick={handleCopyLink}
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Share Link'}
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden min-h-0">
                {/* Chat timeline */}
                <div className="lg:col-span-2 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden h-full min-h-0">
                    <div className="bg-slate-50/50 border-b border-slate-100 p-3 px-4 flex justify-between items-center shrink-0">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conversation Timeline</h3>
                        <div className="text-[10px] text-slate-400 font-bold">{messages.length} Messages</div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-2">
                                <MessageSquare className="h-10 w-10 opacity-20" />
                                <p className="text-sm">No WhatsApp messages found for this owner.</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => {
                                let tsPill: React.ReactNode = null;
                                if (msg.type === 'bot' && msg.tsStatus) {
                                    const raw = String(msg.tsStatus);
                                    const label = raw.split(' - ')[0].trim();
                                    const formatted = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
                                    let cls = 'bg-emerald-500/30 text-emerald-100';
                                    if (formatted.includes('Read')) cls = 'bg-blue-400/40 text-blue-100';
                                    if (formatted.includes('Failed')) cls = 'bg-red-400/40 text-red-100';
                                    if (formatted.includes('Sent')) cls = 'bg-white/20 text-emerald-50';
                                    tsPill = (
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cls}`}>
                                            {formatted}
                                        </span>
                                    );
                                }

                                return (
                                    <div key={idx} className={`flex flex-col ${msg.type === 'user' ? 'items-start' : 'items-end'}`}>
                                        <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.type === 'user'
                                            ? 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'
                                            : 'bg-amber-600 text-white rounded-tr-none'
                                            }`}>
                                            <div className="flex items-center justify-between mb-2 gap-3">
                                                <span className={`text-[10px] font-bold uppercase tracking-wide ${msg.type === 'user' ? 'text-slate-400' : 'text-amber-100'}`}>
                                                    {msg.label}
                                                </span>
                                                {tsPill}
                                            </div>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                                                {msg.content}
                                            </p>
                                        </div>
                                        {msg.date && (
                                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                                                {new Date(msg.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-1 h-full pb-4">
                    <Card className="border-slate-200 shadow-sm bg-white">
                        <CardContent className="p-4 space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <User className="h-4 w-4 text-slate-400" /> Owner Information
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Contact info</span>
                                    <p className="font-medium text-slate-900 mt-1">{phone}</p>
                                </div>
                                {owner["Location"] && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Location</span>
                                        <p className="font-medium text-slate-900 mt-1">{owner["Location"]}</p>
                                    </div>
                                )}
                                {owner["Project Name"] && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Project</span>
                                        <p className="font-medium text-slate-900 mt-1">{owner["Project Name"]}</p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Source Table</span>
                                    <p className="font-bold text-amber-600 mt-1 text-xs">master_leads</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {owner["voice_recording_url"] && (
                        <Card className="border-slate-200 shadow-sm bg-white">
                            <CardContent className="p-4 space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Mic className="h-4 w-4 text-slate-400" /> Voice Call
                                </h3>
                                {owner["voice_call_status"] && (
                                    <Badge variant="outline" className="text-[10px] uppercase text-indigo-700 border-indigo-200">
                                        {owner["voice_call_status"]}
                                    </Badge>
                                )}
                                <audio controls className="w-full h-9" src={owner["voice_recording_url"]} />
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-slate-200 shadow-sm bg-white">
                        <CardContent className="p-4 space-y-4">
                            <h3 className="text-sm font-bold text-slate-900">Activity Stats</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <StatBox label="Total Messages" value={messages.length} icon={MessageSquare} />
                                <StatBox label="Incoming" value={messages.filter(m => m.type === 'user').length} icon={User} />
                                <StatBox label="Outgoing" value={messages.filter(m => m.type === 'bot').length} icon={Bot} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatBox({ label, value, icon: Icon }: any) {
    return (
        <div className="p-2 px-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{label}</span>
            </div>
            <span className="text-sm font-bold text-slate-900">{value}</span>
        </div>
    );
}
