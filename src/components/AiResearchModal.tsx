import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Globe,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import { AiResearchResult, MarketAsset, SavedAiBrief } from '../types/market';

interface AiResearchModalProps {
  open: boolean;
  onClose: () => void;
  activeAsset: MarketAsset;
  initialPrompt?: string;
  initialMode?: 'asset-brief' | 'news-pulse' | 'macro-qa';
}

const SUGGESTED_PROMPTS = [
  'What is driving US equities, Treasury yields, and the Fed outlook today?',
  'Latest Bank Indonesia rate outlook, USD/IDR, and IHSG catalysts',
  'Bitcoin & Ethereum latest ETF flows and macro market sentiment',
  'Spot Gold (XAU/USD) and Brent Crude oil price drivers today',
];

function renderFormattedLines(text: string) {
  const lines = text.split('\n');
  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={index} className="h-2" />;
    }
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const heading = trimmed.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '');
      return (
        <h4
          key={index}
          className="text-xs sm:text-sm font-bold text-[#1C1C1E] dark:text-white mt-2 first:mt-0"
        >
          {heading}
        </h4>
      );
    }
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
      return (
        <h4
          key={index}
          className="text-xs sm:text-sm font-bold text-[#1C1C1E] dark:text-white mt-2 first:mt-0"
        >
          {trimmed.replace(/\*\*/g, '')}
        </h4>
      );
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const clean = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\*\*(.*?)\*\*/g, '$1');
      return (
        <div key={index} className="flex items-start gap-2 text-xs sm:text-sm leading-relaxed">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] shrink-0" />
          <span className="text-[#1C1C1E]/90 dark:text-[#E5E5EA]">{clean}</span>
        </div>
      );
    }
    return (
      <p key={index} className="text-xs sm:text-sm leading-relaxed text-[#1C1C1E]/90 dark:text-[#E5E5EA]">
        {trimmed.replace(/\*\*(.*?)\*\*/g, '$1')}
      </p>
    );
  });
}

export const AiResearchModal: React.FC<AiResearchModalProps> = ({
  open,
  onClose,
  activeAsset,
  initialPrompt = '',
  initialMode = 'macro-qa',
}) => {
  const { user, authReady, profileReady, signInWithGoogle } = useAuth();
  const [promptInput, setPromptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResearchResult | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [savedBriefs, setSavedBriefs] = useState<SavedAiBrief[]>([]);
  const [savingBrief, setSavingBrief] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const runResearch = async (
    queryText: string,
    mode: 'asset-brief' | 'news-pulse' | 'macro-qa' = 'macro-qa'
  ) => {
    const clean = queryText.trim().slice(0, 500);
    if (!clean && mode !== 'asset-brief' && mode !== 'news-pulse') return;

    setLoading(true);
    setError(null);
    setJustSaved(false);
    setLastQuery(clean || `${activeAsset.symbol} Live Market Briefing`);

    try {
      const response = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: clean,
          assetSymbol: activeAsset.symbol,
          assetName: activeAsset.name,
          assetPrice: `${activeAsset.currencyPrefix ?? ''}${activeAsset.price}`,
          assetChange: `${activeAsset.changePercent >= 0 ? '+' : ''}${activeAsset.changePercent.toFixed(2)}%`,
          mode,
        }),
      });

      const payload = (await response.json()) as AiResearchResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Request failed (${response.status})`);
      }
      setResult(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to complete grounded market research right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && initialPrompt) {
      setPromptInput(initialPrompt);
      void runResearch(initialPrompt, initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, initialMode]);

  // Listen to user's saved AI briefs in Firestore
  useEffect(() => {
    if (!authReady || !profileReady || !user) {
      setSavedBriefs([]);
      return;
    }

    const briefsPath = `users/${user.uid}/aiBriefs`;
    const q = query(collection(db, briefsPath), where('ownerId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: SavedAiBrief[] = snapshot.docs.map((d) => {
          const data = d.data();
          const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          return {
            id: d.id,
            ownerId: String(data.ownerId || user.uid),
            query: String(data.query || ''),
            assetSymbol: data.assetSymbol ? String(data.assetSymbol) : undefined,
            answer: String(data.answer || ''),
            sources: Array.isArray(data.sources) ? data.sources : [],
            createdAtLabel: created
              ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Saved',
          };
        });
        setSavedBriefs(items.slice(0, 12));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, briefsPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, profileReady, user]);

  const handleSaveBrief = async () => {
    if (!user || !profileReady || !result) return;
    setSavingBrief(true);
    const briefId = `brief_${Date.now()}`;
    const docPath = `users/${user.uid}/aiBriefs/${briefId}`;

    try {
      const sanitizedSources = result.sources.slice(0, 10).map((s) => ({
        title: String(s.title || 'Source').slice(0, 200),
        uri: String(s.uri || '').slice(0, 1024),
      }));

      await setDoc(doc(db, 'users', user.uid, 'aiBriefs', briefId), {
        ownerId: user.uid,
        query: (lastQuery || `${activeAsset.symbol} Brief`).slice(0, 500),
        assetSymbol: activeAsset.symbol.slice(0, 24),
        answer: result.answer.slice(0, 12000),
        sources: sanitizedSources,
        createdAt: serverTimestamp(),
      });
      setJustSaved(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    } finally {
      setSavingBrief(false);
    }
  };

  const handleDeleteBrief = async (briefId: string) => {
    if (!user || !profileReady) return;
    const docPath = `users/${user.uid}/aiBriefs/${briefId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'aiBriefs', briefId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-research-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden pb-safe">
        {/* Top Bar */}
        <div className="px-5 py-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0071E3]/15 dark:bg-[#0A84FF]/20 text-[#0071E3] dark:text-[#0A84FF] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="ai-research-title"
                className="text-sm sm:text-base font-bold text-[#1C1C1E] dark:text-white truncate"
              >
                Live Market Intelligence
              </h3>
              <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] flex items-center gap-1.5 truncate">
                <Globe className="w-3 h-3 text-[#16803C] dark:text-[#30D158] shrink-0" />
                <span>Google Search Grounded · Active Context: {activeAsset.symbol}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Market Intelligence"
            className="w-9 h-9 rounded-full bg-[#E5E5EA] dark:bg-[#2C2C2E] hover:bg-[#D1D1D6] dark:hover:bg-[#38383A] flex items-center justify-center text-[#1C1C1E] dark:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Prompt Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runResearch(promptInput, 'macro-qa');
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              maxLength={500}
              placeholder={`Ask live market questions (e.g. "${activeAsset.symbol} latest catalyst today")`}
              className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-[#F2F2F7] dark:bg-black/50 border border-[#D1D1D6] dark:border-[#2C2C2E] text-xs sm:text-sm text-[#1C1C1E] dark:text-white placeholder:text-[#6C6C70] dark:placeholder:text-[#8E8E93] focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
            />
            <button
              type="submit"
              disabled={loading || !promptInput.trim()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0071E3] dark:bg-[#0A84FF] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-opacity"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Search &amp; Analyze</span>
            </button>
          </form>

          {/* Quick Action Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                const q = `Latest live market briefing and technical catalysts for ${activeAsset.name} (${activeAsset.symbol})`;
                setPromptInput(q);
                void runResearch(q, 'asset-brief');
              }}
              className="px-3 py-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#0A84FF] text-[11px] font-semibold hover:opacity-85 transition-opacity"
            >
              Brief {activeAsset.symbol} Now
            </button>
            {SUGGESTED_PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => {
                  setPromptInput(item);
                  void runResearch(item, 'macro-qa');
                }}
                className="px-3 py-1.5 rounded-full bg-[#F2F2F7] dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#E5E5EA] text-[11px] font-medium hover:bg-[#E5E5EA] dark:hover:bg-[#38383A] transition-colors text-left"
              >
                {item}
              </button>
            ))}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="p-6 rounded-2xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center gap-3 text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93]">
              <Loader2 className="w-5 h-5 animate-spin text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
              <span>Searching live financial sources and synthesizing grounded briefing...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 rounded-2xl bg-[#FF453A]/10 border border-[#FF453A]/30 text-xs text-[#D7261C] dark:text-[#FF453A]">
              {error}
            </div>
          )}

          {/* Result Card */}
          {result && !loading && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#16803C] dark:text-[#30D158]">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Grounded with Google Search</span>
                  {result.sources.length > 0 && (
                    <span className="text-[#6C6C70] dark:text-[#8E8E93]">
                      · {result.sources.length} verified sources
                    </span>
                  )}
                </div>

                {user ? (
                  <button
                    type="button"
                    disabled={savingBrief || justSaved}
                    onClick={handleSaveBrief}
                    className="px-3 py-1 rounded-full bg-white dark:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#38383A] text-[11px] font-semibold text-[#1C1C1E] dark:text-white flex items-center gap-1.5 hover:border-[#0071E3] transition-colors"
                  >
                    {justSaved ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5 text-[#16803C] dark:text-[#30D158]" />
                        <span>Saved to Cloud</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                        <span>{savingBrief ? 'Saving...' : 'Save Brief'}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    className="px-3 py-1 rounded-full bg-white dark:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#38383A] text-[11px] font-semibold text-[#0071E3] dark:text-[#0A84FF]"
                  >
                    Sign in to save briefs
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5">{renderFormattedLines(result.answer)}</div>

              {/* Search Queries Used */}
              {result.searchQueries.length > 0 && (
                <div className="pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-wrap items-center gap-1.5 text-[10px] text-[#6C6C70] dark:text-[#8E8E93]">
                  <span className="font-semibold uppercase tracking-wider">Queries:</span>
                  {result.searchQueries.map((sq, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E]"
                    >
                      {sq}
                    </span>
                  ))}
                </div>
              )}

              {/* Grounded Source Links */}
              {result.sources.length > 0 && (
                <div className="pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93]">
                    Verified Web Sources
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.sources.map((src, i) => (
                      <a
                        key={`${src.uri}-${i}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] hover:border-[#0071E3] dark:hover:border-[#0A84FF] flex items-center justify-between gap-2 text-xs transition-colors"
                      >
                        <span className="font-medium text-[#1C1C1E] dark:text-white truncate">
                          {src.title}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved Cloud Briefs for Signed-In User */}
          {user && savedBriefs.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E]">
              <span className="text-xs font-bold text-[#1C1C1E] dark:text-white">
                Saved Cloud Research Briefs ({savedBriefs.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savedBriefs.map((brief) => (
                  <div
                    key={brief.id}
                    className="p-3 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-start justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPromptInput(brief.query);
                        setLastQuery(brief.query);
                        setResult({
                          answer: brief.answer,
                          sources: brief.sources,
                          searchQueries: [],
                          model: 'gemini-4-hydrogen',
                          generatedAt: '',
                        });
                        setJustSaved(true);
                      }}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#0071E3] dark:text-[#0A84FF]">
                        {brief.assetSymbol && <span>{brief.assetSymbol}</span>}
                        <span>·</span>
                        <span className="text-[#6C6C70] dark:text-[#8E8E93]">{brief.createdAtLabel}</span>
                      </div>
                      <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white truncate mt-0.5">
                        {brief.query}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBrief(brief.id)}
                      aria-label="Delete saved brief"
                      className="p-1.5 rounded-lg text-[#6C6C70] hover:text-[#D7261C] dark:hover:text-[#FF453A] transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
