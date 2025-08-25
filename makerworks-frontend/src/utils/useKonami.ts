// src/utils/useKonami.ts
import { useEffect, useRef } from 'react';

type Opts = {
  ignoreInputs?: boolean; // don't capture when user is typing in inputs/textarea/contenteditable
};

const SEQ = [
  'ArrowUp', 'ArrowUp',
  'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'b', 'a'
];

// Allow Enter immediately after the code, but don't require it.
const ACCEPT_ENTER = true;

export function useKonami(onTrigger: () => void, opts: Opts = {}) {
  const { ignoreInputs = false } = opts;
  const posRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (ignoreInputs) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (t && (t as any).isContentEditable)) {
          return;
        }
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // normalize case for letters
      const expected = SEQ[posRef.current];

      if (key === expected) {
        posRef.current += 1;
        if (posRef.current === SEQ.length) {
          const finish = () => {
            posRef.current = 0;
            onTrigger();
          };
          if (ACCEPT_ENTER) {
            let pressedEnter = false;
            const once = (ev: KeyboardEvent) => {
              if (ev.key === 'Enter') pressedEnter = true;
              window.removeEventListener('keydown', once, true);
              finish();
            };
            window.addEventListener('keydown', once, true);
            window.setTimeout(() => {
              if (!pressedEnter) {
                try { window.removeEventListener('keydown', once, true); } catch {}
                finish();
              }
            }, 300);
          } else {
            finish();
          }
        }
      } else {
        // If the wrong key, but it *was* the first key, keep pos at 1; else reset.
        posRef.current = key === SEQ[0] ? 1 : 0;
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [onTrigger, ignoreInputs]);
}
