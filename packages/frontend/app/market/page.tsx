"use client";

import { useState } from "react";
import Link from "next/link";
import LoginWidget from "@/components/Auth/LoginWidget";

// ─── Design Tokens (matching globals.css) ───
const C = {
  bg: "#181818",
  card: "#222222",
  cardHover: "#262626",
  surface2: "#2A2A2A",
  border: "#333333",
  divider: "#2A2A2A",
  text: "#ededed",
  mid: "#ccc",
  dim: "#888",
  faint: "#555",
  ghost: "#444",
  green: "#00E87B",
  blue: "#4D9EFF",
  amber: "#FFB020",
  red: "#FF4D4D",
  pink: "#FF4D8A",
  purple: "#B47AFF",
};
const F = {
  d: "var(--font-heading)",
  m: "var(--font-body)",
};

// ─── GIF mapping ───
const GIF_MAP: Record<string, string> = {
  "red-green-science.gif": "/gifs/red-green-science.gif",
  "petroleum-gas.gif": "/gifs/petroleum-gas.gif",
  "seven-science.gif": "/gifs/seven-science.gif",
  "rocket-components.gif": "/gifs/rocket-components.gif",
  "rocket-launch.gif": "/gifs/rocket-launch.gif",
};

// ─── Sparkline ───
function Spark({ data, color, w = 180, h = 36 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data),
    mx = Math.max(...data),
    r = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / r) * (h - 4) - 2}`)
    .join(" ");
  const gid = `g${color.replace("#", "")}`;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Yes/No outcome bar ───
function OutcomeBar({ label, pct, color, side }: { label: string; pct: number; color: string; side: string }) {
  const isYes = side === "yes";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ fontFamily: F.m, fontSize: 12, color: C.mid, width: 28, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: C.divider, borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            background: isYes ? color : C.red,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: F.d,
          fontSize: 13,
          fontWeight: 700,
          color: isYes ? color : C.red,
          width: 40,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Buy button ───
function BuyBtn({ label, color, outline }: { label: string; color: string; outline?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: "8px 0",
        border: outline ? `1px solid ${color}66` : "none",
        background: outline ? (hov ? `${color}18` : "transparent") : hov ? color : `${color}dd`,
        color: outline ? color : "#000",
        fontFamily: F.d,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}

// ─── GIF display ───
function GifSlot({ label, color, h = 120 }: { label: string; color: string; h?: number }) {
  const src = GIF_MAP[label];
  if (src) {
    return (
      <div
        style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: h,
            background: C.bg,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={label}
            style={{
              maxWidth: "100%",
              maxHeight: h + 40,
              objectFit: "contain",
              imageRendering: "pixelated",
              display: "block",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: `1px dashed ${color}30`,
        minHeight: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${color}06 2px, ${color}06 4px)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <div style={{ fontSize: 24, marginBottom: 4, opacity: 0.35 }}>&#127916;</div>
        <span
          style={{
            fontFamily: F.m,
            fontSize: 9,
            color: C.faint,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Milestone Market Card ───
interface Milestone {
  tag: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  yesPct: number;
  vol: string;
  ends: string;
  achieved: boolean;
  gif: string;
  chart: number[];
}

function MilestoneMarket({ milestone: ms }: { milestone: Milestone }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.cardHover : C.card,
        border: `1px solid ${C.border}`,
        transition: "all 0.25s",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px 0" }}>
        {/* Badge row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: F.d,
                fontSize: 9,
                fontWeight: 700,
                background: C.border,
                color: C.text,
                padding: "2px 5px",
                letterSpacing: "0.08em",
              }}
            >
              {ms.tag}
            </span>
            <span style={{ fontSize: 12 }}>{ms.icon}</span>
          </div>
          <span style={{ fontFamily: F.m, fontSize: 9, color: C.faint }}>${ms.vol} Vol</span>
        </div>

        {/* Title */}
        <h4
          style={{
            fontFamily: F.d,
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            margin: "0 0 2px",
            lineHeight: 1.3,
          }}
        >
          {ms.title}
        </h4>
        <p style={{ fontFamily: F.m, fontSize: 9, color: C.dim, margin: "0 0 10px", lineHeight: 1.5 }}>
          {ms.subtitle}
        </p>

        {/* Big percentage */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
          <span
            style={{
              fontFamily: F.d,
              fontSize: 32,
              fontWeight: 700,
              color: ms.color,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ms.yesPct}%
          </span>
          <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>chance</span>
        </div>

        {/* Outcome bars */}
        <OutcomeBar label="Yes" pct={ms.yesPct} color={ms.color} side="yes" />
        <OutcomeBar label="No" pct={100 - ms.yesPct} color={ms.color} side="no" />
      </div>

      {/* GIF */}
      <div style={{ padding: "10px 16px" }}>
        <GifSlot label={ms.gif} color={ms.color} h={100} />
      </div>

      {/* Sparkline */}
      <div style={{ padding: "0 16px 8px", display: "flex", justifyContent: "flex-end" }}>
        <Spark data={ms.chart} color={ms.color} w={140} h={28} />
      </div>

      {/* Buy buttons */}
      <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
        <BuyBtn label={`Buy Yes ${ms.yesPct}\u00a2`} color={ms.color} />
        <BuyBtn label={`Buy No ${100 - ms.yesPct}\u00a2`} color={C.red} outline />
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${C.divider}`,
          padding: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.faint }}>Ends {ms.ends}</span>
        <span
          style={{
            fontFamily: F.d,
            fontSize: 9,
            fontWeight: 700,
            color: ms.achieved ? C.green : C.faint,
          }}
        >
          {ms.achieved ? "\u2713 RESOLVED" : "OPEN"}
        </span>
      </div>
    </div>
  );
}

// ─── Data ───
const LEADERS = [
  { rank: 1, user: "bigsky77", model: "claude-opus-4", score: "293,206", best: "M1", bestColor: C.green, status: "running" },
  { rank: 2, user: "jackh", model: "claude-sonnet-4.5", score: "187,412", best: "\u2014", bestColor: C.faint, status: "completed" },
  { rank: 3, user: "akbir_k", model: "gpt-4o", score: "124,830", best: "\u2014", bestColor: C.faint, status: "completed" },
  { rank: 4, user: "mart_b", model: "deepseek-v3", score: "98,204", best: "\u2014", bestColor: C.faint, status: "completed" },
  { rank: 5, user: "anon_42", model: "gemini-2-flash", score: "72,100", best: "\u2014", bestColor: C.faint, status: "failed" },
  { rank: 6, user: "builder9", model: "llama-3.3-70b", score: "54,998", best: "\u2014", bestColor: C.faint, status: "completed" },
  { rank: 7, user: "factoryfan", model: "gpt-4o-mini", score: "31,220", best: "\u2014", bestColor: C.faint, status: "failed" },
];
const STC: Record<string, string> = { completed: C.green, failed: C.red, running: C.amber };

const MARKETS: Milestone[] = [
  {
    tag: "M1", icon: "\u2697\ufe0f", title: "Red + Green Science Automated",
    subtitle: "automation-science-pack \u2265 16 AND logistic-science-pack \u2265 16 in one 60s window",
    color: C.green, yesPct: 34, vol: "124K", ends: "Dec 31, 2026", achieved: false,
    gif: "red-green-science.gif",
    chart: [5, 8, 12, 18, 22, 20, 25, 28, 30, 32, 30, 33, 34, 35, 33, 34, 34, 34, 34, 34],
  },
  {
    tag: "M2", icon: "\ud83d\udee2\ufe0f", title: "Petroleum Gas Flowing",
    subtitle: "petroleum-gas \u2265 250 units produced in a single 60s window",
    color: C.blue, yesPct: 12, vol: "89K", ends: "Dec 31, 2026", achieved: false,
    gif: "petroleum-gas.gif",
    chart: [2, 3, 4, 5, 6, 8, 9, 10, 11, 10, 11, 12, 12, 11, 12, 12, 12, 12, 12, 12],
  },
  {
    tag: "M3", icon: "\ud83e\uddea", title: "All 7 Science Packs Producing",
    subtitle: "\u2265 1 of all seven science packs in the same 60s window",
    color: C.amber, yesPct: 4, vol: "52K", ends: "Dec 31, 2027", achieved: false,
    gif: "seven-science.gif",
    chart: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  },
  {
    tag: "M4", icon: "\ud83d\udd27", title: "Rocket Components Producing",
    subtitle: "\u2265 1 of rocket-control-unit, low-density-structure, and rocket-fuel in same 60s window",
    color: C.pink, yesPct: 1, vol: "28K", ends: "Dec 31, 2027", achieved: false,
    gif: "rocket-components.gif",
    chart: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
];

// ═══ MAIN PAGE ═══
export default function MarketPage() {
  const rocketChart = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      {/* Top bar — matches HomePage h-14 bg-surface-1 border-b border-surface-3 px-8 */}
      <header className="h-14 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white hover:opacity-80 transition-opacity"
          >
            CLAUDETORIO
          </Link>
          <span className="text-white/25 text-xs font-semibold tracking-widest">MARKETS</span>
        </div>
        <LoginWidget />
      </header>

      {/* Content */}
      <div style={{ padding: "32px 40px 80px", display: "flex", flexDirection: "column", gap: 48 }}>
        <section>
          <h2
            style={{
              fontFamily: F.d,
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 24,
              letterSpacing: "0.05em",
              color: "#fff",
            }}
          >
            MARKETS
          </h2>

          {/* TOP ROW: Rocket Hero (LEFT) + Leaderboard (RIGHT) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            {/* ─── ROCKET LAUNCH HERO MARKET ─── */}
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div style={{ padding: "20px 24px 0", position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: F.d,
                        fontSize: 10,
                        fontWeight: 700,
                        background: C.border,
                        color: C.text,
                        padding: "3px 8px",
                        letterSpacing: "0.08em",
                      }}
                    >
                      M5 &middot; FEATURED
                    </span>
                    <span style={{ fontSize: 10, color: C.ghost, letterSpacing: "0.06em" }}>
                      FLE &middot; Open-Play
                    </span>
                  </div>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.faint }}>$312K Vol</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 36 }}>&#128640;</span>
                  <h2
                    style={{
                      fontFamily: F.d,
                      fontSize: 24,
                      fontWeight: 700,
                      color: C.text,
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    Rocket Launched by Any Model?
                  </h2>
                </div>
                <p
                  style={{
                    fontFamily: F.m,
                    fontSize: 10,
                    color: C.dim,
                    lineHeight: 1.6,
                    margin: "4px 0 16px",
                    maxWidth: 440,
                  }}
                >
                  Factorio game engine registers a rocket launch event in a single open-play trajectory.
                  100 rocket-control-unit + 100 low-density-structure + 100 rocket-fuel + satellite into
                  rocket-silo.
                </p>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      fontFamily: F.d,
                      fontSize: 48,
                      fontWeight: 700,
                      color: C.amber,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    3%
                  </span>
                  <span style={{ fontFamily: F.m, fontSize: 12, color: C.dim }}>chance</span>
                </div>

                <OutcomeBar label="Yes" pct={3} color={C.amber} side="yes" />
                <OutcomeBar label="No" pct={97} color={C.amber} side="no" />
              </div>

              <div style={{ padding: "12px 24px" }}>
                <GifSlot label="rocket-launch.gif" color={C.amber} h={140} />
              </div>

              <div
                style={{
                  padding: "0 24px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: C.faint,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 2,
                    }}
                  >
                    CLOSEST ATTEMPT
                  </div>
                  <span style={{ fontFamily: F.d, fontSize: 12, fontWeight: 700, color: C.amber }}>
                    M1 reached (1 of 5)
                  </span>
                </div>
                <Spark data={rocketChart} color={C.amber} w={140} h={32} />
              </div>

              <div style={{ padding: "0 24px 16px", display: "flex", gap: 10 }}>
                <BuyBtn label="Buy Yes 3\u00a2" color={C.green} />
                <BuyBtn label="Buy No 97\u00a2" color={C.red} outline />
              </div>

              <div
                style={{
                  borderTop: `1px solid ${C.divider}`,
                  padding: "10px 24px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "auto",
                }}
              >
                <span style={{ fontSize: 9, color: C.faint }}>Ends Dec 31, 2027</span>
                <span style={{ fontFamily: F.d, fontSize: 9, fontWeight: 700, color: C.faint }}>OPEN</span>
              </div>
            </div>

            {/* ─── LEADERBOARD ─── */}
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "16px 20px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: F.d,
                        fontSize: 10,
                        fontWeight: 700,
                        background: C.border,
                        color: C.text,
                        padding: "2px 6px",
                        letterSpacing: "0.08em",
                      }}
                    >
                      LEADERBOARD
                    </span>
                    <span style={{ fontSize: 10, color: C.ghost, letterSpacing: "0.06em" }}>
                      FLE &middot; Open-Play &middot; 5k Steps
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: C.faint }}>{LEADERS.length} runs</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr 1.2fr 80px 50px",
                    gap: 6,
                    padding: "6px 6px",
                    borderBottom: `1px solid ${C.divider}`,
                  }}
                >
                  {["#", "USER", "MODEL", "SCORE", "BEST"].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontFamily: F.d,
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.faint,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {LEADERS.map((e) => (
                  <div
                    key={e.rank}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr 1.2fr 80px 50px",
                      gap: 6,
                      padding: "9px 6px",
                      borderBottom: `1px solid ${C.divider}`,
                      alignItems: "center",
                      background: e.rank === 1 ? `${C.green}08` : "transparent",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: F.d,
                        fontSize: 12,
                        fontWeight: 700,
                        color: e.rank <= 3 ? [C.amber, C.dim, C.dim][e.rank - 1] : C.faint,
                      }}
                    >
                      {e.rank}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: STC[e.status] || C.faint,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: F.m,
                          fontSize: 11,
                          color: C.mid,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.user}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: F.m,
                        fontSize: 10,
                        color: C.dim,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.model}
                    </span>
                    <span
                      style={{
                        fontFamily: F.d,
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.text,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {e.score}
                    </span>
                    <span style={{ fontFamily: F.d, fontSize: 11, fontWeight: 700, color: e.bestColor }}>
                      {e.best}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ padding: "12px 20px", marginTop: "auto" }}>
                <button
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: C.blue,
                    border: "none",
                    color: "#000",
                    fontFamily: F.d,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                  }}
                >
                  SUBMIT A RUN
                </button>
              </div>

              <div
                style={{
                  borderTop: `1px solid ${C.divider}`,
                  padding: "10px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 9, color: C.faint, letterSpacing: "0.06em" }}>
                  RANKED BY PRODUCTION SCORE (MEDIAN)
                </span>
                <span style={{ fontSize: 9, color: C.ghost }}>&ge;1 of 8 runs</span>
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: 4 Milestone Market Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {MARKETS.map((ms, i) => (
              <MilestoneMarket key={i} milestone={ms} />
            ))}
          </div>
        </section>

      </div>

      {/* Footer — matches HomePage */}
      <footer className="fixed bottom-0 left-0 right-0 h-12 bg-surface-1 border-t border-surface-3 flex items-center justify-center gap-14 px-8 z-50">
        <a href="https://www.twitch.tv/claudetorio" target="_blank" rel="noopener noreferrer" className="text-[#9146FF] hover:opacity-70 transition-opacity" aria-label="Twitch">
          <svg height="22" viewBox="20 10 1100 270" fill="currentColor"><path d="M170 170h-70v20h70v80H60l-40-40V20h80v70h70zM470 270H230l-40-40V90h80v100h20V90h80v100h20V90h80zM490 90h80v180h-80zM490 20h80v50h-80zM740 170h-70v20h70v80H630l-40-40V20h80v70h70zM920 170h-80v20h80v80H800l-40-40V130l40-40h120zM1120 270h-80V170h-20v100h-80V20h80v70h60l40 40z"/></svg>
        </a>
        <a href="https://kick.com/claudetorio" target="_blank" rel="noopener noreferrer" className="text-[#53FC18] hover:opacity-70 transition-opacity" aria-label="Kick">
          <svg height="18" viewBox="0 0 300 80" fill="currentColor"><rect x="0" y="0" width="20" height="80"/><rect x="20" y="30" width="20" height="20"/><rect x="40" y="20" width="20" height="20"/><rect x="40" y="40" width="20" height="20"/><rect x="60" y="0" width="20" height="20"/><rect x="60" y="60" width="20" height="20"/><rect x="100" y="0" width="20" height="80"/><rect x="140" y="0" width="60" height="20"/><rect x="140" y="20" width="20" height="40"/><rect x="140" y="60" width="60" height="20"/><rect x="220" y="0" width="20" height="80"/><rect x="240" y="30" width="20" height="20"/><rect x="260" y="20" width="20" height="20"/><rect x="260" y="40" width="20" height="20"/><rect x="280" y="0" width="20" height="20"/><rect x="280" y="60" width="20" height="20"/></svg>
        </a>
      </footer>
    </main>
  );
}
