import * as React from 'react';

interface ResetPasswordEmailProps {
    fullName: string;
    resetLink: string;
}

export const ResetPasswordEmail: React.FC<Readonly<ResetPasswordEmailProps>> = ({
    fullName,
    resetLink,
}) => (
    <div style={{
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        fontFamily: 'sans-serif',
        padding: '40px 20px',
        textAlign: 'center',
        borderRadius: '12px'
    }}>
        <div style={{ marginBottom: '30px' }}>
            <img
                src="/ASquared Logo White-01.png"
                alt="Asquared"
                style={{ width: '180px', height: 'auto' }}
            />
        </div>

        <h1 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            marginBottom: '20px',
            background: 'linear-gradient(to right, #34d399, #06b6d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
        }}>
            Reset Your Password
        </h1>

        <p style={{ color: '#a1a1aa', fontSize: '16px', lineHeight: '1.5', marginBottom: '30px' }}>
            Hello {fullName},<br />
            We received a request to reset the password for your Asquared account.
        </p>

        <a href={resetLink} style={{
            display: 'inline-block',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontWeight: 'bold',
            padding: '12px 30px',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '16px',
            boxShadow: '0 4px 15px rgba(255, 255, 255, 0.2)'
        }}>
            Reset Password
        </a>

        <p style={{ color: '#71717a', fontSize: '14px', marginTop: '30px', fontStyle: 'italic' }}>
            If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.
        </p>

        <div style={{
            marginTop: '40px',
            paddingTop: '20px',
            borderTop: '1px solid #27272a',
            fontSize: '12px',
            color: '#52525b'
        }}>
            © 2026 Asquared. Powered by ScalePods.
        </div>
    </div>
);

