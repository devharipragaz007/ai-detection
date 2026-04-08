"use client";

import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import type { AnalysisResult, Sentence } from "@/types/detection";
import {
  mapSentencesToHighlights,
  scoreToColor,
  scoreToBorder,
} from "@/lib/highlight";
import { wordDiff, type DiffSegment } from "@/lib/diff";
import { track } from "@/lib/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "idle" | "loading" | "results" | "rewriting" | "rewritten";

// ─── Color helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return { text: "#f87171", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.5)" };
  if (score >= 40) return { text: "#fbbf24", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.5)" };
  return { text: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.45)" };
}

function labelColor(label: string) {
  if (label === "Likely AI-generated") return "text-red-400";
  if (label === "Possibly AI-generated") return "text-amber-400";
  return "text-green-400";
}

function labelBadgeStyle(label: string) {
  if (label === "Likely AI-generated")
    return "bg-red-500/10 border border-red-500/30 text-red-400";
  if (label === "Possibly AI-generated")
    return "bg-amber-500/10 border border-amber-500/30 text-amber-400";
  return "bg-green-500/10 border border-green-500/30 text-green-400";
}

// ─── Error Message ────────────────────────────────────────────────────────────

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className="error-message border-l-2 border-red-500 p-2 text-sm text-red-400"
      style={{ background: "rgba(239, 68, 68, 0.08)" }}
    >
      {message}
    </div>
  );
}

// ─── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(false);
  const size = 148;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const targetOffset = circumference - (score / 100) * circumference;
  const c = scoreColor(score);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#1e1e38"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={c.text}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animated ? targetOffset : circumference}
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
              filter: `drop-shadow(0 0 6px ${c.text}80)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold font-editor tabular-nums"
            style={{ color: c.text }}
          >
            {score}
          </span>
          <span className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-0.5">
            score
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonLine({ w = "100%" }: { w?: string }) {
  return (
    <div
      className="skeleton h-3 rounded-full"
      style={{ width: w, height: "12px" }}
    />
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 fade-enter">
      <div className="flex flex-col items-center gap-3">
        <div className="skeleton rounded-full" style={{ width: 148, height: 148 }} />
        <div className="skeleton rounded-full" style={{ width: 120, height: 20 }} />
      </div>
      <div className="flex flex-col gap-3 mt-2">
        <SkeletonLine w="100%" />
        <SkeletonLine w="75%" />
        <SkeletonLine w="85%" />
      </div>
      <div className="skeleton rounded-lg mt-4" style={{ height: 44 }} />
    </div>
  );
}

function RewriteSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-1 fade-enter">
      {[100, 95, 88, 78, 92, 70].map((w, i) => (
        <SkeletonLine key={i} w={`${w}%`} />
      ))}
    </div>
  );
}

// ─── Highlighted Text ─────────────────────────────────────────────────────────

const HighlightedText = memo(function HighlightedText({
  text,
  sentences,
}: {
  text: string;
  sentences: Sentence[];
}) {
  const segments = useMemo(
    () => mapSentencesToHighlights(text, sentences),
    [text, sentences]
  );

  return (
    <p className="font-mono text-sm leading-7 whitespace-pre-wrap text-slate-200">
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            backgroundColor: scoreToColor(segment.score),
            borderBottom:
              segment.score !== null
                ? `2px solid ${scoreToBorder(segment.score)}`
                : "none",
            borderRadius: "2px",
            padding: "1px 0",
          }}
          title={
            segment.score !== null
              ? `AI probability: ${segment.score}%`
              : undefined
          }
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
});

// ─── Diff View ────────────────────────────────────────────────────────────────

const DiffView = memo(function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <p className="font-mono text-sm leading-7 whitespace-pre-wrap text-slate-200">
      {segments.map((seg, i) => {
        if (seg.type === "removed") {
          return (
            <span
              key={i}
              style={{
                color: "#f87171",
                textDecoration: "line-through",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                borderRadius: "2px",
                padding: "1px 2px",
              }}
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === "added") {
          return (
            <span
              key={i}
              style={{
                color: "#4ade80",
                backgroundColor: "rgba(34, 197, 94, 0.15)",
                borderRadius: "2px",
                padding: "1px 2px",
              }}
            >
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </p>
  );
});

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/60 inline-block" />
        High AI
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/25 border border-amber-500/60 inline-block" />
        Medium
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-green-500/20 border border-green-500/50 inline-block" />
        Low AI
      </span>
    </div>
  );
}

// ─── Sentence Bars ────────────────────────────────────────────────────────────

function SentenceBars({ sentences }: { sentences: Sentence[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3">
        Sentence breakdown
      </p>
      <div className="flex flex-col gap-1.5">
        {sentences.slice(0, 5).map((s, i) => {
          const c = scoreColor(s.score);
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: mounted ? `${s.score}%` : "0%",
                    backgroundColor: c.text,
                    opacity: 0.8,
                    transition: `width 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${i * 100 + 200}ms`,
                  }}
                />
              </div>
              <span
                className="text-xs font-editor tabular-nums w-9 text-right"
                style={{ color: c.text }}
              >
                {s.score}%
              </span>
            </div>
          );
        })}
        {sentences.length > 5 && (
          <p className="text-xs text-slate-600 mt-0.5">
            +{sentences.length - 5} more sentences
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIDetector() {
  const [inputText, setInputText] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rewrittenText, setRewrittenText] = useState<string | null>(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rightPanelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced textarea onChange — avoids re-renders on every keystroke
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setInputText(value);
      setValidationError(null);
    }, 300);
  }, []);

  // Memoize expensive diff computation
  const diffSegments = useMemo(
    () => wordDiff(inputText, rewrittenText ?? ""),
    [inputText, rewrittenText]
  );

  const handleAnalyze = useCallback(async () => {
    // Read from ref for up-to-date value even if debounce hasn't fired
    const text = (textareaRef.current?.value ?? inputText).trim();

    // Input validation
    if (text.length < 50) {
      setValidationError("Text is too short. Paste at least a sentence or two.");
      return;
    }
    if (text.length > 5000) {
      setValidationError("Text is too long. Please keep it under 5000 characters.");
      return;
    }

    setValidationError(null);
    setAppState("loading");
    setApiError(null);
    track("analyze_clicked", {
      text_length: text.split(/\s+/).length,
      char_count: text.length,
    })
    const startTime = Date.now()
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { error?: string };
        throw new Error(err.error ?? "Analysis failed");
      }
      const data = (await response.json()) as AnalysisResult;
      track("analysis_completed", {
        score: data.score,
        label: data.label,
        text_length: text.split(/\s+/).length,
        time_to_result_ms: Date.now() - startTime,
      })
      setResult(data);
      // Sync state with the trimmed text that was analyzed
      setInputText(text);
      setAppState("results");
    } catch (err) {
      track("error_occurred", {
        action: "analyze",
        message: err instanceof Error ? err.message : "Analysis failed",
      })
      setApiError(err instanceof Error ? err.message : "Analysis failed");
      setAppState("idle");
    }
  }, [inputText]);

  const handleRewrite = useCallback(async () => {
    setRewriteLoading(true);
    setAppState("rewriting");
    setApiError(null);
    track("rewrite_clicked", {
      score: result?.score,
      text_length: inputText.trim().split(/\s+/).length,
    })
    const rewriteStartTime = Date.now()
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!response.ok) {
        const err = (await response.json()) as { error?: string };
        throw new Error(err.error ?? "Rewrite failed");
      }
      const data = (await response.json()) as { rewrite: string };
      track("rewrite_completed", {
        text_length: inputText.trim().split(/\s+/).length,
        time_to_result_ms: Date.now() - rewriteStartTime,
      })
      setRewrittenText(data.rewrite);
      setAppState("rewritten");
    } catch (err) {
      track("error_occurred", {
        action: "rewrite",
        message: err instanceof Error ? err.message : "Rewrite failed",
      })
      setApiError(err instanceof Error ? err.message : "Rewrite failed");
      setAppState("results");
    } finally {
      setRewriteLoading(false);
    }
  }, [inputText]);

  const handleReset = useCallback(() => {
    setAppState("idle");
    setResult(null);
    setRewrittenText(null);
    setRewriteLoading(false);
    setApiError(null);
    setValidationError(null);
    setCopied(false);
    setInputText("");
    // Clear uncontrolled textarea
    if (textareaRef.current) textareaRef.current.value = "";
  }, []);

  const handleCopy = useCallback(() => {
    if (!rewrittenText) return;
    navigator.clipboard.writeText(rewrittenText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [rewrittenText]);

  // Scroll right panel into view on mobile when results arrive
  useEffect(() => {
    if ((appState === "results" || appState === "rewritten") && rightPanelRef.current) {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        rightPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [appState]);

  const isLoading = appState === "loading";
  const hasResults = appState === "results" || appState === "rewriting" || appState === "rewritten";
  const showRightPanel = isLoading || hasResults;
  const canAnalyze = inputText.trim().length > 0 && appState === "idle";

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ── */}
      <header className="border-b border-white/5 bg-[#0c0c18]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2L10 6H14L11 9L12 13L8 11L4 13L5 9L2 6H6L8 2Z" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="font-semibold text-white tracking-tight">
              AI Detector
            </span>
            <span className="hidden sm:inline text-xs text-slate-500 border border-white/10 rounded px-1.5 py-0.5">
              sentence-level
            </span>
          </div>
          {hasResults && (
            <button
              onClick={handleReset}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors duration-200 flex items-center gap-1.5 group"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="group-hover:rotate-[-45deg] transition-transform duration-200">
                <path d="M2 8C2 4.7 4.7 2 8 2C10.4 2 12.4 3.3 13.4 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M14 8C14 11.3 11.3 14 8 14C5.6 14 3.6 12.7 2.6 10.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M11 2L13.4 5.2L10 5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 14L2.6 10.8L6 10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              New analysis
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 md:py-8">

        {/* ══ THREE-COLUMN REWRITTEN VIEW ══ */}
        {appState === "rewritten" && result && rewrittenText ? (
          <div
            ref={rightPanelRef}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 panel-enter"
          >
            {/* Column 1 — Original */}
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                Original
              </h2>
              <div
                className="rounded-xl border border-white/8 bg-[#0e0e1c] p-5 overflow-auto"
                style={{ minHeight: "400px" }}
              >
                <HighlightedText text={inputText} sentences={result.sentences} />
              </div>
            </div>

            {/* Column 2 — Changes */}
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                Changes
              </h2>
              <div
                className="rounded-xl border border-white/8 bg-[#0e0e1c] p-5 overflow-auto"
                style={{ minHeight: "400px" }}
              >
                <DiffView segments={diffSegments} />
              </div>
              {/* Diff legend */}
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: "rgba(239,68,68,0.3)", border: "1px solid rgba(239,68,68,0.5)" }}
                  />
                  Removed
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: "rgba(34,197,94,0.25)", border: "1px solid rgba(34,197,94,0.5)" }}
                  />
                  Added
                </span>
              </div>
            </div>

            {/* Column 3 — Humanized */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                  Humanized Version
                </h2>
                <span className="text-xs text-green-400 border border-green-500/30 bg-green-500/10 rounded px-2 py-0.5 font-medium">
                  ✦ Rewritten
                </span>
              </div>
              <div
                className="rounded-xl border border-green-500/20 bg-[#0e0e1c] p-5 overflow-auto flex-1"
                style={{ minHeight: "400px" }}
              >
                <p className="font-mono text-sm text-slate-200 leading-7 whitespace-pre-wrap">
                  {rewrittenText}
                </p>
              </div>
              <button
                onClick={handleCopy}
                className={`
                  h-10 rounded-lg font-medium text-sm transition-all duration-200
                  flex items-center justify-center gap-2
                  ${copied
                    ? "bg-green-600/20 border border-green-500/40 text-green-400"
                    : "bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8 hover:border-white/20"
                  }
                `}
                aria-label="Copy humanized text"
              >
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ══ TWO-COLUMN / IDLE VIEW ══ */
          <div
            className={`grid gap-4 md:gap-6 transition-all duration-500 ${
              showRightPanel ? "md:grid-cols-2" : "md:grid-cols-1 max-w-2xl mx-auto"
            }`}
          >
            {/* ══ LEFT PANEL ══ */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                  {hasResults ? "Analysis" : "Input"}
                </h2>
                {hasResults && <Legend />}
              </div>

              <div
                className="relative flex-1 rounded-xl border border-white/8 bg-[#0e0e1c] overflow-hidden"
                style={{ minHeight: "400px" }}
              >
                {!hasResults && (
                  <textarea
                    ref={textareaRef}
                    onChange={handleTextChange}
                    placeholder="Paste your text here..."
                    disabled={isLoading}
                    className="w-full h-full min-h-[400px] bg-transparent p-5 font-editor text-sm text-slate-200 placeholder-slate-600 resize-none outline-none leading-7 transition-opacity duration-200 disabled:opacity-40"
                    aria-label="Text input for AI detection"
                  />
                )}

                {hasResults && result && (
                  <div className="p-5 overflow-auto max-h-[520px]">
                    <HighlightedText
                      text={inputText}
                      sentences={result.sentences}
                    />
                  </div>
                )}

                {!hasResults && inputText.length > 0 && (
                  <div className="absolute bottom-3 right-4 text-xs text-slate-600 font-editor tabular-nums pointer-events-none">
                    {inputText.length} chars
                  </div>
                )}
              </div>

              {!hasResults && (
                <button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className={`
                    relative h-11 rounded-lg font-medium text-sm transition-all duration-200
                    flex items-center justify-center gap-2.5
                    ${isLoading
                      ? "bg-indigo-600 text-white pointer-events-none opacity-70"
                      : canAnalyze
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.01] active:scale-[0.99]"
                      : "bg-white/5 text-slate-600 cursor-not-allowed"
                    }
                  `}
                  aria-label="Analyze text"
                >
                  {isLoading ? (
                    <>
                      <Spinner />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Analyze Text
                    </>
                  )}
                </button>
              )}

              {validationError && (
                <ErrorMessage message={validationError} />
              )}
              {apiError && appState === "idle" && (
                <ErrorMessage message={apiError} />
              )}
            </div>

            {/* ══ RIGHT PANEL ══ */}
            {showRightPanel && (
              <div
                ref={rightPanelRef}
                className="flex flex-col gap-3 panel-enter"
              >
                {isLoading || appState === "rewriting" ? (
                  /* ── Skeleton ── */
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                        {appState === "rewriting" ? "Rewriting…" : "Analyzing…"}
                      </h2>
                    </div>
                    <div
                      className="flex-1 rounded-xl border border-white/8 bg-[#0e0e1c]"
                      style={{ minHeight: "400px" }}
                    >
                      {appState === "rewriting" && result ? (
                        <div className="p-5 space-y-4">
                          <div className="flex flex-col items-center py-4">
                            <ScoreGauge score={result.score} />
                            <span className={`mt-3 text-sm font-semibold ${labelColor(result.label)}`}>
                              {result.label}
                            </span>
                          </div>
                          <div className="border-t border-white/6 pt-4">
                            <p className="text-xs text-slate-500 mb-3 uppercase tracking-widest font-medium">
                              Generating humanized version…
                            </p>
                            <RewriteSkeleton />
                          </div>
                        </div>
                      ) : (
                        <ResultsSkeleton />
                      )}
                    </div>
                  </>
                ) : (
                  /* ── Results ── */
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                        Results
                      </h2>
                      {result && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${labelBadgeStyle(result.label)}`}>
                          {result.label}
                        </span>
                      )}
                    </div>

                    {result && (
                      <div
                        className="flex-1 rounded-xl border border-white/8 bg-[#0e0e1c] overflow-hidden"
                        style={{ minHeight: "400px" }}
                      >
                        <div className="p-5 flex flex-col gap-5 h-full">
                          <div className="flex flex-col items-center py-2">
                            <ScoreGauge score={result.score} />
                            <div className="mt-3 text-center">
                              <p className={`text-base font-bold ${labelColor(result.label)}`}>
                                {result.label}
                              </p>
                              <p className="text-xs text-slate-600 mt-1">
                                AI probability score
                              </p>
                            </div>
                          </div>

                          <div className="border-t border-white/6" />

                          <div>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3">
                              Why this score
                            </p>
                            <ul className="flex flex-col gap-2.5">
                              {result.explanation.map((point, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2.5 text-sm text-slate-300 leading-snug"
                                  style={{ animationDelay: `${i * 80}ms` }}
                                >
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500/70 flex-shrink-0" />
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <SentenceBars sentences={result.sentences} />

                          <div className="flex-1" />

                          {/* Rewrite button */}
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={handleRewrite}
                              disabled={rewriteLoading}
                              className={`
                                w-full h-11 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600
                                text-white font-medium text-sm transition-all duration-200
                                flex items-center justify-center gap-2
                                shadow-lg shadow-indigo-500/15
                                ${rewriteLoading
                                  ? "pointer-events-none opacity-70"
                                  : "hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99]"
                                }
                              `}
                              aria-label="Rewrite to humanize"
                            >
                              {rewriteLoading ? (
                                <>
                                  <Spinner />
                                  Humanizing...
                                </>
                              ) : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M3 8C3 5.2 5.2 3 8 3C10 3 11.7 4.1 12.6 5.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <path d="M13 8C13 10.8 10.8 13 8 13C6 13 4.3 11.9 3.4 10.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <path d="M11 3L12.6 5.7L9.8 6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M5 13L3.4 10.3L6.2 9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  Rewrite to Humanize
                                </>
                              )}
                            </button>
                            {apiError && appState === "results" && (
                              <ErrorMessage message={apiError} />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <p className="text-xs text-slate-700">
            Demo only — no data is sent anywhere
          </p>
          <p className="text-xs text-slate-700 font-editor">
            v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}
