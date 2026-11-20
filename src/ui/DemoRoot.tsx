import { useMemo, useState } from "react";
import { createLocalStore } from "../data/localStore";
import { Crest, useGuildState } from "./common";
import { KidApp } from "./kid/KidApp";
import { ParentApp } from "./parent/ParentApp";

/** お試しモード: 1台のスマホで家族全員を切り替えて試せる */
export function DemoRoot() {
  const store = useMemo(() => createLocalStore(), []);
  const state = useGuildState(store);
  const [me, setMe] = useState("ruri");
  const profile = state.profiles.find((p) => p.id === me);

  return (
    <div className="app">
      <div className="banner">
        <span>お試しモード：この端末の中だけで動いています</span>
        <button type="button" onClick={() => store.reset()}>
          最初に戻す
        </button>
      </div>
      <div className="who" role="group" aria-label="使う人">
        {state.profiles.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === me} onClick={() => setMe(p.id)}>
            <Crest p={p} />
            {p.name}
            {p.role === "kid" ? <small style={{ color: "var(--ink-dim)" }}>{p.grade}</small> : "（親）"}
          </button>
        ))}
      </div>
      {profile?.role === "kid" && <KidApp key={me} store={store} me={me} />}
      {profile?.role === "parent" && <ParentApp key={me} store={store} me={me} />}
    </div>
  );
}
