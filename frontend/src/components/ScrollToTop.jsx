import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }

    const id = decodeURIComponent(hash.slice(1));
    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const scrollWhenReady = () => {
      if (cancelled) return;

      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        return;
      }

      if (attempts < 60) {
        attempts += 1;
        frame = window.requestAnimationFrame(scrollWhenReady);
        return;
      }

      window.scrollTo(0, 0);
    };

    frame = window.requestAnimationFrame(scrollWhenReady);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [pathname, hash]);

  return null;
}
