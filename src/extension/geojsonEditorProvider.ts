import * as vscode from 'vscode';
import { getEditorHtml } from './webviewHtml';
import type { FieldDef, WebviewToHost } from './protocol';

const EMPTY_FEATURE_COLLECTION = '{\n  "type": "FeatureCollection",\n  "features": []\n}\n';

/**
 * Custom text editor that opens .geojson files as an interactive map.
 * The underlying file stays a normal TextDocument, so dirty state, undo/redo,
 * save, and diffs all work through VSCode as usual.
 */
export class GeojsonEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'geojson-edit.editor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new GeojsonEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      GeojsonEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };
    webviewPanel.webview.html = getEditorHtml(webviewPanel.webview, this.context.extensionUri);

    // Seed a brand-new (empty) file with an empty FeatureCollection.
    if (document.getText().trim() === '') {
      await this.replaceDocument(document, EMPTY_FEATURE_COLLECTION);
    }

    // Guards against re-posting a document change that the webview itself caused.
    let applyingWebviewEdit = false;

    const postDoc = (type: 'init' | 'update'): void => {
      void webviewPanel.webview.postMessage({ type, text: document.getText() });
    };

    const postFields = (): void => {
      void webviewPanel.webview.postMessage({ type: 'fields', fields: this.readFields(document.uri) });
    };

    // Push external / undo-redo document changes back to the webview.
    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (applyingWebviewEdit) {
        return; // our own edit; the webview is already in sync
      }
      postDoc('update');
    });

    // Push field-definition changes from settings.json.
    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('geojson-edit.fields', document.uri)) {
        postFields();
      }
    });

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      switch (msg.type) {
        case 'ready':
          postDoc('init');
          postFields();
          return;
        case 'edit':
          applyingWebviewEdit = true;
          try {
            await this.replaceDocument(document, msg.text);
          } finally {
            applyingWebviewEdit = false;
          }
          return;
        case 'openFieldSettings':
          void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'geojson-edit.fields'
          );
          return;
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      configSub.dispose();
      messageSub.dispose();
    });
  }

  /** Read field definitions from workspace settings, scoped to the document. */
  private readFields(resource: vscode.Uri): FieldDef[] {
    const raw = vscode.workspace
      .getConfiguration('geojson-edit', resource)
      .get<FieldDef[]>('fields', []);
    // Keep only well-formed entries so a bad setting can't break the webview.
    return (Array.isArray(raw) ? raw : []).filter(
      (f): f is FieldDef =>
        !!f &&
        typeof f.key === 'string' &&
        ['string', 'number', 'boolean', 'enum'].includes(f.type)
    );
  }

  /** Replace the whole document via a WorkspaceEdit so undo/redo and dirty state work. */
  private async replaceDocument(document: vscode.TextDocument, text: string): Promise<void> {
    if (document.getText() === text) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, text);
    await vscode.workspace.applyEdit(edit);
  }
}
