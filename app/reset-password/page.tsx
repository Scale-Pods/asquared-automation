'use client';

import { useState, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { resetPassword } from '@/app/actions/auth';

export default function ResetPasswordPage() {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const router = useRouter();

    const [resetState, resetAction, isPending] = useActionState(resetPassword, null as any);

    // Read #access_token=...&type=recovery from the URL hash on the client
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const hash = window.location.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const type = params.get('type');

        if (!token || type !== 'recovery') {
            setTokenError('Invalid or missing reset token. Please request a new password reset.');
            return;
        }

        setAccessToken(token);
    }, []);

    // On success, redirect to login after 3 s
    useEffect(() => {
        if (resetState?.success) {
            const t = setTimeout(() => router.push('/'), 3000);
            return () => clearTimeout(t);
        }
    }, [resetState, router]);

    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4">
            <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in-95 duration-300">
                {/* Logo / branding */}
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Set New Password</h1>
                    <p className="text-zinc-400 text-sm">Enter your new password below to complete the reset.</p>
                </div>

                {/* Error from token parsing */}
                {tokenError && (
                    <div className="p-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-red-400">Invalid Link</p>
                            <p className="text-xs text-red-400/80 mt-1">{tokenError}</p>
                            <button
                                onClick={() => router.push('/')}
                                className="text-xs font-bold text-red-400 hover:underline mt-2 block"
                            >
                                Back to Login
                            </button>
                        </div>
                    </div>
                )}

                {/* Server action errors */}
                {resetState?.error && (
                    <div className="p-3 text-xs font-bold bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-center">
                        {resetState.error}
                    </div>
                )}

                {/* Success */}
                {resetState?.success ? (
                    <div className="flex flex-col items-center gap-4 py-4">
                        <CheckCircle2 className="h-14 w-14 text-emerald-400" />
                        <p className="text-sm font-bold text-emerald-400 text-center">{resetState.message}</p>
                        <p className="text-xs text-zinc-500">Redirecting you to login…</p>
                    </div>
                ) : (
                    !tokenError && accessToken && (
                        <form action={resetAction} className="space-y-4">
                            {/* Hidden access token — passed to the server action */}
                            <input type="hidden" name="accessToken" value={accessToken} />

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">
                                    New Password
                                </Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                                    <Input
                                        id="password"
                                        name="password"
                                        type="password"
                                        placeholder="••••••••"
                                        minLength={8}
                                        required
                                        className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">
                                    Confirm Password
                                </Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                                    <Input
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type="password"
                                        placeholder="••••••••"
                                        minLength={8}
                                        required
                                        className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isPending}
                                className="w-full h-11 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all gap-2 group"
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        Update Password
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </Button>
                        </form>
                    )
                )}

                {/* Loading skeleton while the hash is being parsed */}
                {!tokenError && !accessToken && !resetState?.success && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                    </div>
                )}
            </div>
        </main>
    );
}
