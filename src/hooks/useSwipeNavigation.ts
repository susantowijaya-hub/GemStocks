import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppRoute } from '../types/market';

export interface SwipeNavigationHint {
  direction: 'prev' | 'next';
  targetRoute: AppRoute;
  progress: number;
  readyToCommit: boolean;
}

interface UseSwipeNavigationOptions {
  routes: readonly AppRoute[];
  activeRoute: AppRoute;
  disabled?: boolean;
  onNavigate: (route: AppRoute, direction: 1 | -1) => void;
}

interface SwipeSession {
  active: boolean;
  locked: 'horizontal' | 'vertical' | null;
  isCoarseTouch: boolean;
  startX: number;
  startY: number;
  startScrollY: number;
  startAt: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  lastDx: number;
  maxAbsDy: number;
  recentVelocityPxPerMs: number;
  crossedThreshold: boolean;
}

const INITIAL_SESSION: SwipeSession = {
  active: false,
  locked: null,
  isCoarseTouch: true,
  startX: 0,
  startY: 0,
  startScrollY: 0,
  startAt: 0,
  lastX: 0,
  lastY: 0,
  lastAt: 0,
  lastDx: 0,
  maxAbsDy: 0,
  recentVelocityPxPerMs: 0,
  crossedThreshold: false,
};

function detectCoarseTouchDevice(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    if (window.matchMedia?.('(any-pointer: coarse)').matches && navigator.maxTouchPoints > 0) {
      return true;
    }
  } catch {
    // ignore matchMedia errors
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

function hasBlockingSwipeAncestor(el: EventTarget | null, boundary: HTMLElement | null): boolean {
  let curr = el instanceof HTMLElement ? el : null;
  while (curr && curr !== boundary) {
    if (curr.dataset.noViewSwipe === 'true') return true;
    const tag = curr.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'CANVAS' ||
      curr.getAttribute('role') === 'slider' ||
      curr.isContentEditable
    ) {
      return true;
    }
    const style = window.getComputedStyle(curr);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      curr.scrollWidth > curr.clientWidth + 6
    ) {
      return true;
    }
    curr = curr.parentElement;
  }
  return false;
}

/**
 * Optimized mobile touch-first swipe-to-navigate hook:
 * - Tight angular cone (horizontal dominance >= 2.15x on touch screens) to eliminate
 *   accidental vertical scroll triggers during diagonal thumb swipes.
 * - Native non-passive `touchmove` lock once horizontal intent is confirmed so vertical
 *   viewport jitter never bleeds into a horizontal route transition.
 * - Damped GPU `dragOffsetPx` feedback for responsive visual feel.
 */
export function useSwipeNavigation({
  routes,
  activeRoute,
  disabled = false,
  onNavigate,
}: UseSwipeNavigationOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const sessionRef = useRef<SwipeSession>({ ...INITIAL_SESSION });
  const isCoarseRef = useRef<boolean>(detectCoarseTouchDevice());

  const [swipeHint, setSwipeHint] = useState<SwipeNavigationHint | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState<number>(0);
  const [isTouchFirst, setIsTouchFirst] = useState<boolean>(() => isCoarseRef.current);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      const coarse = mq.matches || navigator.maxTouchPoints > 0;
      isCoarseRef.current = coarse;
      setIsTouchFirst(coarse);
    };
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    return undefined;
  }, []);

  // Native non-passive touchmove guard: only blocks vertical scroll AFTER horizontal lock is confirmed
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onNativeTouchMove = (ev: TouchEvent) => {
      if (sessionRef.current.active && sessionRef.current.locked === 'horizontal' && ev.cancelable) {
        ev.preventDefault();
      }
    };
    el.addEventListener('touchmove', onNativeTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchmove', onNativeTouchMove);
    };
  }, []);

  const getCommitDistance = useCallback((isCoarse: boolean): number => {
    if (typeof window === 'undefined') return 58;
    const vw = window.innerWidth || 390;
    if (isCoarse) {
      // Responsive ~15% viewport width clamped to [48px, 78px] on touch-first screens
      return Math.min(78, Math.max(48, Math.round(vw * 0.15)));
    }
    return Math.min(92, Math.max(64, Math.round(vw * 0.12)));
  }, []);

  const resetGestureUi = useCallback(() => {
    setSwipeHint(null);
    setDragOffsetPx(0);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (disabled || e.touches.length !== 1) {
        sessionRef.current.active = false;
        return;
      }
      const touch = e.touches[0];
      const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
      // Preserve iOS Safari / Android Chrome system edge back/forward gestures
      const edgeSafeZonePx = 22;
      if (touch.clientX < edgeSafeZonePx || touch.clientX > vw - edgeSafeZonePx) {
        sessionRef.current.active = false;
        return;
      }
      if (hasBlockingSwipeAncestor(e.target, containerRef.current)) {
        sessionRef.current.active = false;
        return;
      }

      const now = performance.now ? performance.now() : Date.now();
      sessionRef.current = {
        active: true,
        locked: null,
        isCoarseTouch: isCoarseRef.current,
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        startAt: now,
        lastX: touch.clientX,
        lastY: touch.clientY,
        lastAt: now,
        lastDx: 0,
        maxAbsDy: 0,
        recentVelocityPxPerMs: 0,
        crossedThreshold: false,
      };
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const sess = sessionRef.current;
      if (!sess.active || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const now = performance.now ? performance.now() : Date.now();
      const dx = touch.clientX - sess.startX;
      const dy = touch.clientY - sess.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const dt = Math.max(1, now - sess.lastAt);
      const instVx = (touch.clientX - sess.lastX) / dt;
      sess.recentVelocityPxPerMs = sess.recentVelocityPxPerMs * 0.35 + instVx * 0.65;
      sess.lastX = touch.clientX;
      sess.lastY = touch.clientY;
      sess.lastAt = now;
      sess.lastDx = dx;
      if (absDy > sess.maxAbsDy) sess.maxAbsDy = absDy;

      // Immediately surrender if the browser already initiated native vertical scrolling
      if (
        sess.locked === null &&
        typeof window !== 'undefined' &&
        Math.abs(window.scrollY - sess.startScrollY) > 3
      ) {
        sess.locked = 'vertical';
        sess.active = false;
        resetGestureUi();
        return;
      }

      if (sess.locked === null) {
        // Strict vertical-first protection so curved thumb scrolling never triggers horizontal nav
        const verticalEarlyLockPx = sess.isCoarseTouch ? 8 : 10;
        const horizontalIntentMinPx = sess.isCoarseTouch ? 16 : 16;
        const horizontalDominanceRatio = sess.isCoarseTouch ? 2.15 : 1.75;
        const maxVerticalDriftBeforeLockPx = sess.isCoarseTouch ? 14 : 15;

        if (absDy >= verticalEarlyLockPx && absDx < absDy * horizontalDominanceRatio) {
          sess.locked = 'vertical';
          sess.active = false;
          resetGestureUi();
          return;
        }

        if (absDx < horizontalIntentMinPx) {
          return;
        }

        if (absDx > absDy * horizontalDominanceRatio && sess.maxAbsDy <= maxVerticalDriftBeforeLockPx) {
          sess.locked = 'horizontal';
        } else {
          sess.locked = 'vertical';
          sess.active = false;
          resetGestureUi();
          return;
        }
      }

      if (sess.locked === 'horizontal') {
        // Abort if gesture drifts sharply vertical after locking
        if (absDy > Math.max(44, absDx * 0.72)) {
          sess.locked = 'vertical';
          sess.active = false;
          resetGestureUi();
          return;
        }

        const curIdx = routes.indexOf(activeRoute);
        const targetIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
        if (targetIdx < 0 || targetIdx >= routes.length || absDx < 16) {
          resetGestureUi();
          return;
        }

        const commitDistance = getCommitDistance(sess.isCoarseTouch);
        const progress = Math.min(1, absDx / commitDistance);
        const readyToCommit = absDx >= commitDistance;

        if (readyToCommit && !sess.crossedThreshold) {
          sess.crossedThreshold = true;
          try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(8);
            }
          } catch {
            // ignore unsupported haptics
          }
        } else if (!readyToCommit && sess.crossedThreshold) {
          sess.crossedThreshold = false;
        }

        // Smooth rubber-banded GPU drag offset (±24px max)
        const damped = Math.round(Math.tanh(dx / 115) * 24);
        setDragOffsetPx(damped);

        setSwipeHint({
          direction: dx < 0 ? 'next' : 'prev',
          targetRoute: routes[targetIdx],
          progress,
          readyToCommit,
        });
      }
    },
    [activeRoute, getCommitDistance, resetGestureUi, routes]
  );

  const handleTouchEnd = useCallback(() => {
    const sess = sessionRef.current;
    resetGestureUi();
    if (!sess.active || sess.locked !== 'horizontal') {
      sess.active = false;
      return;
    }
    sess.active = false;

    const dx = sess.lastDx;
    const absDx = Math.abs(dx);
    const now = performance.now ? performance.now() : Date.now();
    const elapsed = Math.max(1, now - sess.startAt);
    const commitDistance = getCommitDistance(sess.isCoarseTouch);

    // Directional consistency check: recent velocity shouldn't be reversing strongly back to origin
    const signedVelocity = dx < 0 ? -sess.recentVelocityPxPerMs : sess.recentVelocityPxPerMs;
    const isReversing = signedVelocity < -0.2;

    const flickMinDistance = sess.isCoarseTouch ? 34 : 42;
    const flickMinVelocity = sess.isCoarseTouch ? 0.38 : 0.46;
    const isFastIntentionalFlick =
      absDx >= flickMinDistance &&
      elapsed <= 280 &&
      signedVelocity >= flickMinVelocity &&
      absDx > sess.maxAbsDy * 2.2;

    const shouldSwitch = !isReversing && (absDx >= commitDistance || isFastIntentionalFlick);
    if (!shouldSwitch) return;

    const curIdx = routes.indexOf(activeRoute);
    const nextIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
    if (nextIdx >= 0 && nextIdx < routes.length) {
      onNavigate(routes[nextIdx], dx < 0 ? 1 : -1);
    }
  }, [activeRoute, getCommitDistance, onNavigate, resetGestureUi, routes]);

  return {
    containerRef,
    swipeHint,
    dragOffsetPx,
    isTouchFirst,
    bindSwipeHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
  };
}
