import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Graphical Garage UI (ring-based cards)
 *
 * Changes in this version:
 * - "Close Now" requires press-and-hold (1s) with a charging border animation
 * - After activation the button becomes "Closing…"
 * - When an auto-timer expires (cron-driven), the button flashes red "Closing…"
 * - Cron alignment: countdowns are approximate unless the underlying timestamp is cron-aligned
 * - "Closing period" modeled as:
 *   cron tick → send close signal → wait checkDelay minutes → verify closed
 */

// ----------------------------
// Constants
// ----------------------------

const CRON_MS = 60 * 1000; // cron cadence (1 minute)
const HOLD_TO_ACTIVATE_MS = 1000; // press-and-hold for Close Now

// ----------------------------
// Data + helpers
// ----------------------------

const initialDoors = [
  {
    id: "left",
    name: "Left",
    status: "closed", // 'open' | 'closed'
    hasSchedule: false,
    latestEvent: { type: "CLOSED", time: "Jan 02, 2026, 07:32 AM" },
    closedDuration: "10d 10h",
    lastAttempt: "Dec 27, 2025, 04:36 PM",
    openedAt: null,

    // retry state
    lastCloseAttempt: null,
    closeAttempts: 0,

    // closing pipeline state (null or object)
    closing: null,
  },
  {
    id: "middle",
    name: "Middle",
    status: "closed",
    hasSchedule: false,
    latestEvent: { type: "CLOSED", time: "Jan 12, 2026, 05:44 PM" },
    closedDuration: "9m",
    lastAttempt: null,
    openedAt: null,
    lastCloseAttempt: null,
    closeAttempts: 0,
    closing: null,
  },
  {
    id: "right",
    name: "Right",
    status: "closed",
    hasSchedule: false,
    latestEvent: { type: "CLOSED", time: "Dec 27, 2025, 05:01 PM" },
    closedDuration: "16d 0h",
    lastAttempt: "Dec 27, 2025, 05:01 PM",
    openedAt: null,
    lastCloseAttempt: null,
    closeAttempts: 0,
    closing: null,
  },
];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ceilToCron(ts, cronMs = CRON_MS) {
  return Math.ceil(ts / cronMs) * cronMs;
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/**
 * Cron-aligned countdown:
 * - initial attempt: openedAt + closeDelay, rounded up to next cron tick
 * - retry attempt: lastCloseAttempt + retryDelay, rounded up to next cron tick
 */
function computeCountdown(args) {
  const {
    isOpen,
    openedAt,
    closeAttempts,
    lastCloseAttempt,
    now,
    closeDelayMin,
    retryDelayMin,
    cronMs = CRON_MS,
  } = args;

  if (!isOpen || !openedAt) {
    return {
      phase: "closed",
      secondsRemaining: 0,
      totalSeconds: 1,
      progress: 1,
      dueAt: null,
      jitterSeconds: 0,
    };
  }

  const phase = closeAttempts === 0 ? "initial" : "retry";
  const baseAt = phase === "initial" ? openedAt : lastCloseAttempt || openedAt;
  const delayMin = phase === "initial" ? closeDelayMin : retryDelayMin;

  const rawTarget = baseAt + delayMin * 60 * 1000;
  const dueAt = ceilToCron(rawTarget, cronMs);

  const totalSeconds = Math.max(1, (dueAt - baseAt) / 1000);
  const secondsRemaining = clamp((dueAt - now) / 1000, 0, totalSeconds);
  const progress = totalSeconds > 0 ? secondsRemaining / totalSeconds : 0;

  const jitterSeconds = Math.max(0, (dueAt - rawTarget) / 1000);

  return {
    phase,
    secondsRemaining,
    totalSeconds,
    progress,
    dueAt,
    jitterSeconds,
  };
}

function icon({ type, className = "w-5 h-5" }) {
  if (type === "settings") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }

  if (type === "refresh") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    );
  }

  if (type === "state") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    );
  }

  if (type === "events") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  return null;
}

// ----------------------------
// Hold-to-activate button
// ----------------------------

function HoldToActivateButton({
  onConfirm,
  disabled,
  holdMs = HOLD_TO_ACTIVATE_MS,
  baseTone = "emerald", // 'emerald' | 'zinc'
  children,
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const firedRef = useRef(false);

  const stop = () => {
    setHolding(false);
    setProgress(0);
    firedRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => () => stop(), []);

  const step = (t) => {
    const elapsed = t - startRef.current;
    const p = clamp(elapsed / holdMs, 0, 1);
    setProgress(p);

    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      stop();
      onConfirm();
      return;
    }

    rafRef.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    startRef.current = performance.now();
    setHolding(true);
    firedRef.current = false;
    rafRef.current = requestAnimationFrame(step);
  };

  const onPointerUp = () => {
    if (!holding) return;
    stop();
  };

  const onPointerCancel = () => stop();
  const onPointerLeave = () => stop();

  const deg = Math.round(progress * 360);

  const tone = baseTone === "emerald" ? {
    inner: "rgba(16,185,129,0.14)",
    text: "rgba(167,243,208,1)",
    charge: "rgba(52,211,153,0.95)",
  } : {
    inner: "rgba(63,63,70,0.20)",
    text: "rgba(228,228,231,0.8)",
    charge: "rgba(161,161,170,0.9)",
  };

  const borderLayer = holding
    ? `conic-gradient(${tone.charge} ${deg}deg, rgba(63,63,70,0.55) 0deg)`
    : `linear-gradient(rgba(63,63,70,0.7), rgba(63,63,70,0.7))`;

  const bg = `linear-gradient(${tone.inner}, ${tone.inner}) padding-box, ${borderLayer} border-box`;

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      className={`w-full select-none rounded-xl py-3 text-xs uppercase tracking-widest transition-all ${
        disabled ? "opacity-60" : "hover:brightness-110"
      }`}
      style={{
        border: "1px solid transparent",
        background: bg,
        color: tone.text,
        touchAction: "none",
      }}
      aria-label="Hold to activate"
    >
      <div className="flex flex-col items-center">
        <div>{children}</div>
        <div className="mt-1 text-[10px] tracking-[0.22em] text-zinc-400">hold 1s</div>
      </div>
    </button>
  );
}

// ----------------------------
// UI components
// ----------------------------

function DoorCard({ door, settings, now, onOpen, onRequestClose }) {
  const isOpen = door.status === "open";
  const isClosing = Boolean(door.closing);

  // When closing, the center ring shows time to the next step:
  // - queued: time to cron tick (commandAt)
  // - verifying: time to verifyAt (checkDelay)
  const closingRing = useMemo(() => {
    if (!door.closing) return null;

    const c = door.closing;
    const nextAt = c.stage === "queued" ? c.commandAt : c.verifyAt;
    const remaining = clamp((nextAt - now) / 1000, 0, 365 * 24 * 60 * 60);
    const total = c.stage === "queued" ? CRON_MS / 1000 : Math.max(1, settings.checkDelay * 60);
    const progress = total > 0 ? clamp(remaining / total, 0, 1) : 0;

    return {
      stage: c.stage,
      trigger: c.trigger,
      secondsRemaining: remaining,
      totalSeconds: total,
      progress,
    };
  }, [door.closing, now, settings.checkDelay]);

  const countdown = useMemo(() => {
    if (!isOpen || isClosing) return null;
    return computeCountdown({
      isOpen,
      openedAt: door.openedAt,
      closeAttempts: door.closeAttempts,
      lastCloseAttempt: door.lastCloseAttempt,
      now,
      closeDelayMin: settings.closeDelay,
      retryDelayMin: settings.retryDelay,
      cronMs: CRON_MS,
    });
  }, [isOpen, isClosing, door.openedAt, door.closeAttempts, door.lastCloseAttempt, now, settings.closeDelay, settings.retryDelay]);

  const ring = closingRing || countdown || { phase: "closed", secondsRemaining: 0, totalSeconds: 1, progress: 1 };

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - ring.progress * circumference;

  const autoClosing = Boolean(door.closing && door.closing.trigger === "auto");

  // Ring colors
  let ringColor = "#10b981"; // closed
  if (isOpen) ringColor = "#3b82f6"; // open countdown default
  if (countdown && countdown.phase === "retry") ringColor = "#f59e0b";
  if (closingRing && closingRing.trigger === "auto") ringColor = "#ef4444";
  if (closingRing && closingRing.trigger === "manual") ringColor = "#22c55e";

  const ringGlow = autoClosing
    ? "drop-shadow(0 0 14px rgba(239, 68, 68, 0.55))"
    : isOpen
    ? "drop-shadow(0 0 10px rgba(59, 130, 246, 0.55))"
    : "drop-shadow(0 0 8px rgba(16, 185, 129, 0.45))";

  const openForSec = isOpen && door.openedAt ? (now - door.openedAt) / 1000 : 0;

  const latestType = String(door.latestEvent?.type || "").toUpperCase();
  let latestDot = "bg-blue-400";
  if (latestType.includes("FAIL") || latestType.includes("ERROR")) latestDot = "bg-amber-400";
  else if (latestType.includes("CLOSED")) latestDot = "bg-emerald-400";

  const nextActionText = (() => {
    if (door.closing) {
      if (door.closing.stage === "queued") return "Queued (cron check)";
      return "Verifying closed";
    }
    if (!isOpen) return "—";
    if (!countdown) return "—";
    return countdown.phase === "initial" ? "Close attempt" : "Retry close";
  })();

  const nextAtText = (() => {
    if (door.closing) {
      const nextAt = door.closing.stage === "queued" ? door.closing.commandAt : door.closing.verifyAt;
      return `~${formatCountdown((nextAt - now) / 1000)}`;
    }
    if (!countdown || !countdown.dueAt) return "—";
    return `~${formatCountdown(countdown.secondsRemaining)}`;
  })();

  const cronJitterText = (() => {
    if (!countdown || !countdown.jitterSeconds) return null;
    if (countdown.jitterSeconds < 1) return null;
    return `cron +${Math.round(countdown.jitterSeconds)}s`;
  })();

  return (
    <div className="relative rounded-3xl border border-zinc-800/70 bg-zinc-900/35 p-6 transition-all duration-300 hover:bg-zinc-800/35">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-extralight tracking-wide text-zinc-100">{door.name}</h3>
          <div
            className={`mt-1 inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${
              door.hasSchedule ? "bg-cyan-500/15 text-cyan-300" : "bg-zinc-700/35 text-zinc-500"
            }`}
          >
            {door.hasSchedule ? "Scheduled" : "No Schedule"}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="mb-6 flex items-center gap-6">
        {/* Ring */}
        <div className={`relative h-36 w-36 ${autoClosing ? "animate-pulse" : ""}`}>
          <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(63, 63, 70, 0.28)" strokeWidth="10" />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-300"
              style={{ filter: ringGlow }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isOpen ? (
              <>
                <span className={`font-mono text-3xl font-light ${autoClosing ? "text-red-300" : "text-blue-300"}`}>
                  {formatCountdown(ring.secondsRemaining)}
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">
                  {door.closing
                    ? door.closing.stage === "queued"
                      ? "to cron"
                      : "to verify"
                    : countdown && countdown.phase === "retry"
                    ? "until retry"
                    : "until close"}
                </span>
                {door.closeAttempts > 0 ? (
                  <span className="mt-1 text-[10px] text-amber-400">Attempt #{door.closeAttempts + 1}</span>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm uppercase tracking-widest text-emerald-400">Closed</span>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Latest Event</div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${latestDot}`} />
              <span className="text-sm text-zinc-300">{door.latestEvent?.type || "—"}</span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{door.latestEvent?.time || "—"}</div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">{isOpen ? "Open For" : "Closed For"}</div>
            <div className="text-sm text-zinc-300">{isOpen ? formatCountdown(openForSec) : door.closedDuration}</div>
          </div>

          {cronJitterText ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Timing</div>
              <div className="text-xs text-zinc-500">~ cron aligned • {cronJitterText}</div>
            </div>
          ) : (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Timing</div>
              <div className="text-xs text-zinc-500">~ cron aligned • 1m cadence</div>
            </div>
          )}
        </div>
      </div>

      {/* Next action */}
      <div className="mb-4 rounded-xl bg-zinc-950/35 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Next Action</div>
            <div className="text-sm text-zinc-400">{nextActionText}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Next In</div>
            <div className="text-sm text-zinc-400">{isOpen ? nextAtText : "—"}</div>
          </div>
        </div>
      </div>

      {/* Action button */}
      {isOpen ? (
        isClosing ? (
          <button
            type="button"
            disabled
            className={`w-full rounded-xl border px-4 py-3 text-xs uppercase tracking-widest transition-all ${
              autoClosing
                ? "border-red-500/50 bg-red-500/10 text-red-200 animate-pulse"
                : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            Closing…
          </button>
        ) : (
          <HoldToActivateButton onConfirm={() => onRequestClose(door.id)} disabled={false} baseTone="emerald">
            Close Now
          </HoldToActivateButton>
        )
      ) : (
        <button
          type="button"
          onClick={() => onOpen(door.id)}
          className="w-full rounded-xl border border-zinc-700/70 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-all hover:bg-zinc-700/30 hover:text-zinc-100"
        >
          Simulate Open
        </button>
      )}
    </div>
  );
}

function SettingsPanel({ settings, setSettings, onSave }) {
  return (
    <div className="border-b border-zinc-800/50 bg-zinc-900/25 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-8 py-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:gap-8">
          <div className="flex-1">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Close Delay</div>
            <div className="flex items-center gap-3">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: `${(settings.closeDelay / 15) * 100}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-xl font-light text-zinc-100">{settings.closeDelay}</span>
              <span className="text-xs text-zinc-500">min</span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              value={settings.closeDelay}
              onChange={(e) => setSettings((p) => ({ ...p, closeDelay: parseInt(e.target.value, 10) }))}
              className="mt-2 w-full accent-blue-500"
            />
          </div>

          <div className="flex-1">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Check Delay</div>
            <div className="flex items-center gap-3">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="absolute inset-y-0 left-0 rounded-full bg-zinc-500" style={{ width: `${(settings.checkDelay / 5) * 100}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-xl font-light text-zinc-100">{settings.checkDelay}</span>
              <span className="text-xs text-zinc-500">min</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.checkDelay}
              onChange={(e) => setSettings((p) => ({ ...p, checkDelay: parseInt(e.target.value, 10) }))}
              className="mt-2 w-full accent-zinc-400"
            />
          </div>

          <div className="flex-1">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Retry Delay</div>
            <div className="flex items-center gap-3">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: `${(settings.retryDelay / 10) * 100}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-xl font-light text-zinc-100">{settings.retryDelay}</span>
              <span className="text-xs text-zinc-500">min</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.retryDelay}
              onChange={(e) => setSettings((p) => ({ ...p, retryDelay: parseInt(e.target.value, 10) }))}
              className="mt-2 w-full accent-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={onSave}
            className="rounded-xl bg-zinc-100 px-6 py-3 text-xs font-medium uppercase tracking-widest text-zinc-900 transition-colors hover:bg-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SystemToggle({ enabled, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-2">
      <span className="text-xs uppercase tracking-wider text-zinc-400">System</span>
      <div className={`relative h-6 w-12 rounded-full transition-colors ${enabled ? "bg-emerald-500/30" : "bg-zinc-700"}`}>
        <div
          className={`absolute top-1 h-4 w-4 rounded-full transition-all ${
            enabled ? "left-7 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "left-1 bg-zinc-500"
          }`}
        />
      </div>
    </button>
  );
}

// ----------------------------
// Minimal self-tests
// Run with ?test=1
// ----------------------------

function runSelfTestsOnce() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("test") !== "1") return;

  console.assert(clamp(5, 0, 10) === 5, "clamp within range");
  console.assert(clamp(-1, 0, 10) === 0, "clamp low");
  console.assert(clamp(11, 0, 10) === 10, "clamp high");
  console.assert(ceilToCron(1) === CRON_MS, "ceilToCron rounds up");
  console.assert(ceilToCron(CRON_MS) === CRON_MS, "ceilToCron exact");

  // Cron-aligned example: base at 0, 9m target is exactly 540000 (cron exact)
  const c1 = computeCountdown({
    isOpen: true,
    openedAt: 0,
    closeAttempts: 0,
    lastCloseAttempt: null,
    now: 60_000,
    closeDelayMin: 9,
    retryDelayMin: 4,
    cronMs: 60_000,
  });
  console.assert(c1.phase === "initial", "countdown initial phase");
  console.assert(Math.floor(c1.secondsRemaining) === 480, "aligned: after 1m, ~8m remaining");
  console.assert(c1.jitterSeconds === 0, "aligned: jitter 0");

  // Unaligned example: base at 10s, target at 550s -> cron rounds to 600s
  const c2 = computeCountdown({
    isOpen: true,
    openedAt: 10_000,
    closeAttempts: 0,
    lastCloseAttempt: null,
    now: 70_000,
    closeDelayMin: 9,
    retryDelayMin: 4,
    cronMs: 60_000,
  });
  console.assert(c2.dueAt === 600_000, "unaligned: dueAt rounded to cron");
  console.assert(Math.floor(c2.secondsRemaining) === 530, "unaligned: extra cron jitter included");
  console.assert(Math.floor(c2.jitterSeconds) === 50, "unaligned: jitter about 50s");

  // Retry example (aligned)
  const c3 = computeCountdown({
    isOpen: true,
    openedAt: 0,
    closeAttempts: 1,
    lastCloseAttempt: 600_000,
    now: 600_000,
    closeDelayMin: 9,
    retryDelayMin: 4,
    cronMs: 60_000,
  });
  console.assert(c3.phase === "retry", "retry phase");
  console.assert(Math.floor(c3.secondsRemaining) === 240, "retry starts at 4m remaining");
}

// ----------------------------
// Main
// ----------------------------

export default function GarageController() {
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [settings, setSettings] = useState({ closeDelay: 9, checkDelay: 1, retryDelay: 4 });
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("state");

  const [now, setNow] = useState(Date.now());
  const [doors, setDoors] = useState(initialDoors);
  const [eventLog, setEventLog] = useState(() => {
    const seed = initialDoors
      .map((d) => ({
        id: `${d.id}-seed`,
        door: d.name,
        type: d.latestEvent?.type || "—",
        time: d.latestEvent?.time || "—",
      }))
      .reverse();
    return seed;
  });

  useEffect(() => {
    runSelfTestsOnce();
  }, []);

  // Global clock tick (drives countdown + cron simulation)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const pushEvents = (items) => {
    const entries = (items || [])
      .filter(Boolean)
      .map(({ door, type, ts }) => ({
        id: `${ts}-${Math.random().toString(16).slice(2)}`,
        door,
        type,
        time: formatTime(ts),
      }));

    setEventLog((prev) => [...entries, ...prev].slice(0, 200));
  };

  // Helper: schedule a close attempt through the cron pipeline
  const requestClose = (doorId, trigger) => {
    const requestedAt = now;
    const commandAt = trigger === "manual" ? ceilToCron(now) : now; // auto will supply its own aligned time

    setDoors((prev) =>
      prev.map((d) => {
        if (d.id !== doorId) return d;
        if (d.status !== "open") return d;
        if (d.closing) return d;

        const c = {
          trigger,
          stage: requestedAt >= commandAt ? "verifying" : "queued",
          commandAt,
          verifyAt: commandAt + settings.checkDelay * 60 * 1000,
        };

        const next = {
          ...d,
          closing: c,
          latestEvent: { type: trigger === "manual" ? "CLOSE REQUESTED" : "CLOSE SIGNAL SENT", time: formatTime(requestedAt) },
        };

        return next;
      })
    );

    pushEvents([{ door: doorId === "left" ? "Left" : doorId === "middle" ? "Middle" : "Right", type: "CLOSE REQUESTED", ts: requestedAt }]);
  };

  const simulateOpen = (doorId) => {
    const t = now;
    setDoors((prev) =>
      prev.map((d) =>
        d.id === doorId
          ? {
              ...d,
              status: "open",
              openedAt: t,
              closing: null,
              closeAttempts: 0,
              lastCloseAttempt: null,
              latestEvent: { type: "OPENED", time: formatTime(t) },
            }
          : d
      )
    );
    pushEvents([{ door: doorId === "left" ? "Left" : doorId === "middle" ? "Middle" : "Right", type: "OPENED", ts: t }]);
  };

  // Mock initial state
  useEffect(() => {
    // Middle: open 12m, already failed once, now counting down retry=4m
    const t = Date.now();
    setDoors((prev) =>
      prev.map((d) => {
        if (d.id === "middle") {
          return {
            ...d,
            status: "open",
            openedAt: t - 12 * 60 * 1000,
            closeAttempts: 1,
            lastCloseAttempt: t,
            closing: null,
            latestEvent: { type: "CLOSE FAILED", time: formatTime(t) },
          };
        }
        if (d.id === "right") {
          return {
            ...d,
            status: "open",
            openedAt: t,
            closeAttempts: 0,
            lastCloseAttempt: null,
            closing: null,
            latestEvent: { type: "OPENED", time: formatTime(t) },
          };
        }
        return d;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cron simulation / state machine:
  // - If countdown hits dueAt, cron sends close signal (auto trigger) and we enter verifying.
  // - After checkDelay minutes, verify closes the door (success in this mock).
  useEffect(() => {
    const events = [];

    setDoors((prev) => {
      let changed = false;

      const next = prev.map((d) => {
        let door = d;

        // Advance closing pipeline
        if (door.closing) {
          const c = door.closing;

          // queued → verifying (at cron command time)
          if (c.stage === "queued" && now >= c.commandAt) {
            changed = true;
            const updated = {
              ...door,
              closing: { ...c, stage: "verifying" },
              lastCloseAttempt: c.commandAt,
              latestEvent: { type: "CLOSE SIGNAL SENT", time: formatTime(c.commandAt) },
            };
            events.push({ door: door.name, type: "CLOSE SIGNAL SENT", ts: c.commandAt });
            door = updated;
          }

          // verifying → closed (at verify time)
          const c2 = door.closing;
          if (c2 && c2.stage === "verifying" && now >= c2.verifyAt) {
            changed = true;
            // Mock: always succeed for now.
            const closedAt = c2.verifyAt;
            events.push({ door: door.name, type: "CLOSED", ts: closedAt });
            door = {
              ...door,
              status: "closed",
              openedAt: null,
              closing: null,
              closeAttempts: 0,
              lastCloseAttempt: null,
              closedDuration: "just now",
              latestEvent: { type: "CLOSED", time: formatTime(closedAt) },
            };
          }

          return door;
        }

        // If door is open and not closing, see if an AUTO close is due
        if (door.status === "open" && door.openedAt) {
          const cd = computeCountdown({
            isOpen: true,
            openedAt: door.openedAt,
            closeAttempts: door.closeAttempts,
            lastCloseAttempt: door.lastCloseAttempt,
            now,
            closeDelayMin: settings.closeDelay,
            retryDelayMin: settings.retryDelay,
            cronMs: CRON_MS,
          });

          if (cd.dueAt && now >= cd.dueAt) {
            // cron tick triggers close attempt
            const commandAt = cd.dueAt;
            const verifyAt = commandAt + settings.checkDelay * 60 * 1000;
            changed = true;

            events.push({ door: door.name, type: "CLOSE SIGNAL SENT", ts: commandAt });

            return {
              ...door,
              closing: { trigger: "auto", stage: "verifying", commandAt, verifyAt },
              lastCloseAttempt: commandAt,
              latestEvent: { type: "CLOSE SIGNAL SENT", time: formatTime(commandAt) },
            };
          }
        }

        return door;
      });

      return changed ? next : prev;
    });

    if (events.length) pushEvents(events);
  }, [now, settings.closeDelay, settings.retryDelay, settings.checkDelay]);

  const refresh = () => {
    pushEvents([{ door: "System", type: "REFRESH", ts: Date.now() }]);
  };

  const tabButton = (key, label, ic) => {
    const active = activeTab === key;
    return (
      <button
        type="button"
        onClick={() => setActiveTab(key)}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
          active ? "bg-zinc-800/50 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {icon({ type: ic, className: "w-4 h-4" })}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-black text-zinc-100">
      {/* Background: simple gradient (green at bottom) */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-black via-black to-emerald-950" />

      {/* Glow blobs */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute bottom-[-260px] left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-emerald-500/18 blur-[170px]" />
        <div className="absolute bottom-[-240px] right-[-220px] h-[640px] w-[640px] rounded-full bg-emerald-400/10 blur-[160px]" />
        <div className="absolute top-[-260px] left-[-240px] h-[620px] w-[620px] rounded-full bg-blue-500/10 blur-[170px]" />
      </div>

      {/* Soft vignette */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

      {/* Header */}
      <header className="relative z-10 border-b border-zinc-800/50 px-8 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl uppercase tracking-[0.3em]">Garage</div>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-500">Controller</span>
          </div>

          <div className="flex items-center gap-4">
            <SystemToggle enabled={systemEnabled} onToggle={() => setSystemEnabled((v) => !v)} />
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`rounded-xl border p-3 transition-colors ${
                showSettings ? "border-zinc-700 bg-zinc-800" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              }`}
              aria-label="Settings"
            >
              {icon({ type: "settings", className: "w-5 h-5 text-zinc-400" })}
            </button>
          </div>
        </div>
      </header>

      {/* Settings */}
      {showSettings ? (
        <div className="relative z-20">
          <SettingsPanel settings={settings} setSettings={setSettings} onSave={() => setShowSettings(false)} />
        </div>
      ) : null}

      {/* Tabs */}
      <div className="relative z-10 border-b border-zinc-800/30 px-8 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-6">
          {tabButton("state", "State", "state")}
          {tabButton("events", "Events", "events")}
          <div className="flex-1" />
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-zinc-500 hover:text-zinc-300"
          >
            {icon({ type: "refresh", className: "w-4 h-4" })}
            <span className="text-xs uppercase tracking-wider">Refresh</span>
          </button>
        </div>
      </div>

      <main className="relative z-10 px-8 py-8 pb-28">
        <div className="mx-auto max-w-6xl">
          {activeTab === "state" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {doors.map((door) => (
                <DoorCard
                  key={door.id}
                  door={door}
                  settings={settings}
                  now={now}
                  onOpen={simulateOpen}
                  onRequestClose={(id) => requestClose(id, "manual")}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/25 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-100">Event stream</div>
                  <div className="mt-1 text-xs text-zinc-500">Newest first</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEventLog((p) => p.slice(0, 50))}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-4 py-2 text-xs uppercase tracking-widest text-zinc-300 hover:border-zinc-700"
                >
                  Trim
                </button>
              </div>

              <div className="mt-5 max-h-[520px] overflow-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/25">
                {eventLog.length === 0 ? (
                  <div className="p-6 text-sm text-zinc-500">No events yet.</div>
                ) : (
                  <ul className="divide-y divide-zinc-800/60">
                    {eventLog.map((e) => {
                      const t = String(e.type).toUpperCase();
                      let dot = "bg-blue-400";
                      if (t.includes("FAIL") || t.includes("ERROR")) dot = "bg-amber-400";
                      else if (t.includes("CLOSED")) dot = "bg-emerald-400";
                      else if (t.includes("SIGNAL") || t.includes("CLOSE")) dot = "bg-red-400";

                      return (
                        <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                            <div>
                              <div className="text-sm text-zinc-200">
                                <span className="text-zinc-100">{e.type}</span>
                                <span className="text-zinc-500"> • </span>
                                <span className="text-zinc-300">{e.door}</span>
                              </div>
                              <div className="text-xs text-zinc-500">{e.time}</div>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-600">{String(e.id).slice(0, 8)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t border-zinc-800/30 bg-zinc-950/80 px-8 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button type="button" className="text-xs uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300">
            Sign out
          </button>
          <div className="font-mono text-[10px] text-zinc-600">Live data • {systemEnabled ? "System enabled" : "System paused"}</div>
        </div>
      </footer>
    </div>
  );
}
