import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Lock,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { TwoStageMetaLabelEvaluation } from '../utils/metaLabelValidator';

interface MetaLabelValidatorPanelProps {
  evaluation: TwoStageMetaLabelEvaluation;
  assetLabel: string;
  strategyLabel: string;
  enforceDiscipline: boolean;
  onToggleEnforceDiscipline: () => void;
}

export const MetaLabelValidatorPanel: React.FC<MetaLabelValidatorPanelProps> = ({
  evaluation,
  assetLabel,
  strategyLabel,
  enforceDiscipline,
  onToggleEnforceDiscipline,
}) => {
  const { discipline } = evaluation;

  const verdictTone =
    evaluation.verdict === 'EXECUTE_FULL'
      ? 'text-[var(--gain-text)]'
      : evaluation.verdict === 'EXECUTE_REDUCED'
        ? 'text-[var(--warn-text)]'
        : evaluation.verdict === 'FILTER_PASS'
          ? 'text-[var(--loss-text)]'
          : 'text-[var(--text-secondary)]';

  const disciplineTone =
    discipline.status === 'VALIDATED'
      ? 'text-[var(--gain-text)]'
      : discipline.status === 'HALT_RECALIBRATE'
        ? 'text-[var(--loss-text)]'
        : 'text-[var(--warn-text)]';

  const probBarPct = Math.max(4, Math.min(100, evaluation.metaProbabilityPct));
  const thresholdMarkerPct = Math.max(10, Math.min(90, evaluation.metaThresholdPct));

  return (
    <section
      data-testid="two-stage-meta-label-validator"
      aria-label="2-Stage Meta-Labeling Confluence Validator and Validation Discipline"
      className="rounded-2xl liquid-glass-card overflow-hidden"
    >
      {/* Top Bar: Clean Title + Single Functional Toggle */}
      <div className="px-4 py-3.5 border-b border-[var(--border-divider)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
              2-Stage Meta-Labeling Confluence Validator
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
            {assetLabel} · {strategyLabel} · Primary Recall → Meta-Precision &amp; Fractional Sizing
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enforceDiscipline}
          data-testid="toggle-validation-discipline"
          onClick={onToggleEnforceDiscipline}
          className={`inline-flex items-center gap-2 min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
            enforceDiscipline
              ? 'border-[var(--accent-primary)]/50 bg-[var(--accent-soft)] text-[var(--text-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
          <span>Validation Discipline Cap</span>
          <span className="font-mono text-[11px] font-bold">
            {enforceDiscipline ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Stage 1 -> Stage 2 Pipeline Summary Row (Clean Hairline Columns, No Nested Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border-divider)] border-b border-[var(--border-divider)]">
        {/* Stage 1 */}
        <div className="p-4 space-y-1.5">
          <div className="text-[11px] font-semibold text-[var(--text-muted)]">
            01. Stage 1 — Primary Side Model
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-base font-extrabold tracking-tight ${
                evaluation.stage1Direction === 'BUY'
                  ? 'text-[var(--gain-text)]'
                  : evaluation.stage1Direction === 'SELL'
                    ? 'text-[var(--loss-text)]'
                    : 'text-[var(--text-secondary)]'
              }`}
            >
              {evaluation.stage1Direction === 'NEUTRAL'
                ? 'Flat / Awaiting Setup'
                : `${evaluation.stage1Direction} Candidate`}
            </span>
            <span className="font-mono tabular-nums text-xs font-bold text-[var(--text-primary)]">
              {evaluation.stage1PassedGates}/{evaluation.stage1TotalGates} gates
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {evaluation.stage1Summary}
          </p>
        </div>

        {/* Stage 2 Calibrated Meta-Probability */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
            <span>02. Stage 2 — Meta-Probability P(Win)</span>
            <span className="font-mono tabular-nums">
              Threshold ≥ {evaluation.metaThresholdPct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`font-mono tabular-nums text-xl font-extrabold ${verdictTone}`}>
              {evaluation.metaProbabilityPct}%
            </span>
            <span className="font-mono tabular-nums text-xs font-semibold text-[var(--text-secondary)]">
              Meta-EV:{' '}
              <strong
                className={
                  evaluation.metaExpectedR > 0
                    ? 'text-[var(--gain-text)]'
                    : evaluation.metaExpectedR < 0
                      ? 'text-[var(--loss-text)]'
                      : 'text-[var(--text-primary)]'
                }
              >
                {evaluation.metaExpectedR >= 0 ? '+' : ''}
                {evaluation.metaExpectedR.toFixed(2)}R
              </strong>
            </span>
          </div>
          {/* Clean linear probability gauge with threshold tick */}
          <div className="relative h-2 w-full rounded-full bg-[var(--bg-inset)] overflow-visible">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${probBarPct}%`,
                backgroundColor:
                  evaluation.metaProbabilityPct >= evaluation.metaThresholdPct
                    ? 'var(--gain-text)'
                    : evaluation.metaProbabilityPct >= 46
                      ? 'var(--warn-text)'
                      : 'var(--loss-text)',
              }}
            />
            <span
              aria-hidden="true"
              title={`Stage 2 threshold: ${evaluation.metaThresholdPct}%`}
              className="absolute -top-0.5 bottom-[-2px] w-0.5 bg-[var(--text-primary)]/70"
              style={{ left: `${thresholdMarkerPct}%` }}
            />
          </div>
        </div>

        {/* Final Verdict & Bet Size */}
        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
            <span>03. Calibrated Execution &amp; Size</span>
            <span className="font-mono tabular-nums">
              Raw {evaluation.rawBetSizeMultiplier.toFixed(2)}x → Live{' '}
              {evaluation.effectiveSizeMultiplier.toFixed(2)}x
            </span>
          </div>
          <div className={`text-base font-extrabold tracking-tight ${verdictTone}`}>
            {evaluation.verdictLabel}
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {evaluation.verdictReason}
          </p>
        </div>
      </div>

      {/* Orthogonal Stage 2 Confluence Feature Table */}
      {evaluation.features.length > 0 && (
        <div className="px-4 py-3.5 border-b border-[var(--border-divider)]">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Stage 2 Orthogonal Feature Attribution
            </h4>
            <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
              Log-Odds Calibration · Non-Overlapping Context
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2">
            {evaluation.features.map((feat) => (
              <div
                key={feat.id}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border-divider)]/70 last:border-b-0 sm:last:border-b text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)] truncate">
                    {feat.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {feat.stateLabel}
                  </div>
                </div>
                <span
                  className={`font-mono tabular-nums text-xs font-bold shrink-0 ${
                    feat.logOddsDelta > 0
                      ? 'text-[var(--gain-text)]'
                      : feat.logOddsDelta < 0
                        ? 'text-[var(--loss-text)]'
                        : 'text-[var(--text-muted)]'
                  }`}
                >
                  {feat.logOddsDelta > 0 ? '+' : ''}
                  {feat.logOddsDelta.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation Discipline Audit Section */}
      <div className="px-4 py-3.5 bg-[var(--bg-inset)]/45 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {discipline.status === 'VALIDATED' ? (
              <ShieldCheck className="w-4 h-4 text-[var(--gain-text)] shrink-0" />
            ) : discipline.status === 'HALT_RECALIBRATE' ? (
              <ShieldAlert className="w-4 h-4 text-[var(--loss-text)] shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-[var(--warn-text)] shrink-0" />
            )}
            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
              Validation Discipline Audit
            </h4>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              ·
            </span>
            <span className={`text-xs font-bold truncate ${disciplineTone}`}>
              {discipline.statusLabel}
            </span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
            IS {discipline.inSampleCount} · Purged {discipline.purgedEmbargoCount} · OOS{' '}
            {discipline.outOfSampleCount}
          </div>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {discipline.summary}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {discipline.checks.map((chk) => {
            const StateIcon =
              chk.state === 'PASS'
                ? CheckCircle2
                : chk.state === 'BLOCK'
                  ? XCircle
                  : AlertTriangle;
            const iconColor =
              chk.state === 'PASS'
                ? 'text-[var(--gain-text)]'
                : chk.state === 'BLOCK'
                  ? 'text-[var(--loss-text)]'
                  : 'text-[var(--warn-text)]';

            return (
              <div
                key={chk.id}
                className="pt-2 border-t border-[var(--border-subtle)] space-y-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">
                    {chk.label}
                  </span>
                  <StateIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                </div>
                <div className="font-mono tabular-nums text-xs font-bold text-[var(--text-primary)] truncate">
                  {chk.metricValue}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                  {chk.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
