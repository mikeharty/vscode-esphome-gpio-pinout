(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PinoutLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const YAML_HEURISTICS = ["esphome:", "esp32:", "esp8266:", "rp2040:", "nrf52:", "bk72xx:", "rtl87xx:"];

  // Platform blocks the parser understands; order matters only for detection priority.
  const PLATFORM_BLOCKS = ["esp32", "esp8266", "rp2040", "nrf52", "bk72xx", "rtl87xx"];

  // Options that legitimately appear inside an ESPHome pin schema block. Any other
  // sibling key (pcf8574:, mcp23017:, sn74hc595:, sx1509:, ...) means the pin lives on
  // an I/O expander, not on the board itself.
  const PIN_SCHEMA_OPTION_KEYS = new Set([
    "number",
    "mode",
    "inverted",
    "allow_other_uses",
    "drive_strength",
    "ignore_strapping_warning",
    "ignore_pin_validation_error",
    "analog",
    "input",
    "output",
    "open_drain",
    "pullup",
    "pulldown",
  ]);

  // Tokens that look like board-level pin aliases (silkscreen names). These must never
  // fall through to digit-guessing: "D1" is GPIO5 on a NodeMCU, not GPIO1.
  const ALIAS_TOKEN_RE =
    /^(?:D\d+|A\d+|P\d+|PA_?\d+|PB_?\d+|LED[A-Z0-9_]*|RX\d?|TX\d?|SDA\d?|SCL\d?|SS|MOSI|MISO|SCK|BUTTON[A-Z0-9_]*|GROVE|VP|VN)$/i;

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

  // Remove a trailing YAML comment from a scalar value, respecting quoted strings.
  function stripTrailingComment(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return s;
    const quote = s[0] === '"' || s[0] === "'" ? s[0] : null;
    if (quote) {
      for (let i = 1; i < s.length; i++) {
        if (s[i] === "\\" && quote === '"') {
          i++;
          continue;
        }
        if (s[i] === quote) return s.slice(0, i + 1).trim();
      }
      return s;
    }
    // Unquoted: a comment starts at "#" preceded by whitespace (or at position 0).
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trim();
    }
    return s;
  }

  function cleanScalar(raw) {
    return stripOuterQuotes(stripTrailingComment(raw));
  }

  function parseSubstitutions(lines) {
    const subs = {};
    const subLines = {};
    let inSubs = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = countIndent(raw);
      if (!inSubs) {
        if (indent === 0 && /^substitutions:\s*(#.*)?$/.test(trimmed)) inSubs = true;
        continue;
      }

      if (indent === 0 && /^[A-Za-z0-9_]+\s*:/.test(trimmed) && !/^substitutions:\s*(#.*)?$/.test(trimmed)) break;

      const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
      if (m) {
        subs[m[1]] = cleanScalar(m[2]);
        subLines[m[1]] = i + 1;
      }
    }

    return { subs, subLines };
  }

  // Resolve `${name}` and `$name` substitution references inside a string.
  function resolveTemplates(str, subs) {
    if (str == null) return str;
    return String(str)
      .replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, k) => (subs && subs[k] != null ? String(subs[k]) : m))
      .replace(/\$([A-Za-z0-9_]+)/g, (m, k) => (subs && subs[k] != null ? String(subs[k]) : m));
  }

  function parseBoardVariantAndPsram(lines) {
    let board = null,
      variant = null,
      platform = null,
      psramMode = null;

    function parseBlock(blockName) {
      const idx = lines.findIndex(
        (l) => countIndent(l) === 0 && new RegExp(`^${blockName}:\\s*(#.*)?$`).test(l.trim()),
      );
      if (idx < 0) return null;

      const blockLines = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const line = lines[i];
        const indent = countIndent(line);
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (indent === 0 && /^[A-Za-z0-9_]+\s*:/.test(trimmed)) break;
        if (indent > 0) blockLines.push({ line, i });
      }
      return blockLines;
    }

    for (const platformBlock of PLATFORM_BLOCKS) {
      const block = parseBlock(platformBlock);
      if (!block) continue;
      if (!platform) platform = platformBlock;
      for (const { line } of block) {
        const mBoard = line.match(/^\s*board:\s*(.+?)\s*$/);
        if (mBoard && !board) board = cleanScalar(mBoard[1]);
        if (platformBlock === "esp32") {
          const mVar = line.match(/^\s*variant:\s*(.+?)\s*$/);
          if (mVar) variant = cleanScalar(mVar[1]);
        }
      }
    }

    const psramBlock = parseBlock("psram");
    if (psramBlock) {
      for (const { line } of psramBlock) {
        const mMode = line.match(/^\s*mode:\s*(.+?)\s*$/);
        if (mMode) psramMode = cleanScalar(mMode[1]);
      }
    }

    return { board, variant, platform, psramMode };
  }

  function isPinKeyName(key) {
    return key === "pin" || key.endsWith("_pin") || /^pin_[a-d]$/.test(key) || key === "sda" || key === "scl";
  }

  function isPinListKeyName(key) {
    return key.endsWith("_pins");
  }

  function normalizeAliasToken(token) {
    return String(token || "")
      .trim()
      .toUpperCase()
      .replace(/[\s]+/g, "");
  }

  // An unknown pin-schema key counts as an expander reference only when its value looks
  // like a component id (plain identifier), so future numeric/boolean pin options are
  // not silently misclassified.
  function looksLikeIdReference(value) {
    const v = String(value ?? "").trim();
    if (!v) return true; // "pcf8574:" with nested/absent value still marks the hub key
    if (/^(true|false|on|off|yes|no)$/i.test(v)) return false;
    if (/^-?\d+(\.\d+)?/.test(v)) return false;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
  }

  function lookupAlias(token, pinAliases) {
    if (!pinAliases) return null;
    const norm = normalizeAliasToken(token);
    if (!norm) return null;
    if (Object.prototype.hasOwnProperty.call(pinAliases, norm)) return { gpio: pinAliases[norm], alias: norm };
    // PA05 / PA_5 / PA5 spellings are equivalent.
    const paMatch = norm.match(/^(P[AB])_?0*(\d+)$/);
    if (paMatch) {
      for (const candidate of [`${paMatch[1]}${paMatch[2]}`, `${paMatch[1]}_${paMatch[2]}`]) {
        if (Object.prototype.hasOwnProperty.call(pinAliases, candidate)) {
          return { gpio: pinAliases[candidate], alias: candidate };
        }
      }
    }
    return null;
  }

  // Convert a single scalar pin token into a GPIO number.
  //
  // ctx: { platform, pinAliases } — platform gates chip-specific syntax so "P26" means
  // GPIO26 on bk72xx but stays an alias token elsewhere; pinAliases maps board
  // silkscreen names (D1, LED, PA05, ...) to GPIO numbers.
  function pinValueToGpio(rawValue, substitutions, ctx) {
    const platform = ctx?.platform ?? null;
    const pinAliases = ctx?.pinAliases ?? null;

    if (rawValue == null) return { gpio: null, resolvedFrom: null, isGuessed: false, subKey: null, alias: null };
    let v = cleanScalar(String(rawValue));

    let isGuessed = false;
    let subKey = null;
    const subM = v.match(/^\$\{([A-Za-z0-9_]+)\}$/) || v.match(/^\$([A-Za-z0-9_]+)$/);
    if (subM) {
      const key = subM[1];
      if (substitutions && substitutions[key] != null) {
        v = cleanScalar(String(substitutions[key]));
        subKey = key;
      } else {
        isGuessed = true;
      }
    }

    function done(gpio, extra) {
      return { gpio, resolvedFrom: v, isGuessed, subKey, alias: null, ...extra };
    }

    if (v.startsWith("{")) {
      // Flow-style pin schema: { number: GPIO5, mode: INPUT_PULLUP } — but an expander
      // reference key (pcf8574: hub_id) means this is not a board GPIO at all.
      const pairs = [...v.matchAll(/([A-Za-z0-9_]+)\s*:\s*([^,{}]*)/g)].map((m) => [m[1], m[2].trim()]);
      const expanderPair = pairs.find(([k, val]) => !PIN_SCHEMA_OPTION_KEYS.has(k) && looksLikeIdReference(val));
      if (expanderPair) return done(null, { expander: expanderPair[0] });
      const nm = v.match(/number\s*:\s*("?)([^,}"']+)\1/i);
      if (nm) {
        const inner = pinValueToGpio(nm[2], substitutions, ctx);
        return { ...inner, resolvedFrom: v, isGuessed: isGuessed || inner.isGuessed, subKey: subKey ?? inner.subKey };
      }
      return done(null);
    }

    // nRF52 port notation: P0.26 / P1.11 (valid regardless of detected platform — unambiguous).
    const nrf = v.match(/^P([01])\.(\d+)$/i);
    if (nrf) return done(parseInt(nrf[1], 10) * 32 + parseInt(nrf[2], 10));

    // GPIOnn / IOnn / bare number.
    const m = v.match(/^(?:GPIO|IO)?\s*(\d+)$/i);
    if (m) return done(parseInt(m[1], 10));

    // Beken pins: P26 == GPIO26 (only meaningful on bk72xx).
    if (platform === "bk72xx") {
      const beken = v.match(/^P(\d+)$/i);
      if (beken) return done(parseInt(beken[1], 10));
    }

    // Realtek pins: PA12 / PA_12 == GPIO12 (only meaningful on rtl87xx).
    if (platform === "rtl87xx") {
      const realtek = v.match(/^PA_?(\d+)$/i);
      if (realtek) return done(parseInt(realtek[1], 10));
    }

    // Board alias (silkscreen) lookup: D1, A0, LED, RX, TX, ...
    const aliasHit = lookupAlias(v, pinAliases);
    if (aliasHit && Number.isFinite(aliasHit.gpio)) {
      return { gpio: aliasHit.gpio, resolvedFrom: v, isGuessed, subKey, alias: aliasHit.alias };
    }

    // Alias-looking tokens without a known mapping must NOT be digit-guessed:
    // D1 is GPIO5 on a NodeMCU, guessing 1 would be misleading.
    if (ALIAS_TOKEN_RE.test(v)) {
      return { gpio: null, resolvedFrom: v, isGuessed, subKey, alias: null, aliasCandidate: normalizeAliasToken(v) };
    }

    // Last resort: extract a digit run from a longer expression and mark it guessed.
    const m2 = v.match(/(?:GPIO|IO)\s*(\d+)/i) || v.match(/(\d+)/);
    if (m2) return { gpio: parseInt(m2[1], 10), resolvedFrom: v, isGuessed: true, subKey, alias: null };

    return done(null);
  }

  // Parse a YAML flow list "[a, b, c]" into raw item strings; returns null if not a flow list.
  function parseFlowList(value) {
    const v = stripTrailingComment(value);
    if (!v.startsWith("[") || !v.endsWith("]")) return null;
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function parsePinUsages(lines, substitutions, subLines, ctx) {
    const usedPins = new Map();
    const unresolved = [];
    const referencedSubKeys = new Set();
    let currentSection = null;
    let currentItem = null;
    let currentItemIndent = null;

    // Scan a nested pin schema block: find number:, and detect expander references
    // (pcf8574: hub_id and friends) among the block's direct children.
    function scanNestedPinBlock(startIndex, pinIndent) {
      let numberEntry = null;
      let expanderKey = null;
      let childIndent = null;
      for (let j = startIndex + 1; j < lines.length; j++) {
        const raw = lines[j];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const indent = countIndent(raw);
        if (indent <= pinIndent) break;
        if (childIndent == null) childIndent = indent;
        const keyM = raw.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
        if (!keyM) continue;
        const key = keyM[1];
        if (key === "number" && !numberEntry) {
          numberEntry = { value: keyM[2], lineIndex: j };
        } else if (
          indent === childIndent &&
          !PIN_SCHEMA_OPTION_KEYS.has(key) &&
          !expanderKey &&
          looksLikeIdReference(stripTrailingComment(keyM[2]))
        ) {
          expanderKey = key;
        }
      }
      return { numberEntry, expanderKey };
    }

    // Collect block-style list items ("- GPIO5") directly under a *_pins key.
    function scanBlockList(startIndex, keyIndent) {
      const items = [];
      for (let j = startIndex + 1; j < lines.length; j++) {
        const raw = lines[j];
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const indent = countIndent(raw);
        if (indent <= keyIndent) break;
        const itemM = raw.match(/^\s*-\s*(.+?)\s*$/);
        if (itemM) items.push({ value: itemM[1], lineIndex: j });
        else break;
      }
      return items;
    }

    function pushUsage(gpio, usage) {
      if (gpio == null || Number.isNaN(gpio)) return;
      if (!usedPins.has(gpio)) usedPins.set(gpio, []);
      usedPins.get(gpio).push(usage);
    }

    function recordResolved(result, where) {
      pushUsage(result.gpio, {
        gpio: result.gpio,
        isGuessed: result.isGuessed,
        alias: result.alias ?? null,
        line: where.line,
        key: where.key,
        section: currentItem?.section ?? currentSection ?? null,
        platform: currentItem?.platform ?? null,
        id: currentItem?.id ?? null,
        name: currentItem?.name ?? null,
        context: currentItem || null,
      });

      if (result.subKey && subLines && subLines[result.subKey] != null) {
        referencedSubKeys.add(result.subKey);
        pushUsage(result.gpio, {
          gpio: result.gpio,
          isGuessed: false,
          alias: null,
          line: subLines[result.subKey],
          key: result.subKey,
          section: "substitutions",
          platform: null,
          id: null,
          name: null,
          context: null,
        });
      }
    }

    function recordUnresolved(result, where, rawValue) {
      if (result.subKey) referencedSubKeys.add(result.subKey);
      unresolved.push({
        line: where.line,
        key: where.key,
        rawValue: cleanScalar(String(rawValue)),
        aliasCandidate: result.aliasCandidate ?? null,
        expander: result.expander ?? null,
        context: currentItem,
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = countIndent(raw);

      if (indent === 0) {
        const m = raw.match(/^([A-Za-z0-9_]+)\s*:\s*(#.*)?$/);
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
        const platM = rest.match(/^platform:\s*(.+?)\s*$/);
        if (platM) {
          currentItem = {
            section: currentSection,
            platform: cleanScalar(platM[1]),
            id: null,
            name: null,
            itemIndent,
          };
          currentItemIndent = itemIndent;
        } else if (currentItem && itemIndent === currentItemIndent) {
          currentItem = { section: currentSection, platform: null, id: null, name: null, itemIndent };
          currentItemIndent = itemIndent;
        }
      }

      if (currentItem && indent > (currentItemIndent ?? -1)) {
        const idM = raw.match(/^\s*(?:-\s+)?id:\s*(.+?)\s*$/);
        if (idM && currentItem.id == null) currentItem.id = cleanScalar(idM[1]);
        const nameM = raw.match(/^\s*(?:-\s+)?name:\s*(.+?)\s*$/);
        if (nameM && currentItem.name == null) currentItem.name = cleanScalar(nameM[1]);
      }

      const keyM = raw.match(/^\s*(?:-\s+)?([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
      if (!keyM) continue;

      const key = keyM[1];
      const value = keyM[2];
      if (currentSection === "substitutions") continue;

      // List-of-pins keys: data_pins: [GPIO1, GPIO2] or block list form.
      if (isPinListKeyName(key)) {
        const flowItems = value ? parseFlowList(value) : null;
        const items = flowItems
          ? flowItems.map((val) => ({ value: val, lineIndex: i }))
          : !value
            ? scanBlockList(i, indent)
            : [];
        for (const item of items) {
          const result = pinValueToGpio(item.value, substitutions, ctx);
          const where = { line: item.lineIndex + 1, key };
          if (result.gpio == null) recordUnresolved(result, where, item.value);
          else recordResolved(result, where);
        }
        continue;
      }

      if (!isPinKeyName(key)) continue;

      const where = { line: i + 1, key };

      if (value && value !== "") {
        const strippedValue = stripTrailingComment(value);
        if (!strippedValue) continue;
        const result = pinValueToGpio(strippedValue, substitutions, ctx);
        if (result.expander) continue; // expander pin — not a board GPIO
        if (result.gpio == null) recordUnresolved(result, where, strippedValue);
        else recordResolved(result, where);
      } else {
        const { numberEntry, expanderKey } = scanNestedPinBlock(i, indent);
        if (expanderKey) continue; // pin lives on an I/O expander — not a board GPIO
        if (!numberEntry) {
          unresolved.push({
            ...where,
            rawValue: "(nested pin with no number found)",
            aliasCandidate: null,
            expander: null,
            context: currentItem,
          });
          continue;
        }
        const result = pinValueToGpio(numberEntry.value, substitutions, ctx);
        const nestedWhere = { line: numberEntry.lineIndex + 1, key };
        if (result.gpio == null) recordUnresolved(result, nestedWhere, numberEntry.value);
        else recordResolved(result, nestedWhere);
      }
    }

    for (const list of usedPins.values()) {
      for (const usage of list) {
        if (usage.id == null && usage.context?.id != null) usage.id = usage.context.id;
        if (usage.name == null && usage.context?.name != null) usage.name = usage.context.name;
        delete usage.context;
      }
      list.sort((a, b) => a.line - b.line);
    }
    for (const u of unresolved) delete u.context;
    return { usedPins, unresolved, referencedSubKeys };
  }

  // options: { pinAliases: { NAME: gpio } } — board-specific silkscreen alias map.
  function parseEsphomeYaml(yamlText, options) {
    if (!looksLikeEsphomeYaml(yamlText)) {
      return {
        ok: false,
        reason: "YAML does not look like an ESPHome config (heuristic).",
        board: null,
        variant: null,
        platform: null,
        psramMode: null,
        usedPins: new Map(),
        unresolved: [],
        substitutions: {},
      };
    }
    const lines = yamlText.split(/\r?\n/);
    const { subs: substitutions, subLines } = parseSubstitutions(lines);
    const { board, variant, platform, psramMode } = parseBoardVariantAndPsram(lines);

    const pinAliases = options?.pinAliases ?? null;
    const ctx = { platform, pinAliases };

    const { usedPins, unresolved, referencedSubKeys } = parsePinUsages(lines, substitutions, subLines, ctx);
    const unusedGpioSubstitutions = [];
    for (const [key, val] of Object.entries(substitutions)) {
      if (!isPinKeyName(key)) continue;
      if (referencedSubKeys.has(key)) continue;
      const { gpio } = pinValueToGpio(val, {}, ctx);
      if (gpio != null) unusedGpioSubstitutions.push({ key, value: val, gpio });
    }
    return {
      ok: true,
      board: resolveTemplates(board, substitutions),
      variant: resolveTemplates(variant, substitutions),
      platform,
      psramMode,
      usedPins,
      unresolved,
      substitutions,
      unusedGpioSubstitutions,
    };
  }

  return {
    looksLikeEsphomeYaml,
    countIndent,
    stripOuterQuotes,
    stripTrailingComment,
    cleanScalar,
    parseSubstitutions,
    parseBoardVariantAndPsram,
    pinValueToGpio,
    parseFlowList,
    parsePinUsages,
    parseEsphomeYaml,
    resolveTemplates,
    isPinKeyName,
    normalizeAliasToken,
  };
});
