'use server';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, comparePassword } from '@/lib/auth-utils';
import React from 'react';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-change-this';
const secret = new TextEncoder().encode(JWT_SECRET);

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
            .setExpirationTime('1h') // Changed from 24h to 1h
            .sign(secret);

        (await cookies()).set('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60, // 1 hour (Changed from 1 day)
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

// Helper to send email via Nodemailer (SMTP)
async function sendOTPEmail(email: string, otp: string, fullName: string) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: true, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false // This bypasses the 'self-signed certificate' error
        }
    });

    try {
        await transporter.sendMail({
            from: `"Asquared" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Your Password Reset OTP',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #10b981;">Reset Your Password</h2>
                    <p>Hello ${fullName},</p>
                    <p>You requested a password reset. Please use the following One-Time Password (OTP) to proceed:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #10b981; padding: 20px; text-align: center; background: #f0fdf4; border-radius: 8px;">
                        ${otp}
                    </div>
                    <p style="margin-top: 20px; color: #666; font-size: 14px;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #aaa;">© 2026 Asquared. Powered by ScalePods.</p>
                </div>
            `,
        });
        console.log(`OTP Email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error('Nodemailer error:', error);
        return { error: 'Failed to send OTP email.' };
    }
}

export async function forgotPassword(prevState: any, formData: FormData) {
    const email = (formData.get('email') as string)?.toLowerCase();

    if (!email) {
        return { error: 'Email is required' };
    }

    try {
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, full_name')
            .eq('email', email)
            .maybeSingle();

        if (userError) {
            console.error('Error fetching user:', userError);
            return { error: 'An error occurred while looking up your account.' };
        }

        if (user) {
            // Generate a 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000); // 10 minutes

            // Clean up existing tokens/OTPs
            await supabaseAdmin
                .from('password_resets')
                .delete()
                .eq('email', email);

            // Save OTP to Supabase
            const { error: resetError } = await supabaseAdmin
                .from('password_resets')
                .insert([{
                    email,
                    token: otp, // reusing token field for OTP
                    expires_at: expiresAt.toISOString()
                }]);

            if (resetError) {
                console.error('Database error saving OTP:', resetError);
                return { error: 'Database error. Please ensure password_resets table exists.' };
            }

            // Send OTP Email
            await sendOTPEmail(email, otp, user.full_name || 'User');
        }

        // Always return success for security
        return { success: true, email };
    } catch (err) {
        console.error('Forgot password error:', err);
        return { error: 'An unexpected error occurred' };
    }
}

export async function verifyOTP(prevState: any, formData: FormData) {
    const email = formData.get('email') as string;
    const otp = formData.get('otp') as string;

    if (!email || !otp) return { error: 'Email and OTP are required' };

    try {
        const { data: resetEntry, error } = await supabaseAdmin
            .from('password_resets')
            .select('*')
            .eq('email', email)
            .eq('token', otp)
            .single();

        if (error || !resetEntry || new Date(resetEntry.expires_at) < new Date()) {
            return { error: 'Invalid or expired OTP' };
        }

        return { success: true, email, otp };
    } catch (err) {
        return { error: 'Verification failed' };
    }
}

export async function resetPassword(prevState: any, formData: FormData) {
    const token = formData.get('token') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!token || !email || !password || !confirmPassword) {
        return { error: 'All fields are required' };
    }

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' };
    }

    try {
        // Validate token and email
        const { data: resetEntry, error: tokenError } = await supabaseAdmin
            .from('password_resets')
            .select('*')
            .eq('token', token)
            .eq('email', email)
            .single();

        if (tokenError || !resetEntry || new Date(resetEntry.expires_at) < new Date()) {
            return { error: 'Invalid or expired session. Please try again.' };
        }

        // Hash new password
        const passwordHash = await hashPassword(password);

        // Update user password and password_changed_at timestamp
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ 
                password_hash: passwordHash,
                password_changed_at: new Date().toISOString()
            })
            .eq('email', resetEntry.email);

        if (updateError) throw updateError;

        // Delete used token
        await supabaseAdmin
            .from('password_resets')
            .delete()
            .eq('token', token);

        return { success: true, message: 'Password updated successfully. You can now log in.' };
    } catch (err) {
        console.error('Reset password error:', err);
        return { error: 'An unexpected error occurred' };
    }
}

