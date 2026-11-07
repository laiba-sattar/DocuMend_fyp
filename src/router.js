import { useEffect, useState } from 'react';

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);

  // pushState does not fire popstate, so notify the listeners ourselves.
  const tell = () => window.dispatchEvent(new PopStateEvent('popstate'));
  tell();
  // ...and once more after the current render has finished. A page that calls
  // navigate() from its own first effect (FinishSignIn does) would otherwise
  // shout before the router is listening: effects run child-first, so the
  // router's own listener is not attached yet. The repeat is harmless — the
  // second call sets the same pathname.
  queueMicrotask(tell);

  window.scrollTo(0, 0);
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    return () => window.removeEventListener('popstate', syncPathname);
  }, []);
  return pathname;
}
