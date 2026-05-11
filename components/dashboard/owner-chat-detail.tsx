"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    RefreshCw,
    MessageSquare,
    User,
    Bot,
    Link as LinkIcon,
    Check
} from "lucide-react";

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
        // Use ID for stable routing, fallback to phone
        const phone = owner.contactNo || owner.Phone || owner.phone || "";
        const shareId = owner.id || phone;
        const shareUrl = `${baseUrl}/dashboard/whatsapp/chat/${encodeURIComponent(shareId)}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(err => {
                console.error("Failed to copy link:", err);
            });
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = shareUrl;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error("Fallback copy failed:", err);
            }
            document.body.removeChild(textArea);
        }
    };

    useEffect(() => {
        if (!owner) return;

        const timeline: any[] = [];
        let seq = 1;

        const parseOwnerMsg = (raw: any, label: string, type: 'bot' | 'user', sequence: number) => {
            if (!raw || !String(raw).trim()) return null;
            const content = String(raw).trim();

            // Check for ISO timestamps
            const isoRegex = /\n{1,2}(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.+)$/;
            const isoMatch = content.match(isoRegex);
            if (isoMatch) {
                return {
                    type,
                    content: content.replace(isoRegex, '').trim(),
                    label,
                    date: isoMatch[1],
                    sequence
                };
            }

            // Check for "YYYY-MM-DD HH:MM:SS" on the last line
            const lines = content.split('\n');
            const lastLine = lines[lines.length - 1].trim();
            const spaceDateRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
            if (lines.length > 1 && spaceDateRegex.test(lastLine)) {
                const d = new Date(lastLine.replace(' ', 'T'));
                if (!isNaN(d.getTime())) {
                    return {
                        type,
                        content: lines.slice(0, -1).join('\n').trim() || 'Message Received',
                        label,
                        date: d.toISOString(),
                        sequence
                    };
                }
            }

            return { type, content, label, date: null, sequence };
        };

        // Flow: Whatsapp_1 (bot) → User_Replied_1 → Bot_Replied_1 → User_Replied_2 → Bot_Replied_2 ...

        // 1. Initial outreach from bot
        const wp1 = owner["Whatsapp_1"];
        const wp1Msg = parseOwnerMsg(wp1, "Whatsapp_1", "bot", seq++);
        if (wp1Msg) {
            // Attach status
            (wp1Msg as any).tsStatus = owner["Whatsapp_1_status"] || null;
            // If no date in content, use the Whatsapp_1_Date column
            if (!wp1Msg.date && owner["Whatsapp_1_Date"]) {
                const d = new Date(owner["Whatsapp_1_Date"]);
                if (!isNaN(d.getTime())) wp1Msg.date = d.toISOString();
            }
            timeline.push(wp1Msg);
        }

        // 1b. Check for retry_1
        const retry1 = owner["retry_1"];
        const retry1Msg = parseOwnerMsg(retry1, "Retry 1", "bot", seq++);
        if (retry1Msg) {
            timeline.push(retry1Msg);
        }

        // 2. Paired rounds: User_Replied_i then Bot_Replied_i (up to 5)
        for (let i = 1; i <= 5; i++) {
            const userReply = owner[`User_Replied_${i}`];
            const userMsg = parseOwnerMsg(userReply, `User_Replied_${i}`, "user", seq++);
            if (userMsg) timeline.push(userMsg);

            const botReply = owner[`Bot_Replied_${i}`];
            const botMsg = parseOwnerMsg(botReply, `Bot_Replied_${i}`, "bot", seq++);
            if (botMsg) {
                (botMsg as any).tsStatus = owner[`Bot_Replied_Status_${i}`] || null;
                timeline.push(botMsg);
            }
        }

        setMessages(timeline);
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

    return (
        <div className="space-y-6 flex flex-col h-full overflow-hidden max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">{owner.Name || owner.name || "Owner"}</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{owner.contactNo || owner.Phone || owner.phone || "—"}</span>
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
                                if (msg.type === 'bot' && (msg as any).tsStatus) {
                                    const raw = String((msg as any).tsStatus);
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
                                    <p className="font-medium text-slate-900 mt-1">{owner.contactNo || owner.Phone || owner.phone || "—"}</p>
                                    
                                </div>
                               
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Source Table</span>
                                    <p className="font-bold text-amber-600 mt-1 text-xs">owner_data</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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
