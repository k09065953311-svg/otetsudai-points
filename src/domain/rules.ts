// ギルドのルール（ポイント計算・承認・交換）。
// 画面にも保存先にも依存しない「純粋な関数」だけを置き、自動テストで守る。
// 各操作は「何をどう書き換えるか」(Mutation の一覧) を返す。
// お試しモードはそれを手元の状態に、Firebase モードは Firestore に適用する。

import type { Entry, FamilyState, Profile, Quest, Reward, UrgentQuest } from "./types";

export class GuildError extends Error {}

export type Mutation =
  | { op: "putEntry"; entry: Entry }
  | { op: "putProfile"; profile: Profile }
  | { op: "putQuest"; quest: Quest }
  | { op: "putReward"; reward: Reward }
  | { op: "putUrgent"; urgent: UrgentQuest | null };

// ---- ランク ----

export const RANKS: ReadonlyArray<readonly [string, number]> = [
  ["F", 0],
  ["E", 500],
  ["D", 1500],
  ["C", 3000],
  ["B", 6000],
  ["A", 10000],
  ["S", 20000]
];

export function rankOf(total: number) {
  let i = 0;
  while (i + 1 < RANKS.length && total >= RANKS[i + 1][1]) i++;
  const [rank, floor] = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  return {
    rank,
    next: next ? next[0] : null,
    toNext: next ? next[1] - total : 0,
    progress: next ? (total - floor) / (next[1] - floor) : 1
  };
}

// ---- 日付 ----

/** 端末の時刻での日付 "YYYY-MM-DD" */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** その週の月曜 0:00 (端末の時刻) */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
}

// ---- 残高 ----

/** 交換申請中（親がまだ渡していない）G の合計 */
export function reservedCoins(state: FamilyState, profileId: string): number {
  return state.entries
    .filter((e) => e.profileId === profileId && e.kind === "shop" && e.status === "wait")
    .reduce((sum, e) => sum + e.value, 0);
}

/** 今使える G = 所持 G − 予約中の G */
export function availableCoins(state: FamilyState, profileId: string): number {
  return findProfile(state, profileId).coins - reservedCoins(state, profileId);
}

// ---- 参照 ----

export function findProfile(state: FamilyState, id: string): Profile {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) throw new GuildError("冒険者が見つかりません");
  return p;
}

function findKid(state: FamilyState, id: string): Profile {
  const p = findProfile(state, id);
  if (p.role !== "kid") throw new GuildError("子どものアカウントで操作してください");
  return p;
}

function findParent(state: FamilyState, id: string): Profile {
  const p = findProfile(state, id);
  if (p.role !== "parent") throw new GuildError("親のアカウントで操作してください");
  return p;
}

function findEntry(state: FamilyState, id: string): Entry {
  const e = state.entries.find((x) => x.id === id);
  if (!e) throw new GuildError("記録が見つかりません");
  return e;
}

export function questsFor(state: FamilyState, kidId: string): Quest[] {
  return state.quests.filter((q) => !q.archived && (q.visibleTo.length === 0 || q.visibleTo.includes(kidId)));
}

export function pendingEntries(state: FamilyState): Entry[] {
  return state.entries.filter((e) => e.status === "wait");
}

// ---- 回数制限 ----

/** 今日このクエストを報告した回数（差し戻しは数えない） */
export function reportsToday(state: FamilyState, kidId: string, questId: string, now: number): number {
  const today = dayKey(now);
  return state.entries.filter(
    (e) =>
      e.profileId === kidId &&
      e.kind === "quest" &&
      e.refId === questId &&
      e.status !== "back" &&
      dayKey(e.createdAt) === today
  ).length;
}

/** 今週このごほうびを交換（申請中を含む）した回数 */
export function exchangesThisWeek(state: FamilyState, kidId: string, rewardId: string, now: number): number {
  const from = weekStart(now);
  return state.entries.filter(
    (e) =>
      e.profileId === kidId &&
      e.kind === "shop" &&
      e.refId === rewardId &&
      e.status !== "back" &&
      e.createdAt >= from
  ).length;
}

export function questBlockReason(state: FamilyState, kidId: string, quest: Quest, now: number): string | null {
  if (quest.dailyLimit !== null && reportsToday(state, kidId, quest.id, now) >= quest.dailyLimit) {
    return `今日はもう${quest.dailyLimit}回報告しました。また明日！`;
  }
  return null;
}

export function rewardBlockReason(state: FamilyState, kidId: string, reward: Reward, now: number): string | null {
  const short = reward.price - availableCoins(state, kidId);
  if (short > 0) return `あと ${short} G`;
  if (reward.weeklyLimit !== null && exchangesThisWeek(state, kidId, reward.id, now) >= reward.weeklyLimit) {
    return `今週はもう${reward.weeklyLimit}回交換しました`;
  }
  return null;
}

// ---- 緊急クエスト ----

export function urgentIsOpen(u: UrgentQuest | null, now: number): u is UrgentQuest {
  return !!u && !u.done && u.takenBy === null && u.deadline > now;
}

// ---- 子どもの操作 ----

function newEntry(fields: Omit<Entry, "status" | "decidedAt" | "decidedBy" | "comment">): Entry {
  return { ...fields, status: "wait", decidedAt: null, decidedBy: null, comment: null };
}

export function reportQuest(state: FamilyState, kidId: string, questId: string, now: number, id: string): Mutation[] {
  findKid(state, kidId);
  const quest = questsFor(state, kidId).find((q) => q.id === questId);
  if (!quest) throw new GuildError("このクエストは受けられません");
  const reason = questBlockReason(state, kidId, quest, now);
  if (reason) throw new GuildError(reason);
  return [
    {
      op: "putEntry",
      entry: newEntry({ id, profileId: kidId, kind: "quest", refId: quest.id, title: quest.title, value: quest.reward, createdAt: now })
    }
  ];
}

export function takeUrgent(state: FamilyState, kidId: string, now: number, id: string): Mutation[] {
  findKid(state, kidId);
  const u = state.urgent;
  if (!u || u.done) throw new GuildError("緊急クエストは出ていません");
  if (u.deadline <= now) throw new GuildError("時間切れです");
  if (u.takenBy !== null) throw new GuildError("ほかの冒険者が先に受注しました");
  return [
    { op: "putUrgent", urgent: { ...u, takenBy: kidId } },
    {
      op: "putEntry",
      entry: newEntry({ id, profileId: kidId, kind: "urgent", refId: u.id, title: `【緊急】${u.title}`, value: u.reward, createdAt: now })
    }
  ];
}

export function requestExchange(state: FamilyState, kidId: string, rewardId: string, now: number, id: string): Mutation[] {
  findKid(state, kidId);
  const reward = state.rewards.find((r) => r.id === rewardId && !r.archived);
  if (!reward) throw new GuildError("このごほうびは交換できません");
  const reason = rewardBlockReason(state, kidId, reward, now);
  if (reason) throw new GuildError(reason);
  return [
    {
      op: "putEntry",
      entry: newEntry({ id, profileId: kidId, kind: "shop", refId: reward.id, title: reward.title, value: reward.price, createdAt: now })
    }
  ];
}

// ---- 親の操作 ----

/** 承認。クエストなら G が増え、交換なら G が減って確定する */
export function approve(state: FamilyState, entryId: string, parentId: string, now: number): Mutation[] {
  findParent(state, parentId);
  const e = findEntry(state, entryId);
  if (e.status !== "wait") throw new GuildError("この記録はもう処理されています");
  const kid = findProfile(state, e.profileId);
  const decided: Entry = { ...e, status: "ok", decidedAt: now, decidedBy: parentId };
  if (e.kind === "shop") {
    if (kid.coins < e.value) throw new GuildError(`${kid.name}の G が足りません`);
    return [
      { op: "putEntry", entry: decided },
      { op: "putProfile", profile: { ...kid, coins: kid.coins - e.value } }
    ];
  }
  const muts: Mutation[] = [
    { op: "putEntry", entry: decided },
    { op: "putProfile", profile: { ...kid, coins: kid.coins + e.value, total: kid.total + e.value } }
  ];
  if (e.kind === "urgent" && state.urgent && state.urgent.id === e.refId) {
    muts.push({ op: "putUrgent", urgent: { ...state.urgent, done: true } });
  }
  return muts;
}

/** 差し戻し（交換ならキャンセル）。G は動かない。緊急クエストは再び受注できるようになる */
export function sendBack(state: FamilyState, entryId: string, parentId: string, comment: string, now: number): Mutation[] {
  findParent(state, parentId);
  const e = findEntry(state, entryId);
  if (e.status !== "wait") throw new GuildError("この記録はもう処理されています");
  const muts: Mutation[] = [
    { op: "putEntry", entry: { ...e, status: "back", decidedAt: now, decidedBy: parentId, comment: comment.trim() || null } }
  ];
  if (e.kind === "urgent" && state.urgent && state.urgent.id === e.refId && !state.urgent.done) {
    muts.push({ op: "putUrgent", urgent: { ...state.urgent, takenBy: null } });
  }
  return muts;
}

export function giveBonus(
  state: FamilyState,
  kidId: string,
  parentId: string,
  value: number,
  reason: string,
  now: number,
  id: string
): Mutation[] {
  const parent = findParent(state, parentId);
  const kid = findKid(state, kidId);
  if (!Number.isInteger(value) || value <= 0 || value > 1000) throw new GuildError("ボーナスは1〜1000 G で入れてください");
  return [
    {
      op: "putEntry",
      entry: {
        id,
        profileId: kidId,
        kind: "bonus",
        refId: null,
        title: reason.trim() ? `ボーナス：${reason.trim()}` : `ボーナス（${parent.name}より）`,
        value,
        status: "ok",
        createdAt: now,
        decidedAt: now,
        decidedBy: parentId,
        comment: null
      }
    },
    { op: "putProfile", profile: { ...kid, coins: kid.coins + value, total: kid.total + value } }
  ];
}

export function issueUrgent(
  state: FamilyState,
  parentId: string,
  title: string,
  reward: number,
  minutes: number,
  now: number,
  id: string
): Mutation[] {
  findParent(state, parentId);
  if (!title.trim()) throw new GuildError("依頼内容を入れてください");
  if (!Number.isInteger(reward) || reward <= 0 || reward > 1000) throw new GuildError("報酬は1〜1000 G で入れてください");
  if (!(minutes > 0)) throw new GuildError("制限時間を選んでください");
  const u = state.urgent;
  if (u && !u.done && u.takenBy !== null && state.entries.some((e) => e.refId === u.id && e.status === "wait")) {
    throw new GuildError("いまの緊急クエストの承認がまだです。先に承認か差し戻しをしてください");
  }
  return [
    {
      op: "putUrgent",
      urgent: { id, title: title.trim(), reward, deadline: now + minutes * 60_000, issuedBy: parentId, takenBy: null, done: false }
    }
  ];
}

export function cancelUrgent(state: FamilyState, parentId: string): Mutation[] {
  findParent(state, parentId);
  return [{ op: "putUrgent", urgent: null }];
}

export function saveQuest(state: FamilyState, parentId: string, quest: Quest): Mutation[] {
  findParent(state, parentId);
  if (!quest.title.trim()) throw new GuildError("クエスト名を入れてください");
  if (!Number.isInteger(quest.reward) || quest.reward <= 0) throw new GuildError("報酬は1以上の整数で入れてください");
  return [{ op: "putQuest", quest: { ...quest, title: quest.title.trim() } }];
}

export function saveReward(state: FamilyState, parentId: string, reward: Reward): Mutation[] {
  findParent(state, parentId);
  if (!reward.title.trim()) throw new GuildError("ごほうび名を入れてください");
  if (!Number.isInteger(reward.price) || reward.price <= 0) throw new GuildError("必要 G は1以上の整数で入れてください");
  return [{ op: "putReward", reward: { ...reward, title: reward.title.trim() } }];
}

// ---- 適用（お試しモードとテストで使う） ----

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

export function applyMutations(state: FamilyState, muts: Mutation[]): FamilyState {
  let s = state;
  for (const m of muts) {
    switch (m.op) {
      case "putEntry":
        s = { ...s, entries: upsert(s.entries, m.entry) };
        break;
      case "putProfile":
        s = { ...s, profiles: upsert(s.profiles, m.profile) };
        break;
      case "putQuest":
        s = { ...s, quests: upsert(s.quests, m.quest) };
        break;
      case "putReward":
        s = { ...s, rewards: upsert(s.rewards, m.reward) };
        break;
      case "putUrgent":
        s = { ...s, urgent: m.urgent };
        break;
    }
  }
  return s;
}
