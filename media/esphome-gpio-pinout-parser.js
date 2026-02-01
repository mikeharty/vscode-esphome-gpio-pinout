(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PinoutLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const YAML_HEURISTICS = ["esphome:", "esp32:", "esp8266:", "rp2040:", "bk72xx:", "rtl87xx:"];

  function looksLikeEsphomeYaml(text) {
    if (!text) return false;
    return YAML_HEURISTICS.some((m) => text.includes(m));
  }

  function countIndent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function stripOuterQuotes(s) {
    const t = (s ?? "").trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
    return t;
  }

  function parseSubstitutions(lines) {
    const subs = {};
    let inSubs = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = countIndent(raw);
      if (!inSubs) {
        if (indent === 0 && /^substitutions:\s*$/.test(trimmed)) inSubs = true;
        continue;
      }

      if (indent === 0 && /^[A-Za-z0-9_]+\s*:/.test(trimmed) && !/^substitutions:\s*$/.test(trimmed)) break;

      const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
      if (m) subs[m[1]] = stripOuterQuotes(m[2]);
    }

    return subs;
  }

  function parseBoardVariantAndPsram(lines) {
    let board = null,
      variant = null,
      psramMode = null;

    function parseBlock(blockName) {
      const idx = lines.findIndex((l) => l.trim() === `${blockName}:` && countIndent(l) === 0);
      if (idx < 0) return null;

      const baseIndent = countIndent(lines[idx]);
      const blockLines = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const line = lines[i];
        const indent = countIndent(line);
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (indent === 0 && /^[A-Za-z0-9_]+\s*:/.test(trimmed)) break;
        if (indent > baseIndent) blockLines.push({ line, i });
      }
      return blockLines;
    }

    const esp32Block = parseBlock("esp32");
    if (esp32Block) {
      for (const { line } of esp32Block) {
        const mBoard = line.match(/^\s*board:\s*([^\s#]+)\s*$/);
        if (mBoard) board = stripOuterQuotes(mBoard[1]);
        const mVar = line.match(/^\s*variant:\s*([^\s#]+)\s*$/);
        if (mVar) variant = stripOuterQuotes(mVar[1]);
      }
    }

    const psramBlock = parseBlock("psram");
    if (psramBlock) {
      for (const { line } of psramBlock) {
        const mMode = line.match(/^\s*mode:\s*([^\s#]+)\s*$/);
        if (mMode) psramMode = stripOuterQuotes(mMode[1]);
      }
    }

    return { board, variant, psramMode };
  }

  function pinValueToGpio(rawValue, substitutions) {
    if (rawValue == null) return { gpio: null, resolvedFrom: null };
    let v = stripOuterQuotes(String(rawValue).trim());

    const subM = v.match(/^\$\{([A-Za-z0-9_]+)\}$/);
    if (subM) {
      const key = subM[1];
      if (substitutions && substitutions[key] != null) v = String(substitutions[key]).trim();
    }

    if (v.startsWith("{") && v.includes("number")) {
      const nm = v.match(/number\s*:\s*("?)(GPIO)?\s*(\d+)\1/i);
      if (nm) return { gpio: parseInt(nm[3], 10), resolvedFrom: v };
    }

    const m = v.match(/^(GPIO)?\s*(\d+)\s*$/i);
    if (m) return { gpio: parseInt(m[2], 10), resolvedFrom: v };

    const m2 = v.match(/(GPIO)?\s*(\d+)/i);
    if (m2) return { gpio: parseInt(m2[2], 10), resolvedFrom: v };

    return { gpio: null, resolvedFrom: v };
  }

  function parsePinUsages(lines, substitutions) {
    const usedPins = new Map();
    const unresolved = [];
    let currentSection = null;
    let currentItem = null;
    let currentItemIndent = null;

    function scanNestedNumber(startIndex, pinIndent) {
      for (let j = startIndex + 1; j < lines.length; j++) {
        const raw = lines[j];
        const indent = countIndent(raw);
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (indent <= pinIndent) break;
        const nm = raw.match(/^\s*number:\s*(.+?)\s*$/);
        if (nm) return { value: nm[1], lineIndex: j };
      }
      return null;
    }

    function pushUsage(gpio, usage) {
      if (gpio == null || Number.isNaN(gpio)) return;
      if (!usedPins.has(gpio)) usedPins.set(gpio, []);
      usedPins.get(gpio).push(usage);
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = countIndent(raw);

      if (indent === 0) {
        const m = raw.match(/^([A-Za-z0-9_]+)\s*:\s*$/);
        if (m) {
          currentSection = m[1];
          currentItem = null;
          currentItemIndent = null;
        }
      }

      const listM = raw.match(/^(\s*)-\s+(.*)$/);
      if (listM) {
        const itemIndent = listM[1].length;
        const rest = listM[2].trim();
        const platM = rest.match(/^platform:\s*([^\s#]+)\s*$/);
        if (platM) {
          currentItem = { section: currentSection, platform: stripOuterQuotes(platM[1]), id: null, name: null, itemIndent };
          currentItemIndent = itemIndent;
        } else if (currentItem && itemIndent === currentItemIndent) {
          currentItem = { section: currentSection, platform: null, id: null, name: null, itemIndent };
          currentItemIndent = itemIndent;
        }
      }

      if (currentItem && indent > (currentItemIndent ?? -1)) {
        const idM = raw.match(/^\s*id:\s*(.+?)\s*$/);
        if (idM) currentItem.id = stripOuterQuotes(idM[1]);
        const nameM = raw.match(/^\s*name:\s*(.+?)\s*$/);
        if (nameM) currentItem.name = stripOuterQuotes(nameM[1]);
      }

      const keyM = raw.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
      if (!keyM) continue;

      const key = keyM[1];
      const value = keyM[2];
      const isPinKey = key === "pin" || key.endsWith("_pin");
      if (!isPinKey) continue;

      let gpio = null;
      let where = { line: i + 1, key };

      if (value && value !== "") {
        const { gpio: g } = pinValueToGpio(value, substitutions);
        gpio = g;
        if (gpio == null) {
          unresolved.push({ ...where, rawValue: value, context: currentItem });
          continue;
        }
      } else {
        const nested = scanNestedNumber(i, indent);
        if (!nested) {
          unresolved.push({ ...where, rawValue: "(nested pin with no number found)", context: currentItem });
          continue;
        }
        const { gpio: g } = pinValueToGpio(nested.value, substitutions);
        gpio = g;
        where = { line: nested.lineIndex + 1, key };
        if (gpio == null) {
          unresolved.push({ ...where, rawValue: nested.value, context: currentItem });
          continue;
        }
      }

      pushUsage(gpio, {
        gpio,
        line: where.line,
        key: where.key,
        section: currentItem?.section ?? currentSection ?? null,
        platform: currentItem?.platform ?? null,
        id: currentItem?.id ?? null,
        name: currentItem?.name ?? null
      });
    }

    for (const list of usedPins.values()) list.sort((a, b) => a.line - b.line);
    return { usedPins, unresolved };
  }

  function parseEsphomeYaml(yamlText) {
    if (!looksLikeEsphomeYaml(yamlText)) {
      return {
        ok: false,
        reason: "YAML does not look like an ESPHome config (heuristic).",
        board: null,
        variant: null,
        psramMode: null,
        usedPins: new Map(),
        unresolved: [],
        substitutions: {}
      };
    }
    const lines = yamlText.split(/\r?\n/);
    const substitutions = parseSubstitutions(lines);
    const { board, variant, psramMode } = parseBoardVariantAndPsram(lines);
    const { usedPins, unresolved } = parsePinUsages(lines, substitutions);
    return { ok: true, board, variant, psramMode, usedPins, unresolved, substitutions };
  }

  function resolveTemplates(str, subs) {
    if (str == null) return str;
    return String(str).replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, k) => (subs && subs[k] != null ? String(subs[k]) : m));
  }

  return {
    looksLikeEsphomeYaml,
    countIndent,
    stripOuterQuotes,
    parseSubstitutions,
    parseBoardVariantAndPsram,
    pinValueToGpio,
    parsePinUsages,
    parseEsphomeYaml,
    resolveTemplates
  };
});
