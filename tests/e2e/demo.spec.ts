import { expect, test, type Page } from "@playwright/test";

// お試しモードで「報告 → 承認 → G が増える → 交換 → 渡す」の一連の流れを、スマホ画面で確かめる

async function switchTo(page: Page, name: string) {
  await page.getByRole("group", { name: "使う人" }).getByRole("button", { name: new RegExp(name) }).click();
}

const gold = (page: Page) => page.locator(".card .gold b");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "最初に戻す" }).click();
});

test("子どもの報告を親が承認すると G が増える", async ({ page }) => {
  await switchTo(page, "レイ");
  await expect(gold(page)).toHaveText("620");
  await page.getByRole("tab", { name: "依頼掲示板" }).click();
  const card = page.locator(".quest", { hasText: "お風呂そうじ" });
  await card.getByRole("button", { name: "達成を報告する" }).click();
  await expect(page.getByRole("status")).toContainText("報告しました");
  await expect(card).toContainText("今日はもう1回報告しました");

  await switchTo(page, "母");
  await expect(page.getByRole("tab", { name: /承認/ })).toContainText("承認");
  const item = page.locator(".approve", { hasText: "レイ：お風呂そうじ" });
  await item.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByRole("status")).toContainText("レイに 30 G を付与しました");

  await switchTo(page, "レイ");
  await expect(gold(page)).toHaveText("650");
});

test("差し戻すとコメントが子どもの記録に残る", async ({ page }) => {
  await switchTo(page, "父");
  const item = page.locator(".approve", { hasText: "リツ：朝の支度を自分で" });
  await item.getByRole("button", { name: "差し戻す" }).click();
  await page.getByRole("button", { name: "まだ終わってないよ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "差し戻す" }).click();

  await switchTo(page, "リツ");
  await page.getByRole("tab", { name: "冒険の記録" }).click();
  await expect(page.locator(".log", { hasText: "朝の支度を自分で" })).toContainText("まだ終わってないよ");
});

test("交換は申請で予約され、親が渡すと確定する", async ({ page }) => {
  await switchTo(page, "リツ");
  await page.getByRole("tab", { name: "交換所" }).click();
  await expect(page.locator(".sec")).toContainText("使える G：310");
  await page.locator(".item", { hasText: "好きなおやつ1つ" }).getByRole("button", { name: "交換を申請" }).click();
  await expect(page.locator(".sec")).toContainText("使える G：210");
  await expect(page.locator(".item", { hasText: "好きな本を1冊" })).toContainText("あと 590 G");

  await switchTo(page, "母");
  await page.locator(".approve", { hasText: "リツ：好きなおやつ1つ" }).getByRole("button", { name: "渡した" }).click();

  await switchTo(page, "リツ");
  await expect(gold(page)).toHaveText("210");
});

test("緊急クエストは先着1名", async ({ page }) => {
  await switchTo(page, "ルリ");
  await page.getByRole("button", { name: "達成したので報告する" }).click();
  await switchTo(page, "レイ");
  await expect(page.locator(".urgent")).toContainText("ルリが受注・承認待ち");
  await expect(page.getByRole("button", { name: "達成したので報告する" })).toHaveCount(0);

  await switchTo(page, "母");
  await page.locator(".approve", { hasText: "【緊急】" }).getByRole("button", { name: "承認する" }).click();
  await switchTo(page, "ルリ");
  await expect(gold(page)).toHaveText("1,300");
});

test("親がクエストを追加すると子どもの掲示板に出る", async ({ page }) => {
  await switchTo(page, "父");
  await page.getByRole("tab", { name: "設定" }).click();
  await page.getByRole("button", { name: "クエストを追加" }).click();
  await page.getByLabel("クエスト名").fill("玄関の靴をそろえる");
  await page.getByLabel("報酬（G）").fill("15");
  await page.getByRole("button", { name: "保存する" }).click();

  await switchTo(page, "リツ");
  await page.getByRole("tab", { name: "依頼掲示板" }).click();
  await expect(page.locator(".quest", { hasText: "玄関の靴をそろえる" })).toContainText("15 G");
});

test("画面が横にはみ出さない", async ({ page }) => {
  for (const name of ["ルリ", "母"]) {
    await switchTo(page, name);
    const tabs = page.getByRole("tab");
    for (let i = 0; i < (await tabs.count()); i++) {
      await tabs.nth(i).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});
