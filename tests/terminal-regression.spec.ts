import { expect, test, type Page } from '@playwright/test';

const ALL_ROUTES = [
  { id: 'dashboard', navLabel: 'Markets' },
  { id: 'ict', navLabel: 'ICT Radar' },
  { id: 'watchlist', navLabel: 'Watchlist' },
  { id: 'portfolio', navLabel: 'Portfolio' },
  { id: 'stocks', navLabel: 'Stocks' },
  { id: 'heatmap', navLabel: 'Heatmap' },
  { id: 'news', navLabel: 'News' },
  { id: 'calendar', navLabel: 'Calendar' },
  { id: 'extract', navLabel: 'Share' },
] as const;

const ALL_THEMES = [
  { id: 'obsidian', menuLabel: 'Desk Slate Pro', isDark: true },
  { id: 'arctic', menuLabel: 'Institutional Daylight', isDark: false },
  { id: 'parchment', menuLabel: 'Warm Editorial', isDark: false },
] as const;

function attachErrorCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.startsWith('http://localhost:3000/api/') && res.status() >= 500) {
      serverErrors.push(`${res.status()} ${url}`);
    }
  });

  return { consoleErrors, pageErrors, serverErrors };
}

test.describe('Stocks Terminal E2E & Visual Contrast Regression', () => {
  test('renders all 9 routes with zero console, hydration, or runtime errors', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { consoleErrors, pageErrors, serverErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();

    for (const route of ALL_ROUTES) {
      const navBtn = page
        .locator('header nav[aria-label="Primary Navigation"] button')
        .filter({ hasText: route.navLabel })
        .first();
      await navBtn.click();

      await expect
        .poll(() => new URL(page.url()).hash)
        .toBe(`#${route.id}`);

      // Wait for lazy chunk fallback (MarketSkeleton) to settle
      await expect(page.getByTestId('market-skeleton')).toHaveCount(0);
      await expect(page.getByText('Loading terminal view...')).toHaveCount(0);
      await expect(page.getByText('Session Recovery Needed')).toHaveCount(0);
      await expect(page.getByText('Unable to render')).toHaveCount(0);

      // Ensure main has substantive rendered UI in every route
      const mainTextLen = await page
        .locator('main')
        .evaluate((el) => (el as HTMLElement).innerText.trim().length);
      expect(mainTextLen).toBeGreaterThan(40);
    }

    const hydrationIssues = [...consoleErrors, ...pageErrors].filter((msg) =>
      /hydration|did not match|failed to fetch dynamically imported/i.test(msg)
    );
    expect(hydrationIssues, 'No hydration or dynamic chunk errors').toEqual([]);
    expect(consoleErrors, 'Zero console.error messages across all 9 routes').toEqual([]);
    expect(pageErrors, 'Zero uncaught page errors across all 9 routes').toEqual([]);
    expect(serverErrors, 'Zero 5xx responses from /api/* routes').toEqual([]);
  });

  test('validates WCAG visual contrast and layout integrity across all 3 surviving themes', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('market-skeleton')).toHaveCount(0);
    await expect(page.getByText('Loading terminal view...')).toHaveCount(0);

    // Ensure lazy widgets on dashboard have settled
    await page.waitForTimeout(600);

    for (const theme of ALL_THEMES) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const themeTrigger = page.locator('header button[aria-haspopup="menu"]').first();
      await themeTrigger.click();

      const themeItem = page
        .locator('div[role="menu"][aria-label="Select Display Theme"] button')
        .filter({ hasText: theme.menuLabel })
        .first();
      await expect(themeItem).toBeVisible();
      await themeItem.click();

      await expect
        .poll(() =>
          page.evaluate(() => ({
            hasClass: document.documentElement.className,
            dataTheme: document.documentElement.dataset.theme,
          }))
        )
        .toMatchObject({ dataTheme: theme.id });

      // Allow CSS color/theme transitions (150-300ms) to complete before sampling computed styles
      await page.waitForTimeout(420);

      const audit = await page.evaluate((expectedThemeId) => {
        const CANVAS_RGB: Record<string, [number, number, number]> = {
          obsidian: [11, 14, 20],
          arctic: [244, 246, 249],
          parchment: [244, 240, 230],
        };

        const parseRgba = (str: string): [number, number, number, number] | null => {
          const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
          if (!m) return null;
          return [
            Number(m[1]),
            Number(m[2]),
            Number(m[3]),
            m[4] === undefined ? 1 : Number(m[4]),
          ];
        };

        const parseGradientAvg = (bgImage: string): [number, number, number, number] | null => {
          if (!bgImage || !bgImage.includes('gradient(')) return null;
          const matches = bgImage.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)/gi);
          if (!matches || matches.length === 0) return null;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          let count = 0;
          for (const token of matches) {
            const parsed = parseRgba(token);
            if (parsed) {
              r += parsed[0];
              g += parsed[1];
              b += parsed[2];
              a += parsed[3];
              count += 1;
            }
          }
          if (count === 0) return null;
          return [r / count, g / count, b / count, a / count];
        };

        const blendOver = (
          fg: [number, number, number, number],
          bg: [number, number, number]
        ): [number, number, number] => {
          const a = fg[3];
          return [
            fg[0] * a + bg[0] * (1 - a),
            fg[1] * a + bg[1] * (1 - a),
            fg[2] * a + bg[2] * (1 - a),
          ];
        };

        const relLum = ([r, g, b]: [number, number, number]): number => {
          const conv = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
        };

        const contrastRatio = (c1: [number, number, number], c2: [number, number, number]) => {
          const l1 = relLum(c1);
          const l2 = relLum(c2);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };

        const effectiveBg = (el: HTMLElement): [number, number, number] => {
          const chain: HTMLElement[] = [];
          let curr: HTMLElement | null = el;
          while (curr) {
            chain.push(curr);
            curr = curr.parentElement;
          }
          let rgb: [number, number, number] = CANVAS_RGB[expectedThemeId] ?? [232, 238, 247];
          for (let i = chain.length - 1; i >= 0; i--) {
            const style = window.getComputedStyle(chain[i]);
            const parsed = parseRgba(style.backgroundColor);
            if (parsed && parsed[3] > 0.01) {
              rgb = blendOver(parsed, rgb);
            } else if (chain[i].tagName !== 'BODY' && chain[i].tagName !== 'HTML') {
              const grad = parseGradientAvg(style.backgroundImage);
              if (grad && grad[3] > 0.01) {
                rgb = blendOver(grad, rgb);
              }
            }
          }
          return rgb;
        };

        const selectors = [
          'header button',
          'main h1',
          'main h2',
          'main h3',
          'main button',
          '[data-testid="feed-diagnostics-trigger"]',
        ];
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(',')));
        const violations: Array<{ text: string; ratio: number; fg: string; bg: string }> = [];
        let checked = 0;

        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          const text = el.innerText.trim();
          if (!text || text.length > 80) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || Number(style.opacity) < 0.5) continue;

          // Skip active filled buttons with gradient/overlay spans where parent bg doesn't reflect child span pill
          if (el.closest('nav[aria-label="Primary Navigation"]') && el.querySelector('span.absolute')) {
            continue;
          }

          const fgParsed = parseRgba(style.color);
          if (!fgParsed) continue;
          const bgRgb = effectiveBg(el);
          const fgRgb = fgParsed[3] < 0.99 ? blendOver(fgParsed, bgRgb) : ([fgParsed[0], fgParsed[1], fgParsed[2]] as [number, number, number]);
          const ratio = contrastRatio(fgRgb, bgRgb);
          checked += 1;

          const fontSize = parseFloat(style.fontSize || '14');
          const fontWeight = parseInt(style.fontWeight || '400', 10);
          const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
          const minRequired = isLarge ? 3.0 : 4.2;

          if (ratio < minRequired) {
            violations.push({
              text: text.slice(0, 40),
              ratio: Number(ratio.toFixed(2)),
              fg: `rgb(${fgRgb.map((n) => Math.round(n)).join(',')})`,
              bg: `rgb(${bgRgb.map((n) => Math.round(n)).join(',')})`,
            });
          }
        }

        return {
          checked,
          violations,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
        };
      }, theme.id);

      expect(audit.checked).toBeGreaterThan(8);
      expect(
        audit.violations,
        `Visual contrast violations in theme "${theme.id}": ${JSON.stringify(audit.violations)}`
      ).toEqual([]);
      expect(
        audit.overflowX,
        `Horizontal overflow detected in theme "${theme.id}"`
      ).toBeLessThanOrEqual(2);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('enforces mobile swipe guards over charts & depth curves while allowing main view swipes', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const { consoleErrors, pageErrors } = attachErrorCollectors(page);

    try {
      await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(500);

      // Verify zero horizontal overflow on mobile viewport
      const mobileOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(mobileOverflow).toBeLessThanOrEqual(2);

      // Verify top header icons/controls do NOT overlap each other on 390px mobile view
      const headerAudit = await page.evaluate(() => {
        const header = document.querySelector('header');
        const brandBtn = header?.querySelector('button');
        const actionBar = header?.querySelector('[data-testid="header-actions-bar"]');
        if (!header || !brandBtn || !actionBar) {
          return { ok: false, reason: 'Missing header elements', overlaps: [] as string[] };
        }
        const items = [
          brandBtn as HTMLElement,
          ...Array.from(actionBar.querySelectorAll<HTMLElement>('button')),
        ].filter((el) => {
          const r = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
        });

        const rects = items
          .map((el) => ({
            label: el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText.trim() || 'btn',
            rect: el.getBoundingClientRect(),
          }))
          .sort((a, b) => a.rect.left - b.rect.left);

        const overlaps: string[] = [];
        for (let i = 0; i < rects.length; i++) {
          const cur = rects[i];
          if (cur.rect.left < -1 || cur.rect.right > window.innerWidth + 1) {
            overlaps.push(`OutOfBounds(${cur.label}: ${Math.round(cur.rect.left)}..${Math.round(cur.rect.right)})`);
          }
          for (let j = i + 1; j < rects.length; j++) {
            const nxt = rects[j];
            const horizOverlap = Math.min(cur.rect.right, nxt.rect.right) - Math.max(cur.rect.left, nxt.rect.left);
            const vertOverlap = Math.min(cur.rect.bottom, nxt.rect.bottom) - Math.max(cur.rect.top, nxt.rect.top);
            if (horizOverlap > 1 && vertOverlap > 1) {
              overlaps.push(`${cur.label} overlaps ${nxt.label} by ${Math.round(horizOverlap)}px`);
            }
          }
        }
        return { ok: overlaps.length === 0 && rects.length >= 5, count: rects.length, overlaps };
      });
      expect(headerAudit.overlaps, `Mobile header overlap detected: ${JSON.stringify(headerAudit)}`).toEqual([]);
      expect(headerAudit.ok).toBe(true);

      // Helper: dispatch realistic horizontal touch swipe over a target element or coordinates
      const swipeOnLocator = async (selector: string, startX: number, endX: number) => {
        await page.evaluate(
          ({ sel, sx, ex }) => {
            const target = document.querySelector(sel) as HTMLElement | null;
            if (!target) throw new Error(`Missing swipe target: ${sel}`);
            target.scrollIntoView({ block: 'center' });
            const rect = target.getBoundingClientRect();
            const y = rect.top + Math.min(rect.height / 2, 80);
            const mkTouch = (x: number) =>
              new Touch({
                identifier: 1,
                target,
                clientX: x,
                clientY: y,
                pageX: x,
                pageY: y,
              });

            const tStart = mkTouch(sx);
            target.dispatchEvent(
              new TouchEvent('touchstart', {
                bubbles: true,
                cancelable: true,
                touches: [tStart],
                targetTouches: [tStart],
                changedTouches: [tStart],
              })
            );

            const steps = 4;
            for (let i = 1; i <= steps; i++) {
              const curX = sx + ((ex - sx) * i) / steps;
              const tMove = mkTouch(curX);
              target.dispatchEvent(
                new TouchEvent('touchmove', {
                  bubbles: true,
                  cancelable: true,
                  touches: [tMove],
                  targetTouches: [tMove],
                  changedTouches: [tMove],
                })
              );
            }

            const tEnd = mkTouch(ex);
            target.dispatchEvent(
              new TouchEvent('touchend', {
                bubbles: true,
                cancelable: true,
                touches: [],
                targetTouches: [],
                changedTouches: [tEnd],
              })
            );
          },
          { sel: selector, sx: startX, ex: endX }
        );
      };

      // 1. Swipe inside InteractiveChart guard ([data-no-view-swipe="true"]) -> MUST stay on #dashboard
      await expect(page.locator('[data-no-view-swipe="true"]').first()).toBeVisible();
      await swipeOnLocator('[data-no-view-swipe="true"]', 300, 90);
      await page.waitForTimeout(250);
      expect(new URL(page.url()).hash).toBe('#dashboard');

      // 2. Swipe inside UnifiedMarketPulseCard Depth Book tab curve guard -> verify stays on #dashboard
      const pulseCard = page.getByTestId('unified-market-pulse-card');
      await pulseCard.scrollIntoViewIfNeeded();
      await expect(pulseCard).toBeVisible();
      await pulseCard.locator('[data-pulse-tab="depth"]').click();
      await expect(pulseCard.getByText('Cumulative Depth Curve')).toBeVisible();
      const depthGuardCount = await page.locator('[data-no-view-swipe="true"]').count();
      expect(depthGuardCount).toBeGreaterThanOrEqual(2);
      await page.evaluate(() => {
        const guards = Array.from(document.querySelectorAll<HTMLElement>('[data-no-view-swipe="true"]'));
        const depthGuard = guards[guards.length - 1];
        depthGuard.scrollIntoView({ block: 'center' });
        const rect = depthGuard.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        const mkTouch = (x: number) =>
          new Touch({
            identifier: 2,
            target: depthGuard,
            clientX: x,
            clientY: y,
            pageX: x,
            pageY: y,
          });
        depthGuard.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [mkTouch(300)],
            targetTouches: [mkTouch(300)],
            changedTouches: [mkTouch(300)],
          })
        );
        depthGuard.dispatchEvent(
          new TouchEvent('touchmove', {
            bubbles: true,
            cancelable: true,
            touches: [mkTouch(120)],
            targetTouches: [mkTouch(120)],
            changedTouches: [mkTouch(120)],
          })
        );
        depthGuard.dispatchEvent(
          new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [mkTouch(120)],
          })
        );
      });
      await page.waitForTimeout(250);
      expect(new URL(page.url()).hash).toBe('#dashboard');

      // 3. Swipe on unguarded <main> container area -> MUST navigate from #dashboard to #watchlist and back
      await page.evaluate(() => window.scrollTo(0, 0));
      await swipeOnLocator('main h1, main h2', 310, 90);
      await expect
        .poll(() => new URL(page.url()).hash)
        .toBe('#watchlist');

      await swipeOnLocator('main', 90, 310);
      await expect
        .poll(() => new URL(page.url()).hash)
        .toBe('#dashboard');

      // 4. Mobile layout order: Unified Market Pulse card MUST render strictly above Correlation Matrix on 390px viewports
      await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(450);
      const mobilePulseCard = page.getByTestId('unified-market-pulse-card');
      const correlationSection = page.getByTestId('correlation-matrix-section');
      await mobilePulseCard.scrollIntoViewIfNeeded();
      await expect(mobilePulseCard).toBeVisible();
      await correlationSection.scrollIntoViewIfNeeded();
      await expect(correlationSection).toBeVisible();

      const pulseBox = await mobilePulseCard.boundingBox();
      const corrBox = await correlationSection.boundingBox();
      expect(pulseBox).not.toBeNull();
      expect(corrBox).not.toBeNull();
      expect(pulseBox!.y + pulseBox!.height).toBeLessThanOrEqual(corrBox!.y + 2);

      // 5. Mobile ambient liquid glass backdrop & collapsible BottomDock floating icon
      const backdropStyle = await page.getByTestId('ambient-glass-backdrop').evaluate((el) => {
        const st = window.getComputedStyle(el);
        return { position: st.position, opacity: Number(st.opacity), bg: st.backgroundImage };
      });
      expect(backdropStyle.position).toBe('fixed');
      expect(backdropStyle.opacity).toBeGreaterThan(0);

      const dockTrigger = page.getByTestId('bottom-dock-trigger');
      await expect(dockTrigger).toBeVisible();
      await expect(page.getByTestId('bottom-dock-bar')).toHaveCount(0);
      await dockTrigger.click();
      const dockBar = page.getByTestId('bottom-dock-bar');
      await expect(dockBar).toBeVisible();
      await dockBar.locator('[data-route-id="portfolio"]').click();
      await expect
        .poll(() => new URL(page.url()).hash)
        .toBe('#portfolio');
      await expect(dockTrigger).toBeVisible({ timeout: 3000 });

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('surfaces real-time multi-provider failover and cached snapshot diagnostics badge & drawer', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { pageErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' });

    const diagTrigger = page.getByTestId('feed-diagnostics-trigger');
    await expect(diagTrigger).toBeVisible();

    // Wait for initial quotes RTT / diagnostics to populate
    await expect(diagTrigger).not.toHaveText('Init', { timeout: 15_000 });

    // Open unified Live + Diagnostics drawer and inspect stream control + provider rows
    await diagTrigger.click();
    const drawer = page.getByTestId('feed-diagnostics-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Feed Diagnostics & Failover')).toBeVisible();
    const pauseBtn = drawer.getByRole('button', { name: /Pause Live|Resume Live/ });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();
    await expect(diagTrigger).toContainText('Paused');
    await drawer.getByRole('button', { name: 'Resume Live' }).click();
    await expect(drawer.getByText('Coinbase L2 & Spot')).toBeVisible();
    await expect(drawer.getByText('Global Indices & Macro')).toBeVisible();
    await expect(drawer.getByText('IDX Equities Proxy')).toBeVisible();
    await expect(drawer.getByText('Quotes RTT')).toBeVisible();

    // Close drawer before checking other UI overlays
    await diagTrigger.click();

    // Simulate /api/market/quotes cached snapshot fallback via route interception
    await diagTrigger.click();
    await page.route('**/api/market/quotes', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.diagnostics = {
        overallStatus: 'cached',
        hasCachedFallback: true,
        hasFailover: true,
        serverTimestamp: Date.now(),
        providers: [
          {
            id: 'coinbase',
            label: 'Coinbase L2 & Spot',
            primarySource: 'Coinbase Exchange L2',
            activeSource: 'Yahoo Crypto Fallback',
            status: 'failover',
            latencyMs: 142,
            lastSuccessAt: Date.now() - 4000,
            isCachedFallback: false,
            fallbackReason: 'Coinbase L2 timeout; fell back to session book',
          },
          {
            id: 'yahoo_macro',
            label: 'Global Indices & Macro',
            primarySource: 'Yahoo Finance v8 + TV',
            activeSource: 'Cached Quotes Snapshot (SWR)',
            status: 'cached',
            latencyMs: 38,
            lastSuccessAt: Date.now() - 12000,
            isCachedFallback: true,
            fallbackReason: 'Serving warm snapshot while refreshing upstream',
          },
          {
            id: 'idx_proxy',
            label: 'IDX Equities Proxy',
            primarySource: 'IDX TV Scanner + Flow',
            activeSource: 'Yahoo .JK Basket Proxy',
            status: 'failover',
            latencyMs: 210,
            lastSuccessAt: Date.now() - 5000,
            isCachedFallback: false,
            fallbackReason: 'IDX TradingView scanner sparse; Yahoo .JK proxy active',
          },
        ],
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.route('**/api/market/diagnostics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          overallStatus: 'cached',
          hasCachedFallback: true,
          hasFailover: true,
          serverTimestamp: Date.now(),
          providers: [
            {
              id: 'coinbase',
              label: 'Coinbase L2 & Spot',
              primarySource: 'Coinbase Exchange L2',
              activeSource: 'Yahoo Crypto Fallback',
              status: 'failover',
              latencyMs: 142,
              lastSuccessAt: Date.now() - 4000,
              isCachedFallback: false,
              fallbackReason: 'Coinbase L2 timeout; fell back to session book',
            },
            {
              id: 'yahoo_macro',
              label: 'Global Indices & Macro',
              primarySource: 'Yahoo Finance v8 + TV',
              activeSource: 'Cached Quotes Snapshot (SWR)',
              status: 'cached',
              latencyMs: 38,
              lastSuccessAt: Date.now() - 12000,
              isCachedFallback: true,
              fallbackReason: 'Serving warm snapshot while refreshing upstream',
            },
            {
              id: 'idx_proxy',
              label: 'IDX Equities Proxy',
              primarySource: 'IDX TV Scanner + Flow',
              activeSource: 'Yahoo .JK Basket Proxy',
              status: 'failover',
              latencyMs: 210,
              lastSuccessAt: Date.now() - 5000,
              isCachedFallback: false,
              fallbackReason: 'IDX TradingView scanner sparse; Yahoo .JK proxy active',
            },
          ],
        }),
      });
    });

    await drawer.getByRole('button', { name: 'Retry Live Feeds' }).click();

    await expect(diagTrigger).toContainText('Cached');
    await expect(drawer.getByText('Cached Snapshot Fallback Active')).toBeVisible();
    await expect(drawer.getByText('Yahoo .JK Basket Proxy')).toBeVisible();
    await expect(drawer.getByText('Yahoo Crypto Fallback')).toBeVisible();

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await diagTrigger.click();

    // Verify Top 8 open-session ticker strip & Breaking News marquee bar
    await expect(page.getByTestId('breaking-news-bar')).toBeVisible();
    const liveStrip = page.getByTestId('live-ticker-strip');
    await expect(liveStrip).toBeVisible();
    await expect(liveStrip).toContainText(/OPEN TOP 8|LIVE TOP 8/);

    // Verify D3 5-minute trajectory sparklines on dashboard ticker cards
    await page.evaluate(() => window.scrollTo(0, 0));
    const sparkRows = page.getByTestId('ticker-5m-sparkline-row');
    expect(await sparkRows.count()).toBeGreaterThanOrEqual(4);
    const firstSparkRow = sparkRows.first();
    await expect(firstSparkRow).toBeVisible();
    await expect(firstSparkRow).toContainText(/5m\s+[+\-]?\d+\.\d{2}%/);
    const firstSparkSvg = firstSparkRow.getByTestId('d3-5m-sparkline');
    await expect(firstSparkSvg).toBeVisible();
    expect(await firstSparkSvg.locator('path').count()).toBeGreaterThanOrEqual(1);

    // Verify redundant overlapping cards were consolidated into ONE UnifiedMarketPulseCard
    await expect(page.getByTestId('risk-regime-gauge')).toHaveCount(0);
    await expect(page.getByTestId('market-fear-greed-gauge')).toHaveCount(0);
    await expect(page.getByTestId('headline-sentiment-gauge')).toHaveCount(0);
    await expect(page.getByTestId('technicals-sentiment-card')).toHaveCount(0);
    await expect(page.getByText('Index 3-Phase Session Briefings')).toHaveCount(0);

    const pulseCard = page.getByTestId('unified-market-pulse-card');
    await pulseCard.scrollIntoViewIfNeeded();
    await expect(pulseCard).toBeVisible();
    const compositeScore = Number(await page.getByTestId('unified-pulse-score').innerText());
    expect(compositeScore).toBeGreaterThanOrEqual(0);
    expect(compositeScore).toBeLessThanOrEqual(100);
    await expect(page.getByTestId('unified-pulse-stance')).toHaveText(
      /Strong Risk-On|Risk-On|Neutral|Balanced|Risk-Off|Strong Risk-Off/
    );
    await expect(pulseCard).toContainText('Risk-On');
    await expect(pulseCard).toContainText('Fear/Greed');
    await expect(pulseCard).toContainText('Headlines');
    await expect(pulseCard).toContainText('Key Support');

    // Switch internal tabs inside the single unified card (Depth Book + News & Vol)
    await pulseCard.locator('[data-pulse-tab="depth"]').click();
    await expect(pulseCard.getByText('Cumulative Depth Curve')).toBeVisible();
    await pulseCard.locator('[data-pulse-tab="drivers"]').click();
    await expect(pulseCard.getByText('Avg 5m Range')).toBeVisible();
    await pulseCard.getByRole('tab', { name: 'Bull' }).click();
    await pulseCard.getByRole('tab', { name: 'Bear' }).click();
    await pulseCard.getByRole('tab', { name: 'Top' }).click();
    await pulseCard.locator('[data-pulse-tab="overview"]').click();

    // Verify Key Statistics & Dynamic Timeframe Range incorporated directly inside chart
    const chartStats = page.getByTestId('chart-key-statistics');
    await chartStats.scrollIntoViewIfNeeded();
    await expect(chartStats).toBeVisible();
    await expect(page.getByTestId('chart-timeframe-range')).toContainText('Day Range');

    // Verify major FX currencies & granular intraday timeframes (1m..4h) + Candlestick toggle + Dynamic Range switch
    await page.evaluate(() => window.scrollTo(0, 0));
    const fxTab = page.locator('main button').filter({ hasText: 'Currencies & Yields' }).first();
    await fxTab.click();
    for (const pair of ['USD/IDR', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD', 'USD/CNY']) {
      await expect(page.locator('main').getByText(pair).first()).toBeVisible();
    }

    // Select EUR/USD to reveal 1m, 5m, 15m, 30m, 1h, 4h timeframe buttons & Candlestick OHLC
    await page.locator('main button').filter({ hasText: 'EUR/USD' }).first().click();
    const chartToggle = page.getByTestId('chart-type-toggle');
    await expect(chartToggle).toBeVisible();
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h']) {
      await expect(page.locator('main button', { hasText: new RegExp(`^${tf}$`) })).toBeVisible();
    }
    await page.locator('main button', { hasText: /^15m$/ }).click();
    await expect(page.getByTestId('chart-timeframe-range')).toContainText('15m Range');
    await chartToggle.getByRole('button', { name: 'Candles' }).click();
    const candleGroup = page.getByTestId('candlestick-series');
    await expect(candleGroup).toBeVisible();
    expect(await candleGroup.locator('canvas').count()).toBeGreaterThanOrEqual(1);
    await chartToggle.getByRole('button', { name: 'Line' }).click();
    await expect(candleGroup).toHaveCount(0);

    // Verify BTC/USD and XAU/USD also expose granular 1m..4h timeframes
    const commTab = page.locator('main button').filter({ hasText: 'Commodities & Crypto' }).first();
    await commTab.click();
    await page.locator('main button').filter({ hasText: 'Bitcoin' }).first().click();
    await expect(page.locator('main button', { hasText: /^1m$/ })).toBeVisible();
    await expect(page.locator('main button', { hasText: /^4h$/ })).toBeVisible();
    await page.locator('main button').filter({ hasText: 'Gold' }).first().click();
    await expect(page.locator('main button', { hasText: /^5m$/ })).toBeVisible();
    await expect(page.locator('main button', { hasText: /^1h$/ })).toBeVisible();

    // Verify ICT Liquidity & OTE Radar moved to its own chart-free #ict tab with Active/Deactive pop-up toggle & timestamps
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .locator('header nav[aria-label="Primary Navigation"] button')
      .filter({ hasText: 'ICT Radar' })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#ict');

    const ictView = page.getByTestId('ict-radar-view');
    await expect(ictView).toBeVisible();
    // Strictly zero charts inside #ict
    await expect(ictView.getByTestId('candlestick-series')).toHaveCount(0);
    await expect(ictView.locator('canvas')).toHaveCount(0);

    const ictGrid = ictView.getByTestId('ict-pairs-grid');
    await expect(ictGrid).toBeVisible();
    for (const sym of ['BTC/USD', 'XAU/USD']) {
      await expect(ictGrid).toContainText(sym);
    }
    for (const excludedSym of [
      'EUR/USD',
      'GBP/USD',
      'USD/JPY',
      'AUD/USD',
      'USD/IDR',
      'USD/CNY',
      'US10Y',
      'ID10Y',
      'DXY',
    ]) {
      await expect(ictGrid).not.toContainText(excludedSym);
    }

    // Verify Volatility Noise Filter & Macro News Guard toggles + Relative Timestamps inside #ict
    const volFilterToggle = ictView.getByTestId('ict-vol-filter-toggle');
    await expect(volFilterToggle).toBeVisible();
    await expect(volFilterToggle).toContainText('On');
    await volFilterToggle.click();
    await expect(volFilterToggle).toContainText('Off');
    await volFilterToggle.click();
    await expect(volFilterToggle).toContainText('On');

    const newsGuardToggle = ictView.getByTestId('ict-news-guard-toggle');
    await expect(newsGuardToggle).toBeVisible();
    await expect(newsGuardToggle).toContainText('On');
    await newsGuardToggle.click();
    await expect(newsGuardToggle).toContainText('Off');
    await newsGuardToggle.click();
    await expect(newsGuardToggle).toContainText('On');

    await expect(ictView.getByTestId('ict-focused-vol-status')).toContainText(/ATR \d+\.\d{3}%/);
    const focusedSpotPlaque = ictView.getByTestId('ict-focused-spot-price');
    await expect(focusedSpotPlaque).toBeVisible();
    await expect(focusedSpotPlaque).toHaveClass(/spot-plaque-surface/);
    await expect(focusedSpotPlaque.locator('.spot-price-3d-hero')).toBeVisible();
    await expect(focusedSpotPlaque.getByTestId('ict-focused-spot-bias-badge')).toBeVisible();
    await expect(focusedSpotPlaque.getByTestId('ict-focused-spot-bias-badge')).toHaveText(
      /^(BUY|SELL|BUY LIMIT|SELL LIMIT|PULLBACK · BUY|PULLBACK · SELL|WAIT FOR BUY|WAIT FOR SELL|WAIT · RANGING)$/
    );
    await expect(ictGrid.locator('[data-testid="ict-card-spot-bias-badge"]').first()).toHaveText(
      /^(BUY|SELL|BUY LIMIT|SELL LIMIT|PULLBACK · BUY|PULLBACK · SELL|WAIT FOR BUY|WAIT FOR SELL|WAIT · RANGING)$/
    );
    await expect(ictView.getByTestId('ict-execution-banner')).toBeVisible();
    await expect(ictView.getByTestId('ict-rr-comparison')).toBeVisible();
    await expect(ictView.getByTestId('ict-spot-proximity')).toBeVisible();
    await expect(ictView.getByTestId('ict-invalidation-box')).toBeVisible();
    await expect(ictView.getByTestId('ict-invalidation-box')).toContainText('Allowed 15m ATR:');
    await expect(ictView.getByTestId('ict-focused-relative-time')).toHaveText(/Just now|\d+[smhd] ago/);
    await expect(ictGrid.locator('[data-testid="ict-signal-relative-time"]').first()).toHaveText(
      /Just now|\d+[smhd] ago/
    );
    await expect(ictView.getByTestId('ict-action-callout')).toBeVisible();
    await expect(ictView.getByTestId('ict-confluence-strip')).toBeVisible();

    // Verify Risk Calculator & Survival Shield are completely removed, Clearance Scorecard & Bias->Placement Ticket are visible, and WAIT safety holds
    await expect(ictView.getByTestId('ict-position-calculator')).toHaveCount(0);
    await expect(ictView.getByTestId('survival-strategy-panel')).toHaveCount(0);
    const clearanceScorecard = ictView.getByTestId('ict-clearance-scorecard');
    await expect(clearanceScorecard).toBeVisible();
    await expect(clearanceScorecard).toContainText('5-Gate Signal Clearance');
    await expect(clearanceScorecard.getByTestId('ict-bias-verdict-badge')).toHaveText(
      /^(STRONG BUY|BUY|BULLISH LEAN \(WAIT\)|NEUTRAL \/ RANGE|BEARISH LEAN \(WAIT\)|SELL|STRONG SELL)$/
    );
    const placementTicket = ictView.getByTestId('signal-placement-ticket');
    await expect(placementTicket).toBeVisible();
    await expect(placementTicket).toContainText('Directional Bias');
    await expect(placementTicket).toContainText('Order Placement');
    await expect(placementTicket).toContainText('Hard Stop Loss');
    await expect(placementTicket).toContainText('Take Profit Plan');

    const focusedBadgeText = await ictView.getByTestId('ict-focused-signal-badge').innerText();
    if (focusedBadgeText.includes('WAIT')) {
      await expect(ictView.getByTestId('ict-spot-proximity')).not.toContainText('IN ENTRY ZONE');
      await expect(ictView.getByTestId('ict-spot-proximity')).toContainText(/Standby|Invalidated|Missed/);
      await expect(placementTicket).toContainText('NO ORDER — STAND BY');
    }

    const copyTicketBtn = ictView.getByTestId('ict-copy-ticket-btn');
    await expect(copyTicketBtn).toBeVisible();
    await copyTicketBtn.click();
    await expect(copyTicketBtn).toContainText('Copied');

    await ictView.getByTestId('ict-guide-toggle').click();
    await expect(ictView.getByTestId('ict-how-to-guide')).toBeVisible();
    await ictView.getByTestId('ict-guide-toggle').click();
    await expect(ictView.getByTestId('ict-how-to-guide')).toHaveCount(0);

    await expect(ictView.getByTestId('ict-sort-toggle')).toBeVisible();
    await ictView.getByTestId('ict-sort-volatility').click();
    await expect(ictView.getByTestId('ict-sort-volatility')).toHaveAttribute('aria-pressed', 'true');
    await ictView.getByTestId('ict-sort-occurrence').click();
    await expect(ictView.getByTestId('ict-sort-occurrence')).toHaveAttribute('aria-pressed', 'true');

    // Switch to Supply & Demand · Candle & Volume strategy system inside #ict, verify zero charts & batch scan
    const strategySwitcher = ictView.getByTestId('radar-strategy-switcher');
    await expect(strategySwitcher).toBeVisible();
    await ictView.getByTestId('strategy-tab-sdcv').click();
    await expect(ictView.getByTestId('strategy-tab-sdcv')).toHaveAttribute('aria-selected', 'true');
    await expect(ictView.getByTestId('sdcv-pillar-strip')).toBeVisible();
    await expect(ictView.getByTestId('ict-focused-spot-price')).toBeVisible();
    await expect(ictView.getByTestId('ict-focused-spot-bias-badge')).toBeVisible();
    await expect(ictView.getByTestId('ict-focused-spot-bias-badge')).toHaveText(
      /^(BUY|SELL|BUY LIMIT|SELL LIMIT|PULLBACK · BUY|PULLBACK · SELL|WAIT FOR BUY|WAIT FOR SELL|WAIT · RANGING)$/
    );
    await expect(ictGrid.locator('[data-testid="ict-card-spot-bias-badge"]').first()).toHaveText(
      /^(BUY|SELL|BUY LIMIT|SELL LIMIT|PULLBACK · BUY|PULLBACK · SELL|WAIT FOR BUY|WAIT FOR SELL|WAIT · RANGING)$/
    );
    await expect(ictView.getByTestId('ict-execution-banner')).toBeVisible();
    await expect(ictView.getByTestId('ict-rr-comparison')).toBeVisible();
    await expect(ictView.getByTestId('ict-invalidation-box')).toBeVisible();
    await expect(ictView).toContainText('Candle Reading:');
    await expect(ictView).toContainText(/Relative Volume|Tick-Range Effort|Bar Volume/);
    await expect(ictView.locator('canvas')).toHaveCount(0);

    await expect(ictView.getByTestId('ict-position-calculator')).toHaveCount(0);
    await expect(ictView.getByTestId('survival-strategy-panel')).toHaveCount(0);
    await expect(ictView.getByTestId('ict-clearance-scorecard')).toBeVisible();
    await expect(ictView.getByTestId('ict-bias-verdict-badge')).toHaveText(
      /^(STRONG BUY|BUY|BULLISH LEAN \(WAIT\)|NEUTRAL \/ RANGE|BEARISH LEAN \(WAIT\)|SELL|STRONG SELL)$/
    );
    await expect(ictView.getByTestId('signal-placement-ticket')).toBeVisible();
    await expect(ictView.getByTestId('signal-placement-ticket')).toContainText('Order Placement');
    const sdcvBadgeText = await ictView.getByTestId('ict-focused-signal-badge').innerText();
    if (sdcvBadgeText.includes('WAIT')) {
      await expect(ictView.getByTestId('ict-spot-proximity')).not.toContainText('IN ENTRY ZONE');
      await expect(ictView.getByTestId('signal-placement-ticket')).toContainText('NO ORDER — STAND BY');
    }

    await ictView.getByTestId('ict-scan-now-btn').click();
    await expect(ictView.getByTestId('ict-alert-log')).toContainText(/S&D (BUY|SELL|WAIT)/);

    await ictView.getByTestId('strategy-tab-ict').click();
    await expect(ictView.getByTestId('strategy-tab-ict')).toHaveAttribute('aria-selected', 'true');

    // Toggle ICT Pop-up notifications Deactive -> Scan still appends to timestamped log without spawning ICT pop-up toast
    const popupToggle = ictView.getByTestId('ict-popup-toggle');
    await expect(popupToggle).toBeVisible();
    await popupToggle.click();
    await expect(popupToggle).toContainText('Deactive');

    const alertLog = ictView.getByTestId('ict-alert-log');
    const beforeLogCount = await alertLog.locator('[data-testid="ict-alert-timestamp"]').count();
    await ictView.getByTestId('ict-scan-now-btn').click();
    await expect
      .poll(() => alertLog.locator('[data-testid="ict-alert-timestamp"]').count())
      .toBeGreaterThan(beforeLogCount);
    await expect(alertLog.locator('[data-testid="ict-alert-timestamp"]').first()).toContainText('WIB');
    await expect(alertLog.locator('[data-testid="ict-alert-relative-time"]').first()).toHaveText(
      /Just now|\d+[smhd] ago/
    );
    const firstOutcomeControls = alertLog.locator('[data-testid="alert-outcome-controls"]').first();
    await expect(firstOutcomeControls).toBeVisible();
    const winBtn = firstOutcomeControls.getByRole('button', { name: 'Win' });
    await winBtn.click();
    await expect(winBtn).toHaveAttribute('aria-pressed', 'true');

    // Toast stack unmounts completely when no pop-up toasts exist; if non-ICT toast is present, ensure no ICT toast appeared
    await page.waitForTimeout(250);
    if ((await page.getByTestId('price-alert-toast-stack').count()) > 0) {
      await expect(page.getByTestId('price-alert-toast-stack')).not.toContainText(/ICT (BUY|SELL|WAIT)/);
    }

    // Toggle back to Active -> Scan triggers ICT toast notification AND updates log
    await popupToggle.click();
    await expect(popupToggle).toContainText('Active');
    await ictView.getByTestId('ict-scan-now-btn').click();
    await expect(page.getByTestId('price-alert-toast-stack')).toContainText(/ICT (BUY|SELL|WAIT)/, { timeout: 10_000 });

    // Navigate back to Markets (#dashboard) and verify Alert Drawer IDX Bandarmology & ICT scanning
    await page
      .locator('header nav[aria-label="Primary Navigation"] button')
      .filter({ hasText: 'Markets' })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#dashboard');
    await page.getByTestId('alerts-drawer-toggle').click();
    const alertDrawer = page.getByTestId('price-alert-drawer');
    await expect(alertDrawer).toBeVisible();
    await alertDrawer.getByRole('button', { name: 'Scan ICT' }).click();
    await expect(alertDrawer).toContainText(/ICT (BUY|SELL|WAIT)/);
    await alertDrawer.getByTestId('scan-idx-bandar-btn').click();
    await alertDrawer.getByTestId('alert-filter-tabs').getByRole('tab', { name: /IDX Bandar/ }).click();
    await expect(alertDrawer).toContainText(/Early Acc|Strong Acc|IDX Bandar/);
    await alertDrawer.getByTestId('alert-filter-tabs').getByRole('tab', { name: /All/ }).click();
    await alertDrawer.getByRole('button', { name: 'Close alerts panel' }).click();

    // Verify Collapsible Left SideDock click-to-expand with illuminated navigation names
    const dockTrigger = page.getByTestId('bottom-dock-trigger');
    await expect(dockTrigger).toBeVisible();
    const triggerText = await dockTrigger.evaluate((el) => (el as HTMLElement).innerText.trim());
    expect(triggerText).toBe('');
    await dockTrigger.click();
    const dockBar = page.getByTestId('bottom-dock-bar');
    await expect(dockBar).toBeVisible();
    const dockRouteText = await dockBar.locator('[data-route-id="stocks"]').evaluate((el) => (el as HTMLElement).innerText.trim());
    expect(dockRouteText).toContain('Stocks');

    await dockBar.locator('[data-route-id="stocks"]').click();
    await expect
      .poll(() => new URL(page.url()).hash)
      .toBe('#stocks');

    expect(pageErrors).toEqual([]);
  });

  test('renders mobile ICT Radar and S&D Matrix without label overlaps or horizontal overflow', async ({
    page,
  }) => {
    const { pageErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/#ict', { waitUntil: 'domcontentloaded' });

    const ictView = page.getByTestId('ict-radar-view');
    await expect(ictView).toBeVisible({ timeout: 15_000 });
    await ictView.getByTestId('ict-scan-now-btn').click();

    for (const mode of ['ict', 'sdcv'] as const) {
      if (mode === 'sdcv') {
        await ictView.getByTestId('strategy-tab-sdcv').click();
        await expect(ictView.getByTestId('strategy-tab-sdcv')).toHaveAttribute('aria-selected', 'true');
      }

      const metrics = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="ict-radar-view"]');
        if (!root) return { docOverflow: 999, overlapCount: 999 };
        const vw = window.innerWidth;
        const docOverflow = Math.max(0, document.documentElement.scrollWidth - vw);
        let overlapCount = 0;
        const containers = root.querySelectorAll(
          '[data-testid="ict-signal-card"], [data-testid="ict-focused-setup"], [data-testid="ict-alert-log"], section'
        );
        for (const c of containers) {
          const leaves = Array.from(c.querySelectorAll('span, p, h1, h2, button, strong')).filter(
            (el) => {
              if (el.querySelector('span, p, button, div')) return false;
              const r = el.getBoundingClientRect();
              return r.width > 1 && r.height > 1 && (el.textContent || '').trim().length > 0;
            }
          );
          for (let i = 0; i < leaves.length; i++) {
            const a = leaves[i].getBoundingClientRect();
            for (let j = i + 1; j < leaves.length; j++) {
              const b = leaves[j].getBoundingClientRect();
              const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
              const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
              if (
                ix > 2 &&
                iy > 2 &&
                !leaves[i].contains(leaves[j]) &&
                !leaves[j].contains(leaves[i])
              ) {
                overlapCount += 1;
              }
            }
          }
        }
        return { docOverflow, overlapCount };
      });

      expect(metrics.docOverflow).toBe(0);
      expect(metrics.overlapCount).toBe(0);
    }

    expect(pageErrors).toEqual([]);
  });

  test('triggers automated IDX Bandarmology accumulation shift alerts and persists SymbolDetailModal MTF tabs', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { pageErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#stocks', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('idx-bandarmology-filter')).toBeVisible();
    await expect(page.getByTestId('stocks-action-filter')).toBeVisible();
    await expect(page.getByTestId('idx-bandar-shift-monitor')).toBeVisible();

    const idxScanner = page.getByTestId('idx-buy-scanner');
    await expect(idxScanner).toBeVisible({ timeout: 15_000 });
    await expect(idxScanner.getByTestId('idx-buy-ready-count')).toContainText(/\d+ Can Buy Now/);
    await idxScanner.getByTestId('idx-scanner-tab-all').click();
    await expect(idxScanner.getByTestId('idx-scanner-tab-all')).toHaveAttribute('aria-selected', 'true');
    const firstScannerRow = idxScanner.locator('tbody tr').first();
    await expect(firstScannerRow).toBeVisible({ timeout: 15_000 });
    await expect(firstScannerRow).toContainText(/BUY NOW|BUY AT DEMAND|BREAKOUT BUY|WAIT PULLBACK|AVOID \/ SELL|WATCH/);
    await expect(firstScannerRow).toContainText(/TP/);
    await expect(firstScannerRow).toContainText(/SL/);
    await idxScanner.getByTestId('idx-scanner-tab-buy').click();
    await expect(idxScanner.getByTestId('idx-scanner-tab-buy')).toHaveAttribute('aria-selected', 'true');

    const firstStockRow = page.locator('main section:not([data-testid="idx-buy-scanner"]) tbody tr').first();
    await expect(firstStockRow).toBeVisible({ timeout: 15_000 });
    await expect(firstStockRow).toContainText(/BUY|SELL|WAIT/);
    await expect(firstStockRow).toContainText(/TP1/);
    await expect(firstStockRow).toContainText(/SL/);
    await expect(
      page.locator('main').getByText(/Strong Acc|Early Acc|Neutral|Early Dist|Strong Dist/).first()
    ).toBeVisible({ timeout: 15_000 });

    // Simulate a live IDX Bandarmology shift ('Early Accumulation' <-> 'Strong Accumulation') and assert toast notification
    let expectedShiftRegex = /Early Acc → Strong Acc|Strong Acc → Early Acc/;
    await page.route('**/api/stocks/movers', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const buckets = ['impact', 'gainers', 'losers', 'foreignBuy', 'foreignSell'] as const;
      type MoverStub = {
        symbol?: string;
        bandarmology?: {
          phase?: string;
          score?: number;
          volumeRatio?: number;
          accumulationPressure?: number;
          foreignBias?: string;
          summary?: string;
        };
      };

      let targetSymbol: string | undefined;
      let targetPrevPhase: string | undefined;
      for (const bucketKey of buckets) {
        const list = body?.indonesia?.[bucketKey] as MoverStub[] | undefined;
        if (!Array.isArray(list)) continue;
        const match = list.find(
          (s) =>
            s.bandarmology?.phase === 'Early Accumulation' ||
            s.bandarmology?.phase === 'Strong Accumulation'
        );
        if (match?.symbol) {
          targetSymbol = match.symbol;
          targetPrevPhase = match.bandarmology?.phase;
          break;
        }
      }

      if (!targetSymbol && Array.isArray(body?.indonesia?.impact) && body.indonesia.impact.length > 0) {
        targetSymbol = body.indonesia.impact[0].symbol;
        targetPrevPhase = 'Early Accumulation';
      }

      if (targetSymbol) {
        const wasStrong = targetPrevPhase === 'Strong Accumulation';
        const nextPhase = wasStrong ? 'Early Accumulation' : 'Strong Accumulation';
        expectedShiftRegex = wasStrong ? /Strong Acc → Early Acc/ : /Early Acc → Strong Acc/;

        for (const bucketKey of buckets) {
          const list = body?.indonesia?.[bucketKey] as MoverStub[] | undefined;
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (item.symbol === targetSymbol) {
              item.bandarmology = {
                ...(item.bandarmology ?? {}),
                phase: nextPhase,
                score: wasStrong ? 22 : 72,
                volumeRatio: 1.85,
                accumulationPressure: wasStrong ? 56 : 79,
                foreignBias: 'Net Buy',
                summary: `Automated phase transition to ${nextPhase}`,
              };
            }
          }
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.locator('main button', { hasText: 'Refresh' }).first().click();
    await expect(page.getByTestId('price-alert-toast-stack')).toContainText(/IDX Bandar/, { timeout: 12_000 });
    await expect(page.getByTestId('price-alert-toast-stack')).toContainText(expectedShiftRegex);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Open SymbolDetailModal and verify Persistent Quick-Switch Intraday Tabs (1m..4h) + Execution Trade Plan + Candlestick chart
    await firstStockRow.click();
    const modal = page.getByTestId('symbol-detail-modal');
    await expect(modal).toBeVisible();
    const tradePlanCard = modal.getByTestId('modal-trade-plan-card');
    await expect(tradePlanCard).toBeVisible();
    await expect(tradePlanCard).toContainText(/Execution Trade Plan/);
    await expect(tradePlanCard).toContainText(/Stop Loss/);
    await expect(tradePlanCard).toContainText(/Take Profit 1/);
    const mtfTabs = modal.getByTestId('symbol-detail-timeframe-tabs');
    await expect(mtfTabs).toBeVisible();
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h']) {
      await expect(mtfTabs.locator(`button[data-timeframe="${tf}"]`)).toBeVisible();
    }
    await mtfTabs.locator('button[data-timeframe="15m"]').click();
    await expect(mtfTabs.locator('button[data-timeframe="15m"]')).toHaveAttribute('aria-selected', 'true');
    const savedTf = await page.evaluate(() => window.localStorage.getItem('stocks_symbol_detail_timeframe_v1'));
    expect(savedTf).toBe('15m');

    const modalChartToggle = modal.getByTestId('chart-type-toggle');
    await expect(modalChartToggle).toBeVisible({ timeout: 15_000 });
    await modalChartToggle.getByRole('button', { name: 'Candles' }).click();
    const modalCandles = modal.getByTestId('candlestick-series');
    await expect(modalCandles).toBeVisible();
    expect(await modalCandles.locator('canvas').count()).toBeGreaterThanOrEqual(1);
    await modal.getByRole('button', { name: 'Close chart modal' }).click();
    await expect(modal).toHaveCount(0);

    // Reopen SymbolDetailModal on second stock row and verify 15m persisted across symbol switches
    const secondStockRow = page.locator('main section:not([data-testid="idx-buy-scanner"]) tbody tr').nth(1);
    await secondStockRow.click();
    const reopenedModal = page.getByTestId('symbol-detail-modal');
    await expect(reopenedModal).toBeVisible();
    await expect(
      reopenedModal.getByTestId('symbol-detail-timeframe-tabs').locator('button[data-timeframe="15m"]')
    ).toHaveAttribute('aria-selected', 'true');
    await reopenedModal.getByTestId('symbol-detail-timeframe-tabs').locator('button[data-timeframe="4h"]').click();
    await expect(
      reopenedModal.getByTestId('symbol-detail-timeframe-tabs').locator('button[data-timeframe="4h"]')
    ).toHaveAttribute('aria-selected', 'true');
    await reopenedModal.getByRole('button', { name: 'Close chart modal' }).click();
    await expect(reopenedModal).toHaveCount(0);

    // Verify Portfolio holdings animated list container & IDX Bandarmology rollup support
    const dockTrigger = page.getByTestId('bottom-dock-trigger');
    await dockTrigger.click();
    await page.getByTestId('bottom-dock-bar').locator('[data-route-id="portfolio"]').click();
    await expect
      .poll(() => new URL(page.url()).hash)
      .toBe('#portfolio');
    await page.getByRole('button', { name: 'Add your first holding' }).click();
    const bbcaPick = page.locator('form button').filter({ hasText: 'BBCA' }).first();
    await expect(bbcaPick).toBeVisible({ timeout: 10_000 });
    await bbcaPick.click();
    const qtyInput = page.locator('form input[type="number"]').first();
    await qtyInput.fill('100');
    const priceInput = page.locator('form input[type="number"]').nth(1);
    await expect(priceInput).not.toHaveValue('', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Save Holding' }).click();
    await expect(page.getByTestId('portfolio-holdings-list')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('portfolio-holding-row-BBCA')).toBeVisible();
    await expect(page.locator('main')).toContainText('IDX Bandarmology:');

    // Verify AI Daily Digest modal on News Feed (#news)
    await dockTrigger.click();
    await page.getByTestId('bottom-dock-bar').locator('[data-route-id="news"]').click();
    await expect
      .poll(() => new URL(page.url()).hash)
      .toBe('#news');

    let digestCallCount = 0;
    await page.route('**/api/news/daily-digest', async (route) => {
      digestCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionHeadline: 'Semiconductor Surge and Bank Flows Anchor Risk-On Session',
          marketMood: 'Risk-On Momentum',
          executiveBrief:
            'US mega-cap semis and Jakarta large-cap accumulation led cross-asset gains as breaking technology earnings catalysts drove volume rotation.',
          topicLabel: 'All Global Markets',
          moverImpacts: [
            {
              symbol: 'NVDA',
              yahooSymbol: 'NVDA',
              name: 'NVIDIA Corporation',
              market: 'US Equities',
              movePercent: '+32.57%',
              direction: 'up',
              associatedHeadline: 'Nvidia shares soar on leadership & AI guidance update',
              impactAnalysis:
                'Heavy institutional call and spot volume followed breaking headlines, lifting Nasdaq leadership.',
            },
            {
              symbol: 'CDIA',
              yahooSymbol: 'CDIA.JK',
              name: 'PT Chandra Daya Investasi Tbk',
              market: 'IDX / Jakarta',
              movePercent: '+24.52%',
              direction: 'up',
              associatedHeadline: 'IDX heavyweights extend foreign accumulation streak',
              impactAnalysis:
                'Strong Accumulation phase paired with 4.34x 20D relative turnover pushed IDX momentum higher.',
            },
          ],
          sessionWatchpoints: [
            'Monitor US 10Y yield reaction ahead of the afternoon bond auction.',
            'Track IDX foreign net buy continuity into the Jakarta closing print.',
            'Watch Nasdaq breadth sustainability beyond top 3 AI heavyweights.',
          ],
          model: 'gemini-4-hydrogen',
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    const digestBtn = page.getByTestId('daily-digest-trigger');
    await expect(digestBtn).toBeVisible();
    await digestBtn.click();

    const digestModal = page.getByTestId('daily-digest-modal');
    await expect(digestModal).toBeVisible();
    await expect(digestModal).toContainText('Semiconductor Surge and Bank Flows Anchor Risk-On Session');
    await expect(digestModal.getByTestId('daily-digest-movers-list')).toContainText('NVDA');
    await expect(digestModal.getByTestId('daily-digest-movers-list')).toContainText('CDIA');
    await expect(digestModal).toContainText('Session Watchpoints');

    await digestModal.getByTestId('daily-digest-regenerate').click();
    await expect.poll(() => digestCallCount).toBe(2);
    await digestModal.getByRole('button', { name: 'Close Daily Digest' }).click();
    await expect(digestModal).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Verify Share Studio (#extract): zero Support & Resistance and readable instrument names only
    await dockTrigger.click();
    await page.getByTestId('bottom-dock-bar').locator('[data-route-id="extract"]').click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#extract');
    await expect(page.getByText('Scheduled Market Share Studio')).toBeVisible();
    await expect(page.getByRole('button', { name: /Support & Resistance/i })).toHaveCount(0);
    await page.getByRole('button', { name: /05:30 WIB Morning/i }).click();
    const briefArea = page.getByLabel('Formatted brief for Telegram or WhatsApp');
    const briefText = await briefArea.inputValue();
    expect(briefText).toContain('S&P 500');
    expect(briefText).toContain('Bitcoin');
    expect(briefText).toContain('IDX Composite');
    expect(briefText).not.toMatch(/\(SPX\)|\(IXIC\)|\(DJI\)|\(IHSG\)/);
    expect(briefText).not.toMatch(/\|\s*S\s+[^·\n]+·\s*R\s+/);

    // Verify Unified Market Intelligence Panel on #dashboard (4 legacy panels merged into 1)
    await dockTrigger.click();
    await page.getByTestId('bottom-dock-bar').locator('[data-route-id="dashboard"]').click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#dashboard');

    const unifiedIntel = page.getByTestId('market-intelligence-unified-card');
    await unifiedIntel.scrollIntoViewIfNeeded();
    await expect(unifiedIntel).toBeVisible({ timeout: 15_000 });
    await expect(unifiedIntel).toContainText('Unified Market Thesis & Outlook');
    await expect(unifiedIntel).toContainText('Forward Market Outlook');
    await expect(page.getByText('Headline, Rumor & Sentiment Watch')).toHaveCount(0);
    await expect(page.getByText('Macro Data Implications (High & Mid)')).toHaveCount(0);
    await expect(page.getByText('Compiled Multi-Source Market & Stocks Summary')).toHaveCount(0);

    // Verify ForexFactory-mirrored Calendar (#calendar)
    await dockTrigger.click();
    await page.getByTestId('bottom-dock-bar').locator('[data-route-id="calendar"]').click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#calendar');

    const ffCalendar = page.getByTestId('forex-calendar-view');
    await expect(ffCalendar).toBeVisible();
    await expect(ffCalendar).toContainText('ForexFactory Weekly Schedule');
    await expect(ffCalendar.getByTestId('calendar-refresh-btn')).toBeVisible();
    const rangeTablist = ffCalendar.getByTestId('calendar-range-filter');
    await expect(rangeTablist).toHaveAttribute('role', 'tablist');
    await expect(ffCalendar.getByTestId('calendar-range-this_week')).toHaveAttribute('role', 'tab');
    await expect(ffCalendar.getByTestId('calendar-range-next_week')).toHaveAttribute('role', 'tab');
    await expect(ffCalendar.getByTestId('calendar-range-this_month')).toHaveAttribute('role', 'tab');
    for (const tier of ['high', 'med', 'low', 'holiday']) {
      await expect(ffCalendar.getByTestId(`ff-impact-filter-${tier}`)).toBeVisible();
    }
    const calCurrencySelect = ffCalendar.getByLabel('Filter by currency');
    await expect(calCurrencySelect).toBeVisible();
    for (const cur of ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY']) {
      await expect(calCurrencySelect.locator(`option[value="${cur}"]`)).toHaveCount(1);
    }
    await expect(ffCalendar.locator('table thead')).toContainText('Actual');
    await expect(ffCalendar.locator('table thead')).toContainText('Forecast');
    await expect(ffCalendar.locator('table thead')).toContainText('Previous');
    if ((await ffCalendar.getByTestId('calendar-actual-cell').count()) > 0) {
      await expect(ffCalendar.getByTestId('calendar-actual-cell').first()).not.toContainText(/pending/i);
    }

    expect(pageErrors).toEqual([]);
  });

  test('Header Refresh All button re-fetches assets, news, and calendar while keeping current view', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorCollectors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#ict', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ict-radar-view')).toBeVisible({ timeout: 15_000 });

    const refreshBtn = page.getByTestId('header-refresh-all-btn');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toContainText('Refresh All');

    const seenEndpoints = new Set<string>();
    const onRequest = (req: import('@playwright/test').Request) => {
      const url = req.url();
      if (url.includes('/api/market/quotes')) seenEndpoints.add('quotes');
      if (url.includes('/api/news/feed')) seenEndpoints.add('news');
      if (url.includes('/api/calendar/events')) seenEndpoints.add('calendar');
    };
    page.on('request', onRequest);

    await refreshBtn.click();

    await expect
      .poll(() => seenEndpoints.has('quotes') && seenEndpoints.has('news') && seenEndpoints.has('calendar'), {
        timeout: 10_000,
      })
      .toBe(true);

    page.off('request', onRequest);
    expect(new URL(page.url()).hash).toBe('#ict');
    await expect(page.getByTestId('ict-radar-view')).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

