// firestore.rules の自動テスト。Firebase のエミュレーター（手元で動く偽の Firestore）で実行する。
//   npm run test:rules
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { initialFamily } from "../src/domain/seed";

let env: RulesTestEnvironment;
const F = "fam1";
const now = () => Date.now();

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

function entry(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    profileId: "ruri",
    kind: "quest",
    refId: "q-bath",
    title: "お風呂そうじ",
    value: 30,
    status: "wait",
    createdAt: now(),
    decidedAt: null,
    decidedBy: null,
    comment: null,
    ...over
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-guild",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const seed = initialFamily();
    await setDoc(doc(db, "families", F), { name: "テスト家", ownerUid: "u-mama" });
    await setDoc(doc(db, "families", F, "members", "u-mama"), { role: "parent", profileId: "mama", inviteCode: null });
    await setDoc(doc(db, "families", F, "members", "u-ruri"), { role: "kid", profileId: "ruri", inviteCode: "X" });
    await setDoc(doc(db, "families", F, "members", "u-rei"), { role: "kid", profileId: "rei", inviteCode: "Y" });
    for (const p of seed.profiles) await setDoc(doc(db, "families", F, "profiles", p.id), p);
    for (const q of seed.quests) await setDoc(doc(db, "families", F, "quests", q.id), q);
    for (const r of seed.rewards) await setDoc(doc(db, "families", F, "rewards", r.id), r);
    await setDoc(doc(db, "families", F, "meta", "urgent"), {
      urgent: { id: "u1", title: "玄関", reward: 60, deadline: now() + 3600_000, issuedBy: "mama", takenBy: null, done: false }
    });
    await setDoc(doc(db, "invites", "KIDCODE"), { familyId: F, profileId: "ritsu", role: "kid", createdBy: "u-mama", expiresAt: now() + 3600_000, usedBy: null });
    await setDoc(doc(db, "invites", "OLDCODE"), { familyId: F, profileId: "ritsu", role: "kid", createdBy: "u-mama", expiresAt: now() - 1000, usedBy: null });
  });
});

describe("家族の外の人", () => {
  it("家族のデータを読めない", async () => {
    await assertFails(getDoc(doc(as("stranger"), "families", F, "profiles", "ruri")));
  });
  it("招待コードなしで家族に入れない", async () => {
    await assertFails(setDoc(doc(as("stranger"), "families", F, "members", "stranger"), { role: "parent", profileId: "papa", inviteCode: null }));
  });
});

describe("招待コードで参加", () => {
  const join = (uid: string, code: string, role = "kid", profileId = "ritsu") => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(doc(db, "families", F, "members", uid), { role, profileId, joinedAt: now(), inviteCode: code });
    b.update(doc(db, "invites", code), { usedBy: uid });
    b.set(doc(db, "users", uid), { familyId: F });
    return b.commit();
  };
  it("正しいコードなら入れる", async () => {
    await assertSucceeds(join("u-ritsu", "KIDCODE"));
  });
  it("使用済みのコードでは入れない", async () => {
    await join("u-ritsu", "KIDCODE");
    await assertFails(join("u-other", "KIDCODE"));
  });
  it("期限切れのコードでは入れない", async () => {
    await assertFails(join("u-ritsu", "OLDCODE"));
  });
  it("子ども用のコードで親として入れない", async () => {
    await assertFails(join("u-ritsu", "KIDCODE", "parent", "ritsu"));
  });
  it("子どもは招待コードを作れない", async () => {
    await assertFails(setDoc(doc(as("u-ruri"), "invites", "HACK01"), { familyId: F, profileId: "papa", role: "parent", createdBy: "u-ruri", expiresAt: now() + 1000, usedBy: null }));
  });
});

describe("子どもの報告", () => {
  it("自分の名前で正しい報酬の報告ができる", async () => {
    await assertSucceeds(setDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), entry()));
  });
  it("ほかの子の名前では報告できない", async () => {
    await assertFails(setDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), entry({ profileId: "rei" })));
  });
  it("報酬の額を書き換えられない", async () => {
    await assertFails(setDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), entry({ value: 9999 })));
  });
  it("最初から「承認済み」にはできない", async () => {
    await assertFails(setDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), entry({ status: "ok" })));
  });
  it("昔の日付にして回数制限をすり抜けられない", async () => {
    await assertFails(setDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), entry({ createdAt: now() - 2 * 86400_000 })));
  });
  it("交換申請は本当の値段でだけできる", async () => {
    const db = as("u-ruri");
    await assertSucceeds(setDoc(doc(db, "families", F, "entries", "x1"), entry({ id: "x1", kind: "shop", refId: "r-snack", title: "おやつ", value: 100 })));
    await assertFails(setDoc(doc(db, "families", F, "entries", "x2"), entry({ id: "x2", kind: "shop", refId: "r-snack", title: "おやつ", value: 1 })));
  });
  it("自分の G を増やせない", async () => {
    await assertFails(updateDoc(doc(as("u-ruri"), "families", F, "profiles", "ruri"), { coins: 99999 }));
  });
  it("自分の報告を承認できない", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, "families", F, "entries", "e1"), entry()));
    await assertFails(updateDoc(doc(as("u-ruri"), "families", F, "entries", "e1"), { status: "ok" }));
  });
  it("クエストやごほうびを書き換えられない", async () => {
    await assertFails(updateDoc(doc(as("u-ruri"), "families", F, "quests", "q-bath"), { reward: 500 }));
    await assertFails(updateDoc(doc(as("u-ruri"), "families", F, "rewards", "r-snack"), { price: 1 }));
  });
});

describe("緊急クエスト", () => {
  const take = (uid: string, profileId: string, id: string) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(doc(db, "families", F, "meta", "urgent"), {
      urgent: { id: "u1", title: "玄関", reward: 60, deadline: 0, issuedBy: "mama", takenBy: profileId, done: false }
    });
    b.set(doc(db, "families", F, "entries", id), entry({ id, profileId, kind: "urgent", refId: "u1", title: "【緊急】玄関", value: 60 }));
    return b.commit();
  };
  it("締め切りなど他の項目を変えて受注することはできない", async () => {
    await assertFails(take("u-ruri", "ruri", "e1"));
  });
  it("先着1名だけ受注できる", async () => {
    let u: Record<string, unknown> = {};
    await env.withSecurityRulesDisabled(async (ctx) => {
      u = (await getDoc(doc(ctx.firestore() as unknown as Firestore, "families", F, "meta", "urgent"))).data()!.urgent;
    });
    const takeOk = (uid: string, profileId: string, id: string) => {
      const db = as(uid);
      const b = writeBatch(db);
      b.set(doc(db, "families", F, "meta", "urgent"), { urgent: { ...u, takenBy: profileId } });
      b.set(doc(db, "families", F, "entries", id), entry({ id, profileId, kind: "urgent", refId: "u1", title: "【緊急】玄関", value: 60 }));
      return b.commit();
    };
    await assertSucceeds(takeOk("u-ruri", "ruri", "e1"));
    await assertFails(takeOk("u-rei", "rei", "e2"));
  });
});

describe("親", () => {
  it("承認して G を増やせる", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, "families", F, "entries", "e1"), entry()));
    const db = as("u-mama");
    const b = writeBatch(db);
    b.update(doc(db, "families", F, "entries", "e1"), { status: "ok", decidedAt: now(), decidedBy: "mama" });
    b.update(doc(db, "families", F, "profiles", "ruri"), { coins: 30, total: 30 });
    await assertSucceeds(b.commit());
  });
  it("承認のときに報酬額や名前は変えられない", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, "families", F, "entries", "e1"), entry()));
    await assertFails(updateDoc(doc(as("u-mama"), "families", F, "entries", "e1"), { value: 300 }));
  });
  it("招待コードを作れる", async () => {
    await assertSucceeds(setDoc(doc(as("u-mama"), "invites", "NEW001"), { familyId: F, profileId: "papa", role: "parent", createdBy: "u-mama", expiresAt: now() + 1000, usedBy: null }));
  });
  it("記録は消せない（あとから確認できるように）", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, "families", F, "entries", "e1"), entry()));
    const db = as("u-mama");
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(db, "families", F, "entries", "e1")));
  });
});

describe("家族を新しく作る", () => {
  it("最初の親が家族・自分・初期データを一度に作れる", async () => {
    const db = as("u-new");
    const seed = initialFamily();
    const b = writeBatch(db);
    b.set(doc(db, "families", "fam2"), { name: "新しい家", ownerUid: "u-new", createdAt: now() });
    b.set(doc(db, "families", "fam2", "members", "u-new"), { role: "parent", profileId: "papa", joinedAt: now(), inviteCode: null });
    b.set(doc(db, "users", "u-new"), { familyId: "fam2" });
    for (const p of seed.profiles) b.set(doc(db, "families", "fam2", "profiles", p.id), p);
    for (const q of seed.quests) b.set(doc(db, "families", "fam2", "quests", q.id), q);
    b.set(doc(db, "families", "fam2", "meta", "urgent"), { urgent: null });
    await assertSucceeds(b.commit());
  });
  it("他人の家族に親として入り込めない", async () => {
    await assertFails(setDoc(doc(as("u-new"), "families", F, "members", "u-new"), { role: "parent", profileId: "papa", inviteCode: null }));
  });
});
