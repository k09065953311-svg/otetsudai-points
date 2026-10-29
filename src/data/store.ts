// 保存先の共通の窓口。画面はこの形だけを使い、お試しモードか Firebase かを気にしない。

import type { Mutation } from "../domain/rules";
import type { FamilyState } from "../domain/types";

export type Build = (state: FamilyState) => Mutation[];

export interface GuildStore {
  readonly mode: "demo" | "firebase";
  getState(): FamilyState;
  subscribe(listener: (state: FamilyState) => void): () => void;
  /** build に最新の状態を渡し、返ってきた書き換えをまとめて保存する。ルール違反は GuildError で失敗する */
  commit(build: Build): Promise<void>;
}

export function newId(prefix = ""): string {
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(rnd, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}
