const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const buildUrl = pathToFileURL(
  resolve(__dirname, "..", "build", "index.html"),
).href;

test("offline build opens from index.html and persists text", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(buildUrl, { waitUntil: "load" });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#textEditor")).toBeVisible();

  const rawText = "offline build persistence";
  await page.locator("#textEditor").fill(rawText);
  await page.waitForTimeout(450);

  const storageState = await page.evaluate(async () => ({
    protocol: location.protocol,
    records: await window.FixTxtStorage.readTabs(),
    settings: localStorage.getItem("fixtxt-settings-v3"),
    styleSheetCount: document.styleSheets.length,
  }));
  expect(storageState.protocol).toBe("file:");
  expect(storageState.styleSheetCount).toBeGreaterThan(0);
  expect(storageState.records.some((record) => record.text === rawText)).toBe(
    true,
  );
  expect(storageState.settings).not.toContain(rawText);

  await page.reload({ waitUntil: "load" });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#textEditor")).toHaveValue(rawText);
  expect(pageErrors).toEqual([]);
});
