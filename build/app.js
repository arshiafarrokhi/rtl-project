var textarea = document.getElementById("textEditor");
var rtlRichViewer = document.getElementById("rtlRichViewer");
var jsonTreeOutput = document.getElementById("jsonTreeOutput");
var markdownOutput = document.getElementById("markdownOutput");
var tabList = document.getElementById("tabList");
var addTabButton = document.getElementById("addTab");
var rtlViewerButton = document.getElementById("rtlViewerMode");
var jsonViewerButton = document.getElementById("jsonViewer");
var markdownViewerButton = document.getElementById("markdownViewer");
var editorViewSwitch = document.getElementById("editorViewSwitch");
var previewViewButton = document.getElementById("previewView");
var sourceViewButton = document.getElementById("sourceView");
var jsonViewSwitch = document.getElementById("jsonViewSwitch");
var jsonTextViewButton = document.getElementById("jsonTextView");
var jsonTreeViewButton = document.getElementById("jsonTreeView");
var markdownAlignSwitch = document.getElementById("markdownAlignSwitch");
var markdownAlignRightButton = document.getElementById("markdownAlignRight");
var markdownAlignLeftButton = document.getElementById("markdownAlignLeft");
var modeTitleIcon = document.getElementById("modeTitleIcon");
var modeTitleText = document.getElementById("modeTitleText");
var lineNumbers = document.getElementById("lineNumbers");
var themeToggle = document.getElementById("themeToggle");
var themeIcon = document.getElementById("themeIcon");
var themeText = document.getElementById("themeText");
var toast = document.getElementById("toast");
var SETTINGS_KEY = "fixtxt-settings-v3";
var LEGACY_WORKSPACES_KEY = "fixtxt-workspaces-v2";
var LEGACY_TABS_KEY = "fixtxt-tabs-v1";
var MAX_TABS = 5;
var TREE_NODE_LIMIT = 1800;
var activeMode = "rtl";
var jsonView = "text";
var markdownAlign = "right";
var editorViews = {
  rtl: "source",
  markdown: "preview",
};
var workspaces = {
  rtl: createWorkspace("rtl"),
  json: createWorkspace("json"),
  markdown: createWorkspace("markdown"),
};
var renamingTabId = null;
var saveTimer;
var toastTimer;
var lineNumberFrame;
var dirtyTabIds = new Set();
var storageWarningShown = false;
var initializationComplete = false;

function createWorkspace(mode) {
  var tab = createTab(1, mode);
  return {
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function getDefaultTabTitle(index) {
  return "Tab " + index;
}

function createTab(index, mode) {
  return {
    id:
      "tab-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8),
    title: getDefaultTabTitle(index),
    customTitle: false,
    text: "",
    direction: mode === "json" ? "ltr" : "rtl",
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
  };
}

function normalizeMode(mode) {
  if (mode === "json" || mode === "markdown") {
    return mode;
  }
  return "rtl";
}

function normalizeJsonView(view) {
  return view === "tree" ? "tree" : "text";
}

function normalizeDirection(direction) {
  return direction === "ltr" ? "ltr" : "rtl";
}

function normalizeMarkdownAlign(align) {
  return align === "left" ? "left" : "right";
}

function normalizeEditorView(view) {
  return view === "preview" ? "preview" : "source";
}

function normalizeText(text) {
  return String(text == null ? "" : text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "");
}

function stripDirectionalControls(text) {
  return normalizeText(text).replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}

function sanitizeText(text) {
  return normalizeText(text);
}

function sanitizeIncomingText(text) {
  return normalizeText(text);
}

function getWorkspace(mode) {
  return workspaces[normalizeMode(mode || activeMode)];
}

function getActiveTab(mode) {
  var workspace = getWorkspace(mode);
  return (
    workspace.tabs.find(function (tab) {
      return tab.id === workspace.activeTabId;
    }) || workspace.tabs[0]
  );
}

function renumberTabs(mode) {
  getWorkspace(mode).tabs.forEach(function (tab, index) {
    if (!tab.customTitle) {
      tab.title = getDefaultTabTitle(index + 1);
    }
  });
}

function forEachTab(callback) {
  ["rtl", "json", "markdown"].forEach(function (mode) {
    getWorkspace(mode).tabs.forEach(function (tab) {
      callback(tab, mode);
    });
  });
}

function findTabById(tabId) {
  var match = null;
  forEachTab(function (tab, mode) {
    if (!match && tab.id === tabId) {
      match = { tab: tab, mode: mode };
    }
  });
  return match;
}

function serializeWorkspace(workspace) {
  return {
    activeTabId: workspace.activeTabId,
    tabs: workspace.tabs.map(function (tab) {
      return {
        id: tab.id,
        title: tab.title,
        customTitle: tab.customTitle,
        direction: tab.direction,
      };
    }),
  };
}

function writeSettingsNow() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        activeMode: activeMode,
        jsonView: jsonView,
        markdownAlign: markdownAlign,
        editorViews: editorViews,
        workspaces: {
          rtl: serializeWorkspace(workspaces.rtl),
          json: serializeWorkspace(workspaces.json),
          markdown: serializeWorkspace(workspaces.markdown),
        },
      }),
    );
  } catch (error) {
    showStorageWarning();
  }
}

function markTabDirty(tabId) {
  if (tabId) {
    dirtyTabIds.add(tabId);
  }
}

function markAllTabsDirty() {
  forEachTab(function (tab) {
    markTabDirty(tab.id);
  });
}

function showStorageWarning() {
  if (storageWarningShown || !initializationComplete) {
    return;
  }
  storageWarningShown = true;
  showToast("Saving is unavailable in this browser session.");
}

function persistDirtyTabs() {
  var ids = Array.from(dirtyTabIds);
  if (!ids.length) {
    return Promise.resolve();
  }

  var records = ids
    .map(function (tabId) {
      var match = findTabById(tabId);
      if (!match) {
        return null;
      }
      return {
        id: match.tab.id,
        mode: match.mode,
        text: match.tab.text,
        updatedAt: Date.now(),
      };
    })
    .filter(Boolean);

  ids.forEach(function (tabId) {
    dirtyTabIds.delete(tabId);
  });

  return window.FixTxtStorage.writeTabs(records).catch(function () {
    ids.forEach(markTabDirty);
    showStorageWarning();
  });
}

function saveNow() {
  window.clearTimeout(saveTimer);
  writeActiveTabFromEditor(false);
  writeSettingsNow();
  return persistDirtyTabs();
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 320);
}

function writeActiveTabFromEditor(shouldQueue) {
  var tab = getActiveTab();
  if (!tab) {
    return;
  }

  var nextText = textarea.value;
  var nextDirection =
    activeMode === "json"
      ? "ltr"
      : activeMode === "markdown"
        ? markdownAlign === "left"
          ? "ltr"
          : "rtl"
        : normalizeDirection(textarea.dir);

  if (tab.text !== nextText) {
    tab.text = nextText;
    markTabDirty(tab.id);
  }
  tab.direction = nextDirection;
  if (!textarea.hidden) {
    tab.selectionStart = textarea.selectionStart || 0;
    tab.selectionEnd = textarea.selectionEnd || 0;
    tab.scrollTop = textarea.scrollTop || 0;
    scheduleLineNumbers();
  }

  if (shouldQueue) {
    queueSave();
  }
}

function normalizeStoredTab(tab, index, mode) {
  var fallback = createTab(index + 1, mode);
  var storedTitle = typeof tab.title === "string" ? tab.title.trim() : "";
  var customTitle =
    Boolean(storedTitle) &&
    (Boolean(tab.customTitle) || !/^Tab \d+$/.test(storedTitle));
  return {
    id: typeof tab.id === "string" && tab.id ? tab.id : fallback.id,
    title: customTitle ? storedTitle.slice(0, 32) : fallback.title,
    customTitle: customTitle,
    text: typeof tab.text === "string" ? sanitizeText(tab.text) : "",
    direction: mode === "json" ? "ltr" : normalizeDirection(tab.direction),
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
  };
}

function normalizeStoredWorkspace(rawWorkspace, mode) {
  var workspace = createWorkspace(mode);
  if (!rawWorkspace || !Array.isArray(rawWorkspace.tabs)) {
    return workspace;
  }

  workspace.tabs = rawWorkspace.tabs
    .slice(0, MAX_TABS)
    .map(function (tab, index) {
      return normalizeStoredTab(tab, index, mode);
    });

  if (!workspace.tabs.length) {
    workspace.tabs = [createTab(1, mode)];
  }

  workspace.activeTabId = workspace.tabs.some(function (tab) {
    return tab.id === rawWorkspace.activeTabId;
  })
    ? rawWorkspace.activeTabId
    : workspace.tabs[0].id;

  return workspace;
}

function migrateLegacyTabs() {
  var legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_TABS_KEY) || "null");
  } catch (error) {}

  if (!legacy || !Array.isArray(legacy.tabs)) {
    return false;
  }

  var rtlTabs = [];
  var jsonTabs = [];
  legacy.tabs.slice(0, MAX_TABS).forEach(function (tab, index) {
    var mode = tab && tab.jsonMode ? "json" : "rtl";
    var normalized = normalizeStoredTab(
      tab || {},
      mode === "json" ? jsonTabs.length : rtlTabs.length,
      mode,
    );
    if (mode === "json") {
      jsonTabs.push(normalized);
    } else {
      rtlTabs.push(normalized);
    }
  });

  if (rtlTabs.length) {
    workspaces.rtl.tabs = rtlTabs;
    workspaces.rtl.activeTabId = rtlTabs[0].id;
  }

  if (jsonTabs.length) {
    workspaces.json.tabs = jsonTabs;
    workspaces.json.activeTabId = jsonTabs[0].id;
  }

  var legacyActive = legacy.tabs.find(function (tab) {
    return tab.id === legacy.activeTabId;
  });
  activeMode = legacyActive && legacyActive.jsonMode ? "json" : "rtl";
  return true;
}

function loadStoredState() {
  var stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
  } catch (error) {}

  if (stored && stored.workspaces) {
    activeMode = normalizeMode(stored.activeMode);
    jsonView = normalizeJsonView(stored.jsonView);
    markdownAlign = normalizeMarkdownAlign(stored.markdownAlign);
    editorViews.rtl = normalizeEditorView(
      stored.editorViews && stored.editorViews.rtl,
    );
    editorViews.markdown = normalizeEditorView(
      stored.editorViews && stored.editorViews.markdown,
    );
    workspaces.rtl = normalizeStoredWorkspace(stored.workspaces.rtl, "rtl");
    workspaces.json = normalizeStoredWorkspace(stored.workspaces.json, "json");
    workspaces.markdown = normalizeStoredWorkspace(
      stored.workspaces.markdown,
      "markdown",
    );
    renumberTabs("rtl");
    renumberTabs("json");
    renumberTabs("markdown");
    return "indexeddb";
  }

  try {
    stored = JSON.parse(localStorage.getItem(LEGACY_WORKSPACES_KEY) || "null");
  } catch (error) {
    stored = null;
  }

  if (stored && stored.workspaces) {
    activeMode = normalizeMode(stored.activeMode);
    jsonView = normalizeJsonView(stored.jsonView);
    markdownAlign = normalizeMarkdownAlign(stored.markdownAlign);
    workspaces.rtl = normalizeStoredWorkspace(stored.workspaces.rtl, "rtl");
    workspaces.json = normalizeStoredWorkspace(stored.workspaces.json, "json");
    workspaces.markdown = normalizeStoredWorkspace(
      stored.workspaces.markdown,
      "markdown",
    );
    renumberTabs("rtl");
    renumberTabs("json");
    renumberTabs("markdown");
    return "legacy-workspaces";
  }

  if (migrateLegacyTabs()) {
    renumberTabs("rtl");
    renumberTabs("json");
    renumberTabs("markdown");
    return "legacy-tabs";
  }

  return "new";
}

function hydrateTabTexts(stateSource) {
  if (stateSource !== "indexeddb") {
    markAllTabsDirty();
    return persistDirtyTabs().then(function () {
      if (dirtyTabIds.size) {
        return;
      }
      try {
        localStorage.removeItem(LEGACY_WORKSPACES_KEY);
        localStorage.removeItem(LEGACY_TABS_KEY);
      } catch (error) {}
    });
  }

  return window.FixTxtStorage.readTabs().then(function (records) {
    var recordsById = new Map();
    records.forEach(function (record) {
      recordsById.set(record.id, record);
    });
    forEachTab(function (tab) {
      var record = recordsById.get(tab.id);
      tab.text = record && typeof record.text === "string" ? record.text : "";
    });
  });
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

function getSafeHref(url) {
  var value = String(url || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(value) || /^[./#]/.test(value)) {
    return value;
  }
  return "";
}

function renderInlineMarkdown(text) {
  var html = "";
  var pattern =
    /`([^`\n]+)`|!\[([^\]\n]{0,160})\]\(([^)\n]{1,500})\)|\[([^\]\n]{1,160})\]\(([^)\n]{1,500})\)|(\*\*|__)(.+?)\6|(\*|_)([^*_]+?)\8|~~(.+?)~~/g;
  var lastIndex = 0;
  var match;

  while ((match = pattern.exec(text))) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    if (match[1] != null) {
      html += '<span class="rich-code">' + escapeHtml(match[1]) + "</span>";
    } else if (match[2] != null) {
      var src = getSafeHref(match[3]);
      html += src
        ? '<img src="' +
          escapeAttribute(src) +
          '" alt="' +
          escapeAttribute(match[2]) +
          '">'
        : '<span class="rich-code">' +
          escapeHtml(match[2] || "image") +
          "</span>";
    } else if (match[4] != null) {
      var href = getSafeHref(match[5]);
      html += href
        ? '<a class="rich-link" href="' +
          escapeAttribute(href) +
          '" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out" aria-hidden="true"></i>' +
          escapeHtml(match[4]) +
          "</a>"
        : '<span class="rich-link" title="' +
          escapeAttribute(match[5]) +
          '"><i class="ph ph-arrow-square-out" aria-hidden="true"></i>' +
          escapeHtml(match[4]) +
          "</span>";
    } else if (match[7] != null) {
      html += "<strong>" + renderInlineMarkdown(match[7]) + "</strong>";
    } else if (match[9] != null) {
      html += "<em>" + renderInlineMarkdown(match[9]) + "</em>";
    } else if (match[10] != null) {
      html += "<s>" + renderInlineMarkdown(match[10]) + "</s>";
    } else {
      html += escapeHtml(match[0]);
    }
    lastIndex = pattern.lastIndex;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function renderRtlPreview() {
  var text = textarea.value;
  rtlRichViewer.innerHTML = text
    .split("\n")
    .map(function (line) {
      return '<div class="rich-line">' + renderInlineMarkdown(line) + "</div>";
    })
    .join("");
}

function isMarkdownTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(function (cell) {
      return cell.trim();
    });
}

function renderMarkdownTable(lines, startIndex) {
  var headers = splitMarkdownTableRow(lines[startIndex]);
  var rows = [];
  var index = startIndex + 2;

  while (
    index < lines.length &&
    /\|/.test(lines[index]) &&
    lines[index].trim()
  ) {
    rows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }

  var html =
    "<table><thead><tr>" +
    headers
      .map(function (cell) {
        return "<th>" + renderInlineMarkdown(cell) + "</th>";
      })
      .join("") +
    "</tr></thead><tbody>" +
    rows
      .map(function (row) {
        return (
          "<tr>" +
          headers
            .map(function (_, cellIndex) {
              return (
                "<td>" + renderInlineMarkdown(row[cellIndex] || "") + "</td>"
              );
            })
            .join("") +
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table>";

  return { html: html, nextIndex: index };
}

function renderMarkdownDocument(markdown) {
  var lines = sanitizeText(markdown).split("\n");
  var html = "";
  var index = 0;

  while (index < lines.length) {
    var line = lines[index];
    var trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    var fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      var codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      html +=
        "<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>";
      continue;
    }

    if (
      index + 1 < lines.length &&
      /\|/.test(line) &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      var table = renderMarkdownTable(lines, index);
      html += table.html;
      index = table.nextIndex;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html += "<hr>";
      index += 1;
      continue;
    }

    var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      var level = heading[1].length;
      html +=
        "<h" +
        level +
        ">" +
        renderInlineMarkdown(heading[2]) +
        "</h" +
        level +
        ">";
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      var quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      html +=
        "<blockquote>" +
        renderMarkdownDocument(quoteLines.join("\n")) +
        "</blockquote>";
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      html += "<ul>";
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        html +=
          "<li>" +
          renderInlineMarkdown(lines[index].replace(/^\s*[-*+]\s+/, "")) +
          "</li>";
        index += 1;
      }
      html += "</ul>";
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>";
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        html +=
          "<li>" +
          renderInlineMarkdown(lines[index].replace(/^\s*\d+\.\s+/, "")) +
          "</li>";
        index += 1;
      }
      html += "</ol>";
      continue;
    }

    var paragraph = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index].trim()) &&
      !/^(#{1,6})\s+/.test(lines[index].trim()) &&
      !/^>\s?/.test(lines[index].trim()) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html += "<p>" + renderInlineMarkdown(paragraph.join(" ")) + "</p>";
  }

  return (
    html ||
    '<div class="markdown-empty">Paste Markdown to preview it here.</div>'
  );
}

function renderMarkdownViewer() {
  var isLeft = markdownAlign === "left";
  markdownOutput.dir = isLeft ? "ltr" : "rtl";
  markdownOutput.classList.toggle("is-align-left", isLeft);
  markdownOutput.classList.toggle("is-align-right", !isLeft);
  markdownOutput.innerHTML = textarea.value.trim()
    ? renderMarkdownDocument(textarea.value)
    : '<div class="markdown-empty">Paste Markdown to preview it here.</div>';
}

function setEditorDirection(direction) {
  textarea.dir = direction;
  textarea.style.direction = direction;
  textarea.style.textAlign = direction === "rtl" ? "right" : "left";
}

function updateModeUI() {
  var isJson = activeMode === "json";
  var isMarkdown = activeMode === "markdown";
  var isTree = isJson && jsonView === "tree";
  var editorView = isMarkdown ? editorViews.markdown : editorViews.rtl;

  modeTitleText.textContent = isJson
    ? "JSON Viewer"
    : isMarkdown
      ? "Markdown Viewer"
      : "RTL Viewer";
  modeTitleIcon.className = isJson
    ? "ph ph-brackets-curly"
    : isMarkdown
      ? "ph ph-markdown-logo"
      : "ph ph-text-align-right";

  rtlViewerButton.classList.toggle("is-active", activeMode === "rtl");
  rtlViewerButton.setAttribute(
    "aria-pressed",
    activeMode === "rtl" ? "true" : "false",
  );
  jsonViewerButton.classList.toggle("is-active", isJson);
  jsonViewerButton.setAttribute("aria-pressed", isJson ? "true" : "false");
  markdownViewerButton.classList.toggle("is-active", isMarkdown);
  markdownViewerButton.setAttribute(
    "aria-pressed",
    isMarkdown ? "true" : "false",
  );
  editorViewSwitch.classList.toggle("is-visible", !isJson);
  jsonViewSwitch.classList.toggle("is-visible", isJson);
  markdownAlignSwitch.classList.toggle("is-visible", isMarkdown);
  previewViewButton.classList.toggle(
    "is-active",
    !isJson && editorView === "preview",
  );
  previewViewButton.setAttribute(
    "aria-pressed",
    !isJson && editorView === "preview" ? "true" : "false",
  );
  sourceViewButton.classList.toggle(
    "is-active",
    !isJson && editorView === "source",
  );
  sourceViewButton.setAttribute(
    "aria-pressed",
    !isJson && editorView === "source" ? "true" : "false",
  );
  jsonTextViewButton.classList.toggle(
    "is-active",
    isJson && jsonView === "text",
  );
  jsonTextViewButton.setAttribute(
    "aria-pressed",
    isJson && jsonView === "text" ? "true" : "false",
  );
  jsonTreeViewButton.classList.toggle("is-active", isTree);
  jsonTreeViewButton.setAttribute("aria-pressed", isTree ? "true" : "false");
  markdownAlignRightButton.classList.toggle(
    "is-active",
    isMarkdown && markdownAlign === "right",
  );
  markdownAlignRightButton.setAttribute(
    "aria-pressed",
    isMarkdown && markdownAlign === "right" ? "true" : "false",
  );
  markdownAlignLeftButton.classList.toggle(
    "is-active",
    isMarkdown && markdownAlign === "left",
  );
  markdownAlignLeftButton.setAttribute(
    "aria-pressed",
    isMarkdown && markdownAlign === "left" ? "true" : "false",
  );
  textarea.classList.toggle("is-json-viewer", isJson);

  if (isJson) {
    setEditorDirection("ltr");
    textarea.placeholder = "Paste raw JSON here...";
  } else if (isMarkdown) {
    setEditorDirection(markdownAlign === "left" ? "ltr" : "rtl");
    textarea.placeholder = "Paste Markdown here...";
  } else {
    setEditorDirection(getActiveTab("rtl").direction || "rtl");
    textarea.placeholder =
      "Paste Persian, Arabic, Markdown, or mixed RTL/LTR text here...";
  }
}

function getTabIconClass(tab) {
  var title = tab.title.toLowerCase();
  if (activeMode === "json" || title.endsWith(".json")) {
    return "ph ph-brackets-curly tab-file-icon";
  }
  if (activeMode === "markdown") {
    return "ph ph-markdown-logo tab-file-icon";
  }
  return "ph ph-file-text tab-file-icon";
}

function renderTabs() {
  var workspace = getWorkspace();
  while (tabList.firstChild) {
    tabList.removeChild(tabList.firstChild);
  }

  workspace.tabs.forEach(function (tab) {
    var isActive = tab.id === workspace.activeTabId;
    var item = document.createElement("div");
    var closeButton = document.createElement("button");
    item.className = isActive ? "tab-item is-active" : "tab-item";

    if (renamingTabId === tab.id) {
      var renameInput = document.createElement("input");
      renameInput.className = "tab-rename-input";
      renameInput.type = "text";
      renameInput.value = tab.title;
      renameInput.maxLength = 32;
      renameInput.setAttribute("aria-label", "Rename " + tab.title);
      renameInput.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      renameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          finishRenamingTab(tab.id, renameInput.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRenamingTab();
        }
      });
      renameInput.addEventListener("blur", function () {
        finishRenamingTab(tab.id, renameInput.value);
      });
      item.appendChild(renameInput);
      window.requestAnimationFrame(function () {
        renameInput.focus();
        renameInput.select();
      });
    } else {
      var tabButton = document.createElement("button");
      var tabIcon = document.createElement("i");
      var tabLabel = document.createElement("span");
      tabButton.className = "tab-button";
      tabButton.type = "button";
      tabButton.id = "tabButton-" + tab.id;
      tabButton.setAttribute("role", "tab");
      tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
      tabButton.setAttribute("aria-controls", "textEditor");
      tabButton.title = tab.title + " - double click or press F2 to rename";
      tabButton.addEventListener("click", function () {
        switchTab(tab.id);
      });
      tabButton.addEventListener("dblclick", function (event) {
        event.preventDefault();
        startRenamingTab(tab.id);
      });
      tabButton.addEventListener("keydown", function (event) {
        if (event.key === "F2") {
          event.preventDefault();
          startRenamingTab(tab.id);
        }
      });
      tabIcon.className = getTabIconClass(tab);
      tabIcon.setAttribute("aria-hidden", "true");
      tabLabel.className = "tab-label";
      tabLabel.textContent = tab.title;
      tabButton.appendChild(tabIcon);
      tabButton.appendChild(tabLabel);
      item.appendChild(tabButton);
    }

    closeButton.className = "tab-close";
    closeButton.type = "button";
    closeButton.disabled = workspace.tabs.length === 1;
    closeButton.setAttribute(
      "aria-label",
      closeButton.disabled ? "Close tab disabled" : "Close " + tab.title,
    );
    closeButton.title = closeButton.disabled
      ? "At least one tab must stay open"
      : "Close tab";
    closeButton.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
    closeButton.addEventListener("click", function (event) {
      event.stopPropagation();
      closeTab(tab.id);
    });
    item.appendChild(closeButton);
    tabList.appendChild(item);
  });

  tabList.appendChild(addTabButton);
  addTabButton.disabled = workspace.tabs.length >= MAX_TABS;
  addTabButton.title = addTabButton.disabled ? "Maximum 5 tabs" : "Add tab";
  addTabButton.setAttribute(
    "aria-disabled",
    addTabButton.disabled ? "true" : "false",
  );
}

function renderLineNumbers() {
  lineNumberFrame = null;

  if (textarea.hidden || textarea.value.length > 180000) {
    lineNumbers.hidden = true;
    textarea.classList.add("without-line-numbers");
    return;
  }

  var lineCount = 1;
  for (var index = 0; index < textarea.value.length; index += 1) {
    if (textarea.value.charCodeAt(index) === 10) {
      lineCount += 1;
    }
  }

  var values = new Array(lineCount);
  for (var line = 0; line < lineCount; line += 1) {
    values[line] = String(line + 1);
  }

  lineNumbers.textContent = values.join("\n");
  lineNumbers.hidden = false;
  lineNumbers.scrollTop = textarea.scrollTop;
  textarea.classList.remove("without-line-numbers");
}

function scheduleLineNumbers() {
  if (lineNumberFrame) {
    return;
  }
  lineNumberFrame = window.requestAnimationFrame(renderLineNumbers);
}

function renderCurrentView() {
  updateModeUI();

  textarea.hidden = true;
  rtlRichViewer.hidden = true;
  jsonTreeOutput.hidden = true;
  markdownOutput.hidden = true;

  if (activeMode === "json" && jsonView === "tree") {
    jsonTreeOutput.hidden = false;
    renderJsonTree();
  } else if (activeMode === "json") {
    textarea.hidden = false;
  } else if (activeMode === "markdown" && editorViews.markdown === "preview") {
    renderMarkdownViewer();
    markdownOutput.hidden = false;
  } else if (activeMode === "rtl" && editorViews.rtl === "preview") {
    renderRtlPreview();
    rtlRichViewer.hidden = false;
  } else {
    textarea.hidden = false;
  }

  if (textarea.hidden) {
    lineNumbers.hidden = true;
  } else {
    scheduleLineNumbers();
  }
}

function loadActiveTab(focusEditor) {
  var tab = getActiveTab();
  if (!tab) {
    return;
  }
  textarea.value = tab.text;
  setEditorDirection(
    activeMode === "json"
      ? "ltr"
      : activeMode === "markdown"
        ? markdownAlign === "left"
          ? "ltr"
          : "rtl"
        : tab.direction,
  );
  renderCurrentView();
  if (focusEditor) {
    if (!textarea.hidden) {
      try {
        textarea.focus({ preventScroll: true });
      } catch (error) {
        textarea.focus();
      }
      var selectionStart = Math.min(tab.selectionStart || 0, tab.text.length);
      var selectionEnd = Math.min(
        tab.selectionEnd == null ? selectionStart : tab.selectionEnd,
        tab.text.length,
      );
      textarea.setSelectionRange(selectionStart, selectionEnd);
      textarea.scrollTop = tab.scrollTop || 0;
    } else {
      focusVisibleEditor();
    }
  }
}

function addNewTab() {
  var workspace = getWorkspace();
  if (workspace.tabs.length >= MAX_TABS) {
    showToast("Maximum 5 tabs reached.");
    return;
  }
  writeActiveTabFromEditor(false);
  var activeIndex = workspace.tabs.findIndex(function (tab) {
    return tab.id === workspace.activeTabId;
  });
  var insertIndex = activeIndex >= 0 ? activeIndex + 1 : workspace.tabs.length;
  var newTab = createTab(workspace.tabs.length + 1, activeMode);
  workspace.tabs.splice(insertIndex, 0, newTab);
  workspace.activeTabId = newTab.id;
  if (activeMode === "json") {
    jsonView = "text";
  } else {
    editorViews[activeMode] = "source";
  }
  markTabDirty(newTab.id);
  renumberTabs(activeMode);
  renderTabs();
  loadActiveTab(true);
  saveNow();
}

function closeTab(tabId) {
  var workspace = getWorkspace();
  var index = workspace.tabs.findIndex(function (tab) {
    return tab.id === tabId;
  });
  if (index === -1 || workspace.tabs.length === 1) {
    return;
  }
  writeActiveTabFromEditor(false);
  var closingActive = tabId === workspace.activeTabId;
  workspace.tabs.splice(index, 1);
  dirtyTabIds.delete(tabId);
  window.FixTxtStorage.deleteTabs([tabId]).catch(showStorageWarning);
  renumberTabs(activeMode);
  if (closingActive) {
    workspace.activeTabId =
      workspace.tabs[Math.min(index, workspace.tabs.length - 1)].id;
  }
  renderTabs();
  if (closingActive) {
    loadActiveTab(true);
  }
  saveNow();
}

function switchTab(tabId) {
  var workspace = getWorkspace();
  if (tabId === workspace.activeTabId) {
    return;
  }
  if (
    !workspace.tabs.some(function (tab) {
      return tab.id === tabId;
    })
  ) {
    return;
  }
  writeActiveTabFromEditor(false);
  workspace.activeTabId = tabId;
  renderTabs();
  loadActiveTab(true);
  saveNow();
}

function startRenamingTab(tabId) {
  var workspace = getWorkspace();
  if (
    !workspace.tabs.some(function (tab) {
      return tab.id === tabId;
    })
  ) {
    return;
  }
  writeActiveTabFromEditor(false);
  renamingTabId = tabId;
  renderTabs();
}

function finishRenamingTab(tabId, title) {
  if (renamingTabId !== tabId) {
    return;
  }
  var workspace = getWorkspace();
  var tabIndex = workspace.tabs.findIndex(function (tab) {
    return tab.id === tabId;
  });
  if (tabIndex === -1) {
    renamingTabId = null;
    renderTabs();
    return;
  }
  var fallbackTitle = getDefaultTabTitle(tabIndex + 1);
  var nextTitle =
    title.trim().replace(/\s+/g, " ").slice(0, 32) || fallbackTitle;
  workspace.tabs[tabIndex].title = nextTitle;
  workspace.tabs[tabIndex].customTitle = nextTitle !== fallbackTitle;
  renamingTabId = null;
  renderTabs();
  saveNow();
}

function cancelRenamingTab() {
  renamingTabId = null;
  renderTabs();
}

function switchMode(mode) {
  mode = normalizeMode(mode);
  if (mode === activeMode) {
    return;
  }
  writeActiveTabFromEditor(false);
  activeMode = mode;
  renamingTabId = null;
  renderTabs();
  loadActiveTab(true);
  saveNow();
}

function setJsonView(view) {
  writeActiveTabFromEditor(false);
  jsonView = normalizeJsonView(view);
  renderCurrentView();
  saveNow();
  if (jsonView === "text") {
    focusVisibleEditor();
  }
}

function setEditorView(view) {
  if (activeMode === "json") {
    return;
  }
  writeActiveTabFromEditor(false);
  editorViews[activeMode] = normalizeEditorView(view);
  renderCurrentView();
  saveNow();
  focusVisibleEditor();
}

function setMarkdownAlign(align) {
  markdownAlign = normalizeMarkdownAlign(align);
  setEditorDirection(markdownAlign === "left" ? "ltr" : "rtl");
  renderCurrentView();
  saveNow();
}

function clearFormatting(text) {
  return stripDirectionalControls(text);
}

function toRTL(text) {
  return clearFormatting(text)
    .split("\n")
    .map(function (line) {
      return "\u202B" + line + "\u202C";
    })
    .join("\n");
}

function toLTR(text) {
  return clearFormatting(text)
    .split("\n")
    .map(function (line) {
      return "\u202A" + line + "\u202C";
    })
    .join("\n");
}

function formatJsonText(text) {
  var cleaned = sanitizeIncomingText(text).trim();
  if (!cleaned) {
    return "";
  }
  return JSON.stringify(JSON.parse(cleaned), null, 2);
}

function scheduleJsonFormat(showInvalidToast) {
  window.setTimeout(function () {
    if (activeMode !== "json") {
      return;
    }
    try {
      textarea.value = formatJsonText(textarea.value);
      writeActiveTabFromEditor(false);
      renderCurrentView();
      saveNow();
    } catch (error) {
      writeActiveTabFromEditor(true);
      if (showInvalidToast) {
        showToast("Invalid JSON.");
      }
    }
  }, 0);
}

function insertRawText(text) {
  var raw = sanitizeIncomingText(text);
  if (!raw) {
    return;
  }

  if (textarea.hidden) {
    if (activeMode === "json") {
      jsonView = "text";
    } else {
      editorViews[activeMode] = "source";
    }
    renderCurrentView();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  var start =
    textarea.selectionStart == null
      ? textarea.value.length
      : textarea.selectionStart;
  var end =
    textarea.selectionEnd == null
      ? textarea.value.length
      : textarea.selectionEnd;
  textarea.setRangeText(raw, start, end, "end");

  writeActiveTabFromEditor(false);
  if (activeMode === "json") {
    scheduleJsonFormat(true);
  } else {
    queueSave();
  }
  try {
    textarea.focus({ preventScroll: true });
  } catch (error) {
    textarea.focus();
  }
}

function getRawText() {
  writeActiveTabFromEditor(false);
  return getActiveTab().text;
}

function copyRawText() {
  var text = getRawText();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(function () {
        showToast("Copied raw text.");
      })
      .catch(function () {
        fallbackCopyText(text);
      });
    return;
  }
  fallbackCopyText(text);
}

function fallbackCopyText(text) {
  var previousFocus = document.activeElement;
  var copyHelper = document.createElement("textarea");
  copyHelper.value = text;
  copyHelper.setAttribute("readonly", "");
  copyHelper.style.position = "fixed";
  copyHelper.style.top = "0";
  copyHelper.style.left = "-9999px";
  document.body.appendChild(copyHelper);
  copyHelper.select();
  var copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {}
  copyHelper.remove();
  if (previousFocus && typeof previousFocus.focus === "function") {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch (error) {
      previousFocus.focus();
    }
  }
  showToast(
    copied
      ? "Copied raw text."
      : "Copy failed. Select Source and press Ctrl+C.",
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderJsonValue(value, key, depth, counter) {
  if (counter.count >= TREE_NODE_LIMIT) {
    counter.limited = true;
    return "";
  }
  counter.count += 1;

  var label =
    key == null
      ? ""
      : '<span class="json-key">' + escapeHtml(key) + "</span>: ";
  if (value === null) {
    return (
      '<div class="json-tree-node">' +
      label +
      '<span class="json-null">null</span></div>'
    );
  }
  if (Array.isArray(value)) {
    var children = "";
    for (
      var index = 0;
      index < value.length && counter.count < TREE_NODE_LIMIT;
      index += 1
    ) {
      children += renderJsonValue(
        value[index],
        String(index),
        depth + 1,
        counter,
      );
    }
    if (index < value.length) {
      counter.limited = true;
    }
    return (
      '<div class="json-tree-node"><details open><summary>' +
      label +
      "Array(" +
      value.length +
      ")</summary>" +
      children +
      "</details></div>"
    );
  }
  if (typeof value === "object") {
    var keys = Object.keys(value);
    var objectChildren = "";
    for (
      var keyIndex = 0;
      keyIndex < keys.length && counter.count < TREE_NODE_LIMIT;
      keyIndex += 1
    ) {
      var childKey = keys[keyIndex];
      objectChildren += renderJsonValue(
        value[childKey],
        childKey,
        depth + 1,
        counter,
      );
    }
    if (keyIndex < keys.length) {
      counter.limited = true;
    }
    return (
      '<div class="json-tree-node"><details open><summary>' +
      label +
      "Object{" +
      keys.length +
      "}</summary>" +
      objectChildren +
      "</details></div>"
    );
  }
  if (typeof value === "string") {
    return (
      '<div class="json-tree-node">' +
      label +
      '<span class="json-string">"' +
      escapeHtml(value) +
      '"</span></div>'
    );
  }
  if (typeof value === "number") {
    return (
      '<div class="json-tree-node">' +
      label +
      '<span class="json-number">' +
      value +
      "</span></div>"
    );
  }
  if (typeof value === "boolean") {
    return (
      '<div class="json-tree-node">' +
      label +
      '<span class="json-boolean">' +
      value +
      "</span></div>"
    );
  }
  return (
    '<div class="json-tree-node">' +
    label +
    escapeHtml(String(value)) +
    "</div>"
  );
}

function renderJsonTree() {
  var text = sanitizeText(textarea.value).trim();
  if (!text) {
    jsonTreeOutput.innerHTML =
      '<div class="json-tree-empty">Paste JSON to see the tree view.</div>';
    return;
  }
  try {
    var value = JSON.parse(text);
    var counter = { count: 0, limited: false };
    var html = renderJsonValue(value, null, 0, counter);
    if (counter.limited) {
      html +=
        '<div class="json-tree-limit">Tree preview stopped after ' +
        TREE_NODE_LIMIT +
        " nodes.</div>";
    }
    jsonTreeOutput.innerHTML = html;
  } catch (error) {
    jsonTreeOutput.innerHTML =
      '<div class="json-tree-error">Invalid JSON: ' +
      escapeHtml(error.message) +
      "</div>";
  }
}

function focusVisibleEditor() {
  if (!textarea.hidden) {
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    return;
  }
  if (!rtlRichViewer.hidden) {
    try {
      rtlRichViewer.focus({ preventScroll: true });
    } catch (error) {
      rtlRichViewer.focus();
    }
    return;
  }
  if (!markdownOutput.hidden) {
    try {
      markdownOutput.focus({ preventScroll: true });
    } catch (error) {
      markdownOutput.focus();
    }
    return;
  }
  try {
    jsonTreeOutput.focus({ preventScroll: true });
  } catch (error) {
    jsonTreeOutput.focus();
  }
}

function focusEditorAtStart() {
  if (!textarea.hidden) {
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
    return;
  }
  if (!rtlRichViewer.hidden) {
    try {
      rtlRichViewer.focus({ preventScroll: true });
    } catch (error) {
      rtlRichViewer.focus();
    }
    rtlRichViewer.scrollTop = 0;
    return;
  }
  if (!markdownOutput.hidden) {
    try {
      markdownOutput.focus({ preventScroll: true });
    } catch (error) {
      markdownOutput.focus();
    }
    markdownOutput.scrollTop = 0;
    return;
  }
  try {
    jsonTreeOutput.focus({ preventScroll: true });
  } catch (error) {
    jsonTreeOutput.focus();
  }
  jsonTreeOutput.scrollTop = 0;
}

function applyText(value, direction) {
  textarea.value = sanitizeText(value);
  setEditorDirection(direction);
  writeActiveTabFromEditor(false);
  renderCurrentView();
  saveNow();
  focusEditorAtStart();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(function () {
    toast.classList.remove("is-visible");
  }, 2200);
}

function updateThemeControl(theme) {
  var isDark = theme === "dark";
  themeIcon.className = isDark
    ? "ph ph-moon theme-icon"
    : "ph ph-sun theme-icon";
  themeText.textContent = "Theme";
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode",
  );
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("fixtxt-theme", theme);
  } catch (error) {}
  updateThemeControl(theme);
}

rtlViewerButton.addEventListener("click", function () {
  switchMode("rtl");
});
jsonViewerButton.addEventListener("click", function () {
  switchMode("json");
});
markdownViewerButton.addEventListener("click", function () {
  switchMode("markdown");
});
previewViewButton.addEventListener("click", function () {
  setEditorView("preview");
});
sourceViewButton.addEventListener("click", function () {
  setEditorView("source");
});
jsonTextViewButton.addEventListener("click", function () {
  setJsonView("text");
});
jsonTreeViewButton.addEventListener("click", function () {
  setJsonView("tree");
});
markdownAlignRightButton.addEventListener("click", function () {
  setMarkdownAlign("right");
});
markdownAlignLeftButton.addEventListener("click", function () {
  setMarkdownAlign("left");
});

document.getElementById("fixRtl").addEventListener("click", function () {
  if (activeMode !== "rtl") {
    showToast("RTL actions are only for RTL Viewer.");
    return;
  }
  applyText(toRTL(textarea.value), "rtl");
});

document.getElementById("fixLtr").addEventListener("click", function () {
  if (activeMode !== "rtl") {
    showToast("RTL actions are only for RTL Viewer.");
    return;
  }
  applyText(toLTR(textarea.value), "ltr");
});

document.getElementById("clearAll").addEventListener("click", function () {
  textarea.value = "";
  writeActiveTabFromEditor(false);
  renderCurrentView();
  saveNow();
});

document.getElementById("pasteText").addEventListener("click", function () {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard
      .readText()
      .then(function (text) {
        insertRawText(text);
        if (activeMode !== "json") {
          showToast("Pasted raw text.");
        }
      })
      .catch(function () {
        focusVisibleEditor();
        showToast("Clipboard permission was blocked. Press Ctrl+V here.");
      });
    return;
  }
  focusVisibleEditor();
  showToast("Press Ctrl+V to paste here.");
});

document.getElementById("copyText").addEventListener("click", copyRawText);
addTabButton.addEventListener("click", addNewTab);

textarea.addEventListener("input", function () {
  writeActiveTabFromEditor(true);
});

textarea.addEventListener("scroll", function () {
  if (!lineNumbers.hidden) {
    lineNumbers.scrollTop = textarea.scrollTop;
  }
});

textarea.addEventListener("paste", function (event) {
  if (!event.clipboardData) {
    return;
  }
  var text = event.clipboardData.getData("text/plain");
  event.preventDefault();
  insertRawText(text);
});

function selectViewerContents(viewer) {
  var selection = window.getSelection();
  if (!selection) {
    return;
  }
  var range = document.createRange();
  range.selectNodeContents(viewer);
  selection.removeAllRanges();
  selection.addRange(range);
}

function viewerContentsAreSelected(viewer) {
  var selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1) {
    return false;
  }
  var selectedRange = selection.getRangeAt(0);
  var fullRange = document.createRange();
  fullRange.selectNodeContents(viewer);
  return (
    selectedRange.compareBoundaryPoints(Range.START_TO_START, fullRange) ===
      0 &&
    selectedRange.compareBoundaryPoints(Range.END_TO_END, fullRange) === 0
  );
}

function previousCodePointStart(text, end) {
  var previous = Array.from(text.slice(0, end)).pop();
  return previous ? end - previous.length : end;
}

function switchVisibleViewerToSource() {
  if (activeMode === "json") {
    setJsonView("text");
  } else {
    setEditorView("source");
  }
}

function handleViewerKeydown(event) {
  var commandKey = event.ctrlKey || event.metaKey;
  if (commandKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectViewerContents(event.currentTarget);
    return;
  }

  var insertedText = null;
  if (!commandKey && !event.altKey && event.key.length === 1) {
    insertedText = event.key;
  } else if (event.key === "Enter") {
    insertedText = "\n";
  }

  if (insertedText != null) {
    event.preventDefault();
    var shouldReplaceAll = viewerContentsAreSelected(event.currentTarget);
    switchVisibleViewerToSource();
    if (shouldReplaceAll) {
      textarea.select();
    } else {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    insertRawText(insertedText);
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    var shouldDeleteAll = viewerContentsAreSelected(event.currentTarget);
    switchVisibleViewerToSource();
    var end = textarea.value.length;
    if (shouldDeleteAll) {
      textarea.setRangeText("", 0, end, "end");
      writeActiveTabFromEditor(true);
    } else if (event.key === "Backspace" && end > 0) {
      textarea.setRangeText(
        "",
        previousCodePointStart(textarea.value, end),
        end,
        "end",
      );
      writeActiveTabFromEditor(true);
    } else {
      textarea.setSelectionRange(end, end);
    }
  }
}

function handleViewerPaste(event) {
  if (!event.clipboardData) {
    return;
  }
  event.preventDefault();
  insertRawText(event.clipboardData.getData("text/plain"));
}

function handleViewerCopy(event) {
  if (!event.clipboardData) {
    return;
  }
  event.preventDefault();
  event.clipboardData.setData("text/plain", getRawText());
  showToast("Copied raw text.");
}

[rtlRichViewer, markdownOutput, jsonTreeOutput].forEach(function (viewer) {
  viewer.addEventListener("keydown", handleViewerKeydown);
  viewer.addEventListener("paste", handleViewerPaste);
  viewer.addEventListener("copy", handleViewerCopy);
});

themeToggle.addEventListener("click", function () {
  var currentTheme =
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  setTheme(currentTheme === "dark" ? "light" : "dark");
});

window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") {
    saveNow();
  }
});

function initializeApp() {
  updateThemeControl(
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  var stateSource = loadStoredState();

  return hydrateTabTexts(stateSource)
    .catch(function () {
      showStorageWarning();
    })
    .then(function () {
      initializationComplete = true;
      renderTabs();
      loadActiveTab(false);
      document.body.dataset.ready = "true";
      return saveNow();
    });
}

initializeApp();
