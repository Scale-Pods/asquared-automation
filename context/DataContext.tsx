"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { consolidateLeads, ConsolidatedLead } from "@/lib/leads-utils";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { useRouter } from 'next/navigation';
import { logout } from '@/app/actions/auth';

interface DataContextType {
    leads: ConsolidatedLead[];
    calls: any[];
    ownerLeads: any[];
    allTimeVoiceCount: number;
    allTimeOwnerVoiceCount: number;
    loadingLeads: boolean;
    loadingCalls: boolean;
    loadingOwners: boolean;
    loadingBalances: boolean;
    voiceBalance: any;
    didBalance: any;
    error: string | null;
    refreshLeads: (params?: { from?: Date; to?: Date; force?: boolean }) => Promise<void>;
    refreshCalls: (params?: { from?: Date; to?: Date; provider?: string; force?: boolean }) => Promise<void>;
    refreshOwners: (params?: { from?: Date; to?: Date; force?: boolean }) => Promise<void>;
    refreshBalances: () => Promise<void>;
    refreshAll: (params?: { from?: Date; to?: Date }) => Promise<void>;
    computeWPReplies: (dateRange?: { from?: Date; to?: Date } | null) => number;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const [leads, setLeads] = useState<ConsolidatedLead[]>([]);
    const [calls, setCalls] = useState<any[]>([]);
    const [allTimeVoiceCount, setAllTimeVoiceCount] = useState(0);
    const [allTimeOwnerVoiceCount, setAllTimeOwnerVoiceCount] = useState(0);
    const [ownerLeads, setOwnerLeads] = useState<any[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(true);
    const [loadingCalls, setLoadingCalls] = useState(true);
    const [loadingOwners, setLoadingOwners] = useState(true);
    const [loadingBalances, setLoadingBalances] = useState(true);
    const [voiceBalance, setVoiceBalance] = useState<any>(null);
    const [didBalance, setDidBalance] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Gatekeeper to prevent redundant identical calls
    const lastCallParams = useRef<string | null>(null);

    const fetchLeads = useCallback(async (params?: { from?: Date; to?: Date; force?: boolean }) => {
        setLoadingLeads(true);
        try {
            const now = new Date();
            const fromDate = params?.from ? startOfDay(params.from) : subDays(startOfDay(now), 7);
            const toDate = params?.to ? endOfDay(params.to) : endOfDay(now);

            const query = new URLSearchParams({
                from: fromDate.toISOString(),
                to: toDate.toISOString()
            });

            const response = await fetch(`/api/leads?${query.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch leads');
            const data = await response.json();
            const consolidated = consolidateLeads(data);
            setLeads(consolidated);
            if (typeof data.allTimeVoiceCount === 'number') {
                setAllTimeVoiceCount(data.allTimeVoiceCount);
            }
            if (typeof data.allTimeOwnerVoiceCount === 'number') {
                setAllTimeOwnerVoiceCount(data.allTimeOwnerVoiceCount);
            }
        } catch (err: any) {
            console.error('DataProvider leads fetch error:', err);
            setError(err.message);
        } finally {
            setLoadingLeads(false);
        }
    }, []);

    const fetchCalls = useCallback(async (params?: { from?: Date; to?: Date; provider?: string; force?: boolean }) => {
        try {
            const now = new Date();
            const fromDate = params?.from ? startOfDay(params.from) : subDays(startOfDay(now), 7);
            const toDate = params?.to ? endOfDay(params.to) : endOfDay(now);
            const provider = params?.provider || 'vapi';

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                console.error("Invalid dates passed to fetchCalls");
                return;
            }

            const query = new URLSearchParams({
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                provider
            });

            const currentQuery = query.toString();

            // Skip if requested params are identical to the last SUCCESSFUL or ONGOING load
            // But ALLOW if forced refresh or if calls array is currently empty
            if (!params?.force && lastCallParams.current === currentQuery && (calls.length > 0 || loadingCalls)) {
                return;
            }

            setLoadingCalls(true);
            lastCallParams.current = currentQuery;

            const response = await fetch(`/api/calls?${currentQuery}`);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) setCalls(data);
            } else {
                // If failed, clear last params to allow retry
                lastCallParams.current = null;
            }
        } catch (err: any) {
            console.error('DataProvider calls fetch error:', err);
            lastCallParams.current = null;
        } finally {
            setLoadingCalls(false);
        }
    }, []);

    const fetchOwners = useCallback(async (params?: { from?: Date; to?: Date; force?: boolean }) => {
        setLoadingOwners(true);
        try {
            const now = new Date();
            const fromDate = params?.from ? startOfDay(params.from) : subDays(startOfDay(now), 7);
            const toDate = params?.to ? endOfDay(params.to) : endOfDay(now);

            const query = new URLSearchParams({
                from: fromDate.toISOString(),
                to: toDate.toISOString()
            });

            const response = await fetch(`/api/owner-leads?${query.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setOwnerLeads(data.owner_data || []);
            }
        } catch (err: any) {
            console.error('DataProvider owners fetch error:', err);
        } finally {
            setLoadingOwners(false);
        }
    }, []);

    const fetchBalances = useCallback(async () => {
        try {
            const [vapiRes, didRes] = await Promise.all([
                fetch('/api/vapi/balance'),
                fetch('/api/did/balance')
            ]);
            if (vapiRes.ok) setVoiceBalance(await vapiRes.json());
            if (didRes.ok) setDidBalance(await didRes.json());
        } catch (err) { }
        finally { setLoadingBalances(false); }
    }, []);

    const refreshAll = useCallback(async (params?: { from?: Date; to?: Date }) => {
        await Promise.all([fetchLeads(params), fetchCalls(params), fetchOwners(params), fetchBalances()]);
    }, [fetchLeads, fetchCalls, fetchOwners, fetchBalances]);

    const router = useRouter();

    useEffect(() => {
        // Master Dashboard strategy: Fetch everything on mount
        refreshAll();

        // Session Monitor: Checks every 1 minute if the session is still valid
        const checkSession = async () => {
            try {
                const res = await fetch('/api/auth/session');
                if (!res.ok) {
                    // Session expired or invalid
                    await logout();
                    router.push('/');
                    router.refresh();
                }
            } catch (err) {
                console.error("Session check failed", err);
            }
        };

        const interval = setInterval(checkSession, 60000); // Check every 60 seconds
        return () => clearInterval(interval);
    }, [refreshAll, router]);

    const computeWPReplies = useCallback((dateRange?: { from?: Date; to?: Date } | null): number => {
        if (!leads) return 0;
        const fromDate = dateRange?.from ? startOfDay(new Date(dateRange.from)) : null;
        const toDate = dateRange?.to ? endOfDay(new Date(dateRange.to)) : (fromDate ? endOfDay(new Date(fromDate)) : null);

        const toYYYYMMDD = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const isWithinRange = (d: Date | null) => {
            if (!fromDate || !toDate) return true;
            if (!d) return false;
            if (d >= fromDate && d <= toDate) return true;
            const dStr = toYYYYMMDD(d);
            return dStr >= toYYYYMMDD(fromDate) && dStr <= toYYYYMMDD(toDate);
        };

        const seen = new Set<string>();
        let count = 0;

        leads.forEach((lead: any) => {
            // Deduplicate
            const uid = lead["Lead ID"] || lead.id || lead.phone;
            if (!uid || seen.has(uid)) return;
            seen.add(uid);

            const track = lead["WP_Replied_track"];
            if (!track || String(track).trim() === "" || String(track).trim().toLowerCase() === "no") return;

            const content = String(track).trim();
            let replyDate: Date | null = null;

            // ISO regex extraction
            const isoMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^ \n]*)/);
            if (isoMatch) {
                const d = new Date(isoMatch[1]);
                if (!isNaN(d.getTime())) replyDate = d;
            }

            // Fallback: try direct parse
            if (!replyDate) {
                const d = new Date(content);
                if (!isNaN(d.getTime()) && (content.includes('T') || (content.includes('-') && content.includes(':')))) {
                    replyDate = d;
                }
            }

            if (replyDate && isWithinRange(replyDate)) {
                count++;
            }
        });

        return count;
    }, [leads]);

    return (
        <DataContext.Provider value={{
            leads,
            calls,
            ownerLeads,
            allTimeVoiceCount,
            allTimeOwnerVoiceCount,
            loadingLeads,
            loadingCalls,
            loadingOwners,
            loadingBalances,
            voiceBalance,
            didBalance,
            error,
            refreshLeads: fetchLeads,
            refreshCalls: fetchCalls,
            refreshOwners: fetchOwners,
            refreshBalances: fetchBalances,
            refreshAll,
            computeWPReplies
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
