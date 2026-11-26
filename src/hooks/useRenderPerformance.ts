import { useEffect, useRef } from 'react';

interface RenderPerfOptions {
  warnThresholdMs?: number;
  trackRenders?: boolean;
}

/**
 * Tracks component mount, initialization, and commit latencies using the browser
 * Performance API (`performance.mark` / `performance.measure`), logging diagnostics
 * strictly to developer console without rendering telemetry in the UI.
 */
export function useRenderPerformance(
  componentName: string,
  options: RenderPerfOptions = {}
): void {
  const { warnThresholdMs = 24, trackRenders = false } = options;
  const mountStartRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : 0
  );
  const renderStartRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : 0
  );
  const renderCountRef = useRef<number>(0);

  if (typeof performance !== 'undefined') {
    renderStartRef.current = performance.now();
  }
  renderCountRef.current += 1;

  useEffect(() => {
    if (typeof performance === 'undefined') return;
    const mountEnd = performance.now();
    const initDurationMs = Number((mountEnd - mountStartRef.current).toFixed(2));
    const startMark = `${componentName}:mount-start`;
    const endMark = `${componentName}:mount-ready`;
    const measureName = `${componentName}:init`;

    try {
      performance.mark(startMark, { startTime: mountStartRef.current });
      performance.mark(endMark, { startTime: mountEnd });
      performance.measure(measureName, startMark, endMark);
      const entries = performance.getEntriesByName(measureName, 'measure');
      const latest = entries[entries.length - 1];
      const measuredMs = latest ? Number(latest.duration.toFixed(2)) : initDurationMs;

      if (measuredMs > warnThresholdMs) {
        console.warn(
          `[perf] ${componentName} initialization took ${measuredMs}ms (threshold ${warnThresholdMs}ms)`
        );
      } else if (import.meta.env.DEV) {
        console.info(`[perf] ${componentName} interactive in ${measuredMs}ms`);
      }

      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    } catch {
      // Ignore Performance API errors on restricted browsers
    }
  }, [componentName, warnThresholdMs]);

  useEffect(() => {
    if (!trackRenders || typeof performance === 'undefined') return;
    const commitDuration = performance.now() - renderStartRef.current;
    if (renderCountRef.current > 1 && commitDuration > warnThresholdMs * 1.5) {
      console.warn(
        `[perf] ${componentName} re-render #${renderCountRef.current} took ${commitDuration.toFixed(2)}ms`
      );
    }
  });
}
