const vscode = require("vscode");

const VIEW_TYPE = "esphomeGpioPinout";
const UPDATE_DEBOUNCE_MS = 250;
const AUTO_OPEN_SETTING = "esphomeGpioPinout.autoOpen";
const ESPHOME_YAML_HEURISTIC = /(^|\n)\s*(esphome|esp32|esp8266|rp2040|nrf52|bk72xx|rtl87xx)\s*:/;

let panel;
let lastActiveDocument = null;
let lastActiveDocumentUri = null;
let lastActiveViewColumn = null;
let updateTimer = null;
const autoOpenedDocumentUris = new Set();

function activate(context) {
  rememberActiveEditor(vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.commands.registerCommand("esphomeGpioPinout.open", () => {
      if (panel) {
        // Rebuild HTML so UI changes are reflected without requiring manual panel disposal.
        panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
        panel.reveal(vscode.ViewColumn.Beside, true);
        return;
      }

      const created = vscode.window.createWebviewPanel(VIEW_TYPE, "ESPHome GPIO Pinout", vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      adoptPanel(created, context);
      sendUpdate();
    }),
  );

  // Restore the panel after a window reload instead of dropping it.
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      deserializeWebviewPanel(restoredPanel) {
        restoredPanel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        };
        adoptPanel(restoredPanel, context);
        sendUpdate();
        return Promise.resolve();
      },
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) rememberActiveEditor(editor);
      void maybeAutoOpenPanel(editor);
      if (!panel || !editor) return;
      scheduleUpdate();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!panel) return;
      if (isTrackedDocument(event.document)) scheduleUpdate();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!panel) {
        const active = vscode.window.activeTextEditor;
        if (active && active.document === doc) void maybeAutoOpenPanel(active);
      }

      if (!panel) return;
      if (isTrackedDocument(doc)) sendUpdate();
    }),
  );

  void maybeAutoOpenPanel(vscode.window.activeTextEditor);
}

function adoptPanel(webviewPanel, context) {
  panel = webviewPanel;
  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "requestRefresh") {
      sendUpdate();
      return;
    }
    if (message.type === "jump" && Number.isFinite(message.line)) {
      await jumpToLine(message.line);
      return;
    }
    if (message.type === "focusEditor") {
      await showTrackedEditor({ focus: true });
      return;
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function isTrackedDocument(doc) {
  if (!doc) return false;
  const active = vscode.window.activeTextEditor;
  if (active && active.document === doc && isYamlDocument(doc)) return true;
  if (lastActiveDocument && lastActiveDocument === doc) return true;
  if (lastActiveDocumentUri && doc.uri.toString() === lastActiveDocumentUri) return true;
  return false;
}

function scheduleUpdate() {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    updateTimer = null;
    sendUpdate();
  }, UPDATE_DEBOUNCE_MS);
}

function sendUpdate() {
  if (!panel) return;
  const payload = getActiveEditorPayload();
  if (payload.ok) lastActiveDocumentUri = payload.uri;
  panel.webview.postMessage({ type: "update", payload });
}

function getActiveEditorPayload() {
  const editor = vscode.window.activeTextEditor;

  // Stay sticky on the last YAML document: switching focus to a code file,
  // output pane, or settings editor should not blank the pinout panel.
  if (editor && isYamlDocument(editor.document)) {
    rememberActiveEditor(editor);
    return buildPayloadFromDocument(editor.document);
  }

  if (lastActiveDocument && !lastActiveDocument.isClosed) {
    return buildPayloadFromDocument(lastActiveDocument);
  }

  if (lastActiveDocumentUri) {
    const fallback = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === lastActiveDocumentUri);
    if (fallback && !fallback.isClosed) {
      lastActiveDocument = fallback;
      return buildPayloadFromDocument(fallback);
    }
  }

  if (editor && editor.document) {
    return buildPayloadFromDocument(editor.document);
  }

  return {
    ok: false,
    reason: "No active editor. Open an ESPHome YAML file to begin.",
  };
}

async function showTrackedEditor({ focus }) {
  if (!lastActiveDocumentUri) return null;
  const uri = vscode.Uri.parse(lastActiveDocumentUri);
  const visible = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString());

  const doc =
    visible?.document ??
    (lastActiveDocument && !lastActiveDocument.isClosed
      ? lastActiveDocument
      : await vscode.workspace.openTextDocument(uri));

  const viewColumn = visible?.viewColumn ?? lastActiveViewColumn ?? vscode.ViewColumn.One;
  const editor = await vscode.window.showTextDocument(doc, { viewColumn, preserveFocus: !focus });
  if (editor) rememberActiveEditor(editor);
  return editor;
}

async function jumpToLine(lineNumber) {
  const editor = await showTrackedEditor({ focus: true });
  if (!editor) return;

  const maxLine = editor.document.lineCount || lineNumber;
  const line = Math.max(1, Math.min(lineNumber, maxLine));
  const pos = new vscode.Position(line - 1, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

function rememberActiveEditor(editor) {
  if (!editor || !editor.document) return;
  if (!isYamlDocument(editor.document)) return;
  lastActiveDocument = editor.document;
  lastActiveDocumentUri = editor.document.uri.toString();
  if (editor.viewColumn) lastActiveViewColumn = editor.viewColumn;
}

function buildPayloadFromDocument(doc) {
  return {
    ok: true,
    yamlText: doc.getText(),
    fileName: doc.fileName,
    languageId: doc.languageId,
    isDirty: doc.isDirty,
    uri: doc.uri.toString(),
  };
}

function isYamlDocument(doc) {
  if (!doc) return false;
  if (doc.languageId === "yaml" || doc.languageId === "esphome") return true;
  const file = String(doc.fileName || "").toLowerCase();
  return file.endsWith(".yaml") || file.endsWith(".yml");
}

function looksLikeEsphomeDocument(doc) {
  if (!isYamlDocument(doc)) return false;
  const text = doc.getText().slice(0, 120000);
  return ESPHOME_YAML_HEURISTIC.test(text);
}

async function maybeAutoOpenPanel(editor) {
  if (panel) return;
  if (!editor || !editor.document) return;
  if (!vscode.workspace.getConfiguration().get(AUTO_OPEN_SETTING, false)) return;
  if (!looksLikeEsphomeDocument(editor.document)) return;

  const uri = editor.document.uri.toString();
  if (autoOpenedDocumentUris.has(uri)) return;
  autoOpenedDocumentUris.add(uri);

  await vscode.commands.executeCommand("esphomeGpioPinout.open");
}

function getWebviewHtml(webview, extensionUri) {
  const logicUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "esphome-gpio-pinout-parser.js"));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "esphome-gpio-pinout.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinout.css"));
  const pinoutBaseUri = `${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinouts"))}/`;
  const pinoutIndexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinouts", "index.json"));

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `connect-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ESPHome GPIO Pinout</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body data-pinout-base="${pinoutBaseUri}" data-pinout-index="${pinoutIndexUri}">
  <div class="tm-modal">
    <div class="tm-modal-header">
      <div class="tm-hgroup">
        <div class="tm-h-title" id="tm-esphome-pinout-board">ESPHome GPIO Pinout</div>
        <div class="tm-h-subtitle" id="tm-esphome-pinout-subtitle">Waiting for YAML</div>
      </div>
      <div class="tm-actions">
        <div class="tm-zoom-group" role="group" aria-label="Zoom controls">
          <button class="tm-btn tm-zoom-btn" id="tm-esphome-pinout-zoomout" title="Zoom out (Ctrl/Cmd + scroll)" aria-label="Zoom out">&minus;</button>
          <button class="tm-zoom-label" id="tm-esphome-pinout-zoomlabel" title="Reset zoom to 100%" aria-label="Reset zoom">100%</button>
          <button class="tm-btn tm-zoom-btn" id="tm-esphome-pinout-zoomin" title="Zoom in (Ctrl/Cmd + scroll)" aria-label="Zoom in">+</button>
        </div>
        <div class="tm-select-wrap" id="tm-esphome-pinout-labelstyle-wrap" hidden>
          <select class="tm-select" id="tm-esphome-pinout-labelstyle" aria-label="Pin label style">
            <option value="gpio">GPIO labels</option>
            <option value="board">Silkscreen labels</option>
          </select>
        </div>
        <button class="tm-btn" id="tm-esphome-pinout-refresh" title="Re-read the active YAML file">Refresh</button>
      </div>
    </div>
    <div class="tm-modal-body">
      <div class="tm-diagram-wrap">
        <div class="tm-diagram" id="tm-esphome-pinout-diagram"></div>
        <div class="tm-legend" id="tm-esphome-pinout-legend" hidden></div>
      </div>
      <div class="tm-side" id="tm-esphome-pinout-side"></div>
    </div>
  </div>

  <script src="${logicUri}" defer></script>
  <script src="${scriptUri}" defer></script>
</body>
</html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
