import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'warning';

export interface ToastMessage {
  text: string;
  type: ToastType;
}

/**
 * Simple auto-dismissing toast. Call showToast(text) for a success message
 * or showToast(text, 'warning') for a warning; it clears itself after 4s.
 */
export function useToast() {
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  return { toastMessage, showToast };
}
