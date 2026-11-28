import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function walkDirFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDirFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Stocks — Global Market Terminal',
          short_name: 'Stocks',
          description:
            'Real-time global equity indices, IDX & US Top 10 movers, ID10Y & US Treasury yields, breaking financial news, and macroeconomic calendar.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/@vite\//, /^\/src\//, /^\/assets\//, /^\/node_modules\//],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'stocks-api-cache',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Optimizes public/ image assets (SVG minification & PNG chunk stripping) in dist/
      {
        name: 'optimize-public-images',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(import.meta.dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          const files = walkDirFiles(distDir);
          let svgSavedBytes = 0;
          let pngOptimizedCount = 0;

          for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.svg') {
              const raw = fs.readFileSync(file, 'utf8');
              const optimized = raw
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/>\s+</g, '><')
                .replace(/\s{2,}/g, ' ')
                .trim();
              if (optimized.length > 0 && optimized.length < raw.length) {
                svgSavedBytes += raw.length - optimized.length;
                fs.writeFileSync(file, optimized, 'utf8');
              }
            } else if (ext === '.png') {
              const buf = fs.readFileSync(file);
              const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
              if (buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG)) {
                // Strip non-critical metadata ancillary chunks (tEXt, zTXt, iTXt, pHYs, tIME) while preserving IHDR/PLTE/IDAT/IEND/tRNS/gAMA/cHRM/sRGB
                const chunks: Buffer[] = [PNG_SIG];
                let offset = 8;
                let stripped = false;
                while (offset + 12 <= buf.length) {
                  const len = buf.readUInt32BE(offset);
                  const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
                  const totalLen = 12 + len;
                  if (offset + totalLen > buf.length) {
                    stripped = false;
                    break;
                  }
                  if (['tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) {
                    stripped = true;
                  } else {
                    chunks.push(buf.subarray(offset, offset + totalLen));
                  }
                  offset += totalLen;
                  if (type === 'IEND') break;
                }
                if (stripped) {
                  const rebuilt = Buffer.concat(chunks);
                  if (rebuilt.length < buf.length) {
                    fs.writeFileSync(file, rebuilt);
                    pngOptimizedCount += 1;
                  }
                }
              }
            }
          }

          if (svgSavedBytes > 0 || pngOptimizedCount > 0) {
            console.log(
              `[optimize-public-images] SVG saved ${svgSavedBytes}B, stripped metadata on ${pngOptimizedCount} PNG asset(s)`
            );
          }
        },
      },
      // Generates pre-compressed Brotli (.br) siblings for production dist/ bundles
      {
        name: 'brotli-compression',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(import.meta.dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          const compressibleExts = new Set([
            '.js',
            '.mjs',
            '.css',
            '.html',
            '.svg',
            '.json',
            '.webmanifest',
            '.txt',
            '.xml',
          ]);

          let count = 0;
          let rawTotal = 0;
          let brTotal = 0;

          for (const file of walkDirFiles(distDir)) {
            const ext = path.extname(file).toLowerCase();
            if (!compressibleExts.has(ext)) continue;
            const raw = fs.readFileSync(file);
            if (raw.length < 1024) continue;

            const compressed = zlib.brotliCompressSync(raw, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
              },
            });
            if (compressed.length < raw.length) {
              fs.writeFileSync(`${file}.br`, compressed);
              count += 1;
              rawTotal += raw.length;
              brTotal += compressed.length;
            }
          }

          if (count > 0) {
            const pct = (((rawTotal - brTotal) / Math.max(1, rawTotal)) * 100).toFixed(1);
            console.log(
              `[brotli-compression] Compressed ${count} files (${(rawTotal / 1024).toFixed(1)} kB -> ${(brTotal / 1024).toFixed(1)} kB, -${pct}%)`
            );
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
    },
    build: {
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-firebase',
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-d3',
                test: /node_modules[\\/]d3(-[a-z]+)?[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/](motion|framer-motion)[\\/]/,
                priority: 15,
              },
              {
                name: 'vendor-icons',
                test: /node_modules[\\/]lucide-react[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR and file watching are disabled in AI Studio to prevent flickering and WS port conflicts.
      hmr: false,
      ws: false as const,
      watch: null,
    },
  };
});
