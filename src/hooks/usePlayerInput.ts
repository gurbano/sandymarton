/**
 * React hook for capturing keyboard input for player control
 */

import { useEffect, useCallback } from 'react';
import { getPlayerManager } from '../player';

interface UsePlayerInputOptions {
  enabled?: boolean;
}

/**
 * Hook that captures keyboard input and forwards it to the PlayerManager
 * Handles key repeat prevention and proper cleanup
 */
export function usePlayerInput(options: UsePlayerInputOptions = {}) {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Prevent default for game controls to avoid scrolling
      const gameKeys = ['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      if (gameKeys.includes(event.key.toLowerCase())) {
        event.preventDefault();
      }

      getPlayerManager().handleKeyDown(event.key);
    },
    [enabled]
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      getPlayerManager().handleKeyUp(event.key);
    },
    [enabled]
  );

  // Handle blur (window loses focus) - release all keys
  const handleBlur = useCallback(() => {
    const manager = getPlayerManager();
    // Release all common game keys
    ['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].forEach(
      (key) => manager.handleKeyUp(key)
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, handleKeyDown, handleKeyUp, handleBlur]);

  // Return player manager for direct access if needed
  return getPlayerManager();
}

export default usePlayerInput;
