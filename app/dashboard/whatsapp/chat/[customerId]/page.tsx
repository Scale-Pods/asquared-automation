"use client";

import { use, useEffect, useState } from "react";
import { WhatsAppChatDetail } from "@/components/dashboard/whatsapp-chat-detail";
import { OwnerChatDetail } from "@/components/dashboard/owner-chat-detail";
import { useData } from "@/context/DataContext";
import { ASLoader } from "@/components/as-loader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
    const { customerId } = use(params);
    const decodedCustomerId = decodeURIComponent(customerId);
    const { leads, ownerLeads, loadingLeads, loadingOwners } = useData();
    
    const [foundType, setFoundType] = useState<"lead" | "owner" | "none" | "searching">("searching");
    const [foundOwner, setFoundOwner] = useState<any>(null);

    useEffect(() => {
        if (loadingLeads || loadingOwners) return;

        const searchVal = decodedCustomerId.toLowerCase().trim();
        const searchReplaced = searchVal.replace(/\D/g, '');

        // 1. Check leads
        const leadFound = leads.find(l => {
            const lId = String(l.id || "").toLowerCase();
            if (lId === searchVal) return true;
            
            if (l.phone) {
                const lPhoneReplaced = String(l.phone).replace(/\D/g, '');
                if (searchReplaced && lPhoneReplaced === searchReplaced) return true;
            }
            return false;
        });

        if (leadFound) {
            setFoundType("lead");
            return;
        }

        // 2. Check owners
        const ownerFound = ownerLeads.find(o => {
            const oId = String(o.id || "").toLowerCase();
            if (oId === searchVal) return true;

            const contact = String(o.contactNo || "").replace(/\D/g, '');
            const phone = String(o.Phone || "").replace(/\D/g, '');
            const phone2 = String(o.phone || "").replace(/\D/g, '');

            if (searchReplaced && (contact === searchReplaced || phone === searchReplaced || phone2 === searchReplaced)) return true;
            return false;
        });

        if (ownerFound) {
            setFoundOwner(ownerFound);
            setFoundType("owner");
        } else {
            setFoundType("none");
        }
    }, [decodedCustomerId, leads, ownerLeads, loadingLeads, loadingOwners]);

    if (loadingLeads || loadingOwners || foundType === "searching") {
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
            {foundType === "lead" ? (
                <WhatsAppChatDetail customerId={decodedCustomerId} />
            ) : (
                <OwnerChatDetail owner={foundOwner} />
            )}
        </div>
    );
}
