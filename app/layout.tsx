import '../styles/globals.css';
import '../styles/orbit.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: 'Orbit Meeting | Video conferencing',
    template: '%s | Orbit Meeting',
  },
  description:
    'Orbit Meeting — secure, fast video conferencing with live translation. Join from your browser, share your screen, chat and collaborate in real time.',
  twitter: {
    creator: '@orbitmeeting',
    site: '@orbitmeeting',
    card: 'summary_large_image',
  },
  openGraph: {
    url: 'https://orbit.meeting',
    images: [
      {
        url: '/images/orbit-logo.svg',
        width: 1200,
        height: 630,
        type: 'image/svg+xml',
      },
    ],
    siteName: 'Orbit Meeting',
  },
  icons: {
    icon: [
      { rel: 'icon', url: '/orbit-favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', url: '/favicon.ico' },
    ],
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/orbit-favicon.svg',
        sizes: '180x180',
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
