'use client';
import * as React from 'react';

/**
 * A locally-chosen profile picture.
 *
 * There are no accounts in this build, so there is nowhere to upload an avatar
 * to. It is kept in localStorage and applied to the local participant's own
 * tiles only — it is a convenience for the person using this browser, not an
 * identity claim. Anything more would need a real profile service.
 *
 * The data URL is deliberately size-capped: localStorage is a ~5 MB budget for
 * the whole origin, and an uncapped 12 MP phone photo would blow it up and
 * evict everything else.
 */

const KEY = 'orbit.avatar';
const EVENT = 'orbit:avatar';
const MAX_BYTES = 256 * 1024;

/** Downscales to a square thumbnail and returns a JPEG data URL. */
async function toSquareDataUrl(file: File, size = 192): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('canvas unavailable');
  }
  // Centre-crop to square before scaling, so portraits are not squashed.
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function getLocalAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLocalAvatar(dataUrl: string | null) {
  try {
    if (dataUrl) window.localStorage.setItem(KEY, dataUrl);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Quota exceeded or storage disabled: the picker just does not stick.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Reads a picked image file, rejecting anything too large to store.
 * Returns the stored data URL, or null if the user cancelled.
 */
export async function pickLocalAvatar(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > MAX_BYTES * 4) throw new Error('Please pick an image smaller than 1 MB.');
  const dataUrl = await toSquareDataUrl(file);
  if (dataUrl.length > MAX_BYTES) throw new Error('That image is too detailed to store.');
  setLocalAvatar(dataUrl);
  return dataUrl;
}

export function useLocalAvatar(): string | null {
  // Seeded post-mount for the same SSR-safety reason as meeting prefs.
  const [avatar, setAvatar] = React.useState<string | null>(null);

  React.useEffect(() => {
    const read = () => setAvatar(getLocalAvatar());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return avatar;
}
