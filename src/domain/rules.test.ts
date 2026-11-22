import { describe, expect, it } from "vitest";
import {
  applyMutations,
  approve,
  availableCoins,
  giveBonus,
  GuildError,
  issueUrgent,
  normalizeQuest,
  rankOf,
  reportQuest,
  requestExchange,
  revoke,
  saveQuest,
  sendBack,
  takeUrgent,
  weekStart
} from "./rules";
import { initialFamily } from "./seed";
import type { FamilyState, Quest } from "./types";

const NOW = new Date(2026, 9, 29, 18, 0).getTime(); // 2026-10-29(木) 18:00
let n = 0;
const id = () => `t${++n}`;
const run = (s: FamilyState, muts: ReturnType<typeof reportQuest>) => applyMutations(s, muts);
const coins = (s: FamilyState, pid: string) => s.profiles.find((p) => p.id === pid)!;

function withCoins(pid: string, value: number): FamilyState {
  const s = initialFamily();
  const p = s.profiles.find((x) => x.id === pid)!;
  p.coins = value;
  p.total = value;
  return s;
}

describe("ランク", () => {
  it("累計 G でランクが決まる", () => {
    expect(rankOf(0).rank).toBe("F");
    expect(rankOf(499).rank).toBe("F");
    expect(rankOf(500).rank).toBe("E");
    expect(rankOf(3880)).toMatchObject({ rank: "C", next: "B", toNext: 2120 });
    expect(rankOf(25000)).toMatchObject({ rank: "S", next: null, progress: 1 });
  });
});

describe("クエストの報告と承認", () => {
  it("報告しただけでは G は増えず、親が承認すると増える", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "rei", "q-bath", NOW, "e1"));
    expect(coins(s, "rei").coins).toBe(0);
    expect(s.entries[0].status).toBe("wait");

    s = run(s, approve(s, "e1", "mama", NOW + 1000));
    expect(coins(s, "rei")).toMatchObject({ coins: 30, total: 30 });
    expect(s.entries[0]).toMatchObject({ status: "ok", decidedBy: "mama" });
  });

  it("同じ記録を2回承認できない（2人の親が同時に押しても二重にならない）", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "rei", "q-bath", NOW, "e1"));
    s = run(s, approve(s, "e1", "mama", NOW));
    expect(() => approve(s, "e1", "papa", NOW)).toThrow(GuildError);
  });

  it("差し戻すと G は動かず、コメントが残る", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "ritsu", "q-laundry", NOW, "e1"));
    s = run(s, sendBack(s, "e1", "papa", "タオルの角をそろえよう", NOW));
    expect(coins(s, "ritsu").coins).toBe(0);
    expect(s.entries[0]).toMatchObject({ status: "back", comment: "タオルの角をそろえよう" });
  });

  it("1日の回数上限を超えて報告できない。差し戻しは回数に数えない", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "ruri", "q-bath", NOW, "e1"));
    expect(() => reportQuest(s, "ruri", "q-bath", NOW + 1, "e2")).toThrow("今日はもう1回");
    s = run(s, sendBack(s, "e1", "mama", "", NOW));
    expect(() => reportQuest(s, "ruri", "q-bath", NOW + 2, "e3")).not.toThrow();
  });

  it("日付が変わればまた報告できる", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "ruri", "q-bath", NOW, "e1"));
    const tomorrow = new Date(2026, 9, 30, 7, 0).getTime();
    expect(() => reportQuest(s, "ruri", "q-bath", tomorrow, "e2")).not.toThrow();
  });

  it("上限なしのクエストは何回でも報告できる", () => {
    let s = initialFamily();
    for (let i = 0; i < 5; i++) s = run(s, reportQuest(s, "rei", "q-book", NOW + i, id()));
    expect(s.entries).toHaveLength(5);
  });

  it("その子に見せていないクエストは報告できない", () => {
    let s = initialFamily();
    s = { ...s, quests: s.quests.map((q) => (q.id === "q-trash" ? { ...q, visibleTo: ["ruri"] } : q)) };
    expect(() => reportQuest(s, "ritsu", "q-trash", NOW, "e1")).toThrow(GuildError);
    expect(() => reportQuest(s, "ruri", "q-trash", NOW, "e1")).not.toThrow();
  });

  it("子どもは承認できず、親はクエスト報告できない", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "rei", "q-bath", NOW, "e1"));
    expect(() => approve(s, "e1", "ruri", NOW)).toThrow("親のアカウント");
    expect(() => reportQuest(s, "papa", "q-bath", NOW, "e2")).toThrow("子どものアカウント");
  });
});

describe("ごほうびの交換", () => {
  it("申請すると G が予約され、親が渡すと確定して減る", () => {
    let s = withCoins("ruri", 120);
    s = run(s, requestExchange(s, "ruri", "r-snack", NOW, "x1"));
    expect(coins(s, "ruri").coins).toBe(120);
    expect(availableCoins(s, "ruri")).toBe(20);

    s = run(s, approve(s, "x1", "papa", NOW));
    expect(coins(s, "ruri")).toMatchObject({ coins: 20, total: 120 });
    expect(availableCoins(s, "ruri")).toBe(20);
  });

  it("予約分を含めて G が足りないと申請できない（二重使用の防止）", () => {
    let s = withCoins("ruri", 120);
    s = run(s, requestExchange(s, "ruri", "r-snack", NOW, "x1"));
    expect(() => requestExchange(s, "ruri", "r-snack", NOW, "x2")).toThrow("あと 80 G");
  });

  it("キャンセルすると予約が外れて G が戻る", () => {
    let s = withCoins("ruri", 120);
    s = run(s, requestExchange(s, "ruri", "r-snack", NOW, "x1"));
    s = run(s, sendBack(s, "x1", "mama", "今回は見送り", NOW));
    expect(availableCoins(s, "ruri")).toBe(120);
  });

  it("週の回数上限を守り、次の月曜からまた交換できる", () => {
    let s = withCoins("rei", 1000);
    for (let i = 0; i < 3; i++) s = run(s, requestExchange(s, "rei", "r-game", NOW + i, id()));
    expect(() => requestExchange(s, "rei", "r-game", NOW + 9, "x9")).toThrow("今週はもう3回");
    const nextMonday = weekStart(NOW) + 7 * 24 * 3600_000 + 3600_000;
    expect(() => requestExchange(s, "rei", "r-game", nextMonday, "x10")).not.toThrow();
  });

  it("週の始まりは月曜", () => {
    expect(new Date(weekStart(NOW)).getDay()).toBe(1);
    expect(new Date(weekStart(new Date(2026, 10, 1, 12).getTime())).getDate()).toBe(26); // 11/1(日) → 10/26(月)
  });
});

describe("緊急クエスト", () => {
  it("先着1名だけ受注でき、承認で報酬が入って終了する", () => {
    let s = initialFamily();
    s = run(s, issueUrgent(s, "mama", "玄関をピカピカに", 60, 60, NOW, "u1"));
    s = run(s, takeUrgent(s, "ritsu", NOW + 1000, "e1"));
    expect(() => takeUrgent(s, "rei", NOW + 2000, "e2")).toThrow("先に受注");

    s = run(s, approve(s, "e1", "mama", NOW + 5000));
    expect(coins(s, "ritsu").coins).toBe(60);
    expect(s.urgent?.done).toBe(true);
  });

  it("時間切れになると受注できない", () => {
    let s = initialFamily();
    s = run(s, issueUrgent(s, "papa", "靴をそろえよ", 40, 30, NOW, "u1"));
    expect(() => takeUrgent(s, "rei", NOW + 31 * 60_000, "e1")).toThrow("時間切れ");
  });

  it("差し戻すと、ほかの子がまた受注できる", () => {
    let s = initialFamily();
    s = run(s, issueUrgent(s, "papa", "靴をそろえよ", 40, 30, NOW, "u1"));
    s = run(s, takeUrgent(s, "rei", NOW, "e1"));
    s = run(s, sendBack(s, "e1", "papa", "", NOW));
    expect(() => takeUrgent(s, "ruri", NOW + 1, "e2")).not.toThrow();
  });

  it("承認待ちの緊急クエストがある間は、次を発令できない", () => {
    let s = initialFamily();
    s = run(s, issueUrgent(s, "papa", "靴をそろえよ", 40, 30, NOW, "u1"));
    s = run(s, takeUrgent(s, "rei", NOW, "e1"));
    expect(() => issueUrgent(s, "mama", "次の依頼", 20, 30, NOW, "u2")).toThrow("承認がまだ");
  });
});

describe("ボーナス", () => {
  it("親だけが付けられ、すぐに G とランク用の累計が増える", () => {
    let s = initialFamily();
    s = run(s, giveBonus(s, "rei", "papa", 20, "妹に優しくした", NOW, "b1"));
    expect(coins(s, "rei")).toMatchObject({ coins: 20, total: 20 });
    expect(s.entries[0]).toMatchObject({ kind: "bonus", status: "ok", title: "ボーナス：妹に優しくした" });
    expect(() => giveBonus(s, "ruri", "rei", 20, "", NOW, "b2")).toThrow("親のアカウント");
    expect(() => giveBonus(s, "ruri", "papa", 0, "", NOW, "b3")).toThrow(GuildError);
  });
});

describe("承認の取り消し", () => {
  it("クエストの承認を取り消すと G と累計が元に戻り、記録は「取り消し」で残る", () => {
    let s = initialFamily();
    s = run(s, reportQuest(s, "rei", "q-dishes", NOW, "r1"));
    s = run(s, approve(s, "r1", "papa", NOW));
    const got = coins(s, "rei").coins;
    expect(got).toBeGreaterThan(0);
    s = run(s, revoke(s, "r1", "mama", "テスト", NOW + 1000));
    expect(coins(s, "rei")).toMatchObject({ coins: 0, total: 0 });
    const e = s.entries.find((x) => x.id === "r1")!;
    expect(e).toMatchObject({ status: "back", revokedAt: NOW + 1000, comment: "承認取り消し：テスト" });
    // 取り消した報告は今日の回数に数えない
    expect(() => reportQuest(s, "rei", "q-dishes", NOW + 2000, "r2")).not.toThrow();
  });

  it("交換の取り消しは払った G を返す（累計は変わらない）", () => {
    let s = withCoins("ruri", 1000);
    const reward = s.rewards[0];
    s = run(s, requestExchange(s, "ruri", reward.id, NOW, "x1"));
    s = run(s, approve(s, "x1", "papa", NOW));
    s = run(s, revoke(s, "x1", "papa", "", NOW));
    expect(coins(s, "ruri")).toMatchObject({ coins: 1000, total: 1000 });
  });

  it("もう使ってしまった G は取り消せない・承認待ちや取り消し済みも取り消せない", () => {
    let s = initialFamily();
    s = run(s, giveBonus(s, "ritsu", "papa", 50, "", NOW, "b1"));
    s.profiles.find((p) => p.id === "ritsu")!.coins = 10;
    expect(() => revoke(s, "b1", "papa", "", NOW)).toThrow(GuildError);
    s = run(s, reportQuest(s, "ritsu", "q-dishes", NOW, "w1"));
    expect(() => revoke(s, "w1", "papa", "", NOW)).toThrow(GuildError);
    expect(() => revoke(s, "b1", "ritsu", "", NOW)).toThrow(GuildError);
  });
});

describe("クエストの分類", () => {
  it("分類は手伝い・勉強・運動。昔の「生活」は手伝いとして扱う", () => {
    const old = { id: "q-old", title: "朝の支度", category: "生活", reward: 10, dailyLimit: 1, visibleTo: [] } as unknown as Quest;
    expect(normalizeQuest(old).category).toBe("手伝い");
    const s = initialFamily();
    expect(new Set(s.quests.map((q) => q.category))).toEqual(new Set(["手伝い", "勉強", "運動"]));
    expect(() => saveQuest(s, "papa", old)).toThrow(GuildError);
    expect(() => saveQuest(s, "papa", { ...old, category: "運動" })).not.toThrow();
  });
});
