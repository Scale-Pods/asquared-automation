'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthForms } from "./auth-forms";
import Image from "next/image";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultMode?: 'login' | 'forgot';
}

export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md p-0 overflow-hidden bg-zinc-950 border-white/10 shadow-2xl rounded-3xl">
                <DialogHeader className="sr-only">
                    <DialogTitle>Authentication</DialogTitle>
                    <DialogDescription>
                        Authenticate to access your dashboard and manage your business automation.
                    </DialogDescription>
                </DialogHeader>
                <div className="relative p-8 pt-12">
                    {/* Background effects */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/20 blur-[80px] -z-10 rounded-full"></div>

                    <div className="flex justify-center mb-10">
                        <div className="relative w-40 h-10">
                            <Image
                                src="/ASquared Logo White-01.png"
                                alt="Asquared Logo"
                                fill
                                className="object-contain"
                                priority
                            />
                        </div>
                    </div>

                    <AuthForms defaultMode={defaultMode} onSuccess={onClose} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

