'use client';
import * as React from 'react';

type P = React.SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const MicIcon = (p: P) => (
  <svg {...base(p)}>
    <rect
      x="9"
      y="2.5"
      width="6"
      height="11"
      rx="3"
      fill="currentColor"
      stroke="none"
      opacity="0.95"
    />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3.5" />
    <path d="M9 21h6" />
  </svg>
);
export const MicOffIcon = (p: P) => (
  <svg {...base(p)}>
    <rect
      x="9"
      y="2.5"
      width="6"
      height="11"
      rx="3"
      fill="currentColor"
      stroke="none"
      opacity="0.9"
    />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 11.3 4.4" />
    <path d="M12 18v3.5M9 21h6" />
    <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" strokeWidth={2.2} />
  </svg>
);
export const CamIcon = (p: P) => (
  <svg {...base(p)}>
    <rect
      x="2.5"
      y="6.5"
      width="12"
      height="11"
      rx="2.5"
      fill="currentColor"
      stroke="none"
      opacity="0.95"
    />
    <path d="M14.5 10.5 20.5 7v10l-6-3.5" />
  </svg>
);
export const CamOffIcon = (p: P) => (
  <svg {...base(p)}>
    <rect
      x="2.5"
      y="6.5"
      width="12"
      height="11"
      rx="2.5"
      fill="currentColor"
      stroke="none"
      opacity="0.7"
    />
    <path d="M14.5 10.5 20.5 7v10l-6-3.5" />
    <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2.2} />
  </svg>
);
export const ScreenIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M12 16.5V20M8.5 20h7" />
    <path d="M12 7.5v4M10 9.5h4" strokeWidth={1.6} />
  </svg>
);
export const ScreenStopIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M12 16.5V20M8.5 20h7" />
    <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} />
  </svg>
);
export const ChatIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5h16v10H9l-5 4v-14Z" fill="currentColor" stroke="none" opacity="0.92" />
    <path d="M8 9.5h8M8 12.3h5" stroke="#2e2e33" strokeWidth={1.4} />
  </svg>
);
export const HandIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 12V5.8a1.3 1.3 0 0 1 2.6 0V11m0-4.6a1.3 1.3 0 0 1 2.6 0V11m0-3.2a1.3 1.3 0 0 1 2.6 0v4.3c0 3.4-2.2 6.4-5.6 6.4-2.4 0-3.9-1-5.3-3.2L3.6 12c-.5-.9-.1-1.9.8-2.2.7-.3 1.5 0 1.9.6L8 12Z" />
  </svg>
);
export const TranslateIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 6.5h9M8 4v2.5M5.5 6.5c.8 3 2.6 5.3 5 6.5" />
    <path d="m9.5 11.5 1.8 1.8L15 9.5" />
    <path d="m13.5 20 4-9 4 9M14.8 17.2h5.4" />
  </svg>
);
export const PeopleIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" fill="currentColor" stroke="none" opacity="0.95" />
    <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16 14.6c2.3.2 3.9 1.6 4.4 3.9" />
  </svg>
);
export const TileIcon = (p: P) => (
  <svg {...base(p)}>
    <rect
      x="3.5"
      y="3.5"
      width="7"
      height="7"
      rx="1.6"
      fill="currentColor"
      stroke="none"
      opacity="0.95"
    />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect
      x="13.5"
      y="13.5"
      width="7"
      height="7"
      rx="1.6"
      fill="currentColor"
      stroke="none"
      opacity="0.95"
    />
  </svg>
);
export const MoreIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
export const HangupIcon = (p: P) => (
  <svg {...base(p)}>
    <path
      d="M3.5 13.5c-1-2.5.5-5.5 3.5-4 2.5 1.2 3.4 2 5 2s2.5-.8 5-2c3-1.5 4.5 1.5 3.5 4-1.2 3-4.5 5.4-8.5 5.4s-7.3-2.4-8.5-5.4Z"
      fill="currentColor"
      stroke="none"
      transform="rotate(135 12 12)"
    />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.2} />
  </svg>
);
export const FullIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const RecordIcon = (p: P) => (
  <svg {...base(p)} fill="none">
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
  </svg>
);
export const StopIcon = (p: P) => (
  <svg {...base(p)} fill="none">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
  </svg>
);
// Single gear used for every "Settings" affordance (toolbar, pre-join navbar,
// settings dialog, landing page). The former GearIcon was a second, subtly
// different gear; having both meant settings looked different per screen.
export const SettingsIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const CalendarIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
/* 64px calendar used as the empty-state illustration on the entry page. */
export const CalendarGlyphIcon = (p: P) => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" {...p}>
    <rect x="10" y="14" width="44" height="42" rx="6" strokeWidth={2.6} />
    <path d="M20 9v9M44 9v9" strokeWidth={2.8} />
    <path d="M10 24h44" strokeWidth={2.6} />
    {[32, 39, 46].flatMap((y) =>
      [21, 28, 35, 42].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />
      )),
    )}
  </svg>
);
export const DonateIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);
export const LogOutIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);
export const ChevronDownIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const UserPlusIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8" cy="7" r="4" />
    <path d="M20 8v6M23 11h-6" />
  </svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
  </svg>
);
export const LockIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </svg>
);
export const SignalIcon = ({ level = 3, ...p }: P & { level?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    {[0, 1, 2].map((i) => (
      <rect
        key={i}
        x={4 + i * 6}
        y={14 - i * 3.5}
        width={4}
        height={4 + i * 3.5}
        rx={1}
        opacity={i < level ? 1 : 0.25}
      />
    ))}
  </svg>
);
