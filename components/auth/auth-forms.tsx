'use client';

import { useState, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, User, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { login, signup, forgotPassword, verifyOTP, resetPassword } from '@/app/actions/auth';

type AuthMode = 'login' | 'forgot' | 'otp' | 'reset';

export function AuthForms({ defaultMode = 'login', onSuccess }: { defaultMode?: AuthMode, onSuccess?: () => void }) {
    const [mode, setMode] = useState<AuthMode>(defaultMode);
    const [email, setEmail] = useState('');
    const [otp, setOTP] = useState('');
    const [resendTimer, setResendTimer] = useState(0);
    const router = useRouter();

    const [loginState, loginAction, isLoginPending] = useActionState(login, null as any);
    const [forgotState, forgotAction, isForgotPending] = useActionState(forgotPassword, null as any);
    const [otpState, otpAction, isOtpPending] = useActionState(verifyOTP, null as any);
    const [resetState, resetAction, isResetPending] = useActionState(resetPassword, null as any);

    useEffect(() => {
        if (loginState?.success) {
            router.push('/dashboard');
            onSuccess?.();
            router.refresh();
        }
    }, [loginState, router, onSuccess]);

    useEffect(() => {
        if (forgotState?.success && forgotState?.email) {
            setEmail(forgotState.email);
            setMode('otp');
        }
    }, [forgotState]);

    useEffect(() => {
        if (otpState?.success && otpState?.otp) {
            setOTP(otpState.otp);
            setMode('reset');
        }
    }, [otpState]);

    useEffect(() => {
        if (resendTimer > 0) {
            const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendTimer]);

    useEffect(() => {
        if (resetState?.success) {
            const timer = setTimeout(() => {
                setMode('login');
                onSuccess?.();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [resetState, onSuccess]);

    const handleResend = async () => {
        if (resendTimer > 0) return;
        const formData = new FormData();
        formData.append('email', email);
        await forgotAction(formData);
        setResendTimer(60); // 60 seconds cooldown
    };

    const error = loginState?.error || forgotState?.error || otpState?.error || resetState?.error;
    const isPending = isLoginPending || isForgotPending || isOtpPending || isResetPending;
    const successMessage = resetState?.message;

    return (
        <div className="w-full max-w-sm mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold tracking-tighter text-white">
                    {mode === 'login' && 'Welcome Back'}
                    {mode === 'forgot' && 'Reset Password'}
                    {mode === 'otp' && 'Enter OTP'}
                    {mode === 'reset' && 'New Password'}
                </h1>
                <p className="text-zinc-400 text-sm">
                    {mode === 'login' && 'Enter your credentials to access your dashboard'}
                    {mode === 'forgot' && 'Enter your email to receive a 6-digit code'}
                    {mode === 'otp' && `We've sent a code to ${email}`}
                    {mode === 'reset' && 'Set a strong password for your account'}
                </p>
            </div>

            {error && (
                <div className="p-3 text-xs font-bold bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-center">
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="p-3 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-center">
                    {successMessage}
                </div>
            )}

            <form action={
                mode === 'login' ? loginAction :
                mode === 'forgot' ? forgotAction :
                mode === 'otp' ? otpAction :
                resetAction
            } className="space-y-4">
                {(mode === 'login' || mode === 'forgot') && (
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Email Address</Label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="name@example.com"
                                required
                                defaultValue={email}
                                className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                            />
                        </div>
                    </div>
                )}

                {mode === 'otp' && (
                    <div className="space-y-4">
                        <input type="hidden" name="email" value={email} />
                        <div className="space-y-2">
                            <Label htmlFor="otp" className="text-zinc-300 text-xs font-bold uppercase tracking-wider text-center block">Verification Code</Label>
                            <div className="relative group">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                                <Input
                                    id="otp"
                                    name="otp"
                                    type="text"
                                    placeholder="0 0 0 0 0 0"
                                    maxLength={6}
                                    required
                                    autoFocus
                                    className="pl-10 h-14 bg-white/5 border-white/10 text-white placeholder:text-zinc-700 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-2xl transition-all tracking-[0.8em] font-mono text-2xl text-center"
                                />
                            </div>
                        </div>
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={resendTimer > 0 || isForgotPending}
                                className="text-xs font-bold text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                            >
                                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Didn't receive a code? Resend"}
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'login' && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <Label htmlFor="password" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Password</Label>
                            <button
                                type="button"
                                onClick={() => setMode('forgot')}
                                className="text-[10px] font-bold text-zinc-500 hover:text-emerald-400 uppercase tracking-tight transition-colors"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                required
                                className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                            />
                        </div>
                    </div>
                )}

                {mode === 'reset' && (
                    <div className="space-y-4">
                        <input type="hidden" name="email" value={email} />
                        <input type="hidden" name="token" value={otp} />
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">New Password</Label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Confirm Password</Label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl transition-all"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full h-11 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all gap-2 group"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <>
                            {mode === 'login' && 'Sign In'}
                            {mode === 'forgot' && 'Send Code'}
                            {mode === 'otp' && 'Verify Code'}
                            {mode === 'reset' && 'Update Password'}
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </Button>
            </form>

            {mode !== 'login' && (
                <div className="text-center">
                    <button
                        onClick={() => setMode('login')}
                        className="text-emerald-400 text-xs font-bold hover:underline"
                    >
                        Back to Login
                    </button>
                </div>
            )}
        </div>
    );
}
