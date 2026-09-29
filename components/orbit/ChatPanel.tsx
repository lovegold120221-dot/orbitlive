'use client';
import * as React from 'react';
import { useChat } from '@livekit/components-react';

export type ChatMessageView = {
  id: string;
  from?: string;
  message: string;
  time: string;
  isLocal: boolean;
};

export function OrbitChatPanel({ onClose }: { onClose: () => void }) {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = React.useState('');
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages.length]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    try {
      await send(text);
      setDraft('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="orbit-drawer-head">
        <h3 className="orbit-drawer-title">In-call Messages</h3>
        <button className="orbit-drawer-x" onClick={onClose} aria-label="Close chat" title="Close">
          &times;
        </button>
      </div>
      <div className="orbit-drawer-body" ref={listRef}>
        {chatMessages.length === 0 ? (
          <div className="orbit-empty">No messages yet. Say hello to the meeting.</div>
        ) : (
          <div className="orbit-chat-list">
            {chatMessages.map((m) => {
              const from = m.from?.name || m.from?.identity || 'Guest';
              return (
                <div className="orbit-chat-msg" key={m.id}>
                  <div className="orbit-chat-meta">
                    <strong className={m.from?.isLocal ? 'is-own' : ''}>{from}</strong>
                    <span>
                      {typeof m.timestamp === 'number'
                        ? new Date(m.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="orbit-chat-bubble">{m.message}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <form className="orbit-chat-bar" onSubmit={submit}>
        <input
          className="orbit-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message to everyone..."
          aria-label="Send a message"
          autoComplete="off"
        />
        <button type="submit" className="orbit-chat-send" disabled={!draft.trim() || isSending}>
          Send
        </button>
      </form>
    </>
  );
}
