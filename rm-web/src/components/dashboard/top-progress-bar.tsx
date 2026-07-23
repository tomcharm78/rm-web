'use client';
// Top progress bar for route transitions.
//
// Moving between modules gave no feedback at all — you clicked Tasks and nothing
// happened until the page swapped, so a slow query read as a dead click.
//
// The App Router has no router events to subscribe to (they were removed with the
// Pages Router), so the two ends of a navigation are inferred:
//   START  — a click on an internal <a> whose href differs from where we are.
//   FINISH — usePathname() changes, which only happens once the new route commits.
//
// The bar creeps toward 90% and waits there. It never reaches 100 on its own,
// because pretending to know the remaining time is how progress bars end up
// sitting full while the page is still blank. It only completes when the route
// actually arrives.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function TopProgressBar() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);
  const startedAt = useRef(0);

  // A navigation that resolves in 80ms would flash the bar for less time than it
  // takes to paint, which reads as nothing happening at all. Hold it briefly so
  // fast routes still confirm the click registered.
  const MIN_VISIBLE_MS = 400;

  function stopCreep() {
    if (creepRef.current) {
      clearInterval(creepRef.current);
      creepRef.current = null;
    }
  }

  function start() {
    if (hideRef.current) clearTimeout(hideRef.current);
    stopCreep();
    setVisible(true);
    setWidth(8);
    startedAt.current = Date.now();
    // Decelerating creep — fast at first, then slower, approaching but never
    // reaching 90. Feels like progress without ever claiming to be nearly done.
    creepRef.current = setInterval(() => {
      setWidth((w) => (w >= 90 ? w : w + Math.max(0.4, (90 - w) * 0.08)));
    }, 120);
  }

  function finish() {
    const elapsed = Date.now() - startedAt.current;
    if (elapsed < MIN_VISIBLE_MS) {
      hideRef.current = setTimeout(finish, MIN_VISIBLE_MS - elapsed);
      return;
    }
    stopCreep();
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 260);
  }

  // FINISH — the route committed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // the initial page load is not a navigation
    }
    finish();
  }, [pathname]);

  // START — capture clicks on internal links anywhere in the app.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Let the browser handle modified clicks — new tab, download, etc.
      // NOTE: no defaultPrevented check. Next's <Link> calls preventDefault to
      // navigate client-side, and React's root handler runs before a document
      // listener would — so testing it here means never firing on the very links
      // we care about. We listen in the CAPTURE phase instead (see below).
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;   // external
      if (url.pathname === window.location.pathname) return; // same page

      start();
    }

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      stopCreep();
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        insetInlineStart: 0,
        width: '100%',
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: '#4f46e5',
          borderStartEndRadius: 3,
          borderEndEndRadius: 3,
          transition: width === 100 ? 'width 200ms ease-out' : 'width 200ms linear',
        }}
      />
    </div>
  );
}