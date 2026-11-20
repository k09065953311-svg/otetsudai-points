// お試しモード: この端末の中（localStorage）だけで動く。Firebase の設定前でも全機能を試せる。

import { applyMutations } from "../domain/rules";
import { demoFamily } from "../domain/seed";
import type { FamilyState } from "../domain/types";
import type { Build, GuildStore } from "./store";

const KEY = "otetsudai-demo-v1";

function load(): FamilyState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FamilyState) : null;
  } catch {
    return null;
  }
}

function save(state: FamilyState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 保存できない環境（プライベートブラウズ等）では、開いている間だけ動く
  }
}

export function createLocalStore(now = Date.now()): GuildStore & { reset(): void } {
  let state = load() ?? demoFamily(now);
  const listeners = new Set<(s: FamilyState) => void>();
  const emit = () => listeners.forEach((l) => l(state));

  return {
    mode: "demo",
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async commit(build: Build) {
      state = applyMutations(state, build(state));
      save(state);
      emit();
    },
    reset() {
      state = demoFamily(Date.now());
      save(state);
      emit();
    }
  };
}
