// Firebase モード: 家族全員のスマホで同じデータを共有する。
//
// Firestore の構成
//   users/{uid}                         … その端末(アカウント)が入っている家族 { familyId }
//   invites/{code}                      … 参加用の招待コード（24時間有効・1回限り）
//   families/{fid}                      … 家族 { name, ownerUid }
//   families/{fid}/members/{uid}        … 端末と冒険者の結びつき { role, profileId }
//   families/{fid}/profiles/{id}        … 冒険者（G の残高もここ）
//   families/{fid}/quests/{id}          … クエスト
//   families/{fid}/rewards/{id}         … ごほうび
//   families/{fid}/entries/{id}         … 報告・交換・ボーナスの記録
//   families/{fid}/meta/urgent          … 緊急クエスト { urgent }
// 誰が何を書けるかは firestore.rules で守る。

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  query,
  runTransaction,
  writeBatch,
  type DocumentReference,
  type Firestore
} from "firebase/firestore";
import { applyMutations, GuildError, type Mutation } from "../domain/rules";
import { initialFamily } from "../domain/seed";
import type { Entry, FamilyState, Profile, Quest, Reward, Role, UrgentQuest } from "../domain/types";
import { firebaseConfig as config, firebaseConfigured } from "./config";
import type { Build, GuildStore } from "./store";

/** 自動テスト用: 手元の Firebase エミュレーターにつなぐ（npm run test:e2e:firebase） */
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

let app: FirebaseApp | null = null;
let auth: Auth;
let db: Firestore;

function fb() {
  if (!firebaseConfigured) throw new Error("Firebase が設定されていません");
  if (!app) {
    app = initializeApp(config);
    auth = getAuth(app);
    if (useEmulators) {
      db = initializeFirestore(app, {});
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } else {
      db = initializeFirestore(app, { localCache: persistentLocalCache() });
    }
  }
  return { auth, db };
}

// ---- ログインと家族 ----

export type Session =
  | { status: "signedOut" }
  | { status: "noFamily"; uid: string; anonymous: boolean }
  | { status: "member"; uid: string; familyId: string; role: Role; profileId: string };

export function watchSession(cb: (s: Session) => void): () => void {
  const { auth, db } = fb();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return cb({ status: "signedOut" });
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      const familyId = u.exists() ? (u.data().familyId as string) : null;
      if (familyId) {
        const m = await getDoc(doc(db, "families", familyId, "members", user.uid));
        if (m.exists()) {
          const d = m.data();
          return cb({ status: "member", uid: user.uid, familyId, role: d.role, profileId: d.profileId });
        }
      }
      cb({ status: "noFamily", uid: user.uid, anonymous: user.isAnonymous });
    } catch (e) {
      console.error(e);
      cb({ status: "noFamily", uid: user.uid, anonymous: user.isAnonymous });
    }
  });
}

export async function signInAsParent() {
  // エミュレーターでは Google ログインの代わりに匿名ログインで試す
  if (useEmulators) await signInAnonymously(fb().auth);
  else await signInWithPopup(fb().auth, new GoogleAuthProvider());
}

export async function signInForInvite() {
  await signInAnonymously(fb().auth);
}

export async function logOut() {
  await signOut(fb().auth);
}

/** 最初の親が家族を作る。初期のクエスト・ごほうび・家族5人が入る */
export async function createFamily(uid: string, parentProfileId: string, familyName: string): Promise<string> {
  const { db } = fb();
  const familyRef = doc(collection(db, "families"));
  const seed = initialFamily();
  const batch = writeBatch(db);
  batch.set(familyRef, { name: familyName, ownerUid: uid, createdAt: Date.now() });
  batch.set(doc(familyRef, "members", uid), { role: "parent", profileId: parentProfileId, joinedAt: Date.now(), inviteCode: null });
  batch.set(doc(db, "users", uid), { familyId: familyRef.id });
  for (const p of seed.profiles) batch.set(doc(familyRef, "profiles", p.id), p);
  for (const q of seed.quests) batch.set(doc(familyRef, "quests", q.id), q);
  for (const r of seed.rewards) batch.set(doc(familyRef, "rewards", r.id), r);
  batch.set(doc(familyRef, "meta", "urgent"), { urgent: null });
  await batch.commit();
  return familyRef.id;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 読み間違えやすい 0/O/1/I は使わない

export async function createInvite(familyId: string, profile: Profile, createdBy: string): Promise<string> {
  const { db } = fb();
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  const batch = writeBatch(db);
  batch.set(doc(db, "invites", code), {
    familyId,
    profileId: profile.id,
    role: profile.role,
    createdBy,
    expiresAt: Date.now() + 24 * 3600_000,
    usedBy: null
  });
  await batch.commit();
  return code;
}

export async function joinWithInvite(uid: string, rawCode: string): Promise<void> {
  const { db } = fb();
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const inviteRef = doc(db, "invites", code);
  const snap = await getDoc(inviteRef).catch(() => null);
  if (!snap || !snap.exists()) throw new GuildError("招待コードが見つかりません。親にもう一度出してもらってください");
  const inv = snap.data();
  if (inv.usedBy) throw new GuildError("この招待コードはもう使われています");
  if (inv.expiresAt < Date.now()) throw new GuildError("招待コードの期限（24時間）が切れています");
  const batch = writeBatch(db);
  batch.set(doc(db, "families", inv.familyId, "members", uid), {
    role: inv.role,
    profileId: inv.profileId,
    joinedAt: Date.now(),
    inviteCode: code
  });
  batch.update(inviteRef, { usedBy: uid });
  batch.set(doc(db, "users", uid), { familyId: inv.familyId });
  await batch.commit();
}

// ---- 家族のデータ ----

export function createFirestoreStore(familyId: string): GuildStore {
  const { db } = fb();
  const fam = doc(db, "families", familyId);
  let state: FamilyState = { profiles: [], quests: [], rewards: [], entries: [], urgent: null };
  const listeners = new Set<(s: FamilyState) => void>();
  const emit = () => listeners.forEach((l) => l(state));
  const unsubs: Array<() => void> = [];

  const watch = <T,>(key: "profiles" | "quests" | "rewards") =>
    onSnapshot(collection(fam, key), (snap) => {
      state = { ...state, [key]: snap.docs.map((d) => d.data() as T) };
      emit();
    });
  unsubs.push(watch<Profile>("profiles"), watch<Quest>("quests"), watch<Reward>("rewards"));
  unsubs.push(
    onSnapshot(query(collection(fam, "entries"), orderBy("createdAt", "desc"), limit(400)), (snap) => {
      state = { ...state, entries: snap.docs.map((d) => d.data() as Entry).reverse() };
      emit();
    })
  );
  unsubs.push(
    onSnapshot(doc(fam, "meta", "urgent"), (snap) => {
      state = { ...state, urgent: (snap.data()?.urgent as UrgentQuest | null) ?? null };
      emit();
    })
  );

  const refOf = (m: Mutation): DocumentReference => {
    switch (m.op) {
      case "putEntry":
        return doc(fam, "entries", m.entry.id);
      case "putProfile":
        return doc(fam, "profiles", m.profile.id);
      case "putQuest":
        return doc(fam, "quests", m.quest.id);
      case "putReward":
        return doc(fam, "rewards", m.reward.id);
      case "putUrgent":
        return doc(fam, "meta", "urgent");
    }
  };

  return {
    mode: "firebase",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async commit(build: Build) {
      // 1回目: 手元のデータで何を書き換えるか調べる
      const draft = build(state);
      const refs = new Map<string, DocumentReference>();
      for (const m of draft) refs.set(refOf(m).path, refOf(m));
      await runTransaction(db, async (tx) => {
        // 2回目: 書き換える記録をサーバーから読み直して最新にしてから、もう一度ルールを通す。
        // 親2人が同時に承認ボタンを押しても、二重に G が入らない。
        let fresh = state;
        for (const ref of refs.values()) {
          const snap = await tx.get(ref);
          if (!snap.exists()) continue;
          const data = snap.data();
          const col = ref.parent.id;
          if (col === "entries") fresh = applyMutations(fresh, [{ op: "putEntry", entry: data as Entry }]);
          else if (col === "profiles") fresh = applyMutations(fresh, [{ op: "putProfile", profile: data as Profile }]);
          else if (col === "quests") fresh = applyMutations(fresh, [{ op: "putQuest", quest: data as Quest }]);
          else if (col === "rewards") fresh = applyMutations(fresh, [{ op: "putReward", reward: data as Reward }]);
          else if (ref.id === "urgent") fresh = { ...fresh, urgent: (data.urgent as UrgentQuest | null) ?? null };
        }
        for (const m of build(fresh)) {
          const ref = refOf(m);
          if (m.op === "putUrgent") tx.set(ref, { urgent: m.urgent });
          else tx.set(ref, m.op === "putEntry" ? m.entry : m.op === "putProfile" ? m.profile : m.op === "putQuest" ? m.quest : m.reward);
        }
      });
    }
  };
}
