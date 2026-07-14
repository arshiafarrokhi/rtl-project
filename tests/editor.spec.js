const { test, expect } = require("@playwright/test");

async function openCleanApp(page) {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  await expect(page.locator("#previewView")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function showSource(page) {
  await page.locator("#sourceView").click();
  await expect(page.locator("#textEditor")).toBeVisible();
}

async function dispatchPlainTextPaste(page, selector, text) {
  return page.locator(selector).evaluate((element, rawText) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", rawText);
    const startedAt = performance.now();
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    return performance.now() - startedAt;
  }, text);
}

test("native source editing keeps focus, caret, Backspace, and Ctrl+A", async ({
  page,
}) => {
  await openCleanApp(page);
  const editor = page.locator("#textEditor");

  await showSource(page);
  await editor.click();
  await page.keyboard.insertText("سلام test");
  await page.locator("#sourceView").click();
  await editor.click();
  await page.keyboard.insertText(" دوم");
  await page.keyboard.press("Backspace");

  await expect(editor).toHaveValue("سلام test دو");
  await expect(editor).toBeFocused();

  await page.keyboard.press("ControlOrMeta+A");
  const selection = await editor.evaluate((element) => ({
    activeElement: document.activeElement === element,
    end: element.selectionEnd,
    pageSelection: window.getSelection().toString(),
    start: element.selectionStart,
    valueLength: element.value.length,
  }));
  expect(selection).toEqual({
    activeElement: true,
    end: selection.valueLength,
    pageSelection: "سلام test دو",
    start: 0,
    valueLength: selection.valueLength,
  });
});

test("preview remains readable and active during keyboard edits", async ({
  page,
}) => {
  await openCleanApp(page);
  await showSource(page);
  const raw =
    "تغییرات در [index.html (line 1256)](D:/code/rtl-project/index.html:1256) انجام شد:";
  await page.locator("#textEditor").fill(raw);
  await page.locator("#previewView").click();

  const preview = page.locator("#rtlRichViewer");
  await expect(preview).toBeVisible();
  await expect(preview.locator(".rich-link")).toHaveText(
    "index.html (line 1256)",
  );
  await preview.focus();
  await page.keyboard.press("ControlOrMeta+A");
  expect(
    await preview.evaluate((element) =>
      element.contains(window.getSelection().anchorNode),
    ),
  ).toBe(true);

  await page.keyboard.press("Backspace");
  await expect(preview).toBeVisible();
  await expect(page.locator("#previewView")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#textEditor")).toHaveValue("");

  await page.keyboard.press("x");
  await expect(preview).toContainText("x");
  await expect(page.locator("#textEditor")).toHaveValue("x");
  await expect(page.locator("#textEditor")).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#textEditor")).toHaveValue("");
  await expect(preview).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("#textEditor")).toHaveValue("x");
  await expect(preview).toBeVisible();
});

test("Source is explicit and workflow boundaries return to Preview", async ({
  page,
}) => {
  await openCleanApp(page);
  await showSource(page);
  await page.locator("#textEditor").fill("source session");
  await page.waitForTimeout(450);

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  await expect(page.locator("#previewView")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#textEditor")).toHaveValue("source session");

  await showSource(page);
  await page.locator("#addTab").click();
  await expect(page.locator("#rtlRichViewer")).toBeVisible();

  await showSource(page);
  await page.locator("#markdownViewer").click();
  await expect(page.locator("#markdownOutput")).toBeVisible();
  await showSource(page);
  await page.locator("#rtlViewerMode").click();
  await expect(page.locator("#rtlRichViewer")).toBeVisible();

  await showSource(page);
  await page.locator("#textEditor").fill("action text");
  await page.locator("#fixRtl").click();
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  await showSource(page);
  await page.locator("#clearAll").click();
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  await expect(page.locator("#textEditor")).toHaveValue("");

  await page.locator("#jsonViewer").click();
  await page.locator("#textEditor").fill('{"value":1}');
  await page.locator("#jsonTreeView").click();
  await page.locator("#jsonTreeOutput").focus();
  await page.keyboard.press("Backspace");
  await expect(page.locator("#jsonTreeOutput")).toBeVisible();
  await dispatchPlainTextPaste(page, "#jsonTreeOutput", '{"next":2}');
  await expect(page.locator("#jsonTreeOutput")).toBeVisible();
  await expect(page.locator("#jsonTreeOutput")).toContainText("next");
});

test("Preview edits preserve Markdown source and stay in Preview", async ({
  page,
}) => {
  await openCleanApp(page);
  await showSource(page);
  await page
    .locator("#textEditor")
    .fill("Read [file](D:/code/rtl-project/file.md:1) now");
  await page.locator("#previewView").click();

  const preview = page.locator("#rtlRichViewer");
  const link = preview.locator(".rich-link");
  await link.evaluate((element) => {
    const viewer = element.closest("#rtlRichViewer");
    viewer.focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.nodeValue.length);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  for (const character of ["d", "o", "c"]) {
    await page.keyboard.press(character);
    await page.waitForTimeout(20);
  }

  await expect(page.locator("#textEditor")).toHaveValue(
    "Read [doc](D:/code/rtl-project/file.md:1) now",
  );
  await expect(preview.locator(".rich-link")).toHaveText("doc");
  await expect(preview).toBeVisible();

  await page.locator("#markdownViewer").click();
  await dispatchPlainTextPaste(
    page,
    "#markdownOutput",
    "# Preview title\n\nPreview body",
  );
  await expect(page.locator("#markdownOutput h1")).toHaveText("Preview title");
  await expect(page.locator("#markdownOutput")).toBeVisible();
  await expect(page.locator("#textEditor")).toHaveValue(
    "# Preview title\n\nPreview body",
  );

  const fontSizes = await page.evaluate(() => ({
    preview: Number.parseFloat(getComputedStyle(rtlRichViewer).fontSize),
    source: Number.parseFloat(getComputedStyle(textEditor).fontSize),
  }));
  expect(fontSizes.preview).toBeGreaterThanOrEqual(18);
  expect(fontSizes.source).toBeGreaterThanOrEqual(18);

  await page.locator("#jsonViewer").click();
  const jsonFontSizes = await page.evaluate(() => ({
    source: Number.parseFloat(getComputedStyle(textEditor).fontSize),
    tree: Number.parseFloat(getComputedStyle(jsonTreeOutput).fontSize),
  }));
  expect(jsonFontSizes.source).toBeGreaterThanOrEqual(16);
  expect(jsonFontSizes.tree).toBeGreaterThanOrEqual(15);
});

test("plain-text paste and preview copy preserve the complete raw source", async ({
  page,
}) => {
  await openCleanApp(page);
  const raw =
    "خط  اول  با فاصله\n[فایل](D:/code/rtl-project/index.html:1256)\n\u202BRTL\u202C";
  await dispatchPlainTextPaste(page, "#rtlRichViewer", raw);
  await expect(page.locator("#textEditor")).toHaveValue(raw);
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  const copied = await page.locator("#rtlRichViewer").evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    return transfer.getData("text/plain");
  });
  expect(copied).toBe(raw);
});

test("RTL, JSON, and Markdown keep independent tabs and source text", async ({
  page,
}) => {
  await openCleanApp(page);
  await showSource(page);
  await page.locator("#textEditor").fill("RTL workspace");

  await page.locator("#jsonViewer").click();
  await dispatchPlainTextPaste(
    page,
    "#textEditor",
    '{"name":"FixTxt","ok":true}',
  );
  await expect(page.locator("#textEditor")).toHaveValue(
    '{\n  "name": "FixTxt",\n  "ok": true\n}',
  );

  await page.locator("#markdownViewer").click();
  await page.locator("#sourceView").click();
  await page.locator("#textEditor").fill("# Markdown workspace");

  await page.locator("#rtlViewerMode").click();
  await expect(page.locator("#textEditor")).toHaveValue("RTL workspace");
  await page.locator("#jsonViewer").click();
  await expect(page.locator("#textEditor")).toContainText("");
  await expect(page.locator("#textEditor")).toHaveValue(/FixTxt/);
  await page.locator("#markdownViewer").click();
  await expect(page.locator("#textEditor")).toHaveValue("# Markdown workspace");
});

test("tab text reloads from IndexedDB while localStorage stores metadata only", async ({
  page,
}) => {
  await openCleanApp(page);
  await showSource(page);
  const raw = "persistent raw text [link](D:/private/path.md:42)";
  await page.locator("#textEditor").fill(raw);
  await page.waitForTimeout(450);

  const persisted = await page.evaluate(async () => {
    const settingsText = localStorage.getItem("fixtxt-settings-v3");
    const records = await window.FixTxtStorage.readTabs();
    return { records, settingsText };
  });
  expect(persisted.settingsText).not.toContain(raw);
  expect(persisted.records.some((record) => record.text === raw)).toBe(true);

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#rtlRichViewer")).toBeVisible();
  await expect(page.locator("#textEditor")).toHaveValue(raw);
});

test("version 2 localStorage data migrates to IndexedDB without text loss", async ({
  page,
}) => {
  await openCleanApp(page);
  const legacyText = "متن قدیمی که باید کامل باقی بماند";
  const legacyState = {
    version: 2,
    activeMode: "rtl",
    jsonView: "text",
    markdownAlign: "right",
    workspaces: {
      rtl: {
        activeTabId: "legacy-rtl",
        tabs: [
          {
            id: "legacy-rtl",
            title: "Legacy",
            customTitle: true,
            text: legacyText,
            direction: "rtl",
          },
        ],
      },
      json: { activeTabId: "legacy-json", tabs: [] },
      markdown: { activeTabId: "legacy-md", tabs: [] },
    },
  };
  await page.evaluate(async () => {
    await window.FixTxtStorage.clearTabs();
    sessionStorage.setItem("seed-v2-migration", "true");
  });
  await page.addInitScript((state) => {
    if (sessionStorage.getItem("seed-v2-migration") !== "true") {
      return;
    }
    sessionStorage.removeItem("seed-v2-migration");
    localStorage.removeItem("fixtxt-settings-v3");
    localStorage.setItem("fixtxt-workspaces-v2", JSON.stringify(state));
  }, legacyState);

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#textEditor")).toHaveValue(legacyText);
  const migration = await page.evaluate(async () => ({
    legacyRemoved: !localStorage.getItem("fixtxt-workspaces-v2"),
    records: await window.FixTxtStorage.readTabs(),
    settings: localStorage.getItem("fixtxt-settings-v3"),
  }));
  expect(migration.legacyRemoved).toBe(true);
  expect(migration.records.some((record) => record.text === legacyText)).toBe(
    true,
  );
  expect(migration.settings).not.toContain(legacyText);
});

test("tabs support keyboard rename, five-tab limit, and protected last tab", async ({
  page,
}) => {
  await openCleanApp(page);
  await expect(page.locator(".tab-close")).toBeDisabled();

  for (let index = 0; index < 4; index += 1) {
    await page.locator("#addTab").click();
  }
  await expect(page.locator(".tab-item")).toHaveCount(5);
  await expect(page.locator("#addTab")).toBeDisabled();

  const activeTab = page.locator(".tab-item.is-active .tab-button");
  await activeTab.focus();
  await activeTab.press("F2");
  const renameInput = page.locator(".tab-item.is-active .tab-rename-input");
  await renameInput.fill("یادداشت اصلی");
  await renameInput.press("Enter");
  await expect(page.locator(".tab-item.is-active .tab-label")).toHaveText(
    "یادداشت اصلی",
  );

  await page.locator(".tab-item.is-active .tab-close").click();
  await expect(page.locator(".tab-item")).toHaveCount(4);
  await expect(page.locator("#addTab")).toBeEnabled();
});

test("long paste stays in the scrollable editor without scrolling the page", async ({
  page,
}) => {
  await openCleanApp(page);
  const longText = "متن بلند با raw spacing  1234567890\n".repeat(12_000);
  const elapsed = await dispatchPlainTextPaste(
    page,
    "#rtlRichViewer",
    longText,
  );

  expect(elapsed).toBeLessThan(3_000);
  await expect(page.locator("#textEditor")).toHaveValue(longText);
  const geometry = await page.evaluate(() => ({
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
    editorScrollHeight: rtlRichViewer.scrollHeight,
    editorClientHeight: rtlRichViewer.clientHeight,
    editorOverflowY: getComputedStyle(rtlRichViewer).overflowY,
    previewVisible: !rtlRichViewer.hidden,
  }));
  expect(geometry.previewVisible).toBe(true);
  expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(
    geometry.bodyClientHeight,
  );
  expect(geometry.editorScrollHeight).toBeGreaterThan(
    geometry.editorClientHeight,
  );
  expect(geometry.editorOverflowY).toBe("auto");
});

test("JSON Tree and Markdown alignment render independently", async ({
  page,
}) => {
  await openCleanApp(page);
  await page.locator("#jsonViewer").click();
  await page.locator("#textEditor").fill('{"items":[1,true,null]}');
  await page.locator("#jsonTreeView").click();
  await expect(page.locator("#jsonTreeOutput")).toContainText("items");
  await expect(page.locator("#jsonTreeOutput")).toContainText("Array(3)");

  await page.locator("#markdownViewer").click();
  await page.locator("#sourceView").click();
  await page
    .locator("#textEditor")
    .fill("# عنوان\n\n[اینجا محتوا را قرار می‌دهم]");
  await page.locator("#previewView").click();
  await page.locator("#markdownAlignRight").click();
  await expect(page.locator("#markdownOutput")).toHaveCSS("direction", "rtl");
  await expect(page.locator("#markdownOutput")).toHaveCSS(
    "text-align",
    "right",
  );
  await page.locator("#markdownAlignLeft").click();
  await expect(page.locator("#markdownOutput")).toHaveCSS("direction", "ltr");
  await expect(page.locator("#markdownOutput")).toHaveCSS("text-align", "left");
});

test("theme preference survives reload", async ({ page }) => {
  await openCleanApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("mobile layout keeps the action bar on one row without page overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("mobile"),
    "Mobile-only layout assertion",
  );
  await openCleanApp(page);
  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector(".toolbar");
    const buttons = Array.from(toolbar.querySelectorAll(".btn"));
    return {
      bodyHasVerticalScroll:
        document.body.scrollHeight > document.body.clientHeight,
      toolbarHasHorizontalScroll: toolbar.scrollWidth > toolbar.clientWidth,
      topOffsets: [
        ...new Set(buttons.map((button) => Math.round(button.offsetTop))),
      ],
    };
  });
  expect(layout.bodyHasVerticalScroll).toBe(false);
  expect(layout.toolbarHasHorizontalScroll).toBe(false);
  expect(layout.topOffsets).toHaveLength(1);

  await page.setViewportSize({ width: 320, height: 568 });
  const smallLayout = await page.evaluate(() => ({
    bodyHasVerticalScroll:
      document.body.scrollHeight > document.body.clientHeight,
    labelsAreClipped: [
      ...document.querySelectorAll(".mode-button span:first-child"),
    ].some((label) => label.scrollWidth > label.clientWidth),
    toolbarHasHorizontalScroll:
      document.querySelector(".toolbar").scrollWidth >
      document.querySelector(".toolbar").clientWidth,
  }));
  expect(smallLayout.bodyHasVerticalScroll).toBe(false);
  expect(smallLayout.labelsAreClipped).toBe(false);
  expect(smallLayout.toolbarHasHorizontalScroll).toBe(false);
});
