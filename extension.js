const vscode = require("vscode");

const VIEW_TYPE = "esphomeGpioPinout";
const UPDATE_DEBOUNCE_MS = 250;

let panel;
let lastActiveDocument = null;
let lastActiveDocumentUri = null;
let lastActiveViewColumn = null;
let updateTimer = null;

function activate(context) {
  rememberActiveEditor(vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.commands.registerCommand("esphomeGpioPinout.open", () => {
      if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
        sendUpdate();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        "ESPHome GPIO Pinout",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
        }
      );

      panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

      panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;
        if (message.type === "requestRefresh") {
          sendUpdate();
          await focusLastActiveEditor();
          return;
        }
        if (message.type === "jump" && Number.isFinite(message.line)) {
          await jumpToLine(message.line);
          return;
        }
        if (message.type === "focusEditor") {
          await focusLastActiveEditor();
          return;
        }
      });

      panel.onDidDispose(() => {
        panel = undefined;
      });

      sendUpdate();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) rememberActiveEditor(editor);
      if (!panel || !editor) return;
      scheduleUpdate();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!panel) return;
      const active = vscode.window.activeTextEditor;
      if (active && active.document === event.document) {
        scheduleUpdate();
        return;
      }
      if (lastActiveDocument && lastActiveDocument === event.document) {
        scheduleUpdate();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!panel) return;
      const active = vscode.window.activeTextEditor;
      if (active && active.document === doc) {
        sendUpdate();
        return;
      }
      if (lastActiveDocumentUri && doc.uri.toString() === lastActiveDocumentUri) {
        sendUpdate();
      }
    })
  );
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
  if (editor) {
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

  return {
    ok: false,
    reason: "No active editor. Open an ESPHome YAML file to begin."
  };
}

async function jumpToLine(lineNumber) {
  if (!lastActiveDocumentUri) return;
  const uri = vscode.Uri.parse(lastActiveDocumentUri);
  let editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString());

  if (!editor) {
    const doc =
      lastActiveDocument && !lastActiveDocument.isClosed
        ? lastActiveDocument
        : await vscode.workspace.openTextDocument(uri);
    const viewColumn = lastActiveViewColumn ?? vscode.ViewColumn.One;
    editor = await vscode.window.showTextDocument(doc, { viewColumn });
  } else {
    editor = await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn ?? lastActiveViewColumn });
  }

  if (!editor) return;
  const maxLine = editor.document.lineCount || lineNumber;
  const line = Math.max(1, Math.min(lineNumber, maxLine));
  const pos = new vscode.Position(line - 1, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  rememberActiveEditor(editor);
}

function rememberActiveEditor(editor) {
  if (!editor || !editor.document) return;
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
    uri: doc.uri.toString()
  };
}

async function focusLastActiveEditor() {
  if (!lastActiveDocumentUri) return;
  const uri = vscode.Uri.parse(lastActiveDocumentUri);
  let editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString());
  if (!editor) {
    const doc =
      lastActiveDocument && !lastActiveDocument.isClosed
        ? lastActiveDocument
        : await vscode.workspace.openTextDocument(uri);
    const viewColumn = lastActiveViewColumn ?? vscode.ViewColumn.One;
    editor = await vscode.window.showTextDocument(doc, { viewColumn });
  } else {
    editor = await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn ?? lastActiveViewColumn });
  }
  if (editor) rememberActiveEditor(editor);
}

function getWebviewHtml(webview, extensionUri) {
  const logicUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "esphome-gpio-pinout-parser.js"));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "esphome-gpio-pinout.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinout.css"));
  const pinoutBaseUri = `${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinouts"))}/`;
  const pinoutIndexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "pinouts", "index.json"));

  const csp = [
    "default-src 'none'",
    "img-src data:",
    `connect-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`
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
        <button class="tm-btn" id="tm-esphome-pinout-zoomout">-</button>
        <div class="tm-zoom-label" id="tm-esphome-pinout-zoomlabel">100%</div>
        <button class="tm-btn" id="tm-esphome-pinout-zoomin">+</button>
        <button class="tm-btn" id="tm-esphome-pinout-refresh">Refresh</button>
      </div>
    </div>
    <div class="tm-modal-body">
      <div class="tm-diagram" id="tm-esphome-pinout-diagram"></div>
      <div class="tm-side" id="tm-esphome-pinout-side"></div>
    </div>
  </div>

  <script src="${logicUri}" defer></script>
  <script src="${scriptUri}" defer></script>
</body>
</html>`;
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
