import { expect, test, type Page } from "@playwright/test";

// 親のスマホと子どものスマホを同時に動かし、本物と同じ Firebase の仕組み（エミュレーター）で
// 「家族を作る → 招待コードで参加 → 報告 → 承認 → 交換」がリアルタイムに伝わるかを確かめる

const gold = (page: Page) => page.locator(".card .gold b");

test("親と子の2台で、報告から交換まで", async ({ browser }) => {
  const parentCtx = await browser.newContext();
  const kidCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  const kid = await kidCtx.newPage();

  // 親: 家族を作る
  await parent.goto("/");
  await parent.getByRole("button", { name: /はじめて使う/ }).click();
  await parent.getByRole("button", { name: "母" }).click();
  await parent.getByRole("button", { name: /家族を作る/ }).click();
  await expect(parent.getByRole("tab", { name: /承認/ })).toBeVisible({ timeout: 15_000 });

  // 親: ルリの招待コードを出す
  await parent.getByRole("tab", { name: "冒険者" }).click();
  await parent.locator(".rowitem", { hasText: "ルリ" }).getByRole("button", { name: "招待コード" }).click();
  const code = (await parent.locator(".code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // 子: 招待コードで参加
  await kid.goto("/");
  await kid.getByRole("button", { name: "招待コードで参加する" }).click();
  await kid.getByLabel("招待コード（6文字）").fill(code);
  await kid.getByRole("button", { name: "参加する" }).click();
  await expect(kid.locator(".card h1")).toHaveText("ルリ", { timeout: 15_000 });
  await expect(gold(kid)).toHaveText("0");

  // 同じコードは2回使えない
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "招待コードで参加する" }).click();
  await other.getByLabel("招待コード（6文字）").fill(code);
  await other.getByRole("button", { name: "参加する" }).click();
  await expect(other.locator(".err")).toContainText("もう使われています");

  // 子: クエストを報告
  await kid.getByRole("tab", { name: "依頼掲示板" }).click();
  await kid.locator(".quest", { hasText: "お風呂そうじ" }).getByRole("button", { name: "達成を報告する" }).click();
  await expect(kid.getByRole("status")).toContainText("報告しました");

  // 親: 承認（子の画面に自動で反映される）
  await parent.getByRole("tab", { name: /承認/ }).click();
  await parent.locator(".approve", { hasText: "ルリ：お風呂そうじ" }).getByRole("button", { name: "承認する" }).click();
  await expect(parent.getByRole("status")).toContainText("ルリに 30 G を付与しました");
  await kid.getByRole("tab", { name: "ギルド" }).click();
  await expect(gold(kid)).toHaveText("30");

  // 親: ボーナス、子: 交換申請、親: 渡す
  await parent.getByRole("tab", { name: "冒険者" }).click();
  await parent.locator(".kid", { hasText: "ルリ" }).getByRole("button", { name: "ボーナス" }).click();
  await parent.getByRole("dialog").getByRole("button", { name: "50 G", exact: true }).click();
  await parent.getByRole("dialog").getByRole("button", { name: "50 G を付ける" }).click();
  await expect(gold(kid)).toHaveText("80");

  await kid.getByRole("tab", { name: "交換所" }).click();
  await kid.locator(".item", { hasText: "ゲーム30分延長" }).getByRole("button", { name: "交換を申請" }).click();
  await expect(kid.locator(".sec")).toContainText("使える G：30");

  await parent.getByRole("tab", { name: /承認/ }).click();
  await parent.locator(".approve", { hasText: "ゲーム30分延長" }).getByRole("button", { name: "渡した" }).click();
  await kid.getByRole("tab", { name: "ギルド" }).click();
  await expect(gold(kid)).toHaveText("30");

  // 子: 緊急クエスト（親が発令 → 子が受注 → 承認）
  await parent.getByRole("tab", { name: "緊急発令" }).click();
  await parent.getByLabel("依頼内容").fill("洗濯物をとりこめ");
  await parent.getByLabel("報酬（G）").fill("25");
  await parent.getByRole("button", { name: "発令する" }).click();
  await kid.getByRole("button", { name: "達成したので報告する" }).click();
  await parent.getByRole("tab", { name: /承認/ }).click();
  await parent.locator(".approve", { hasText: "【緊急】洗濯物をとりこめ" }).getByRole("button", { name: "承認する" }).click();
  await expect(gold(kid)).toHaveText("55");
  await expect(kid.locator(".urgent")).toContainText("ルリが達成");

  await parentCtx.close();
  await kidCtx.close();
  await otherCtx.close();
});
