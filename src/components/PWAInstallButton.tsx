import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install Stocks as a standalone app"
        className="min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] hover:opacity-90 text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-opacity"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        title="Install as standalone app on phone or desktop"
        className="min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
        <span className="hidden sm:inline">App Install</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                Run Stocks as Standalone App
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-full text-[#6C6C70] hover:text-[#1C1C1E] dark:text-[#8E8E93] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {isIOS ? (
              <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#E5E5EA] leading-relaxed">
                1. Open the deployed web URL in <strong>Safari</strong>.<br />
                2. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.<br />
                3. Tap <strong>Add to Home Screen</strong> to launch Stocks fullscreen anytime.
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#E5E5EA] leading-relaxed">
                1. Open the deployed web URL in <strong>Chrome / Edge</strong> (outside any iframe).<br />
                2. Tap the browser menu (<strong>⋮</strong>) and choose <strong>Install App</strong> or{' '}
                <strong>Add to Home screen</strong>.<br />
                3. Launch directly from your desktop or phone home screen anytime.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-[#0071E3] dark:bg-[#0A84FF] py-2 text-xs font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
