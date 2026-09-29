'use client';
import * as React from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary.
 *
 * Without this, any render error in a page unmounts the whole tree and Next
 * shows its generic "Application error: a client-side exception has occurred"
 * page — which is exactly what a participant sees when something in the
 * meeting UI throws. This gives a readable message and a way back.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('Route error', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
        background: '#0b0e14',
        color: '#e6eaf2',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h2>
      <p style={{ margin: 0, maxWidth: 460, color: '#9aa4b8', lineHeight: 1.5 }}>
        The meeting interface hit an unexpected error. Reloading usually clears it. If it keeps
        happening, the details are in the browser console.
      </p>
      {error.digest && (
        <code style={{ fontSize: '0.75rem', color: '#5f6b80' }}>ref: {error.digest}</code>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#246bfd',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: '1px solid #2b3444',
            color: '#e6eaf2',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back to start
        </Link>
      </div>
    </div>
  );
}
