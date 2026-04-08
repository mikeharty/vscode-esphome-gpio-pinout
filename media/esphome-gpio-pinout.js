(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const LABEL_STYLE_PREF_KEY = "labelStylePreference";
  const LABEL_STYLE_STORAGE_KEY = "esphomeGpioPinout.labelStylePreference";
  const ISSUE_TEXT_GPIO_GUESSED = "GPIO number guessed from unresolved value.";
  const LABEL_STYLES = Object.freeze({
    GPIO: "gpio",
    BOARD: "board",
  });

  const CONFIG = {
    zoomMin: 0.75,
    zoomMax: 8.0,
    zoomStep: 0.25,
    zoomBaseScale: 1.25,
  };

  function normalizeLabelStyle(value) {
    if (value === LABEL_STYLES.GPIO) return LABEL_STYLES.GPIO;
    if (value === LABEL_STYLES.BOARD) return LABEL_STYLES.BOARD;
    return null;
  }

  function readLabelStylePreference() {
    const fromState = normalizeLabelStyle(vscode.getState()?.[LABEL_STYLE_PREF_KEY]);
    if (fromState) return fromState;
    try {
      const fromStorage = normalizeLabelStyle(window.localStorage.getItem(LABEL_STYLE_STORAGE_KEY));
      if (fromStorage) return fromStorage;
    } catch {
      // Ignore private-mode/localStorage errors and use defaults.
    }
    return LABEL_STYLES.BOARD;
  }

  function persistLabelStylePreference(labelStylePreference) {
    const normalized = normalizeLabelStyle(labelStylePreference);
    if (!normalized) return;
    const prev = vscode.getState() || {};
    vscode.setState({ ...prev, [LABEL_STYLE_PREF_KEY]: normalized });
    try {
      window.localStorage.setItem(LABEL_STYLE_STORAGE_KEY, normalized);
    } catch {
      // Ignore localStorage errors.
    }
  }

  const STATE = {
    zoom: 1.0,
    fitScale: 1.0,
    lastSig: null,
    lastPayload: null,
    labelStylePreference: readLabelStylePreference(),
    activeLabelStyle: LABEL_STYLES.BOARD,
  };

  let centerBoardRaf = null;

  const subtitleEl = document.getElementById("tm-esphome-pinout-subtitle");
  const diagramEl = document.getElementById("tm-esphome-pinout-diagram");
  const sideEl = document.getElementById("tm-esphome-pinout-side");
  const labelStyleWrapEl = document.getElementById("tm-esphome-pinout-labelstyle-wrap");
  const labelStyleSelectEl = document.getElementById("tm-esphome-pinout-labelstyle");

  if (labelStyleSelectEl) {
    labelStyleSelectEl.value = STATE.labelStylePreference;
    labelStyleSelectEl.addEventListener("change", () => {
      const next = normalizeLabelStyle(labelStyleSelectEl.value) || LABEL_STYLES.BOARD;
      if (next === STATE.labelStylePreference) return;
      STATE.labelStylePreference = next;
      persistLabelStylePreference(next);
      void renderFromPayload(STATE.lastPayload || null);
    });
  }

  document.getElementById("tm-esphome-pinout-refresh").addEventListener("click", () => {
    vscode.postMessage({ type: "requestRefresh" });
  });
  document
    .getElementById("tm-esphome-pinout-zoomout")
    .addEventListener("click", () => setZoom(STATE.zoom - CONFIG.zoomStep));
  document
    .getElementById("tm-esphome-pinout-zoomin")
    .addEventListener("click", () => setZoom(STATE.zoom + CONFIG.zoomStep));

  document.addEventListener(
    "mousedown",
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".tm-select-wrap")) return;
      vscode.postMessage({ type: "focusEditor" });
    },
    true,
  );

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "update") return;
    void renderFromPayload(message.payload || null);
  });

  vscode.postMessage({ type: "requestRefresh" });

  window.addEventListener("resize", () => {
    if (STATE.lastSig) computeFitScale();
  });

  setZoom(STATE.zoom);

  function setZoom(z) {
    const clamped = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, Math.round(z * 100) / 100));
    STATE.zoom = clamped;
    const label = document.getElementById("tm-esphome-pinout-zoomlabel");
    if (label) label.textContent = `${Math.round(clamped * 100)}%`;
    applyZoom();
  }

  function applyZoom() {
    const layer = document.querySelector("#tm-esphome-pinout-diagram .tm-zoom-layer");
    const svg = layer?.querySelector("svg.tm-svg");
    if (!layer || !svg) return;

    const viewW = parseFloat(svg.getAttribute("data-view-width")) || svg.viewBox?.baseVal?.width || 0;
    const viewH = parseFloat(svg.getAttribute("data-view-height")) || svg.viewBox?.baseVal?.height || 0;
    if (!viewW || !viewH) return;

    const scale = STATE.zoom * STATE.fitScale * CONFIG.zoomBaseScale;
    const scaledW = Math.max(1, viewW * scale);
    const scaledH = Math.max(1, viewH * scale);

    layer.style.width = `${scaledW}px`;
    layer.style.height = `${scaledH}px`;
    layer.style.transform = "";
    svg.style.width = `${scaledW}px`;
    svg.style.height = `${scaledH}px`;
    scheduleCenterBoard();
  }

  function centerBoardInViewport() {
    const layer = document.querySelector("#tm-esphome-pinout-diagram .tm-zoom-layer");
    const svg = layer?.querySelector("svg.tm-svg");
    if (!layer || !svg) return;

    const viewW = parseFloat(svg.getAttribute("data-view-width")) || svg.viewBox?.baseVal?.width || 0;
    const viewH = parseFloat(svg.getAttribute("data-view-height")) || svg.viewBox?.baseVal?.height || 0;
    if (!viewW || !viewH) return;

    const boardCenterAttr = parseFloat(svg.getAttribute("data-board-center-x"));
    const boardCenterX = Number.isFinite(boardCenterAttr) ? boardCenterAttr : viewW / 2;
    const boardCenterYAttr = parseFloat(svg.getAttribute("data-board-center-y"));
    const boardCenterY = Number.isFinite(boardCenterYAttr) ? boardCenterYAttr : viewH / 2;

    const style = getComputedStyle(diagramEl);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;
    const availW = Math.max(0, diagramEl.clientWidth - padLeft - padRight);
    const availH = Math.max(0, diagramEl.clientHeight - padTop - padBottom);
    if (!availW || !availH) return;

    const scale = STATE.zoom * STATE.fitScale * CONFIG.zoomBaseScale;
    const scaledCenterX = boardCenterX * scale;
    const scaledCenterY = boardCenterY * scale;
    const scaledW = Math.max(1, viewW * scale);
    const scaledH = Math.max(1, viewH * scale);

    let shiftX = 0;
    let shiftY = 0;

    if (scaledW <= availW + 0.5) {
      const centeredOffset = (availW - scaledW) / 2;
      const desiredShift = scaledW / 2 - scaledCenterX;
      shiftX = Math.max(-centeredOffset, Math.min(desiredShift, centeredOffset));
      diagramEl.scrollLeft = 0;
    } else {
      const targetScrollLeft = scaledCenterX - availW / 2;
      const maxScrollLeft = Math.max(0, diagramEl.scrollWidth - diagramEl.clientWidth);
      diagramEl.scrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft));
    }

    if (scaledH <= availH + 0.5) {
      const centeredOffset = (availH - scaledH) / 2;
      const desiredShift = scaledH / 2 - scaledCenterY;
      shiftY = Math.max(-centeredOffset, Math.min(desiredShift, centeredOffset));
      diagramEl.scrollTop = 0;
    } else {
      const targetScrollTop = scaledCenterY - availH / 2;
      const maxScrollTop = Math.max(0, diagramEl.scrollHeight - diagramEl.clientHeight);
      diagramEl.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
    }

    if (Math.abs(shiftX) > 0.2 || Math.abs(shiftY) > 0.2) {
      layer.style.transform = `translate(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px)`;
    } else {
      layer.style.transform = "";
    }
  }

  function scheduleCenterBoard() {
    if (centerBoardRaf != null) cancelAnimationFrame(centerBoardRaf);
    centerBoardRaf = requestAnimationFrame(() => {
      centerBoardRaf = null;
      centerBoardInViewport();
    });
  }

  function computeFitScale() {
    const svg = diagramEl.querySelector("svg.tm-svg");
    if (!svg) {
      STATE.fitScale = 1.0;
      applyZoom();
      return;
    }

    const viewW = parseFloat(svg.getAttribute("data-view-width")) || svg.viewBox?.baseVal?.width || 0;
    const viewH = parseFloat(svg.getAttribute("data-view-height")) || svg.viewBox?.baseVal?.height || 0;
    if (!viewW || !viewH) {
      STATE.fitScale = 1.0;
      applyZoom();
      return;
    }

    const style = getComputedStyle(diagramEl);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const bounds = diagramEl.getBoundingClientRect();
    const availW = Math.max(0, bounds.width - padX);
    const availH = Math.max(0, bounds.height - padY);
    if (!availW || !availH) {
      STATE.fitScale = 1.0;
      applyZoom();
      return;
    }

    const fitMode = svg.getAttribute("data-fit-mode") || "contain";
    const fitRefW = fitMode === "tall-board" ? parseFloat(svg.getAttribute("data-fit-width")) || viewW : viewW;
    const fitRefH = fitMode === "tall-board" ? parseFloat(svg.getAttribute("data-fit-height")) || viewH : viewH;
    const fitW = availW / fitRefW;
    const fitH = availH / fitRefH;
    // For board-photo layouts, fit to width so panel height tracks actual board content.
    let fit = fitMode === "tall-board" ? fitW : Math.min(fitW, fitH);

    if (fitMode === "tall-board") {
      const maxFitForDefaultWidth = availW / (viewW * CONFIG.zoomBaseScale);
      if (Number.isFinite(maxFitForDefaultWidth) && maxFitForDefaultWidth > 0) {
        fit = Math.min(fit, maxFitForDefaultWidth * 0.995);
      }
    }

    STATE.fitScale = Math.max(0.1, Math.min(fit, 12));
    applyZoom();
  }

  const LOGIC = window.PinoutLogic || {};
  const parseEsphomeYaml =
    LOGIC.parseEsphomeYaml ||
    (() => ({
      ok: false,
      reason: "Pinout logic unavailable.",
      board: null,
      variant: null,
      psramMode: null,
      usedPins: new Map(),
      unresolved: [],
      substitutions: {},
    }));
  const resolveTemplates = LOGIC.resolveTemplates || ((str) => str);

  function escapeXml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const PINOUT_BASE_URI = document.body.getAttribute("data-pinout-base") || "";
  const PINOUT_INDEX_URI = document.body.getAttribute("data-pinout-index") || "";

  const PINOUT_DATA = {
    index: null,
    indexPromise: null,
    defCache: new Map(),
    defPromises: new Map(),
  };

  async function fetchJson(url) {
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("Failed to load pinout data:", url, err);
      return null;
    }
  }

  async function loadPinoutIndex() {
    if (PINOUT_DATA.index) return PINOUT_DATA.index;
    if (!PINOUT_INDEX_URI) return null;
    if (!PINOUT_DATA.indexPromise) {
      PINOUT_DATA.indexPromise = fetchJson(PINOUT_INDEX_URI).then((data) => {
        PINOUT_DATA.index = data;
        return data;
      });
    }
    return PINOUT_DATA.indexPromise;
  }

  function resolvePinoutUrl(relPath) {
    if (!relPath || !PINOUT_BASE_URI) return null;
    try {
      return new URL(relPath, PINOUT_BASE_URI).toString();
    } catch {
      return null;
    }
  }

  async function loadPinoutDefinition(relPath) {
    if (!relPath) return null;
    if (PINOUT_DATA.defCache.has(relPath)) return PINOUT_DATA.defCache.get(relPath);
    if (PINOUT_DATA.defPromises.has(relPath)) return PINOUT_DATA.defPromises.get(relPath);

    const url = resolvePinoutUrl(relPath);
    const promise = fetchJson(url).then((data) => {
      if (data) PINOUT_DATA.defCache.set(relPath, data);
      PINOUT_DATA.defPromises.delete(relPath);
      return data;
    });
    PINOUT_DATA.defPromises.set(relPath, promise);
    return promise;
  }

  function resolveBoardId(boardId, index) {
    if (!boardId) return null;
    if (index?.aliases && index.aliases[boardId]) return index.aliases[boardId];
    const lower = String(boardId).toLowerCase();
    if (index?.aliases && index.aliases[lower]) return index.aliases[lower];
    if (index?.boards && index.boards[lower]) return lower;
    if (index?.boardSocAliases && index.boardSocAliases[lower]) return lower;
    return boardId;
  }

  async function mergeSocRules(index, def) {
    if (!def || !index) return def;
    const socRef = def.socRef;
    if (!socRef || !index?.soc?.[socRef]) return def;

    const socDef = await loadPinoutDefinition(index.soc[socRef]);
    if (!socDef) return def;

    const mergedIssues = [
      ...(Array.isArray(socDef.pinIssues) ? socDef.pinIssues : []),
      ...(Array.isArray(def.pinIssues) ? def.pinIssues : []),
    ];

    return {
      ...def,
      variant: def.variant || socDef.variant || socRef,
      pinIssues: mergedIssues.length ? mergedIssues : undefined,
    };
  }

  async function getBoardDefinition(parsed) {
    const index = await loadPinoutIndex();
    const boardId = resolveBoardId(parsed.board, index);

    if (index && boardId && index.boards && index.boards[boardId]) {
      const def = await loadPinoutDefinition(index.boards[boardId]);
      if (def) return mergeSocRules(index, def);
    }

    if (index && boardId && index.boardSocAliases && index.boardSocAliases[boardId]) {
      const alias = index.boardSocAliases[boardId];
      const socKey = alias?.soc;
      const socPath = socKey && index.soc ? index.soc[socKey] : null;
      const socDef = await loadPinoutDefinition(socPath);
      if (socDef) {
        const def = {
          ...socDef,
          id: boardId,
          socRef: socKey,
          displayName: alias.displayName || socDef.displayName,
          variant: socDef.variant || socKey,
        };
        return mergeSocRules(index, def);
      }
    }

    const variant = (parsed.variant || "").toLowerCase();
    if (index && variant && index.soc && index.soc[variant]) {
      const def = await loadPinoutDefinition(index.soc[variant]);
      if (def) return mergeSocRules(index, def);
    }

    return { kind: "unknown", displayName: boardId ? `Unknown board: ${boardId}` : "Unknown board", gpios: [] };
  }

  function getPinIssues(boardDef, parsed, gpio) {
    if (gpio == null || Number.isNaN(gpio)) return [];
    const rules = Array.isArray(boardDef?.pinIssues) ? boardDef.pinIssues : [];
    if (!rules.length) return [];

    const psramMode = (parsed?.psramMode || "").toLowerCase();
    const issues = [];

    for (const rule of rules) {
      if (!rule || !rule.severity || !rule.text) continue;

      const gpios = Array.isArray(rule.gpios) ? rule.gpios : null;
      const range = Array.isArray(rule.gpioRange) && rule.gpioRange.length === 2 ? rule.gpioRange : null;
      const ranges = Array.isArray(rule.gpioRanges) ? rule.gpioRanges : null;

      let matches = false;
      if (gpios && gpios.includes(gpio)) matches = true;
      if (!matches && range) matches = gpio >= range[0] && gpio <= range[1];
      if (!matches && ranges) {
        for (const r of ranges) {
          if (Array.isArray(r) && r.length === 2 && gpio >= r[0] && gpio <= r[1]) {
            matches = true;
            break;
          }
        }
      }
      if (!matches) continue;

      const when = rule.when || {};
      if (when.psramModeIncludes && !psramMode.includes(String(when.psramModeIncludes).toLowerCase())) continue;
      if (when.psramModeExcludes && psramMode.includes(String(when.psramModeExcludes).toLowerCase())) continue;

      issues.push({ severity: rule.severity, text: rule.text });
    }

    return issues;
  }

  function severityRank(sev) {
    if (sev === "danger") return 3;
    if (sev === "warn") return 2;
    if (sev === "info") return 1;
    return 0;
  }

  function buildUsageLabel(u) {
    const parts = [];
    if (u.section) parts.push(u.section);
    if (u.platform) parts.push(u.platform);
    const head = parts.length ? parts.join(" / ") : "component";
    const idPart = u.id ? `id: ${u.id}` : null;
    const namePart = u.name ? `name: ${u.name}` : null;
    const meta = [idPart, namePart].filter(Boolean).join(", ");
    return meta ? `${head} (${meta})` : head;
  }

  function buildBoardTitleLines(boardDef, parsed) {
    const displayName = String(boardDef?.displayName || "").trim();
    const boardId = String(parsed?.board || "").trim();

    if (displayName && boardId && displayName.toLowerCase() !== boardId.toLowerCase()) {
      return { line1: displayName, line2: boardId };
    }
    return { line1: displayName || boardId || "Board", line2: null };
  }

  function buildIssuesSummary(parsed, boardDef) {
    const issuesByGpio = new Map();
    const variant = (parsed.variant || "").toLowerCase() || null;

    const availableGpios = new Set();
    if (boardDef.kind === "header-board") {
      for (const h of boardDef.headers) for (const p of h.pins) if (p.gpio != null) availableGpios.add(p.gpio);
    } else if (boardDef.kind === "soc-grid") {
      for (const g of boardDef.gpios || []) availableGpios.add(g);
    } else if (boardDef.kind === "svg-board") {
      for (const p of boardDef.pins || []) if (p.gpio != null) availableGpios.add(p.gpio);
    }

    for (const [gpio, usages] of parsed.usedPins.entries()) {
      const list = [];
      list.push(...getPinIssues(boardDef, parsed, gpio));
      if (availableGpios.size && !availableGpios.has(gpio))
        list.push({ severity: "danger", text: "GPIO not present or not broken out on this board layout." });
      if (usages.some((u) => u.isGuessed))
        list.push({ severity: "warn", text: ISSUE_TEXT_GPIO_GUESSED });
      if (list.length) issuesByGpio.set(gpio, list);
    }

    return { issuesByGpio, availableGpios, variant };
  }

  function sameNormalizedLabel(a, b) {
    return (
      String(a || "")
        .replace(/\s+/g, "")
        .toUpperCase() ===
      String(b || "")
        .replace(/\s+/g, "")
        .toUpperCase()
    );
  }

  function gpioTag(gpio) {
    return gpio != null ? `GPIO${gpio}` : null;
  }

  function canonicalBoardTag(pin, gpio) {
    const raw = String(pin?.label || "").trim();
    if (!raw) return gpioTag(gpio) || "";

    const dMatch = raw.match(/\bD\s*([0-9]+)\b/i);
    if (dMatch) return `D${parseInt(dMatch[1], 10)}`;

    const gpioMatch = raw.match(/\bGPIO\s*([0-9]+)\b/i);
    if (gpioMatch) return `GPIO${parseInt(gpioMatch[1], 10)}`;

    return raw.replace(/\s+/g, " ").trim();
  }

  function formatPinTagForStyle(pin, gpio, labelStyle) {
    const boardTag = canonicalBoardTag(pin, gpio);
    const gpioLabel = gpioTag(gpio);

    if (!gpioLabel) return boardTag || "";
    if (labelStyle === LABEL_STYLES.GPIO) return gpioLabel;

    if (boardTag && !sameNormalizedLabel(boardTag, gpioLabel)) return boardTag;
    return gpioLabel;
  }

  function getBoardPins(boardDef) {
    if (boardDef?.kind === "header-board") {
      return (boardDef.headers || []).flatMap((h) => (Array.isArray(h?.pins) ? h.pins : []));
    }
    if (boardDef?.kind === "svg-board") {
      return Array.isArray(boardDef.pins) ? boardDef.pins : [];
    }
    return [];
  }

  function getAvailableLabelStyles(boardDef) {
    const styles = new Set();
    const pins = getBoardPins(boardDef);
    const gpioPins = pins.filter((p) => p && p.gpio != null);

    if (gpioPins.length) styles.add(LABEL_STYLES.GPIO);

    function isTrivialAliasForGpio(boardTag, gpio) {
      if (!boardTag || gpio == null) return false;

      if (sameNormalizedLabel(boardTag, gpioTag(gpio))) return true;

      // Treat numeric aliases like "4", "IO4", or "D4" as equivalent to GPIO4.
      const numericAliasMatch = boardTag.match(/^(?:GPIO|IO|D)?\s*([0-9]+)$/i);
      if (!numericAliasMatch) return false;
      return parseInt(numericAliasMatch[1], 10) === gpio;
    }

    const meaningfulDiffCount = gpioPins.filter((p) => {
      const boardTag = canonicalBoardTag(p, p.gpio);
      if (!boardTag) return false;
      if (isTrivialAliasForGpio(boardTag, p.gpio)) return false;
      return true;
    }).length;

    const diffRatio = gpioPins.length ? meaningfulDiffCount / gpioPins.length : 0;
    const hasMeaningfulAliases = meaningfulDiffCount >= 2 && diffRatio >= 0.2;

    if (hasMeaningfulAliases) styles.add(LABEL_STYLES.BOARD);

    return styles;
  }

  function pickActiveLabelStyle(availableStyles, preferredStyle) {
    if (availableStyles.has(preferredStyle)) return preferredStyle;
    if (availableStyles.has(LABEL_STYLES.BOARD)) return LABEL_STYLES.BOARD;
    if (availableStyles.has(LABEL_STYLES.GPIO)) return LABEL_STYLES.GPIO;
    return LABEL_STYLES.GPIO;
  }

  function updateLabelStyleControl(boardDef) {
    const availableStyles = getAvailableLabelStyles(boardDef);
    const activeStyle = pickActiveLabelStyle(availableStyles, STATE.labelStylePreference);
    STATE.activeLabelStyle = activeStyle;

    if (!labelStyleWrapEl || !labelStyleSelectEl) return;

    let visibleOptions = 0;
    for (const option of labelStyleSelectEl.options) {
      const available = availableStyles.has(option.value);
      option.hidden = !available;
      option.disabled = !available;
      if (available) visibleOptions += 1;
    }

    labelStyleSelectEl.value = activeStyle;
    const showControl = visibleOptions > 1;
    labelStyleWrapEl.hidden = !showControl;
    labelStyleWrapEl.style.display = showControl ? "" : "none";
  }

  function buildHeaderBoardSvg({ boardDef, parsed, issuesByGpio, labelStyle }) {
    const left = boardDef.headers.find((h) => h.side === "left");
    const right = boardDef.headers.find((h) => h.side === "right");
    const nPins = Math.max(left?.pins.length ?? 0, right?.pins.length ?? 0);
    const titleLines = buildBoardTitleLines(boardDef, parsed);
    const subtitleText = [
      parsed.variant ? `variant: ${parsed.variant}` : null,
      parsed.psramMode ? `psram: ${parsed.psramMode}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const hasSubtitle = subtitleText.length > 0;
    const titleOffset = titleLines.line2 ? 18 : 0;
    const subtitleOffset = hasSubtitle ? 16 : 0;

    const boardY = 44 + titleOffset + subtitleOffset;
    const marginTop = boardY + 24;
    const marginBottom = 76;
    const spacing = 44;
    const H = marginTop + marginBottom + (nPins - 1) * spacing + 40;

    const pad = 18;
    const gapTextToPin = 18;
    const gapPinToBoard = 18;
    const boardW = 260;
    const boardH = H - 108;
    const labelMeasureCanvas = document.createElement("canvas");
    const labelMeasureCtx = labelMeasureCanvas.getContext("2d");

    const labelCache = new Map();
    function pinLabelLines(pinObj) {
      if (labelCache.has(pinObj)) return labelCache.get(pinObj);
      const gpio = pinObj?.gpio;
      const primary =
        formatPinTagForStyle(pinObj, gpio, labelStyle) || pinObj?.label || (gpio != null ? `GPIO${gpio}` : "");
      const usageLabel = gpio != null ? bestUsageLabelForGpio(gpio, parsed) : null;
      const secondary = usageLabel || "";
      const lines = { primary, secondary };
      labelCache.set(pinObj, lines);
      return lines;
    }

    function estimateTextWidth(text, font = "800 12px system-ui") {
      const t = text ? String(text) : "";
      if (!t.length) return 0;
      if (!labelMeasureCtx) return t.length * 6.8;
      labelMeasureCtx.font = font;
      return labelMeasureCtx.measureText(t).width;
    }

    function maxLabelWidth(pins) {
      let max = 0;
      for (const p of pins || []) {
        const lines = pinLabelLines(p);
        max = Math.max(
          max,
          estimateTextWidth(lines.primary, "800 12px system-ui"),
          estimateTextWidth(lines.secondary, "700 11px system-ui"),
        );
      }
      return max;
    }

    const leftTextW = Math.max(90, Math.ceil(maxLabelWidth(left?.pins)));
    const rightTextW = Math.max(90, Math.ceil(maxLabelWidth(right?.pins)));

    const leftTextX = pad + leftTextW;
    const leftPinX = leftTextX + gapTextToPin;
    const boardX = leftPinX + gapPinToBoard;
    const rightPinX = boardX + boardW + gapPinToBoard;
    const rightTextX = rightPinX + gapTextToPin;
    const W = rightTextX + rightTextW + pad;
    const boardCenterX = boardX + boardW / 2;
    const boardCenterY = boardY + boardH / 2;

    function pinClasses(gpio, type) {
      const isUsed = gpio != null && parsed.usedPins.has(gpio);
      const issues = gpio != null ? issuesByGpio.get(gpio) || [] : [];
      const worst = issues.reduce(
        (acc, it) => (severityRank(it.severity) > severityRank(acc) ? it.severity : acc),
        "none",
      );

      const cls = ["tm-pin"];
      if (type === "power") cls.push("tm-power");
      if (type === "ground") cls.push("tm-ground");
      if (type === "reset") cls.push("tm-reset");
      if (gpio != null) cls.push("tm-gpio");
      if (isUsed) cls.push("tm-used");
      if (worst === "danger") cls.push("tm-danger");
      if (worst === "warn") cls.push("tm-warn");
      if (worst === "info") cls.push("tm-info");
      if (isUsed) cls.push("tm-clickable");
      return cls.join(" ");
    }

    function pinTitle(gpio, pinObj, headerName) {
      const lines = [];
      const baseLabel = pinObj?.label || (gpio != null ? `GPIO${gpio}` : "(no label)");
      lines.push(`${headerName}-${pinObj.headerNo}: ${baseLabel}`);
      if (pinObj.type) lines.push(`Type: ${pinObj.type}`);
      if (gpio != null) lines.push(`GPIO${gpio}`);

      const usageLabel = gpio != null ? bestUsageLabelForGpio(gpio, parsed) : null;
      if (usageLabel) lines.push(`Usage label: ${usageLabel}`);

      const usages = gpio != null ? parsed.usedPins.get(gpio) || [] : [];
      if (usages.length) {
        lines.push("", "Used by:");
        for (const u of usages) {
          lines.push(`- ${buildUsageLabel(u)} @ line ${u.line} (${u.key})`);
        }
      } else if (gpio != null) {
        lines.push("", "Used by:", "- (not used in YAML)");
      }

      const issues = gpio != null ? issuesByGpio.get(gpio) || [] : [];
      if (issues.length) {
        lines.push("", "Warnings:");
        for (const it of issues) lines.push(`- [${it.severity}] ${it.text}`);
      }

      return lines.join("\n");
    }

    function lineTspan(text, x, dy, maxWidth, font) {
      const t = text || " ";
      const estimated = estimateTextWidth(t, font);
      const squeeze =
        maxWidth && estimated > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<tspan x="${x}" dy="${dy}"${squeeze}>${escapeXml(t)}</tspan>`;
    }

    function renderSide(header, side) {
      if (!header) return "";
      return header.pins
        .map((p, idx) => {
          const y = marginTop + idx * spacing;
          const isLeft = side === "left";
          const cx = isLeft ? leftPinX : rightPinX;
          const tx = isLeft ? leftTextX : rightTextX;
          const anchor = isLeft ? "end" : "start";
          const gpio = p.gpio;

          const lines = pinLabelLines(p);
          const maxWidth = isLeft ? leftTextW : rightTextW;

          return `
          <g class="${pinClasses(gpio, p.type)}" data-gpio="${gpio ?? ""}">
            <title>${escapeXml(pinTitle(gpio, p, header.name))}</title>
            <circle cx="${cx}" cy="${y}" r="10" class="tm-pin-dot"></circle>
            <text
              x="${tx}"
              y="${y + 2}"
              class="tm-pin-text ${gpio != null && parsed.usedPins.has(gpio) ? "tm-clickable" : ""}"
              text-anchor="${anchor}"
              dominant-baseline="middle"
              data-gpio="${gpio ?? ""}"
            >
              ${lineTspan(lines.primary, tx, "-6", maxWidth, "800 12px system-ui")}
              ${lineTspan(lines.secondary, tx, "14", maxWidth, "700 11px system-ui")}
            </text>
          </g>
        `;
        })
        .join("\n");
    }

    return `
    <svg class="tm-svg"
         viewBox="0 0 ${W} ${H}"
         data-view-width="${W}"
         data-view-height="${H}"
         data-board-center-x="${boardCenterX}"
         data-board-center-y="${boardCenterY}"
         style="width:${W}px; height:${H}px;"
         role="img"
         aria-label="GPIO pinout">
      <defs>
        <filter id="tmShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.35"/>
        </filter>
      </defs>

      <rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" rx="14" class="tm-board" filter="url(#tmShadow)"></rect>

      <text x="${boardCenterX}" y="26" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
      ${titleLines.line2 ? `<text x="${boardCenterX}" y="44" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
      ${hasSubtitle ? `<text x="${boardCenterX}" y="${titleLines.line2 ? 62 : 44}" class="tm-subtitle" text-anchor="middle">${escapeXml(subtitleText)}</text>` : ""}

      ${renderSide(left, "left")}
      ${renderSide(right, "right")}
    </svg>
  `;
  }

  function buildSocGridSvg({ boardDef, parsed, issuesByGpio }) {
    const gpios = boardDef.gpios || [];
    const titleLines = buildBoardTitleLines(boardDef, parsed);
    const subtitleText = [
      parsed.board ? `board: ${parsed.board}` : null,
      parsed.psramMode ? `psram: ${parsed.psramMode}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const hasSubtitle = subtitleText.length > 0;

    const cols = 6;
    const cellW = 140;
    const cellH = 64;
    const pad = 18;
    const headerH = hasSubtitle ? (titleLines.line2 ? 92 : 74) : titleLines.line2 ? 70 : 50;
    const subtitleY = titleLines.line2 ? 76 : 58;

    const rows = Math.ceil(gpios.length / cols);
    const W = pad * 2 + cols * cellW;
    const H = headerH + pad * 2 + rows * cellH + 20;
    const boardCenterX = W / 2;
    const boardCenterY = H / 2;

    function worstSeverity(gpio) {
      const issues = issuesByGpio.get(gpio) || [];
      return issues.reduce((acc, it) => (severityRank(it.severity) > severityRank(acc) ? it.severity : acc), "none");
    }

    function clsFor(gpio) {
      const cls = ["tm-soc-cell"];
      if (parsed.usedPins.has(gpio)) cls.push("tm-used");
      const worst = worstSeverity(gpio);
      if (worst === "danger") cls.push("tm-danger");
      else if (worst === "warn") cls.push("tm-warn");
      else if (worst === "info") cls.push("tm-info");
      if (parsed.usedPins.has(gpio)) cls.push("tm-clickable");
      return cls.join(" ");
    }

    function cellTitle(gpio) {
      const lines = [`GPIO${gpio}`];
      const usages = parsed.usedPins.get(gpio) || [];
      if (usages.length) {
        lines.push("", "Used by:");
        for (const u of usages) lines.push(`- ${buildUsageLabel(u)} @ line ${u.line} (${u.key})`);
      }
      const issues = issuesByGpio.get(gpio) || [];
      if (issues.length) {
        lines.push("", "Warnings:");
        for (const it of issues) lines.push(`- [${it.severity}] ${it.text}`);
      }
      return lines.join("\n");
    }

    const cells = gpios
      .map((gpio, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const x = pad + c * cellW;
        const y = headerH + pad + r * cellH;
        return `
          <g class="${clsFor(gpio)}" data-gpio="${gpio}">
            <title>${escapeXml(cellTitle(gpio))}</title>
            <rect x="${x}" y="${y}" width="${cellW - 10}" height="${cellH - 10}" rx="12" class="tm-soc-rect"></rect>
            <text x="${x + (cellW - 10) / 2}" y="${y + 36}" text-anchor="middle" class="tm-soc-text">GPIO${gpio}</text>
          </g>
        `;
      })
      .join("\n");

    return `
      <svg class="tm-svg"
           viewBox="0 0 ${W} ${H}"
           data-view-width="${W}"
           data-view-height="${H}"
           data-board-center-x="${boardCenterX}"
           data-board-center-y="${boardCenterY}"
           style="width:${W}px; height:${H}px;"
           role="img"
           aria-label="GPIO grid">
        <text x="${boardCenterX}" y="34" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
        ${titleLines.line2 ? `<text x="${boardCenterX}" y="54" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
        ${hasSubtitle ? `<text x="${boardCenterX}" y="${subtitleY}" class="tm-subtitle" text-anchor="middle">${escapeXml(subtitleText)}</text>` : ""}
        ${cells}
      </svg>
    `;
  }

  function buildSvgBoardSvg({ boardDef, parsed, issuesByGpio, boardSvgUrl, labelStyle }) {
    const pins = Array.isArray(boardDef.pins) ? boardDef.pins : [];
    const sizeMm = boardDef.sizeMm || {};
    const widthMm = Number(sizeMm.width);
    const heightMm = Number(sizeMm.height);

    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
      return `
        <div class="tm-empty">
          <div class="tm-empty-title">Invalid board layout</div>
          <div class="tm-empty-body">Board SVG metadata is incomplete for this board definition.</div>
        </div>
      `;
    }

    const mmScale = 12;
    const titleLines = buildBoardTitleLines(boardDef, parsed);
    const subtitleText = [
      parsed.variant ? `variant: ${parsed.variant}` : null,
      parsed.psramMode ? `psram: ${parsed.psramMode}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const hasSubtitle = subtitleText.length > 0;
    const titleY = 30;
    const titleLine2Y = 50;
    const subtitleY = titleLines.line2 ? 72 : 54;
    const lastHeaderY = hasSubtitle ? subtitleY : titleLines.line2 ? titleLine2Y : titleY;
    const boardX = 24;
    const boardY = lastHeaderY + 20;
    const boardW = widthMm * mmScale;
    const boardH = heightMm * mmScale;
    const pinR = 7;
    const labelOffsetX = 22;
    const labelOffsetY = 4;
    const labelHeight = 14;
    const maxLabelChars = 44;
    const maxLabelWidth = 340;
    const fitReferenceWidth = boardW + 2 * (maxLabelWidth + labelOffsetX + 24);
    const fitReferenceHeight = boardH + boardY + (titleLines.line2 ? 44 : 42);
    const labelMeasureCanvas = document.createElement("canvas");
    const labelMeasureCtx = labelMeasureCanvas.getContext("2d");

    function worstSeverity(gpio) {
      if (gpio == null) return "none";
      const issues = issuesByGpio.get(gpio) || [];
      return issues.reduce((acc, it) => (severityRank(it.severity) > severityRank(acc) ? it.severity : acc), "none");
    }

    function pinClasses(pin) {
      const gpio = pin?.gpio;
      const cls = ["tm-pin"];
      if (pin?.type === "power") cls.push("tm-power");
      if (pin?.type === "ground") cls.push("tm-ground");
      if (pin?.type === "reset") cls.push("tm-reset");
      if (gpio != null) cls.push("tm-gpio");

      if (gpio != null && parsed.usedPins.has(gpio)) cls.push("tm-used", "tm-clickable");

      const worst = worstSeverity(gpio);
      if (worst === "danger") cls.push("tm-danger");
      else if (worst === "warn") cls.push("tm-warn");
      else if (worst === "info") cls.push("tm-info");

      return cls.join(" ");
    }

    function pinTitle(pin) {
      const lines = [];
      const gpio = pin?.gpio;
      const pinLabel = pin?.label || "(no label)";
      const pinTag = formatPinTagForStyle(pin, gpio, labelStyle);
      lines.push(pinTag || pinLabel);

      const boardTag = canonicalBoardTag(pin, gpio);
      if (pinLabel && boardTag && !sameNormalizedLabel(pinLabel, boardTag)) lines.push(`Board label: ${pinLabel}`);

      const targetRaw = pin?.targetRaw ? String(pin.targetRaw).trim() : null;
      if (targetRaw && !(gpio != null && /^GPIO\s*\d+$/i.test(targetRaw))) {
        lines.push(`Target: ${targetRaw}`);
      }

      const usages = gpio != null ? parsed.usedPins.get(gpio) || [] : [];
      if (usages.length) {
        lines.push("Used by:");
        for (const u of usages) lines.push(`- ${buildUsageLabel(u)} @ line ${u.line} (${u.key})`);
      } else if (gpio != null) {
        lines.push("Not used in current YAML.");
      }

      const issues = gpio != null ? issuesByGpio.get(gpio) || [] : [];
      if (issues.length) {
        for (const it of issues) lines.push(`[${it.severity}] ${it.text}`);
      }

      return lines.join("\n");
    }

    function bestUsageNameOrIdForGpio(gpio) {
      const uses = parsed.usedPins.get(gpio) || [];
      if (!uses.length) return null;

      const pick =
        uses.find((u) => u?.name && String(u.name).trim().length) ||
        uses.find((u) => u?.id && String(u.id).trim().length) ||
        null;
      if (!pick) return null;

      const name = pick?.name ? resolveTemplates(pick.name, parsed.substitutions) : null;
      const id = pick?.id ? resolveTemplates(pick.id, parsed.substitutions) : null;
      return name || id || null;
    }

    function buildPinLabel(pin, gpio, placeRight) {
      const pinTag = compactLabelText(formatPinTagForStyle(pin, gpio, labelStyle));
      if (!pinTag) return null;
      const usageName = gpio != null ? bestUsageNameOrIdForGpio(gpio) : null;
      if (!usageName) {
        return {
          pinTag,
          usageName: null,
          pinFirst: true,
          fullText: pinTag,
        };
      }

      const compactUsageName = compactLabelText(usageName);
      const pinFirst = placeRight;
      const fullText = pinFirst ? `${pinTag} ${compactUsageName}` : `${compactUsageName} ${pinTag}`;
      return {
        pinTag,
        usageName: compactUsageName,
        pinFirst,
        fullText,
      };
    }

    function compactLabelText(raw) {
      const input = String(raw || "").trim();
      if (!input) return "";

      // Keep labels useful, but bounded so they don't dominate scaling.
      const stripped = input.replace(/\s+/g, " ").trim();

      if (stripped.length <= maxLabelChars) return stripped;
      return `${stripped.slice(0, maxLabelChars - 1)}…`;
    }

    function measureTextWidth(text, font) {
      const content = String(text || "");
      if (!content.length) return 0;
      if (!labelMeasureCtx) return content.length * 7.4;
      labelMeasureCtx.font = font;
      return labelMeasureCtx.measureText(content).width;
    }

    function estimateRenderedLabelWidth(label) {
      if (!label) return 0;
      const tagW = measureTextWidth(label.pinTag || "", "900 11px system-ui");
      const nameW = measureTextWidth(label.usageName || "", "600 11px system-ui");
      const sepW = label.usageName ? measureTextWidth(" ", "600 11px system-ui") : 0;
      // Include stroke (paint-order) and a small safety margin.
      return Math.ceil(tagW + nameW + sepW + 16);
    }

    const renderPins = [];
    let minX = boardX - pinR - 4;
    let maxX = boardX + boardW + pinR + 4;
    let minY = boardY - pinR - 4;
    let maxY = boardY + boardH + pinR + 4;

    for (const pin of pins) {
      const px = boardX + Number(pin.x) * mmScale;
      const py = boardY + Number(pin.y) * mmScale;
      const gpio = pin.gpio;
      const placeRight = px >= boardX + boardW / 2;
      const label = buildPinLabel(pin, gpio, placeRight);

      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

      minX = Math.min(minX, px - pinR);
      maxX = Math.max(maxX, px + pinR);
      minY = Math.min(minY, py - pinR);
      maxY = Math.max(maxY, py + pinR);

      let text = null;
      if (gpio != null && label?.fullText) {
        const estimatedWidth = Math.max(48, estimateRenderedLabelWidth(label));
        const textWidth = Math.min(maxLabelWidth, estimatedWidth);
        const tx = placeRight ? px + labelOffsetX : px - labelOffsetX;
        const ty = py + labelOffsetY;

        if (placeRight) {
          minX = Math.min(minX, tx);
          maxX = Math.max(maxX, tx + textWidth);
        } else {
          minX = Math.min(minX, tx - textWidth);
          maxX = Math.max(maxX, tx);
        }
        minY = Math.min(minY, ty - labelHeight);
        maxY = Math.max(maxY, ty + 4);

        text = {
          pinTag: label.pinTag,
          usageName: label.usageName,
          pinFirst: label.pinFirst,
          x: tx,
          y: ty,
          anchor: placeRight ? "start" : "end",
        };
      }

      renderPins.push({ pin, gpio, px, py, text });
    }

    const padX = 30;
    const padY = 20;
    const renderMinX = minX - padX;
    const renderMaxX = maxX + padX;
    const W = Math.ceil(Math.max(1, renderMaxX - renderMinX));
    const shiftX = -renderMinX;
    const shiftY = minY < padY ? padY - minY : 0;
    const H = Math.ceil(maxY + shiftY + padY);

    const boardRenderX = boardX + shiftX;
    const boardRenderY = boardY + shiftY;
    const boardRenderCenterX = boardRenderX + boardW / 2;
    const boardRenderCenterY = boardRenderY + boardH / 2;
    const pinLayers = renderPins
      .map((item) => {
        const px = item.px + shiftX;
        const py = item.py + shiftY;
        const textClass =
          item.gpio != null && parsed.usedPins.has(item.gpio) ? "tm-svg-pin-label tm-clickable" : "tm-svg-pin-label";
        const labelSpans = item.text
          ? item.text.usageName
            ? item.text.pinFirst
              ? `<tspan class="tm-svg-pin-tag">${escapeXml(item.text.pinTag)}</tspan><tspan class="tm-svg-pin-name"> ${escapeXml(item.text.usageName)}</tspan>`
              : `<tspan class="tm-svg-pin-name">${escapeXml(item.text.usageName)} </tspan><tspan class="tm-svg-pin-tag">${escapeXml(item.text.pinTag)}</tspan>`
            : `<tspan class="tm-svg-pin-tag">${escapeXml(item.text.pinTag)}</tspan>`
          : "";
        const text = item.text
          ? `<text x="${item.text.x + shiftX}" y="${item.text.y + shiftY}" text-anchor="${item.text.anchor}" class="${textClass}" data-gpio="${item.gpio ?? ""}">${labelSpans}</text>`
          : "";
        return `
          <g class="${pinClasses(item.pin)}" data-gpio="${item.gpio ?? ""}">
            <title>${escapeXml(pinTitle(item.pin))}</title>
            <circle cx="${px}" cy="${py}" r="${pinR}" class="tm-pin-dot"></circle>
            ${text}
          </g>
        `;
      })
      .join("\n");

    return `
      <svg class="tm-svg"
           viewBox="0 0 ${W} ${H}"
           data-view-width="${W}"
           data-view-height="${H}"
           data-board-center-x="${boardRenderCenterX}"
           data-board-center-y="${boardRenderCenterY}"
           data-fit-width="${Math.ceil(fitReferenceWidth)}"
           data-fit-height="${Math.ceil(fitReferenceHeight)}"
           data-fit-mode="tall-board"
           style="width:${W}px; height:${H}px;"
           role="img"
           aria-label="GPIO board layout">
        <defs>
          <filter id="tmShadowSvgBoard" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.35"/>
          </filter>
        </defs>
        <text x="${boardRenderCenterX}" y="${titleY}" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
        ${titleLines.line2 ? `<text x="${boardRenderCenterX}" y="${titleLine2Y}" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
        ${hasSubtitle ? `<text x="${boardRenderCenterX}" y="${subtitleY}" class="tm-subtitle" text-anchor="middle">${escapeXml(subtitleText)}</text>` : ""}
        <rect x="${boardRenderX}" y="${boardRenderY}" width="${boardW}" height="${boardH}" class="tm-board" filter="url(#tmShadowSvgBoard)"></rect>
        ${
          boardSvgUrl
            ? `<image href="${escapeXml(boardSvgUrl)}" x="${boardRenderX}" y="${boardRenderY}" width="${boardW}" height="${boardH}" preserveAspectRatio="none" class="tm-board-image"></image>`
            : ""
        }
        ${pinLayers}
      </svg>
    `;
  }

  function bestUsageLabelForGpio(gpio, parsed) {
    const uses = parsed.usedPins.get(gpio) || [];
    if (!uses.length) return null;

    const pick =
      uses.find((u) => u?.name && String(u.name).trim().length) ||
      uses.find((u) => u?.id && String(u.id).trim().length) ||
      uses[0];

    const name = pick?.name ? resolveTemplates(pick.name, parsed.substitutions) : null;
    const id = pick?.id ? resolveTemplates(pick.id, parsed.substitutions) : null;

    let label = null;
    if (name && id) label = `${name} (id: ${id})`;
    else label = name || id || null;

    if (label && uses.length > 1) label += ` +${uses.length - 1}`;
    return label;
  }

  async function renderFromPayload(payload) {
    if (!payload || !payload.ok) {
      STATE.lastPayload = payload || null;
      const reason = payload?.reason || "No data available.";
      if (subtitleEl) subtitleEl.textContent = reason;
      if (labelStyleWrapEl) labelStyleWrapEl.hidden = true;
      diagramEl.innerHTML = `
        <div class="tm-empty">
          <div class="tm-empty-title">No ESPHome YAML</div>
          <div class="tm-empty-body">${escapeHtml(reason)}</div>
        </div>
      `;
      sideEl.innerHTML = "";
      STATE.lastSig = null;
      return;
    }

    STATE.lastPayload = payload;
    const yamlText = payload.yamlText || "";
    const source = payload.fileName ? `${payload.fileName}${payload.isDirty ? " (unsaved)" : ""}` : "Active Editor";

    const sig = `${source}|${yamlText.length}|${STATE.labelStylePreference}`;
    if (sig === STATE.lastSig) return;
    STATE.lastSig = sig;
    const renderSig = sig;

    if (subtitleEl) subtitleEl.textContent = `YAML source: ${source}`;

    const parsed = parseEsphomeYaml(yamlText);
    if (!parsed.ok) {
      if (labelStyleWrapEl) labelStyleWrapEl.hidden = true;
      diagramEl.innerHTML = `
        <div class="tm-empty">
          <div class="tm-empty-title">Not an ESPHome YAML</div>
          <div class="tm-empty-body">${escapeHtml(parsed.reason || "")}</div>
        </div>
      `;
      sideEl.innerHTML = "";
      return;
    }

    const boardDef = (await getBoardDefinition(parsed)) || { kind: "unknown", displayName: "Unknown board", gpios: [] };
    if (STATE.lastSig !== renderSig) return;
    updateLabelStyleControl(boardDef);
    const { issuesByGpio, availableGpios, variant } = buildIssuesSummary(parsed, boardDef);
    const boardSvgUrl = boardDef.kind === "svg-board" ? resolvePinoutUrl(boardDef.svgPath) : null;

    const svg =
      boardDef.kind === "header-board"
        ? buildHeaderBoardSvg({ boardDef, parsed, issuesByGpio, labelStyle: STATE.activeLabelStyle })
        : boardDef.kind === "soc-grid"
          ? buildSocGridSvg({ boardDef, parsed, issuesByGpio })
          : boardDef.kind === "svg-board"
            ? buildSvgBoardSvg({ boardDef, parsed, issuesByGpio, boardSvgUrl, labelStyle: STATE.activeLabelStyle })
            : `
        <div class="tm-empty">
          <div class="tm-empty-title">No layout available</div>
          <div class="tm-empty-body">
            board: <code>${escapeHtml(parsed.board || "(none)")}</code><br/>
            variant: <code>${escapeHtml(parsed.variant || "(none)")}</code>
          </div>
        </div>
      `;

    diagramEl.innerHTML = `<div class="tm-zoom-layer">${svg}</div>`;
    requestAnimationFrame(() => {
      if (STATE.lastSig !== renderSig) return;
      computeFitScale();
    });

    diagramEl.querySelectorAll("[data-gpio]").forEach((el) => {
      const s = el.getAttribute("data-gpio");
      if (!s) return;
      const gpio = parseInt(s, 10);
      if (!Number.isFinite(gpio)) return;
      if (!parsed.usedPins.has(gpio)) return;

      el.classList.add("tm-clickable");
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const usages = parsed.usedPins.get(gpio) || [];
        if (!usages.length) return;
        const target = usages.find((u) => u.section !== "substitutions") || usages[0];
        vscode.postMessage({ type: "jump", line: target.line });
      });
    });

    const used = Array.from(parsed.usedPins.entries()).sort((a, b) => a[0] - b[0]);

    const usedHtml =
      used.length === 0
        ? `<div class="tm-muted">No <code>pin:</code> or <code>*_pin:</code> fields detected yet.</div>`
        : used
            .map(([gpio, usages]) => {
              const issues = issuesByGpio.get(gpio) || [];
              const worst = issues.reduce(
                (acc, it) => (severityRank(it.severity) > severityRank(acc) ? it.severity : acc),
                "none",
              );
              const isGuessed = issues.some((it) => it.text === ISSUE_TEXT_GPIO_GUESSED);
              const badge =
                worst === "danger"
                  ? `<span class="tm-badge tm-badge-danger">DANGER</span>`
                  : worst === "warn" && isGuessed
                    ? `<span class="tm-badge tm-badge-warn">GUESSED</span>`
                    : worst === "warn"
                      ? `<span class="tm-badge tm-badge-warn">WARN</span>`
                      : worst === "info"
                        ? `<span class="tm-badge tm-badge-info">INFO</span>`
                        : `<span class="tm-badge tm-badge-ok">OK</span>`;

              const usageLines = usages
                .map(
                  (u) => `
                  <div class="tm-usage-row">
                    <button class="tm-link" data-jump-line="${u.line}">line ${u.line}</button>
                    <span class="tm-usage-label">${escapeHtml(buildUsageLabel(u))}</span>
                    <span class="tm-usage-key">${escapeHtml(u.key)}</span>
                  </div>
                `,
                )
                .join("");

              const issueLines = issues.length
                ? `
                  <div class="tm-issues">
                    ${issues
                      .map(
                        (it) =>
                          `<div class="tm-issue tm-issue-${escapeHtml(it.severity)}">[${escapeHtml(it.severity)}] ${escapeHtml(it.text)}</div>`,
                      )
                      .join("")}
                  </div>
                `
                : "";

              return `
                <div class="tm-used-pin">
                  <div class="tm-used-pin-head">
                    <div class="tm-used-pin-title">GPIO${gpio}</div>
                    ${badge}
                  </div>
                  ${usageLines}
                  ${issueLines}
                </div>
              `;
            })
            .join("");

    const availability =
      availableGpios && availableGpios.size
        ? `<div class="tm-muted">Pins in layout: <b>${availableGpios.size}</b></div>`
        : `<div class="tm-muted">Pin availability unknown.</div>`;

    const unresolvedHtml =
      (parsed.unresolved || []).length === 0
        ? ""
        : `
      <div class="tm-section">
        <div class="tm-section-title">Unresolved Pins</div>
        ${parsed.unresolved
          .map(
            (u) => `
          <div class="tm-used-pin">
            <div class="tm-used-pin-head">
              <div class="tm-used-pin-title">${escapeHtml(u.rawValue)}</div>
              <span class="tm-badge tm-badge-warn">UNRESOLVED</span>
            </div>
            <div class="tm-usage-row">
              <button class="tm-link" data-jump-line="${u.line}">line ${u.line}</button>
              <span class="tm-usage-key">${escapeHtml(u.key)}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>`;

    sideEl.innerHTML = `
      <div class="tm-section">
        <div class="tm-section-title">Detected</div>
        <div class="tm-kv"><span>Board</span><code>${escapeHtml(parsed.board ?? "(none)")}</code></div>
        <div class="tm-kv"><span>Variant</span><code>${escapeHtml(parsed.variant ?? variant ?? "(none)")}</code></div>
        <div class="tm-kv"><span>PSRAM</span><code>${escapeHtml(parsed.psramMode ?? "(none)")}</code></div>
        <div class="tm-kv"><span>File</span><code>${escapeHtml(payload.fileName ?? "(unknown)")}</code></div>
        ${availability}
      </div>

      <div class="tm-section">
        <div class="tm-section-title">Used GPIOs</div>
        ${usedHtml}
      </div>

      ${unresolvedHtml}

      ${
        (parsed.unusedGpioSubstitutions || []).length === 0
          ? ""
          : `
      <div class="tm-section">
        <div class="tm-section-title">Unused GPIO Substitutions</div>
        ${parsed.unusedGpioSubstitutions
          .map(
            (s) => `
          <div class="tm-used-pin">
            <div class="tm-used-pin-head">
              <div class="tm-used-pin-title">GPIO${s.gpio}</div>
              <span class="tm-badge tm-badge-info">UNUSED</span>
            </div>
            <div class="tm-usage-row">
              <span class="tm-usage-label">\${${escapeHtml(s.key)}}: ${escapeHtml(s.value)}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>`
      }

      <div class="tm-footnote">
        Notes:
        <ul class="tm-ul">
          <li>Click a pin or line button to jump to that line in the editor.</li>
          <li>Zoom controls scale the diagram; the diagram area scrolls vertically.</li>
        </ul>
      </div>
    `;

    sideEl.querySelectorAll("[data-jump-line]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const ln = parseInt(btn.getAttribute("data-jump-line"), 10);
        if (!Number.isFinite(ln)) return;
        vscode.postMessage({ type: "jump", line: ln });
      });
    });
  }
})();
