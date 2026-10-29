import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { GuildStore, Build } from "../data/store";
import { GuildError, rankOf, reservedCoins } from "../domain/rules";
import type { Entry, FamilyState, Profile, UrgentQuest } from "../domain/types";

// ---- データ ----

export function useGuildState(store: GuildStore): FamilyState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** 1秒ごと（など）に更新される現在時刻 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ---- 通知（トースト）と演出 ----

interface Feedback {
  toast(text: string): void;
  celebrate(): void;
  /** 操作を実行し、ルール違反や通信エラーをトーストで知らせる。成功したら true */
  run(store: GuildStore, build: Build, success?: string, celebrate?: boolean): Promise<boolean>;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const f = useContext(FeedbackContext);
  if (!f) throw new Error("FeedbackProvider がありません");
  return f;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2600);
  }, []);
  const celebrate = useCallback(() => setBurstKey((k) => k + 1), []);
  const run = useCallback<Feedback["run"]>(
    async (store, build, success, party) => {
      try {
        await store.commit(build);
        if (success) toast(success);
        if (party) celebrate();
        return true;
      } catch (e) {
        if (e instanceof GuildError) toast(e.message);
        else {
          console.error(e);
          toast("保存できませんでした。電波の良いところでもう一度試してください");
        }
        return false;
      }
    },
    [toast, celebrate]
  );

  return (
    <FeedbackContext.Provider value={{ toast, celebrate, run }}>
      {children}
      {burstKey > 0 && <Burst key={burstKey} />}
      <div className="toast" role="status" hidden={!text}>
        {text}
      </div>
    </FeedbackContext.Provider>
  );
}

function Burst() {
  const [dots] = useState(() =>
    Array.from({ length: 18 }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 120;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
    })
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1000);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div className="burst" aria-hidden="true">
      {dots.map((d, i) => (
        <i key={i} style={{ left: "50%", top: "45%", ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px` }} />
      ))}
    </div>
  );
}

// ---- 部品 ----

export function Crest({ p, big = false }: { p: Profile; big?: boolean }) {
  return (
    <span className={big ? "crest big" : "crest"} style={{ background: p.color }} aria-hidden="true">
      {p.role === "kid" ? p.name.slice(0, 1) : p.name}
    </span>
  );
}

export const ICON = {
  home: <path d="M4 10l8-6 8 6v10H4zM10 20v-6h4v6" />,
  board: <path d="M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zM8 8h8M8 12h8M8 16h5" />,
  shop: <path d="M4 9h16l-1.5 11h-13zM9 9V6a3 3 0 016 0v3" />,
  log: <path d="M6 3h9l3 3v15H6zM9 11h6M9 15h6" />,
  check: <path d="M5 12l5 5 9-10" />,
  kids: <path d="M5 9a3 3 0 106 0 3 3 0 10-6 0M13 9a3 3 0 106 0 3 3 0 10-6 0M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5" />,
  flag: <path d="M5 21V4h12l-2 4 2 4H5" />,
  gear: <path d="M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
};

export type TabDef<K extends string> = { key: K; label: string; icon: keyof typeof ICON; badge?: number };

export function Tabs<K extends string>({ tabs, current, onChange }: { tabs: TabDef<K>[]; current: K; onChange(k: K): void }) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === current} onClick={() => onChange(t.key)}>
          <span className="badge" data-n={t.badge ?? 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICON[t.icon]}
            </svg>
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function Section({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="sec">
      <h2>{title}</h2>
      {aside !== undefined && <span>{aside}</span>}
    </div>
  );
}

export function GuildCard({ state, kid }: { state: FamilyState; kid: Profile }) {
  const r = rankOf(kid.total);
  const reserved = reservedCoins(state, kid.id);
  return (
    <section className="card" aria-label="ギルドカード">
      <Crest p={kid} big />
      <span className="label">ADVENTURER GUILD CARD</span>
      <h1>{kid.name}</h1>
      <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>
        {kid.grade}・累計 {kid.total.toLocaleString()} G
      </span>
      <span className="rank">
        {r.rank}
        <small>ランク</small>
      </span>
      <div className="gold">
        <b>{kid.coins.toLocaleString()}</b>
        <span>G 所持{reserved > 0 && `（うち ${reserved} G は交換予約中）`}</span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.round(r.progress * 100)}%` }} />
      </div>
      <div className="barlabel">{r.next ? `${r.next}ランクまで あと ${r.toNext.toLocaleString()} G` : "最高ランク到達！"}</div>
    </section>
  );
}

export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function UrgentPanel({ urgent, state, now, action }: { urgent: UrgentQuest; state: FamilyState; now: number; action?: ReactNode }) {
  const issuer = state.profiles.find((p) => p.id === urgent.issuedBy);
  const taker = urgent.takenBy ? state.profiles.find((p) => p.id === urgent.takenBy) : null;
  const expired = urgent.deadline <= now;
  return (
    <section className="urgent" aria-label="緊急クエスト">
      <span className="tag">緊急クエスト　発令：{issuer?.name ?? "親"}</span>
      <h3>{urgent.title}</h3>
      <div className="row">
        <span className="timer">
          {expired ? (
            <span className="closed">締め切りました</span>
          ) : (
            <>
              <small>のこり</small>
              {formatLeft(urgent.deadline - now)}
            </>
          )}
        </span>
        <span style={{ fontFamily: "var(--display)", color: "var(--brass)", fontSize: 20 }}>
          {urgent.reward} G <small style={{ fontFamily: "var(--body)", fontSize: 11, color: "var(--ink-dim)" }}>先着1名</small>
        </span>
      </div>
      {urgent.done && taker && <span className="done-mark">{taker.name}が達成！</span>}
      {!urgent.done && taker && <span className="pill p-wait">{taker.name}が受注・承認待ち</span>}
      {action}
    </section>
  );
}

export function timeLabel(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === n.toDateString()) return `今日 ${hm}`;
  const y = new Date(now - 86400_000);
  if (d.toDateString() === y.toDateString()) return `昨日 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function EntryRow({ e, state, now, showName }: { e: Entry; state: FamilyState; now: number; showName?: boolean }) {
  const who = state.profiles.find((p) => p.id === e.profileId);
  const pill =
    e.status === "wait"
      ? ["p-wait", "承認待ち"]
      : e.status === "ok"
        ? ["p-ok", e.kind === "shop" ? "交換済み" : e.kind === "bonus" ? "ボーナス" : "承認"]
        : ["p-back", e.kind === "shop" ? "キャンセル" : "差し戻し"];
  const minus = e.kind === "shop";
  return (
    <div className="log">
      <div style={{ minWidth: 0 }}>
        <div className="t">
          {showName && who ? `${who.name}：` : ""}
          {e.title}
        </div>
        <div className="s">
          {e.kind === "shop" ? "交換" : e.kind === "bonus" ? "ボーナス" : "クエスト"}・{timeLabel(e.createdAt, now)}
          {e.comment ? `・「${e.comment}」` : ""}
        </div>
      </div>
      <div style={{ display: "grid", justifyItems: "end", gap: 2 }}>
        <span className="v" style={{ color: minus ? "var(--ink-dim)" : "var(--brass)" }}>
          {minus ? "−" : "+"}
          {e.value}
        </span>
        <span className={`pill ${pill[0]}`}>{pill[1]}</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
