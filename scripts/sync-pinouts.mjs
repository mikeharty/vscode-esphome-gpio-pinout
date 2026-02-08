#!/usr/bin/env node

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const LOCK_PATH = path.join(REPO_ROOT, "scripts", "pinout-sources.lock.json");
const PINOUT_ROOT = path.join(REPO_ROOT, "media", "pinouts");

const SOURCE_DEFS = {
  platformio_espressif32: {
    owner: "platformio",
    repo: "platform-espressif32",
    branch: "develop",
  },
  platformio_espressif8266: {
    owner: "platformio",
    repo: "platform-espressif8266",
    branch: "develop",
  },
  wokwi_boards: {
    owner: "wokwi",
    repo: "wokwi-boards",
    branch: "main",
  },
  wippersnapper_boards: {
    owner: "adafruit",
    repo: "Wippersnapper_Boards",
    branch: "main",
  },
};

const EXTRA_TARGETS = [
  {
    id: "adafruit_feather_nrf52840",
    socRef: "nrf52840",
    displayName: "Adafruit Feather nRF52840 Express",
  },
  {
    id: "adafruit_itsybitsy_nrf52840",
    socRef: "nrf52840",
    displayName: "Adafruit ItsyBitsy nRF52840 Express",
  },
  {
    id: "xiao_ble",
    socRef: "nrf52840",
    displayName: "Seeed XIAO BLE",
  },
  {
    id: "rpipicow",
    socRef: "rp2040",
    displayName: "Raspberry Pi Pico W",
  },
];

const WOKWI_EXPLICIT_MAP = {
  "arduino-nano-esp32": ["arduino_nano_esp32"],
  "esp32-c3-devkitm-1": ["esp32-c3-devkitm-1"],
  "esp32-c6-devkitc-1": ["esp32-c6-devkitc-1"],
  "esp32-cam": ["esp32cam"],
  "esp32-devkit-v1": ["esp32dev", "esp32doit-devkit-v1"],
  "esp32-s2-devkitm-1": ["esp32-s2-devkitm-1"],
  "esp32-s3-box": ["esp32s3box"],
  "esp32-s3-box-3": ["esp32s3box"],
  "esp32-s3-devkitc-1": ["esp32-s3-devkitc-1"],
  "pi-pico-w": ["rpipicow"],
  "wemos-s2-mini": ["lolin_s2_mini"],
  "xiao-esp32-c3": ["seeed_xiao_esp32c3"],
  "xiao-esp32-c6": ["seeed_xiao_esp32c6"],
  "xiao-esp32-s3": ["seeed_xiao_esp32s3"],
};

const WOKWI_DIR_PRIORITY = {
  "esp32-devkit-v1": 1,
  "mch2022-badge": 99,
  "esp32-s3-box": 1,
  "esp32-s3-box-3": 2,
};

const WIPPER_EXPLICIT_MAP = {
  "dfrobot-beetle-esp32c3": "dfrobot_beetle_esp32c3",
  "feather-esp32": "adafruit_feather_esp32_v2",
  "feather-esp32-v2": "adafruit_feather_esp32_v2",
  "feather-esp32s2": "adafruit_feather_esp32s2",
  "feather-esp32s2-reverse-tft": "adafruit_feather_esp32s2_reversetft",
  "feather-esp32s2-tft": "adafruit_feather_esp32s2_tft",
  "feather-esp32s3": "adafruit_feather_esp32s3",
  "feather-esp32s3-4mbflash-2mbpsram": "adafruit_feather_esp32s3",
  "feather-esp32s3-reverse-tft": "adafruit_feather_esp32s3_reversetft",
  "feather-esp32s3-tft": "adafruit_feather_esp32s3_tft",
  funhouse: "adafruit_funhouse_esp32s2",
  "itsybitsy-esp32": "adafruit_itsybitsy_esp32",
  "qtpy-esp32": "adafruit_qtpy_esp32",
  "qtpy-esp32c3": "adafruit_qtpy_esp32c3",
  "qtpy-esp32s2": "adafruit_qtpy_esp32s2",
  "qtpy-esp32s3-n4r2": "adafruit_qtpy_esp32s3_n4r2",
  "xiao-esp32s3": "seeed_xiao_esp32s3",
};

const SOC_DATA = {
  esp32: {
    id: "esp32",
    variant: "esp32",
    kind: "soc-grid",
    displayName: "ESP32 (SoC pin grid)",
    gpios: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36,
      37, 38, 39,
    ],
    pinIssues: [
      {
        gpios: [0, 2, 5, 12, 15],
        severity: "danger",
        text: "Strapping pin (can affect boot mode).",
      },
      {
        gpioRanges: [
          [6, 11],
          [16, 17],
        ],
        severity: "danger",
        text: "Commonly used by internal flash/PSRAM; avoid for general GPIO.",
      },
      {
        gpioRange: [34, 39],
        severity: "warn",
        text: "Input-only pins; no internal pull-up/pull-down.",
      },
    ],
  },
  esp32s2: {
    id: "esp32s2",
    variant: "esp32s2",
    kind: "soc-grid",
    displayName: "ESP32-S2 (SoC pin grid)",
    gpios: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 27, 28, 29, 30, 31, 32, 33, 34,
      35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
    ],
    pinIssues: [
      {
        gpios: [0, 45, 46],
        severity: "danger",
        text: "Strapping pin (can affect boot mode).",
      },
      {
        gpioRange: [26, 32],
        severity: "warn",
        text: "Often used for flash/PSRAM on modules; avoid for general GPIO.",
      },
      {
        gpios: [39, 40, 41, 42],
        severity: "info",
        text: "Often used for JTAG by default.",
      },
    ],
  },
  esp32s3: {
    id: "esp32s3",
    variant: "esp32s3",
    kind: "soc-grid",
    displayName: "ESP32-S3 (SoC pin grid)",
    gpios: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 27, 28, 29, 30, 31, 32, 33, 34,
      35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
    ],
    pinIssues: [
      {
        gpios: [0, 3, 45, 46],
        severity: "danger",
        text: "Strapping pin (can affect boot mode).",
      },
      {
        gpioRange: [26, 32],
        severity: "warn",
        text: "Often used for flash/PSRAM on modules; avoid for general GPIO.",
      },
      {
        gpioRange: [33, 37],
        severity: "danger",
        text: "Octal flash/PSRAM commonly uses GPIO33 to GPIO37; treat as reserved on many modules.",
        when: {
          psramModeIncludes: "octal",
        },
      },
      {
        gpioRange: [33, 37],
        severity: "warn",
        text: "GPIO33 to GPIO37 often tied to flash/PSRAM depending on module.",
        when: {
          psramModeExcludes: "octal",
        },
      },
      {
        gpios: [19, 20],
        severity: "warn",
        text: "USB-JTAG default; repurposing may disable USB-JTAG.",
      },
    ],
  },
  esp32c3: {
    id: "esp32c3",
    variant: "esp32c3",
    kind: "soc-grid",
    displayName: "ESP32-C3 (SoC pin grid)",
    gpios: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    pinIssues: [
      {
        gpios: [2, 8, 9],
        severity: "danger",
        text: "Strapping pin (can affect boot mode).",
      },
      {
        gpioRange: [12, 17],
        severity: "warn",
        text: "Often connected to flash by default on modules.",
      },
      {
        gpios: [18, 19],
        severity: "warn",
        text: "USB-JTAG default; repurposing may disable USB-JTAG.",
      },
    ],
  },
  esp32c6: {
    id: "esp32c6",
    variant: "esp32c6",
    kind: "soc-grid",
    displayName: "ESP32-C6 (SoC pin grid)",
    gpios: [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ],
    pinIssues: [
      {
        gpios: [4, 5, 8, 9, 15],
        severity: "danger",
        text: "Likely strapping pin on ESP32-C6; keep external circuits boot-safe.",
      },
    ],
  },
  esp8266: {
    id: "esp8266",
    variant: "esp8266",
    kind: "soc-grid",
    displayName: "ESP8266 (SoC pin grid)",
    gpios: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    pinIssues: [
      {
        gpios: [0, 2, 15],
        severity: "danger",
        text: "Boot strapping pin; keep external pull state boot-safe.",
      },
      {
        gpioRange: [6, 11],
        severity: "danger",
        text: "Connected to SPI flash interface; avoid for external GPIO use.",
      },
      {
        gpios: [1, 3],
        severity: "info",
        text: "Default UART TX/RX pins used for serial logging/flashing.",
      },
      {
        gpios: [17],
        severity: "warn",
        text: "ADC-only pin (TOUT); cannot be used as digital GPIO.",
      },
    ],
  },
  nrf52840: {
    id: "nrf52840",
    variant: "nrf52840",
    kind: "soc-grid",
    displayName: "nRF52840 (SoC pin grid)",
    gpios: Array.from({ length: 48 }, (_, i) => i),
  },
  rp2040: {
    id: "rp2040",
    variant: "rp2040",
    kind: "soc-grid",
    displayName: "RP2040 (SoC pin grid)",
    gpios: Array.from({ length: 30 }, (_, i) => i),
  },
};

const SOC_GPIOS = Object.fromEntries(Object.entries(SOC_DATA).map(([k, v]) => [k, new Set(v.gpios)]));

function parseMode(argv) {
  const modeArgIndex = argv.indexOf("--mode");
  if (modeArgIndex >= 0 && argv[modeArgIndex + 1]) {
    return argv[modeArgIndex + 1];
  }
  return "build";
}

function jsonHeaders() {
  return {
    "User-Agent": "esphome-gpio-pinout-sync",
    Accept: "application/vnd.github+json",
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: jsonHeaders() });
  if (!res.ok) {
    throw new Error(`Failed request (${res.status}) for ${url}`);
  }
  return res.json();
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url, { headers: jsonHeaders() });
  if (!res.ok) {
    throw new Error(`Failed download (${res.status}) for ${url}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  await fs.writeFile(filePath, arr);
}

function stableSortObject(input) {
  const out = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = input[key];
  }
  return out;
}

async function writeJson(filePath, obj) {
  const text = `${JSON.stringify(obj, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

async function clearDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

function readJsonFileSyncSafe(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function loadLock() {
  const lockText = await fs.readFile(LOCK_PATH, "utf8");
  const lock = JSON.parse(lockText);
  if (!lock?.sources) {
    throw new Error(`Invalid lock file: ${LOCK_PATH}`);
  }
  return lock;
}

async function updateLock() {
  const sources = {};

  for (const [key, src] of Object.entries(SOURCE_DEFS)) {
    const commit = await fetchJson(`https://api.github.com/repos/${src.owner}/${src.repo}/commits/${src.branch}`);

    sources[key] = {
      owner: src.owner,
      repo: src.repo,
      branch: src.branch,
      commit: commit.sha,
    };
  }

  const lock = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sources: stableSortObject(sources),
  };

  await writeJson(LOCK_PATH, lock);
  return lock;
}

function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let stringChar = "";
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

async function extractTarball(archivePath, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  await execFileAsync("tar", ["-xzf", archivePath, "-C", outDir]);
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (!dirs.length) {
    throw new Error(`No extracted directory found in ${outDir}`);
  }
  return path.join(outDir, dirs[0].name);
}

async function fetchSourceTrees(lock, workDir) {
  const sources = {};

  for (const [key, src] of Object.entries(lock.sources)) {
    const archivePath = path.join(workDir, `${key}.tgz`);
    const extractRoot = path.join(workDir, `${key}-src`);

    const url = `https://codeload.github.com/${src.owner}/${src.repo}/tar.gz/${src.commit}`;
    await downloadToFile(url, archivePath);
    const treePath = await extractTarball(archivePath, extractRoot);

    sources[key] = {
      ...src,
      treePath,
    };
  }

  return sources;
}

function mapMcuToSocRef(mcu) {
  const normalized = String(mcu || "").toLowerCase();
  const mapping = {
    esp32: "esp32",
    esp32s2: "esp32s2",
    "esp32-s2": "esp32s2",
    esp32s3: "esp32s3",
    "esp32-s3": "esp32s3",
    esp32c3: "esp32c3",
    "esp32-c3": "esp32c3",
    esp32c6: "esp32c6",
    "esp32-c6": "esp32c6",
    esp8266: "esp8266",
    nrf52840: "nrf52840",
    rp2040: "rp2040",
  };
  return mapping[normalized] || null;
}

function parsePioBoardIdFromFqbn(fqbn) {
  const text = String(fqbn || "").trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length < 3) return null;
  return parts[2];
}

function parseGpioFromToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const gpioMatch = /^GPIO\s*(\d+)$/i.exec(raw);
  if (gpioMatch) return Number(gpioMatch[1]);

  const numericMatch = /^(\d+)$/i.exec(raw);
  if (numericMatch) return Number(numericMatch[1]);

  const nrfMatch = /^P([01])\.(\d+)$/i.exec(raw);
  if (nrfMatch) {
    const bank = Number(nrfMatch[1]);
    const pin = Number(nrfMatch[2]);
    return bank * 32 + pin;
  }

  return null;
}

function classifyPinType({ label, targetRaw, gpio }) {
  const target = String(targetRaw || "").trim();
  const upTarget = target.toUpperCase();
  const upLabel = String(label || "").toUpperCase();

  if (upTarget === "GND" || /^GND(\.|$)/.test(upLabel)) return "ground";
  if (upTarget.startsWith("POWER(") || /^3V|^5V|^VBUS|VCC/.test(upLabel)) return "power";
  if (
    upTarget === "CHIP_PU" ||
    upTarget === "EN" ||
    upTarget === "RST" ||
    upTarget === "RUN" ||
    upLabel.includes("RST")
  )
    return "reset";
  if (gpio != null) return "gpio";
  return "other";
}

function compareWokwiCandidate(current, next) {
  if (!current) return true;

  const currentPriority = WOKWI_DIR_PRIORITY[current.wokwiDir] ?? 50;
  const nextPriority = WOKWI_DIR_PRIORITY[next.wokwiDir] ?? 50;
  if (nextPriority < currentPriority) return true;
  if (nextPriority > currentPriority) return false;

  if (next.pinCount > current.pinCount) return true;
  if (next.pinCount < current.pinCount) return false;

  return next.wokwiDir < current.wokwiDir;
}

function resolveWokwiCandidates(wokwiDirName, boardJson) {
  const candidates = new Set();

  for (const mapped of WOKWI_EXPLICIT_MAP[wokwiDirName] || []) {
    candidates.add(mapped);
  }

  const fqbnId = parsePioBoardIdFromFqbn(boardJson?.fqbn);
  if (fqbnId) {
    candidates.add(fqbnId);
    candidates.add(fqbnId.toLowerCase());
  }

  const envs = boardJson?.environments;
  if (envs && typeof envs === "object") {
    for (const env of Object.values(envs)) {
      const envFqbnId = parsePioBoardIdFromFqbn(env?.fqbn);
      if (envFqbnId) {
        candidates.add(envFqbnId);
        candidates.add(envFqbnId.toLowerCase());
      }
    }
  }

  candidates.add(wokwiDirName);
  candidates.add(wokwiDirName.replaceAll("-", "_"));

  return [...candidates];
}

function parseWokwiPins(boardJson) {
  const out = [];
  const pins = boardJson?.pins || {};

  for (const [label, pin] of Object.entries(pins)) {
    if (!pin || typeof pin !== "object") continue;

    const x = Number(pin.x);
    const y = Number(pin.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const targetRaw = typeof pin.target === "string" ? pin.target.trim() : null;
    const gpio = parseGpioFromToken(targetRaw);
    const type = classifyPinType({ label, targetRaw, gpio });

    out.push({
      label,
      x,
      y,
      targetRaw,
      gpio,
      type,
    });
  }

  out.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.label.localeCompare(b.label);
  });

  return out;
}

function normalizeWipperName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function resolveWipperTargetId(dirName, boardName, targetSet) {
  const explicit = WIPPER_EXPLICIT_MAP[dirName] || WIPPER_EXPLICIT_MAP[boardName];
  if (explicit && targetSet.has(explicit)) return explicit;

  const normalized = normalizeWipperName(boardName || dirName);
  const candidates = new Set([normalized]);
  candidates.add(`adafruit_${normalized}`);

  if (normalized.startsWith("feather_")) {
    candidates.add(`adafruit_${normalized}`);
    if (normalized === "feather_esp32") candidates.add("adafruit_feather_esp32_v2");
    if (normalized === "feather_esp32s2_reverse_tft") candidates.add("adafruit_feather_esp32s2_reversetft");
    if (normalized === "feather_esp32s3_reverse_tft") candidates.add("adafruit_feather_esp32s3_reversetft");
  }
  if (normalized.startsWith("qtpy_")) candidates.add(`adafruit_${normalized}`);
  if (normalized === "itsybitsy_esp32") candidates.add("adafruit_itsybitsy_esp32");
  if (normalized === "funhouse") candidates.add("adafruit_funhouse_esp32s2");
  if (normalized === "xiao_esp32s3") candidates.add("seeed_xiao_esp32s3");

  for (const candidate of candidates) {
    if (targetSet.has(candidate)) return candidate;
  }

  return null;
}

function parseGpioFromWipperEntry(entry) {
  if (!entry || typeof entry !== "object") return [];

  const values = [];

  const keys = ["name", "displayName", "pinName", "pin", "gpio", "gpioNum", "gpioNumber"];
  for (const key of keys) {
    if (typeof entry[key] === "string" || typeof entry[key] === "number") {
      values.push(String(entry[key]));
    }
  }

  const out = [];
  for (const value of values) {
    const gpio = parseGpioFromToken(value);
    if (gpio != null) out.push(gpio);

    const gpioPattern = /GPIO\s*(\d+)/gi;
    let match = gpioPattern.exec(value);
    while (match) {
      out.push(Number(match[1]));
      match = gpioPattern.exec(value);
    }

    const dPattern = /\bD(\d+)\b/gi;
    let dMatch = dPattern.exec(value);
    while (dMatch) {
      out.push(Number(dMatch[1]));
      dMatch = dPattern.exec(value);
    }

    const aPattern = /\bA(\d+)\b/gi;
    let aMatch = aPattern.exec(value);
    while (aMatch) {
      out.push(Number(aMatch[1]));
      aMatch = aPattern.exec(value);
    }

    const nrfPattern = /\bP([01])\.(\d+)\b/gi;
    let nMatch = nrfPattern.exec(value);
    while (nMatch) {
      out.push(Number(nMatch[1]) * 32 + Number(nMatch[2]));
      nMatch = nrfPattern.exec(value);
    }
  }

  return out;
}

function parseGpiosFromWipperDefinition(definition, socRef) {
  const gpios = new Set();

  const components = definition?.components;
  if (components && typeof components === "object") {
    for (const value of Object.values(components)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          for (const gpio of parseGpioFromWipperEntry(entry)) {
            gpios.add(gpio);
          }
        }
      } else if (value && typeof value === "object") {
        for (const entry of Object.values(value)) {
          if (entry && typeof entry === "object") {
            for (const gpio of parseGpioFromWipperEntry(entry)) {
              gpios.add(gpio);
            }
          }
        }
      }
    }
  }

  const allowed = SOC_GPIOS[socRef] || null;
  const list = [...gpios].filter((gpio) => Number.isFinite(gpio) && gpio >= 0);
  const filtered = allowed ? list.filter((gpio) => allowed.has(gpio)) : list;
  filtered.sort((a, b) => a - b);

  return filtered;
}

function buildAliases(targetBoardIds) {
  const aliases = {};

  for (const boardId of targetBoardIds) {
    const lower = boardId.toLowerCase();
    if (lower !== boardId) aliases[lower] = boardId;

    const underscore = boardId.replaceAll("-", "_");
    if (underscore !== boardId) aliases[underscore] = boardId;

    const dashed = boardId.replaceAll("_", "-");
    if (dashed !== boardId) aliases[dashed] = boardId;
  }

  aliases["esp32-s3-devkitc-1-n16r8"] = "esp32-s3-devkitc-1";
  aliases["esp32-s3-devkitc-1_n16r8"] = "esp32-s3-devkitc-1";

  aliases["xiao_esp32s3"] = "seeed_xiao_esp32s3";
  aliases["xiao-esp32s3"] = "seeed_xiao_esp32s3";
  aliases["xiao_esp32c6"] = "seeed_xiao_esp32c6";
  aliases["xiao-esp32c6"] = "seeed_xiao_esp32c6";
  aliases["xiao_esp32c3"] = "seeed_xiao_esp32c3";
  aliases["xiao-esp32c3"] = "seeed_xiao_esp32c3";

  const cleaned = {};
  for (const key of Object.keys(aliases).sort()) {
    const value = aliases[key];
    if (!value || key === value) continue;
    cleaned[key] = value;
  }

  return cleaned;
}

async function buildDataModel(lock, sourceTrees) {
  const espressif32BoardsDir = path.join(sourceTrees.platformio_espressif32.treePath, "boards");
  const espressif8266BoardsDir = path.join(sourceTrees.platformio_espressif8266.treePath, "boards");
  const wokwiBoardsDir = path.join(sourceTrees.wokwi_boards.treePath, "boards");
  const wipperBoardsDir = path.join(sourceTrees.wippersnapper_boards.treePath, "boards");

  const boardNames = {};
  const boardSocRefs = {};
  const esp32BoardIds = [];
  const esp8266BoardIds = [];

  for (const dirEntry of await fs.readdir(espressif32BoardsDir, { withFileTypes: true })) {
    if (!dirEntry.isFile() || !dirEntry.name.endsWith(".json")) continue;
    const boardId = dirEntry.name.replace(/\.json$/, "");
    const boardData = JSON.parse(await fs.readFile(path.join(espressif32BoardsDir, dirEntry.name), "utf8"));

    esp32BoardIds.push(boardId);
    boardNames[boardId] = boardData.name || boardId;

    const socRef = mapMcuToSocRef(boardData?.build?.mcu);
    if (socRef) boardSocRefs[boardId] = socRef;
  }

  for (const dirEntry of await fs.readdir(espressif8266BoardsDir, { withFileTypes: true })) {
    if (!dirEntry.isFile() || !dirEntry.name.endsWith(".json")) continue;
    const boardId = dirEntry.name.replace(/\.json$/, "");
    const boardData = JSON.parse(await fs.readFile(path.join(espressif8266BoardsDir, dirEntry.name), "utf8"));

    esp8266BoardIds.push(boardId);
    boardNames[boardId] = boardData.name || boardId;

    const socRef = mapMcuToSocRef(boardData?.build?.mcu);
    if (socRef) boardSocRefs[boardId] = socRef;
  }

  esp32BoardIds.sort();
  esp8266BoardIds.sort();

  const targetBoardIds = new Set([...esp32BoardIds, ...esp8266BoardIds]);
  for (const extra of EXTRA_TARGETS) {
    targetBoardIds.add(extra.id);
    boardSocRefs[extra.id] = extra.socRef;
    boardNames[extra.id] = extra.displayName;
  }

  const sortedTargetBoardIds = [...targetBoardIds].sort();

  const wokwiSelections = {};
  for (const dirEntry of await fs.readdir(wokwiBoardsDir, { withFileTypes: true })) {
    if (!dirEntry.isDirectory()) continue;

    const boardJsonPath = path.join(wokwiBoardsDir, dirEntry.name, "board.json");
    const boardSvgPath = path.join(wokwiBoardsDir, dirEntry.name, "board.svg");

    let boardJsonText;
    try {
      boardJsonText = await fs.readFile(boardJsonPath, "utf8");
      await fs.access(boardSvgPath);
    } catch {
      continue;
    }

    let boardJson;
    try {
      boardJson = JSON.parse(stripJsonComments(boardJsonText));
    } catch {
      continue;
    }

    const candidates = resolveWokwiCandidates(dirEntry.name, boardJson);
    const matchingIds = candidates.filter((candidate) => targetBoardIds.has(candidate));
    if (!matchingIds.length) continue;

    const pins = parseWokwiPins(boardJson);
    if (!pins.length) continue;

    for (const boardId of matchingIds) {
      const candidate = {
        boardId,
        wokwiDir: dirEntry.name,
        boardJson,
        boardSvgPath,
        pins,
        pinCount: pins.length,
      };

      if (compareWokwiCandidate(wokwiSelections[boardId], candidate)) {
        wokwiSelections[boardId] = candidate;
      }
    }
  }

  const boardDefs = {};
  const boardSources = {};
  const svgAssets = [];

  for (const boardId of Object.keys(wokwiSelections).sort()) {
    const selection = wokwiSelections[boardId];
    const width = Number(selection.boardJson.width);
    const height = Number(selection.boardJson.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;

    boardDefs[boardId] = {
      id: boardId,
      displayName: boardNames[boardId] || selection.boardJson.name || boardId,
      kind: "svg-board",
      socRef: boardSocRefs[boardId] || mapMcuToSocRef(selection.boardJson.mcu),
      svgPath: `assets/wokwi/${boardId}.svg`,
      sizeMm: {
        width,
        height,
      },
      pins: selection.pins,
    };

    boardSources[boardId] = {
      source: "wokwi",
      upstreamId: selection.wokwiDir,
    };

    svgAssets.push({
      boardId,
      sourcePath: selection.boardSvgPath,
      relPath: `assets/wokwi/${boardId}.svg`,
    });
  }

  for (const dirEntry of await fs.readdir(wipperBoardsDir, { withFileTypes: true })) {
    if (!dirEntry.isDirectory()) continue;

    const defPath = path.join(wipperBoardsDir, dirEntry.name, "definition.json");
    let definition;
    try {
      definition = JSON.parse(await fs.readFile(defPath, "utf8"));
    } catch {
      continue;
    }

    const boardId = resolveWipperTargetId(dirEntry.name, definition?.boardName || dirEntry.name, targetBoardIds);
    if (!boardId) continue;
    if (boardDefs[boardId]) continue;

    const socRef = boardSocRefs[boardId] || mapMcuToSocRef(definition?.mcuName);
    if (!socRef) continue;

    const gpios = parseGpiosFromWipperDefinition(definition, socRef);
    if (!gpios.length) continue;

    boardDefs[boardId] = {
      id: boardId,
      displayName: boardNames[boardId] || definition.displayName || definition.boardName || boardId,
      kind: "soc-grid",
      socRef,
      gpios,
      notes: ["GPIO subset derived from Adafruit WipperSnapper board definition."],
    };

    boardSources[boardId] = {
      source: "wippersnapper",
      upstreamId: dirEntry.name,
    };
  }

  const boardsIndex = {};
  for (const boardId of Object.keys(boardDefs).sort()) {
    boardsIndex[boardId] = `boards/generated/${boardId}.json`;
  }

  const boardSocAliases = {};
  for (const boardId of sortedTargetBoardIds) {
    if (boardsIndex[boardId]) continue;
    const socRef = boardSocRefs[boardId];
    if (!socRef || !SOC_DATA[socRef]) continue;

    boardSocAliases[boardId] = {
      soc: socRef,
      displayName: `${boardNames[boardId] || boardId} (SoC pin grid)`,
    };
  }

  const aliases = buildAliases(sortedTargetBoardIds);

  const socIndex = {};
  for (const socKey of Object.keys(SOC_DATA).sort()) {
    socIndex[socKey] = `soc/${socKey}.json`;
  }

  const sourceSummary = {};
  for (const [key, src] of Object.entries(lock.sources)) {
    sourceSummary[key] = {
      repo: `${src.owner}/${src.repo}`,
      branch: src.branch,
      commit: src.commit,
    };
  }

  const counts = {
    targets: sortedTargetBoardIds.length,
    esp32Targets: esp32BoardIds.length,
    esp8266Targets: esp8266BoardIds.length,
    extraTargets: EXTRA_TARGETS.length,
    boardDefinitions: Object.keys(boardsIndex).length,
    wokwiBoards: Object.values(boardSources).filter((src) => src.source === "wokwi").length,
    wippersnapperBoards: Object.values(boardSources).filter((src) => src.source === "wippersnapper").length,
    socFallbackBoards: Object.keys(boardSocAliases).length,
  };

  const index = {
    schemaVersion: 2,
    generated: {
      generatedAt: lock.updatedAt,
      sources: sourceSummary,
      boardCounts: counts,
    },
    boards: boardsIndex,
    soc: socIndex,
    aliases,
    boardSocAliases,
  };

  const targets = {
    schemaVersion: 1,
    generatedAt: lock.updatedAt,
    boards: {
      esp32: esp32BoardIds,
      esp8266: esp8266BoardIds,
      extras: EXTRA_TARGETS.map((item) => item.id),
    },
    all: sortedTargetBoardIds,
  };

  return {
    index,
    targets,
    boardDefs,
    boardSources,
    socData: SOC_DATA,
    svgAssets,
  };
}

function sha256(content) {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

async function writeOutputs({ outputRoot, model }) {
  const pinoutRoot = path.join(outputRoot, "media", "pinouts");
  const generatedBoardsDir = path.join(pinoutRoot, "boards", "generated");
  const wokwiAssetsDir = path.join(pinoutRoot, "assets", "wokwi");
  const socDir = path.join(pinoutRoot, "soc");

  await clearDir(generatedBoardsDir);
  await clearDir(wokwiAssetsDir);
  await clearDir(socDir);

  const managedFiles = [];

  const indexPath = path.join(pinoutRoot, "index.json");
  await writeJson(indexPath, model.index);
  managedFiles.push(path.relative(outputRoot, indexPath));

  const targetsPath = path.join(pinoutRoot, "targets.json");
  await writeJson(targetsPath, model.targets);
  managedFiles.push(path.relative(outputRoot, targetsPath));

  for (const boardId of Object.keys(model.boardDefs).sort()) {
    const outPath = path.join(generatedBoardsDir, `${boardId}.json`);
    await writeJson(outPath, model.boardDefs[boardId]);
    managedFiles.push(path.relative(outputRoot, outPath));
  }

  for (const socKey of Object.keys(model.socData).sort()) {
    const outPath = path.join(socDir, `${socKey}.json`);
    await writeJson(outPath, model.socData[socKey]);
    managedFiles.push(path.relative(outputRoot, outPath));
  }

  for (const svg of model.svgAssets.sort((a, b) => a.boardId.localeCompare(b.boardId))) {
    const outPath = path.join(pinoutRoot, svg.relPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.copyFile(svg.sourcePath, outPath);
    managedFiles.push(path.relative(outputRoot, outPath));
  }

  const manifestPath = path.join(pinoutRoot, "generated-manifest.json");
  const manifestRelPath = path.relative(outputRoot, manifestPath);
  const fullManaged = [...managedFiles, manifestRelPath].sort();
  const manifest = {
    schemaVersion: 1,
    generatedAt: model.index.generated.generatedAt,
    managedFiles: fullManaged,
  };

  await writeJson(manifestPath, manifest);

  return {
    managedFiles: fullManaged,
    manifest,
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function compareWithRepo({ tempRoot, repoRoot, managedFiles }) {
  for (const relPath of managedFiles) {
    const tempPath = path.join(tempRoot, relPath);
    const repoPath = path.join(repoRoot, relPath);

    const [tempExists, repoExists] = await Promise.all([fileExists(tempPath), fileExists(repoPath)]);
    if (!tempExists || !repoExists) {
      throw new Error(`Missing managed file during check: ${relPath}`);
    }

    const [tempContent, repoContent] = await Promise.all([fs.readFile(tempPath), fs.readFile(repoPath)]);

    if (sha256(tempContent) !== sha256(repoContent)) {
      throw new Error(`Managed file drift detected: ${relPath}`);
    }
  }

  const repoManifestPath = path.join(repoRoot, "media", "pinouts", "generated-manifest.json");
  const repoManifest = readJsonFileSyncSafe(repoManifestPath);
  if (!repoManifest || !Array.isArray(repoManifest.managedFiles)) {
    throw new Error("Repository generated manifest is missing or invalid.");
  }

  const expected = managedFiles;
  const actual = [...repoManifest.managedFiles].sort();

  if (expected.length !== actual.length) {
    throw new Error("Managed file count mismatch between generated output and repository manifest.");
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== actual[i]) {
      throw new Error("Managed file list mismatch between generated output and repository manifest.");
    }
  }
}

async function run(mode) {
  if (!["update", "build", "check"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const lock = mode === "update" ? await updateLock() : await loadLock();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pinout-sync-"));
  try {
    const sourceTrees = await fetchSourceTrees(lock, workDir);
    const model = await buildDataModel(lock, sourceTrees);

    if (mode === "check") {
      const tempOut = await fs.mkdtemp(path.join(os.tmpdir(), "pinout-check-"));
      try {
        const tempResult = await writeOutputs({ outputRoot: tempOut, model });
        await compareWithRepo({ tempRoot: tempOut, repoRoot: REPO_ROOT, managedFiles: tempResult.managedFiles });
      } finally {
        await fs.rm(tempOut, { recursive: true, force: true });
      }

      console.log("pinouts:check OK");
      return;
    }

    await writeOutputs({ outputRoot: REPO_ROOT, model });
    console.log(mode === "update" ? "pinouts:update OK" : "pinouts:build OK");
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const mode = parseMode(process.argv);
run(mode).catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
