'use server';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, comparePassword } from '@/lib/auth-utils';
import React from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-change-this';
const secret = new TextEncoder().encode(JWT_SECRET);

// Supabase client using anon key for calling auth methods that trigger email delivery
function getSupabaseClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    return createClient(url, anon);
}

export async function login(prevState: any, formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { error: 'Email and password are required' };
    }

    try {
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            return { error: 'Invalid email or password' };
        }

        const isPasswordValid = await comparePassword(password, user.password_hash);
        if (!isPasswordValid) {
            return { error: 'Invalid email or password' };
        }

        // Check password age (90 days)
        const passwordChangedAt = user.password_changed_at ? new Date(user.password_changed_at) : new Date(0);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        if (passwordChangedAt < ninetyDaysAgo) {
            return {
                error: 'Your password has expired (90 days). Please use "Forgot Password" to set a new one.',
                requiresReset: true
            };
        }

        // Create JWT
        const token = await new SignJWT({ userId: user.id, email: user.email })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(secret);

        (await cookies()).set('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60, // 1 hour
            path: '/',
        });

        return { success: true };
    } catch (err) {
        console.error('Login error:', err);
        return { error: 'An unexpected error occurred' };
    }
}

export async function signup(prevState: any, formData: FormData) {
    return { error: 'Signup is currently disabled. Please contact an administrator.' };
}

export async function logout() {
    (await cookies()).delete('auth_token');
    return { success: true };
}

export async function forgotPassword(prevState: any, formData: FormData) {
    const email = (formData.get('email') as string)?.toLowerCase().trim();

    if (!email) {
        return { error: 'Email is required' };
    }

    try {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();

        // Check if a Supabase Auth user exists for this email — if not, create a shadow user
        // so that resetPasswordForEmail can actually send the email.
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = listData?.users?.find(
            (u: any) => u.email?.toLowerCase() === email
        );

        if (!existingAuthUser) {
            // Create a shadow auth user — only purpose is to receive the recovery email.
            // Actual login uses the custom users table.
            const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                password: Math.random().toString(36) + Math.random().toString(36),
            });
            if (createErr) {
                console.error('Shadow user creation error:', createErr);
            }
        }

        // Trigger Supabase's built-in recovery email — this is what actually sends the email.
        const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${appUrl}/reset-password`,
        });

        if (resetErr) {
            console.error('resetPasswordForEmail error:', resetErr);
            // Don't expose internals — always return success for security
        }

        // Always return success so we don't leak whether an account exists
        return { success: true };
    } catch (err) {
        console.error('Forgot password error:', err);
        return { error: 'An unexpected error occurred' };
    }
}

export async function resetPassword(prevState: any, formData: FormData) {
    const accessToken = formData.get('accessToken') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!accessToken || !password || !confirmPassword) {
        return { error: 'All fields are required' };
    }

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' };
    }

    if (password.length < 8) {
        return { error: 'Password must be at least 8 characters' };
    }

    try {
        // Verify the access token and get the user's email from Supabase Auth
        const supabase = getSupabaseClient();
        const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);

        if (userErr || !userData?.user?.email) {
            console.error('Token verification error:', userErr);
            return { error: 'Invalid or expired reset link. Please request a new one.' };
        }

        const email = userData.user.email.toLowerCase();

        // Hash the new password
        const passwordHash = await hashPassword(password);

        // Update the custom users table
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                password_hash: passwordHash,
                password_changed_at: new Date().toISOString(),
            })
            .eq('email', email);

        if (updateError) {
            console.error('Password update error:', updateError);
            throw updateError;
        }

        return { success: true, message: 'Password updated successfully. You can now log in.' };
    } catch (err) {
        console.error('Reset password error:', err);
        return { error: 'An unexpected error occurred' };
    }
}
