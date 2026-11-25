// ギルドのルール（ポイント計算・承認・交換）。
// 画面にも保存先にも依存しない「純粋な関数」だけを置き、自動テストで守る。
// 各操作は「何をどう書き換えるか」(Mutation の一覧) を返す。
// お試しモードはそれを手元の状態に、Firebase モードは Firestore に適用する。

import { QUEST_CATEGORIES, type Entry, type FamilyState, type GuildArt, type Profile, type Quest, type QuestCategory, type Reward, type Pot, type UrgentQuest, type Vault } from "./types";

export class GuildError extends Error {}

export type Mutation =
  | { op: "putEntry"; entry: Entry }
  | { op: "putProfile"; profile: Profile }
  | { op: "putQuest"; quest: Quest }
  | { op: "putReward"; reward: Reward }
  | { op: "putUrgent"; urgent: UrgentQuest | null }
  | { op: "putArt"; art: GuildArt }
  | { op: "putVault"; vault: Vault };

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

/** 交換申請中・貯金申請中（親がまだ承認していない）G の合計 */
export function reservedCoins(state: FamilyState, profileId: string): number {
  return state.entries
    .filter((e) => e.profileId === profileId && (e.kind === "shop" || e.kind === "deposit") && e.status === "wait")
    .reduce((sum, e) => sum + e.value, 0);
}

/** 今使える G = 所持 G − 予約中の G */
export function availableCoins(state: FamilyState, profileId: string): number {
  return findProfile(state, profileId).coins - reservedCoins(state, profileId);
}

// ---- みんなのごほうび（3人で少しずつ入金） ----

export function potOf(state: FamilyState, rewardId: string): Pot {
  const p = state.vault?.pots?.[rewardId];
  return { balance: p?.balance ?? 0, deposits: { ...(p?.deposits ?? {}) } };
}

function withPot(state: FamilyState, rewardId: string, pot: Pot): Mutation {
  return { op: "putVault", vault: { pots: { ...(state.vault?.pots ?? {}), [rewardId]: pot } } };
}

/** 親の承認待ちの入金 */
export function pendingDeposits(state: FamilyState, rewardId: string): number {
  return state.entries.filter((e) => e.kind === "deposit" && e.refId === rewardId && e.status === "wait").reduce((sum, e) => sum + e.value, 0);
}

/** 満額まであと何 G か（承認待ちの入金も入れて数える） */
export function potRemaining(state: FamilyState, reward: Reward): number {
  return Math.max(0, reward.price - potOf(state, reward.id).balance - pendingDeposits(state, reward.id));
}

export function exchangePending(state: FamilyState, rewardId: string): boolean {
  return state.entries.some((e) => e.kind === "vaultShop" && e.refId === rewardId && e.status === "wait");
}

function findShared(state: FamilyState, rewardId: string): Reward {
  const r = state.rewards.find((x) => x.id === rewardId && !x.archived && x.shared);
  if (!r) throw new GuildError("このごほうびには入金できません");
  return r;
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

/** 昔の分類（「生活」など）や知らない分類は「手伝い」として扱う */
export function normalizeQuest(q: Quest): Quest {
  return (QUEST_CATEGORIES as readonly string[]).includes(q.category) ? q : { ...q, category: "手伝い" as QuestCategory };
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
  if (reward.shared) throw new GuildError("みんなのごほうびは、3人で入金して交換します");
  const reason = rewardBlockReason(state, kidId, reward, now);
  if (reason) throw new GuildError(reason);
  return [
    {
      op: "putEntry",
      entry: newEntry({ id, profileId: kidId, kind: "shop", refId: reward.id, title: reward.title, value: reward.price, createdAt: now })
    }
  ];
}

/** みんなのごほうびに入金を申請する。G は予約され、親が承認した時点で入る（もう自分には戻らない） */
export function requestDeposit(state: FamilyState, kidId: string, rewardId: string, value: number, now: number, id: string): Mutation[] {
  findKid(state, kidId);
  const reward = findShared(state, rewardId);
  if (exchangePending(state, rewardId)) throw new GuildError("交換の申請中です");
  if (!Number.isInteger(value) || value <= 0) throw new GuildError("入金する G を1以上の整数で入れてください");
  const rest = potRemaining(state, reward);
  if (rest <= 0) throw new GuildError("もう満額です");
  if (value > rest) throw new GuildError(`あと ${rest.toLocaleString()} G で満額です`);
  if (value > availableCoins(state, kidId)) throw new GuildError(`使える G が足りません（使える G：${availableCoins(state, kidId)}）`);
  return [
    { op: "putEntry", entry: newEntry({ id, profileId: kidId, kind: "deposit", refId: reward.id, title: `「${reward.title}」に入金`, value, createdAt: now }) }
  ];
}

/** 満額になったみんなのごほうびの交換を申請する（3人のうち誰でも申請できる） */
export function requestVaultExchange(state: FamilyState, kidId: string, rewardId: string, now: number, id: string): Mutation[] {
  findKid(state, kidId);
  const reward = findShared(state, rewardId);
  if (exchangePending(state, rewardId)) throw new GuildError("交換の申請中です");
  const short = reward.price - potOf(state, rewardId).balance;
  if (short > 0) throw new GuildError(`あと ${short.toLocaleString()} G`);
  return [
    { op: "putEntry", entry: newEntry({ id, profileId: kidId, kind: "vaultShop", refId: reward.id, title: reward.title, value: reward.price, createdAt: now }) }
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
  if (e.kind === "deposit" && e.refId) {
    if (kid.coins < e.value) throw new GuildError(`${kid.name}の G が足りません`);
    const pot = potOf(state, e.refId);
    return [
      { op: "putEntry", entry: decided },
      { op: "putProfile", profile: { ...kid, coins: kid.coins - e.value } },
      withPot(state, e.refId, { balance: pot.balance + e.value, deposits: { ...pot.deposits, [kid.id]: (pot.deposits[kid.id] ?? 0) + e.value } })
    ];
  }
  if (e.kind === "vaultShop" && e.refId) {
    const pot = potOf(state, e.refId);
    if (pot.balance < e.value) throw new GuildError(`あと ${(e.value - pot.balance).toLocaleString()} G 足りません`);
    // 交換したら貯金箱は空に戻る。誰がいくら入れたかは、この記録に残す
    return [
      { op: "putEntry", entry: { ...decided, contributions: pot.deposits } },
      withPot(state, e.refId, { balance: pot.balance - e.value, deposits: {} })
    ];
  }
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

/**
 * 承認の取り消し（押し間違い・テストのやり直し用）。
 * クエスト・緊急・ボーナスは付けた G を減らし、交換は払った G を返す。記録は「取り消し」として残る。
 */
export function revoke(state: FamilyState, entryId: string, parentId: string, reason: string, now: number): Mutation[] {
  findParent(state, parentId);
  const e = findEntry(state, entryId);
  if (e.status !== "ok") throw new GuildError("承認済みの記録だけ取り消せます");
  const kid = findProfile(state, e.profileId);
  const note = reason.trim() ? `承認取り消し：${reason.trim()}` : "承認取り消し";
  const revoked: Entry = { ...e, status: "back", comment: note, revokedAt: now, decidedBy: parentId };
  if (e.kind === "vaultShop" && e.refId) {
    const pot = potOf(state, e.refId);
    const back: Record<string, number> = { ...pot.deposits };
    for (const [pid, v] of Object.entries(e.contributions ?? {})) back[pid] = (back[pid] ?? 0) + v;
    return [
      { op: "putEntry", entry: { ...revoked, contributions: null } },
      withPot(state, e.refId, { balance: pot.balance + e.value, deposits: back })
    ];
  }
  if (e.kind === "deposit" && e.refId) {
    const pot = potOf(state, e.refId);
    if ((pot.deposits[kid.id] ?? 0) < e.value || exchangePending(state, e.refId)) {
      throw new GuildError("この G はもう交換に使われているので取り消せません");
    }
    return [
      { op: "putEntry", entry: revoked },
      { op: "putProfile", profile: { ...kid, coins: kid.coins + e.value } },
      withPot(state, e.refId, { balance: pot.balance - e.value, deposits: { ...pot.deposits, [kid.id]: pot.deposits[kid.id] - e.value } })
    ];
  }
  if (e.kind === "shop") {
    return [
      { op: "putEntry", entry: revoked },
      { op: "putProfile", profile: { ...kid, coins: kid.coins + e.value } }
    ];
  }
  if (kid.coins - e.value < reservedCoins(state, kid.id)) {
    throw new GuildError(
      kid.coins < e.value
        ? `${kid.name}はもう G を使っているので取り消せません（所持 ${kid.coins} G）`
        : `${kid.name}の交換申請中の G が足りなくなります。先に交換申請をキャンセルしてください`
    );
  }
  return [
    { op: "putEntry", entry: revoked },
    { op: "putProfile", profile: { ...kid, coins: kid.coins - e.value, total: Math.max(0, kid.total - e.value) } }
  ];
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
  if (!(QUEST_CATEGORIES as readonly string[]).includes(quest.category)) throw new GuildError("種類を選んでください");
  if (!Number.isInteger(quest.reward) || quest.reward <= 0) throw new GuildError("報酬は1以上の整数で入れてください");
  return [{ op: "putQuest", quest: { ...quest, title: quest.title.trim() } }];
}

export function saveReward(state: FamilyState, parentId: string, reward: Reward): Mutation[] {
  findParent(state, parentId);
  if (!reward.title.trim()) throw new GuildError("ごほうび名を入れてください");
  if (!Number.isInteger(reward.price) || reward.price <= 0) throw new GuildError("必要 G は1以上の整数で入れてください");
  return [{ op: "putReward", reward: { ...reward, title: reward.title.trim() } }];
}

/** 1枚あたりの上限（data URL の文字数）。2枚で Firestore の1件 1MB に収まるように */
export const ART_MAX_CHARS = 420_000;

/** タイトル画面のキャラ画像を差し替える（null で元のシルエットに戻す） */
export function saveArt(state: FamilyState, parentId: string, slot: keyof GuildArt, image: string | null): Mutation[] {
  findParent(state, parentId);
  if (image !== null) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new GuildError("画像の形式が読み取れませんでした");
    if (image.length > ART_MAX_CHARS) throw new GuildError("画像が大きすぎます。もう少し小さい画像にしてください");
  }
  const art: GuildArt = { master: null, okami: null, ...(state.art ?? {}), [slot]: image };
  return [{ op: "putArt", art }];
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
      case "putArt":
        s = { ...s, art: m.art };
        break;
      case "putVault":
        s = { ...s, vault: m.vault };
        break;
    }
  }
  return s;
}
