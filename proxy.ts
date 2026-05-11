import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-change-this';
const secret = new TextEncoder().encode(JWT_SECRET);

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static files, images, favicon, etc.
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    const token = request.cookies.get('auth_token')?.value;

    // Check if the user is attempting to access a dashboard route
    if (pathname.startsWith('/dashboard')) {
        // ALLOW PUBLIC ACCESS to specific chat links (bypassing auth)
        // Ensure it has a parameter after /chat/
        const isPublicChat = pathname.startsWith('/dashboard/whatsapp/chat/') && pathname.split('/').length > 4;

        if (isPublicChat) {
            // Allow them through without needing a valid auth token
            return NextResponse.next();
        }

        if (!token) {
            // Redirect to landing page to login
            const response = NextResponse.redirect(new URL('/', request.url));
            return response;
        }

        try {
            // Verify JWT
            await jwtVerify(token, secret);
            return NextResponse.next();
        } catch (error) {
            console.error('Invalid token, redirecting:', error);
            // Delete invalid cookie and redirect to login
            const response = NextResponse.redirect(new URL('/', request.url));
            response.cookies.delete('auth_token');
            return response;
        }
    }

    // If on landing page and already logged in, redirect to dashboard
    if (pathname === '/' && token) {
        try {
            await jwtVerify(token, secret);
            return NextResponse.redirect(new URL('/dashboard', request.url));
        } catch (error) {
            // Token invalid, stay on landing page
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
