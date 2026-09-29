'use client';
import * as React from 'react';
import toast from 'react-hot-toast';
import { useRoomContext } from '@livekit/components-react';
import { DonateIcon, HangupIcon, LogOutIcon } from './icons';
import { OrbitSettingsModal } from './OrbitSettingsModal';

// Re-exported so the toolbar keeps a single import surface for dialogs.
export { OrbitSettingsModal };

export type OrbitModal = 'settings' | 'donate' | 'leave' | 'endall' | null;

function Modal({
  title,
  icon,
  tone,
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: 'danger' | 'pink';
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy: string;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="orbit-dlg-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="orbit-dlg" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="orbit-dlg-head">
          <h3 className={`orbit-dlg-title${tone ? ` is-${tone}` : ''}`} id={labelledBy}>
            {icon}
            {title}
          </h3>
          <button type="button" className="orbit-dlg-x" onClick={onClose} aria-label="Close dialog">
            &times;
          </button>
        </div>
        <div className="orbit-dlg-body">{children}</div>
        {footer && <div className="orbit-dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- donate ---------- */
const AMOUNTS = [5, 15, 30];

export function OrbitDonateModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = React.useState(5);
  const [custom, setCustom] = React.useState('5');

  const selected = custom.trim() === '' ? amount : Number(custom) || 0;

  return (
    <Modal
      labelledBy="orbit-donate-title"
      title="Support Orbit Meeting"
      tone="pink"
      icon={<DonateIcon />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="orbit-mbtn secondary" onClick={onClose}>
            Maybe later
          </button>
          <button
            type="button"
            className="orbit-mbtn primary is-pink"
            aria-disabled="true"
            title="No payment provider is configured for this deployment"
            onClick={() => {
              toast(
                'Donations are not switched on for this deployment — no payment provider is configured, so nothing was charged.',
              );
            }}
          >
            Donate
          </button>
        </>
      }
    >
      <p className="orbit-mhint">
        Orbit Meeting is powered by open peer-to-peer technologies. Your support helps keep servers
        fast, encrypted, and accessible.
      </p>
      <div className="orbit-donate-presets">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            className={`orbit-donate-pill${amount === a && custom === String(a) ? ' is-active' : ''}`}
            onClick={() => {
              setAmount(a);
              setCustom(String(a));
            }}
          >
            ${a}.00
          </button>
        ))}
      </div>
      <div className="orbit-mfield">
        <label htmlFor="orbit-donate-custom">Or custom amount ($ USD)</label>
        <input
          id="orbit-donate-custom"
          type="number"
          min={1}
          step={1}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      </div>
      <p className="orbit-mhint">Selected amount: ${selected.toFixed(2)}</p>
    </Modal>
  );
}

/* ---------- leave / end call confirmations ---------- */
export function OrbitLeaveModal({ onClose }: { onClose: () => void }) {
  const room = useRoomContext();
  return (
    <Modal
      labelledBy="orbit-leave-title"
      title="Leave Call?"
      icon={<LogOutIcon />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="orbit-mbtn secondary" onClick={onClose}>
            Stay
          </button>
          <button
            type="button"
            className="orbit-mbtn primary"
            onClick={() => {
              onClose();
              room.disconnect().catch(() => undefined);
            }}
          >
            Leave Call
          </button>
        </>
      }
    >
      <p className="orbit-mhint">
        You will disconnect from <strong>{room.name}</strong>. The meeting will continue for all
        other participants.
      </p>
    </Modal>
  );
}

export function OrbitEndAllModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      labelledBy="orbit-endall-title"
      title="End Call for All?"
      tone="danger"
      icon={<HangupIcon />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="orbit-mbtn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="orbit-mbtn primary is-danger"
            onClick={() => {
              onClose();
              toast(
                'Ending a room for everyone needs a server-side endpoint — not available here.',
              );
            }}
          >
            End Call for Everyone
          </button>
        </>
      }
    >
      {/* The copy must not claim the call ends when it cannot. The LiveKit
          browser SDK can only disconnect the caller; ending a room for
          everyone is a server-side RoomService operation that this build has
          no endpoint for. An earlier version of this text said "will
          disconnect all participants", which was false. */}
      <p className="orbit-mhint">
        This would disconnect every participant and terminate the session.
      </p>
      <p className="orbit-mhint is-warn">
        <strong>Not available in this build.</strong> A browser client cannot end a room for
        everyone — only itself. This needs a server endpoint, so the button below does nothing yet.
        To leave now, use <strong>End Call</strong> in the toolbar.
      </p>
    </Modal>
  );
}
