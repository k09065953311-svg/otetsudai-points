// 最初に入っているクエスト・ごほうび・家族。親の「設定」画面からあとで変更できる。

import type { FamilyState, Profile, Quest, Reward } from "./types";

export const DEFAULT_PROFILES: Profile[] = [
  { id: "ruri", name: "ルリ", role: "kid", grade: "中2", color: "#ff9ec4", coins: 0, total: 0 },
  { id: "rei", name: "レイ", role: "kid", grade: "小5", color: "#7fd8ff", coins: 0, total: 0 },
  { id: "ritsu", name: "リツ", role: "kid", grade: "小2", color: "#b6f07a", coins: 0, total: 0 },
  { id: "papa", name: "父", role: "parent", color: "#e0b354", coins: 0, total: 0 },
  { id: "mama", name: "母", role: "parent", color: "#f0c987", coins: 0, total: 0 }
];

export const DEFAULT_QUESTS: Quest[] = [
  { id: "q-dishes", title: "食器を下げる", category: "手伝い", reward: 10, dailyLimit: 3, visibleTo: [] },
  { id: "q-bath", title: "お風呂そうじ", category: "手伝い", reward: 30, dailyLimit: 1, visibleTo: [] },
  { id: "q-laundry", title: "洗濯物をたたむ", category: "手伝い", reward: 20, dailyLimit: 1, visibleTo: [] },
  { id: "q-trash", title: "ゴミ出し", category: "手伝い", reward: 20, dailyLimit: 1, visibleTo: [] },
  { id: "q-homework", title: "宿題を終える", category: "勉強", reward: 20, dailyLimit: 1, visibleTo: [] },
  { id: "q-study", title: "自主学習30分", category: "勉強", reward: 30, dailyLimit: 2, visibleTo: [] },
  { id: "q-book", title: "本を1冊読み切る", category: "勉強", reward: 50, dailyLimit: null, visibleTo: [] },
  { id: "q-morning", title: "朝の支度を自分で", category: "生活", reward: 10, dailyLimit: 1, visibleTo: [] }
];

export const DEFAULT_REWARDS: Reward[] = [
  { id: "r-game", title: "ゲーム30分延長", price: 50, note: "週3回まで", weeklyLimit: 3 },
  { id: "r-snack", title: "好きなおやつ1つ", price: 100, note: "週2回まで", weeklyLimit: 2 },
  { id: "r-dinner", title: "夕飯メニュー決定権", price: 150, note: "週1回まで", weeklyLimit: 1 },
  { id: "r-money", title: "お小遣い500円", price: 500, note: "現金で受け取り", weeklyLimit: null },
  { id: "r-book", title: "好きな本を1冊", price: 800, note: "2000円まで", weeklyLimit: null },
  { id: "r-outing", title: "親と二人でお出かけ", price: 1500, note: "行き先は相談", weeklyLimit: null }
];

export function initialFamily(): FamilyState {
  return {
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    quests: DEFAULT_QUESTS.map((q) => ({ ...q })),
    rewards: DEFAULT_REWARDS.map((r) => ({ ...r })),
    entries: [],
    urgent: null
  };
}

/** お試しモード用: 触ってすぐ分かるよう、少し G と記録が入った状態 */
export function demoFamily(now: number): FamilyState {
  const s = initialFamily();
  const set = (id: string, coins: number, total: number) => {
    const p = s.profiles.find((x) => x.id === id)!;
    p.coins = coins;
    p.total = total;
  };
  set("ruri", 1240, 3880);
  set("rei", 620, 2210);
  set("ritsu", 310, 940);
  const h = 3600_000;
  s.entries = [
    { id: "d1", profileId: "ruri", kind: "quest", refId: "q-bath", title: "お風呂そうじ", value: 30, status: "ok", createdAt: now - 26 * h, decidedAt: now - 25 * h, decidedBy: "mama", comment: null },
    { id: "d2", profileId: "ruri", kind: "shop", refId: "r-game", title: "ゲーム30分延長", value: 50, status: "ok", createdAt: now - 24 * h, decidedAt: now - 24 * h, decidedBy: "papa", comment: null },
    { id: "d3", profileId: "rei", kind: "quest", refId: "q-homework", title: "宿題を終える", value: 20, status: "wait", createdAt: now - 1 * h, decidedAt: null, decidedBy: null, comment: null },
    { id: "d4", profileId: "ritsu", kind: "quest", refId: "q-morning", title: "朝の支度を自分で", value: 10, status: "wait", createdAt: now - 2 * h, decidedAt: null, decidedBy: null, comment: null }
  ];
  s.urgent = { id: "u-demo", title: "夕飯までに玄関をピカピカにせよ", reward: 60, deadline: now + 100 * 60_000, issuedBy: "mama", takenBy: null, done: false };
  return s;
}
