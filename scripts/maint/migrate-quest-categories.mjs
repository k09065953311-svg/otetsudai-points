// 一回限りの保守作業（2回目）: 運動のクエストを「運動」に分類する。
// 1回目で「生活」→「手伝い」にまとめた中に運動のクエストがあったため、題名で指定して直す。分類以外は触らない。
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SPORTS = [
  "1人でフットサル行く",
  "縄跳び100回",
  "スクワット10回×３セット",
  "ランニング（赤小まで2往復）",
  "ランニング（赤小まで5往復）",
  "腕立伏せ10回"
];
initializeApp({ credential: applicationDefault(), projectId: process.env.PROJECT_ID });
const db = getFirestore();

const families = await db.collection("families").get();
if (families.size !== 1) throw new Error("家族が1つではないので中止");
const fam = families.docs[0].ref;
const quests = await fam.collection("quests").get();
const batch = db.batch();
const found = [];
for (const d of quests.docs) {
  const q = d.data();
  if (SPORTS.includes(q.title) && q.category !== "運動") {
    batch.update(d.ref, { category: "運動" });
    found.push(q.title);
  }
}
if (found.length !== SPORTS.length) throw new Error(`想定と違うので中止: 見つかったのは ${found.join("、")}`);
await batch.commit();
const after = await fam.collection("quests").get();
for (const d of after.docs) console.log(`after: ${d.data().title} [${d.data().category}]`);
