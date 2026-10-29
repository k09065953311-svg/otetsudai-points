import { useEffect, useMemo, useState } from "react";
import {
  createFamily,
  createFirestoreStore,
  createInvite,
  joinWithInvite,
  logOut,
  signInAsParent,
  signInForInvite,
  useEmulators,
  watchSession,
  type Session
} from "../data/firebase";
import { GuildError } from "../domain/rules";
import type { Profile } from "../domain/types";
import { Crest, Section, useFeedback, useGuildState } from "./common";
import { KidApp } from "./kid/KidApp";
import { ParentApp } from "./parent/ParentApp";

/** 本番モード: 家族全員のスマホで同じデータを共有する */
export function FirebaseRoot() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => watchSession(setSession), []);

  if (!session) return <div className="app"><div className="hero"><p>読み込み中…</p></div></div>;
  if (session.status === "signedOut") return <Welcome />;
  if (session.status === "noFamily") return <Setup session={session} />;
  return <Member familyId={session.familyId} profileId={session.profileId} uid={session.uid} role={session.role} />;
}

function Hero({ sub }: { sub: string }) {
  return (
    <div className="hero">
      <img src="/icon.svg" alt="" />
      <h1>おうちギルド</h1>
      <p>{sub}</p>
    </div>
  );
}

function Welcome() {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (f: () => Promise<void>) => async () => {
    setBusy(true);
    setErr("");
    try {
      await f();
    } catch (e) {
      console.error(e);
      setErr("ログインできませんでした。もう一度試してください");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app screen">
      <Hero sub="お手伝いと勉強で G を貯めて、ごほうびと交換しよう" />
      <div className="stack">
        <button className="btn btn-gold" disabled={busy} onClick={go(signInForInvite)}>
          招待コードで参加する
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={go(signInAsParent)}>
          はじめて使う（親が Google でログインして家族を作る）
        </button>
        {err && <div className="err">{err}</div>}
      </div>
      <div className="note">子どもと2人目の親は、親のスマホに表示される招待コードで参加します。</div>
    </div>
  );
}

function Setup({ session }: { session: Extract<Session, { status: "noFamily" }> }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [parent, setParent] = useState("papa");
  const [name, setName] = useState("我が家のギルド");

  const join = async () => {
    setBusy(true);
    setErr("");
    try {
      await joinWithInvite(session.uid, code);
      location.reload();
    } catch (e) {
      setErr(e instanceof GuildError ? e.message : "参加できませんでした。コードを確かめてもう一度試してください");
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      await createFamily(session.uid, parent, name.trim() || "我が家のギルド");
      location.reload();
    } catch (e) {
      console.error(e);
      setErr("家族を作れませんでした。もう一度試してください");
      setBusy(false);
    }
  };

  return (
    <div className="app screen">
      <Hero sub="招待コードを入れて、家族のギルドに参加しよう" />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <label htmlFor="invite-code">
          招待コード（6文字）
          <input
            id="invite-code"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ fontSize: 22, letterSpacing: ".2em", textAlign: "center" }}
          />
        </label>
        <button className="btn btn-gold" type="submit" disabled={busy || code.trim().length < 6}>
          参加する
        </button>
      </form>
      {(!session.anonymous || useEmulators) && (
        <>
          <Section title="または、家族を新しく作る" />
          <div className="form">
            <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>あなたは？</span>
            <div className="seg">
              <button type="button" aria-pressed={parent === "papa"} onClick={() => setParent("papa")}>
                父
              </button>
              <button type="button" aria-pressed={parent === "mama"} onClick={() => setParent("mama")}>
                母
              </button>
            </div>
            <label htmlFor="family-name">
              ギルドの名前
              <input id="family-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn btn-ghost" disabled={busy} onClick={create}>
              家族を作る（ルリ・レイ・リツと初期クエストが入ります）
            </button>
          </div>
        </>
      )}
      {err && <div className="err">{err}</div>}
      <button className="mini" style={{ justifySelf: "center" }} onClick={() => logOut()}>
        最初の画面に戻る
      </button>
    </div>
  );
}

function Member({ familyId, profileId, uid, role }: { familyId: string; profileId: string; uid: string; role: string }) {
  const store = useMemo(() => createFirestoreStore(familyId), [familyId]);
  const state = useGuildState(store);
  const me = state.profiles.find((p) => p.id === profileId);
  if (!me) return <div className="app"><div className="hero"><p>ギルドのデータを読み込み中…</p></div></div>;
  return (
    <div className="app">
      {role === "kid" ? (
        <KidApp store={store} me={profileId} />
      ) : (
        <ParentApp
          store={store}
          me={profileId}
          kidsExtra={<Devices familyId={familyId} uid={uid} profiles={state.profiles} />}
          settingsExtra={
            <button className="btn btn-ghost" onClick={() => logOut()}>
              この端末からログアウト
            </button>
          }
        />
      )}
    </div>
  );
}

function Devices({ familyId, uid, profiles }: { familyId: string; uid: string; profiles: Profile[] }) {
  const fb = useFeedback();
  const [invite, setInvite] = useState<{ code: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async (p: Profile) => {
    setBusy(true);
    try {
      setInvite({ code: await createInvite(familyId, p, uid), name: p.name });
    } catch (e) {
      console.error(e);
      fb.toast("招待コードを作れませんでした");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Section title="スマホの登録" aside="招待コードは24時間・1回限り" />
      <div className="rowlist">
        {profiles.map((p) => (
          <div className="rowitem" key={p.id}>
            <Crest p={p} />
            <div className="grow">
              <div className="t">{p.name}</div>
              <div className="s">{p.role === "kid" ? `${p.grade}・子ども` : "親"}</div>
            </div>
            <button className="mini" disabled={busy} onClick={() => make(p)}>
              招待コード
            </button>
          </div>
        ))}
      </div>
      {invite && (
        <div className="form">
          <span style={{ fontSize: 13 }}>
            {invite.name}のスマホでこのアプリを開き、「招待コードで参加する」に入力してください。
          </span>
          <div className="code">{invite.code}</div>
          <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>アプリのアドレス：{location.origin}</span>
          <button className="mini" onClick={() => setInvite(null)}>
            閉じる
          </button>
        </div>
      )}
    </>
  );
}
