'use client';

// ============================================================
// Learner: Root Error Boundary — Crash Recovery UI
// ============================================================
// Catches unhandled errors in the React tree and shows a branded
// recovery UI instead of a blank white screen.
// ============================================================

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[ErrorBoundary] Unhandled error:', error);
    }, [error]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)',
            color: '#e0e0e0',
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: '2rem',
        }}>
            {/* Error Icon */}
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '2px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                marginBottom: '1.5rem',
            }}>
                ⚠️
            </div>

            {/* Title */}
            <h1 style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: '0.75rem',
                letterSpacing: '-0.02em',
            }}>
                Something went wrong
            </h1>

            {/* Description */}
            <p style={{
                fontSize: '0.95rem',
                color: '#9ca3af',
                maxWidth: '400px',
                textAlign: 'center',
                lineHeight: 1.6,
                marginBottom: '2rem',
            }}>
                Learner encountered an unexpected error. Your data and strategies are safe — the engine can recover.
            </p>

            {/* Error Details (collapsed) */}
            <details style={{
                maxWidth: '500px',
                width: '100%',
                marginBottom: '2rem',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '1rem',
            }}>
                <summary style={{
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: '#6b7280',
                    userSelect: 'none',
                }}>
                    Technical Details
                </summary>
                <pre style={{
                    marginTop: '0.75rem',
                    fontSize: '0.75rem',
                    color: '#ef4444',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.5,
                }}>
                    {error.message}
                    {error.digest && `\n\nDigest: ${error.digest}`}
                </pre>
            </details>

            {/* Recovery Button */}
            <button
                onClick={reset}
                style={{
                    padding: '0.75rem 2rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                    letterSpacing: '-0.01em',
                }}
                onMouseOver={(e) => {
                    (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
                    (e.target as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
                }}
                onMouseOut={(e) => {
                    (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                    (e.target as HTMLButtonElement).style.boxShadow = '0 4px 15px rgba(59, 130, 246, 0.3)';
                }}
            >
                Recover & Retry
            </button>

            {/* Branding */}
            <p style={{
                marginTop: '3rem',
                fontSize: '0.75rem',
                color: '#4b5563',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
            }}>
                Learner AI Trading System
            </p>
        </div>
    );
}
