import { expect, test, type Page } from "@playwright/test";

// お試しモードで「報告 → 承認 → G が増える → 交換 → 渡す」の一連の流れを、スマホ画面で確かめる

const KIDS = ["ルリ", "レイ", "リツ"];

async function switchTo(page: Page, name: string) {
  await page.getByRole("group", { name: "使う人" }).getByRole("button", { name: new RegExp(name) }).click();
  // 子どもは開くたびにタイトル画面が出る
  if (KIDS.includes(name)) await page.getByRole("button", { name: "冒険に出る" }).click();
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
  await page.getByRole("tab", { name: "冒険の記録" }).click();
  await expect(page.locator(".log", { hasText: "お風呂そうじ" }).first()).toContainText("ギルドの受付が承認");
});

test("親は承認を取り消せる（押し間違い・テスト用）", async ({ page }) => {
  await switchTo(page, "レイ");
  await page.getByRole("tab", { name: "依頼掲示板" }).click();
  await page.locator(".quest", { hasText: "お風呂そうじ" }).getByRole("button", { name: "達成を報告する" }).click();
  await switchTo(page, "母");
  await page.locator(".approve", { hasText: "レイ：お風呂そうじ" }).getByRole("button", { name: "承認する" }).click();
  await expect(page.getByRole("status")).toContainText("レイに 30 G を付与しました");

  await page.getByRole("tab", { name: "冒険者" }).click();
  await page.getByRole("button", { name: "レイの「お風呂そうじ」の承認を取り消す" }).first().click();
  await page.getByLabel(/理由/).fill("テスト");
  await page.getByRole("dialog").getByRole("button", { name: "取り消す" }).click();
  await expect(page.getByRole("status")).toContainText("レイの 30 G を取り消しました");

  await switchTo(page, "レイ");
  await expect(gold(page)).toHaveText("620");
  await page.getByRole("tab", { name: "冒険の記録" }).click();
  await expect(page.locator(".log", { hasText: "お風呂そうじ" }).first()).toContainText("承認取り消し：テスト");
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

test("親が「運動」のクエストを追加すると子どもの掲示板の運動の欄に出る", async ({ page }) => {
  await switchTo(page, "父");
  await page.getByRole("tab", { name: "設定" }).click();
  await page.getByRole("button", { name: "クエストを追加" }).click();
  await page.getByLabel("クエスト名").fill("縄跳び100回");
  await page.getByRole("group", { name: "種類" }).getByRole("button", { name: "運動" }).click();
  await page.getByLabel("報酬（G）").fill("15");
  await page.getByRole("button", { name: "保存する" }).click();

  await switchTo(page, "リツ");
  await page.getByRole("tab", { name: "依頼掲示板" }).click();
  const sports = page.locator(".stack", { has: page.getByText("運動の依頼") });
  await expect(sports.locator(".quest", { hasText: "縄跳び100回" })).toContainText("15 G");
  await expect(page.getByText("生活の依頼")).toHaveCount(0);
});

test("子どもが開くとギルドのタイトル画面が出て、親が登録したキャラ画像が使われる", async ({ page }) => {
  await page.getByRole("group", { name: "使う人" }).getByRole("button", { name: /レイ/ }).click();
  const title = page.getByRole("region", { name: "タイトル画面" });
  await expect(title).toContainText("おうちギルド");
  await expect(title.getByRole("img", { name: "ギルドマスター（画像未設定）" })).toBeVisible();
  await expect(title.getByRole("status")).not.toBeEmpty();

  await switchTo(page, "父");
  await page.getByRole("tab", { name: "設定" }).click();
  // 1x1 の PNG を「画像を選ぶ」に渡す
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("ギルドマスターの画像を選ぶ").setInputFiles({ name: "papa.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("status")).toContainText("ギルドマスターの画像を変えました");

  await page.getByRole("group", { name: "使う人" }).getByRole("button", { name: /レイ/ }).click();
  await expect(title.getByRole("img", { name: "ギルドマスター", exact: true })).toBeVisible();
  await title.getByRole("button", { name: "冒険に出る" }).click();
  await expect(gold(page)).toHaveText("620");
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
