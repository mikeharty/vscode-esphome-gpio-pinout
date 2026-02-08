(function () {
  "use strict";

  const vscode = acquireVsCodeApi();

  const CONFIG = {
    zoomMin: 0.75,
    zoomMax: 8.0,
    zoomStep: 0.25,
  };

  const STATE = {
    zoom: 1.0,
    fitScale: 1.0,
    lastSig: null,
  };

  const subtitleEl = document.getElementById("tm-esphome-pinout-subtitle");
  const diagramEl = document.getElementById("tm-esphome-pinout-diagram");
  const sideEl = document.getElementById("tm-esphome-pinout-side");

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
    () => {
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

    const scale = STATE.zoom * STATE.fitScale;
    const scaledW = Math.max(1, viewW * scale);
    const scaledH = Math.max(1, viewH * scale);

    layer.style.width = `${scaledW}px`;
    layer.style.height = `${scaledH}px`;
    layer.style.transform = "";
    svg.style.width = `${scaledW}px`;
    svg.style.height = `${scaledH}px`;
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
    const fit = fitMode === "tall-board" ? fitW : Math.min(fitW, fitH);
    STATE.fitScale = Math.max(0.1, Math.min(fit * 0.98, 12));
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

    for (const [gpio] of parsed.usedPins.entries()) {
      const list = [];
      list.push(...getPinIssues(boardDef, parsed, gpio));
      if (availableGpios.size && !availableGpios.has(gpio))
        list.push({ severity: "danger", text: "GPIO not present or not broken out on this board layout." });
      if (list.length) issuesByGpio.set(gpio, list);
    }

    return { issuesByGpio, availableGpios, variant };
  }

  function buildHeaderBoardSvg({ boardDef, parsed, issuesByGpio }) {
    const left = boardDef.headers.find((h) => h.side === "left");
    const right = boardDef.headers.find((h) => h.side === "right");
    const nPins = Math.max(left?.pins.length ?? 0, right?.pins.length ?? 0);
    const titleLines = buildBoardTitleLines(boardDef, parsed);
    const titleOffset = titleLines.line2 ? 18 : 0;

    const marginTop = 84 + titleOffset;
    const marginBottom = 76;
    const spacing = 44;
    const H = marginTop + marginBottom + (nPins - 1) * spacing + 40;

    const pad = 18;
    const gapTextToPin = 18;
    const gapPinToBoard = 18;
    const boardY = 60 + titleOffset;
    const boardW = 260;
    const boardH = H - 108;

    const labelCache = new Map();
    function pinLabelLines(pinObj) {
      if (labelCache.has(pinObj)) return labelCache.get(pinObj);
      const gpio = pinObj?.gpio;
      const primary = pinObj?.label || (gpio != null ? `GPIO${gpio}` : "");
      const usageLabel = gpio != null ? bestUsageLabelForGpio(gpio, parsed) : null;
      const secondary = usageLabel || "";
      const lines = { primary, secondary };
      labelCache.set(pinObj, lines);
      return lines;
    }

    function estimateTextWidth(text) {
      const t = text ? String(text) : "";
      return t.length * 6.6;
    }

    function maxLabelWidth(pins) {
      let max = 0;
      for (const p of pins || []) {
        const lines = pinLabelLines(p);
        max = Math.max(max, estimateTextWidth(lines.primary), estimateTextWidth(lines.secondary));
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

    function lineTspan(text, x, dy, maxWidth) {
      const t = text || " ";
      const estimated = estimateTextWidth(t);
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
              ${lineTspan(lines.primary, tx, "-6", maxWidth)}
              ${lineTspan(lines.secondary, tx, "14", maxWidth)}
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
         style="width:${W}px; height:${H}px;"
         role="img"
         aria-label="GPIO pinout">
      <defs>
        <filter id="tmShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.35"/>
        </filter>
      </defs>

      <rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" rx="14" class="tm-board" filter="url(#tmShadow)"></rect>

      <text x="${W / 2}" y="26" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
      ${titleLines.line2 ? `<text x="${W / 2}" y="44" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
      <text x="${W / 2}" y="${titleLines.line2 ? 62 : 44}" class="tm-subtitle" text-anchor="middle">
        ${escapeXml(
          [parsed.variant ? `variant: ${parsed.variant}` : null, parsed.psramMode ? `psram: ${parsed.psramMode}` : null]
            .filter(Boolean)
            .join(" | "),
        )}
      </text>

      ${renderSide(left, "left")}
      ${renderSide(right, "right")}
    </svg>
  `;
  }

  function buildSocGridSvg({ boardDef, parsed, issuesByGpio }) {
    const gpios = boardDef.gpios || [];
    const titleLines = buildBoardTitleLines(boardDef, parsed);

    const cols = 6;
    const cellW = 140;
    const cellH = 64;
    const pad = 18;
    const headerH = titleLines.line2 ? 92 : 74;

    const rows = Math.ceil(gpios.length / cols);
    const W = pad * 2 + cols * cellW;
    const H = headerH + pad * 2 + rows * cellH + 20;

    function worstSeverity(gpio) {
      const issues = issuesByGpio.get(gpio) || [];
      return issues.reduce((acc, it) => (severityRank(it.severity) > severityRank(acc) ? it.severity : acc), "none");
    }

    function clsFor(gpio) {
      const cls = ["tm-soc-cell"];
      if (parsed.usedPins.has(gpio)) cls.push("tm-used");
      const worst = worstSeverity(gpio);
      if (worst === "danger") cls.push("tm-danger");
      if (worst === "warn") cls.push("tm-warn");
      if (worst === "info") cls.push("tm-info");
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
           style="width:${W}px; height:${H}px;"
           role="img"
           aria-label="GPIO grid">
        <text x="${W / 2}" y="34" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
        ${titleLines.line2 ? `<text x="${W / 2}" y="54" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
        <text x="${W / 2}" y="${titleLines.line2 ? 76 : 58}" class="tm-subtitle" text-anchor="middle">
          ${escapeXml([parsed.board ? `board: ${parsed.board}` : null, parsed.psramMode ? `psram: ${parsed.psramMode}` : null].filter(Boolean).join(" | "))}
        </text>
        ${cells}
      </svg>
    `;
  }

  function buildSvgBoardSvg({ boardDef, parsed, issuesByGpio, boardSvgUrl }) {
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
    const boardX = 24;
    const boardY = titleLines.line2 ? 92 : 74;
    const boardW = widthMm * mmScale;
    const boardH = heightMm * mmScale;
    const pinR = 7;
    const labelOffsetX = 22;
    const labelOffsetY = 4;
    const labelCharW = 6.6;
    const labelHeight = 14;
    const maxLabelChars = 44;
    const maxLabelWidth = 280;
    const fitReferenceWidth = boardW + 2 * (maxLabelWidth + labelOffsetX + 24);
    const fitReferenceHeight = boardH + (titleLines.line2 ? 136 : 116);

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
      if (worst === "warn") cls.push("tm-warn");
      if (worst === "info") cls.push("tm-info");

      return cls.join(" ");
    }

    function pinTitle(pin) {
      const lines = [];
      const gpio = pin?.gpio;
      const pinLabel = pin?.label || "(no label)";
      const pinTag = shortPinTag(pin, gpio);
      const gpioLabel = gpio != null ? `GPIO${gpio}` : null;

      if (pinTag && gpioLabel && pinTag !== gpioLabel) lines.push(`${pinTag} (${gpioLabel})`);
      else lines.push(pinTag || gpioLabel || pinLabel);

      if (pinLabel && pinTag && pinLabel !== pinTag) lines.push(`Board label: ${pinLabel}`);

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

    function shortPinTag(pin, gpio) {
      const raw = String(pin?.label || "").trim();
      if (raw) {
        const dMatch = raw.match(/\bD\s*([0-9]+)\b/i);
        if (dMatch) return `D${parseInt(dMatch[1], 10)}`;

        const gpioMatch = raw.match(/\bGPIO\s*([0-9]+)\b/i);
        if (gpioMatch) return `GPIO${parseInt(gpioMatch[1], 10)}`;
      }

      if (gpio != null) return `GPIO${gpio}`;
      return raw || "";
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
      const pinTag = shortPinTag(pin, gpio);
      if (!pinTag) return null;
      const usageName = gpio != null ? bestUsageNameOrIdForGpio(gpio) : null;
      const compactPinTag = compactLabelText(pinTag);
      if (!usageName) {
        return {
          pinTag: compactPinTag,
          usageName: null,
          pinFirst: true,
          fullText: compactPinTag,
        };
      }

      const compactUsageName = compactLabelText(usageName);
      const pinFirst = placeRight;
      const fullText = pinFirst ? `${compactPinTag} ${compactUsageName}` : `${compactUsageName} ${compactPinTag}`;
      return {
        pinTag: compactPinTag,
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

    const renderPins = [];
    const boardCenterX = boardX + boardW / 2;
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
        const estimatedWidth = Math.max(40, String(label.fullText).length * labelCharW);
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

    const padX = 42;
    const padY = 20;
    const leftExtent = Math.max(0, boardCenterX - minX);
    const rightExtent = Math.max(0, maxX - boardCenterX);
    const halfSpanX = Math.max(leftExtent, rightExtent) + padX;
    const W = Math.ceil(halfSpanX * 2);
    const shiftX = W / 2 - boardCenterX;
    const shiftY = minY < padY ? padY - minY : 0;
    const H = Math.ceil(maxY + shiftY + padY);

    const boardRenderX = boardX + shiftX;
    const boardRenderY = boardY + shiftY;
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
        <text x="${W / 2}" y="30" class="tm-title" text-anchor="middle">${escapeXml(titleLines.line1)}</text>
        ${titleLines.line2 ? `<text x="${W / 2}" y="50" class="tm-title tm-title-secondary" text-anchor="middle">${escapeXml(titleLines.line2)}</text>` : ""}
        <text x="${W / 2}" y="${titleLines.line2 ? 72 : 54}" class="tm-subtitle" text-anchor="middle">
          ${escapeXml(
            [
              parsed.variant ? `variant: ${parsed.variant}` : null,
              parsed.psramMode ? `psram: ${parsed.psramMode}` : null,
            ]
              .filter(Boolean)
              .join(" | "),
          )}
        </text>
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
      const reason = payload?.reason || "No data available.";
      if (subtitleEl) subtitleEl.textContent = reason;
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

    const yamlText = payload.yamlText || "";
    const source = payload.fileName ? `${payload.fileName}${payload.isDirty ? " (unsaved)" : ""}` : "Active Editor";

    const sig = `${source}|${yamlText.length}`;
    if (sig === STATE.lastSig) return;
    STATE.lastSig = sig;
    const renderSig = sig;

    if (subtitleEl) subtitleEl.textContent = `YAML source: ${source}`;

    const parsed = parseEsphomeYaml(yamlText);
    if (!parsed.ok) {
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
    const { issuesByGpio, availableGpios, variant } = buildIssuesSummary(parsed, boardDef);
    const boardSvgUrl = boardDef.kind === "svg-board" ? resolvePinoutUrl(boardDef.svgPath) : null;

    const svg =
      boardDef.kind === "header-board"
        ? buildHeaderBoardSvg({ boardDef, parsed, issuesByGpio })
        : boardDef.kind === "soc-grid"
          ? buildSocGridSvg({ boardDef, parsed, issuesByGpio })
          : boardDef.kind === "svg-board"
            ? buildSvgBoardSvg({ boardDef, parsed, issuesByGpio, boardSvgUrl })
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
        vscode.postMessage({ type: "jump", line: usages[0].line });
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
              const badge =
                worst === "danger"
                  ? `<span class="tm-badge tm-badge-danger">DANGER</span>`
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
