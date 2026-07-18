"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WhatsAppChatDetail } from "@/components/dashboard/whatsapp-chat-detail";
import { ASLoader } from "@/components/as-loader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
    const { customerId } = use(params);
    const decodedCustomerId = decodeURIComponent(customerId);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [foundType, setFoundType] = useState<"lead" | "owner" | "none" | "searching">("searching");

    useEffect(() => {
        async function findLead() {
            setLoading(true);
            setFoundType("searching");

            const searchVal = decodedCustomerId.toLowerCase().trim();
            const searchReplaced = searchVal.replace(/\D/g, '');

            const exactMatch = (item: any, fields: string[]) => {
                for (const field of fields) {
                    const val = String(item[field] || "").toLowerCase();
                    if (val === searchVal) return true;
                    const digits = val.replace(/\D/g, '');
                    if (searchReplaced && digits === searchReplaced) return true;
                }
                return false;
            };

            const isOwnerPrefix = searchVal.startsWith('master-');
            const isNormalPrefix = ['intro-', 'intro_uk-', 'follow_up-', 'follow_up_uk-', 'leads-', 'nurture_leads-', 'nurture_leads_uk-'].some(p => searchVal.startsWith(p));

            try {
                // 1. Check normal leads if not explicitly an owner ID
                if (!isOwnerPrefix) {
                    const normalRes = await fetch(`/api/whatsapp/leads?search=${encodeURIComponent(searchVal)}&pageSize=20`);
                    if (normalRes.ok) {
                        const normalData = await normalRes.json();
                        const leadFound = (normalData.leads || []).find((l: any) => exactMatch(l, ['id', 'phone']));
                        if (leadFound) {
                            setFoundType("lead");
                            setLoading(false);
                            return;
                        }
                    }
                }

                // 2. Check owner leads if not explicitly a normal lead ID — redirect to the Owners tab on Chat
                if (!isNormalPrefix) {
                    const cleanId = isOwnerPrefix ? searchVal.split('-')[1] : searchVal;
                    const ownersRes = await fetch(`/api/whatsapp/owners/${encodeURIComponent(cleanId)}`);
                    if (ownersRes.ok) {
                        const ownerData = await ownersRes.json();
                        if (ownerData && !ownerData.error) {
                            router.replace(`/dashboard/whatsapp/chat?tab=master_leads&owner=${ownerData.master_leads_id}`);
                            return;
                        }
                    }
                }

                setFoundType("none");
            } catch (err) {
                console.error("Failed to find lead", err);
                setFoundType("none");
            } finally {
                setLoading(false);
            }
        }

        findLead();
    }, [decodedCustomerId]);

    if (loading || foundType === "searching") {
        return <ASLoader />;
    }

    if (foundType === "none") {
        return (
            <div className="h-screen flex flex-col items-center justify-center space-y-4 text-slate-400">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="font-medium">Chat not found</p>
                <Link href="/dashboard/whatsapp/chat">
                    <Button variant="outline" className="gap-2">
                        <ChevronLeft className="h-4 w-4" /> Back to Chats
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex-1 w-full h-full p-6">
            <div className="mb-4">
                <Link href="/dashboard/whatsapp/chat">
                    <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900">
                        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
                    </Button>
                </Link>
            </div>
            <WhatsAppChatDetail customerId={decodedCustomerId} />
        </div>
    );
}
