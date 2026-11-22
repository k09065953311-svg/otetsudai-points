// 一回限りの保守作業: クエストの分類を「手伝い・勉強・運動」に揃える。
// 「生活」など3種類以外の分類だけを「手伝い」に書き換える（分類以外の項目は触らない）。
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const OK = ["手伝い", "勉強", "運動"];
initializeApp({ credential: applicationDefault(), projectId: process.env.PROJECT_ID });
const db = getFirestore();

const families = await db.collection("families").get();
console.log(`families: ${families.size}`);
for (const fam of families.docs) {
  const quests = await fam.ref.collection("quests").get();
  const batch = db.batch();
  let n = 0;
  for (const d of quests.docs) {
    const q = d.data();
    const fix = !OK.includes(q.category);
    console.log(`before: ${q.title} [${q.category}]${q.archived ? " (しまったクエスト)" : ""}${fix ? " -> 手伝い" : ""}`);
    if (fix) {
      batch.update(d.ref, { category: "手伝い" });
      n++;
    }
  }
  if (n) await batch.commit();
  const after = await fam.ref.collection("quests").get();
  const counts = {};
  for (const d of after.docs) counts[d.data().category] = (counts[d.data().category] ?? 0) + 1;
  console.log(`updated ${n} quests. after: ${JSON.stringify(counts)}`);
  const bad = after.docs.filter((d) => !OK.includes(d.data().category));
  if (bad.length) throw new Error(`まだ3種類以外の分類が ${bad.length} 件あります`);
}
