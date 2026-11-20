import { describe, expect, it } from "vitest";
import { applyMutations, approve, issueUrgent, reportQuest, saveArt, GuildError } from "../../domain/rules";
import { initialFamily } from "../../domain/seed";
import { greeting } from "./TitleScreen";

const at = (h: number) => new Date(2026, 10, 21, h, 0).getTime();

describe("タイトル画面のひと言", () => {
  it("時間帯であいさつが変わる", () => {
    const s = initialFamily();
    expect(greeting(s, "rei", at(7))).toMatchObject({ who: "okami", text: expect.stringContaining("おはよう、レイ") });
    expect(greeting(s, "rei", at(14))).toMatchObject({ who: "master" });
    expect(greeting(s, "rei", at(18))).toMatchObject({ who: "okami", text: expect.stringContaining("おかえり") });
    expect(greeting(s, "rei", at(22)).text).toContain("休む");
  });
  it("承認待ち・承認済み・緊急クエストの順に優先して知らせる", () => {
    let s = initialFamily();
    s = applyMutations(s, reportQuest(s, "rei", "q-dishes", at(14), "e1"));
    expect(greeting(s, "rei", at(14)).text).toContain("報告1件");
    s = applyMutations(s, approve(s, "e1", "papa", at(15)));
    expect(greeting(s, "rei", at(16)).text).toContain("食器を下げる");
    s = applyMutations(s, issueUrgent(s, "mama", "玄関の靴をそろえよ", 40, 30, at(16), "u1"));
    expect(greeting(s, "rei", at(16))).toMatchObject({ who: "master", text: expect.stringContaining("緊急クエスト") });
  });
});

describe("キャラ画像の保存", () => {
  it("親だけが画像を変えられ、もう片方の画像は残る", () => {
    let s = initialFamily();
    const img = "data:image/jpeg;base64,AAAA";
    s = applyMutations(s, saveArt(s, "papa", "master", img));
    s = applyMutations(s, saveArt(s, "mama", "okami", img));
    expect(s.art).toEqual({ master: img, okami: img });
    s = applyMutations(s, saveArt(s, "mama", "master", null));
    expect(s.art).toEqual({ master: null, okami: img });
    expect(() => saveArt(s, "rei", "master", img)).toThrow(GuildError);
    expect(() => saveArt(s, "papa", "master", "javascript:alert(1)")).toThrow(GuildError);
  });
});
