// 一回限りの保守作業: レイのスマホで試したときに入った 20G（テストデータ）を取り消す。
// 安全のため、レイの累計が 20G で、承認済みの記録の合計も 20G のときだけ実行する。
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROFILE = "rei";
const EXPECTED = 20;

initializeApp({ credential: applicationDefault(), projectId: process.env.PROJECT_ID });
const db = getFirestore();

const families = await db.collection("families").get();
console.log(`families: ${families.size}`);
if (families.size !== 1) throw new Error("家族が1つではないので中止");
const fam = families.docs[0].ref;

const profRef = fam.collection("profiles").doc(PROFILE);
const prof = await profRef.get();
if (!prof.exists) throw new Error("レイのプロフィールがないので中止");
const { coins, total } = prof.data();
console.log(`rei before: coins=${coins} total=${total}`);

const entries = await fam.collection("entries").where("profileId", "==", PROFILE).get();
let okSum = 0;
for (const d of entries.docs) {
  const e = d.data();
  console.log(`entry ${d.id}: kind=${e.kind} title=${e.title} value=${e.value} status=${e.status}`);
  if (e.status === "ok" && e.kind !== "shop") okSum += e.value;
}
if (total !== EXPECTED || coins !== EXPECTED || okSum !== EXPECTED) {
  throw new Error(`想定（${EXPECTED}G）と違うので何も変えずに中止しました: okSum=${okSum}`);
}

const urgent = await fam.collection("meta").doc("urgent").get();
const batch = db.batch();
if (urgent.data()?.urgent?.takenBy === PROFILE) {
  console.log("urgent quest taken by rei -> clearing");
  batch.set(urgent.ref, { urgent: null });
}
for (const d of entries.docs) batch.delete(d.ref);
batch.update(profRef, { coins: 0, total: 0 });
await batch.commit();

const after = (await profRef.get()).data();
const left = await fam.collection("entries").where("profileId", "==", PROFILE).get();
console.log(`rei after: coins=${after.coins} total=${after.total}, entries left=${left.size}`);
