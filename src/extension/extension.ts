import * as vscode from 'vscode';
import { GeojsonEditorProvider } from './geojsonEditorProvider';

const EMPTY_FEATURE_COLLECTION = '{\n  "type": "FeatureCollection",\n  "features": []\n}\n';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(GeojsonEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('geojson-edit.openFieldSettings', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'geojson-edit.fields');
    }),
    vscode.commands.registerCommand('geojson-edit.newFile', async () => {
      const defaultDir = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        title: '新規 GeoJSON を作成',
        saveLabel: '作成',
        filters: { GeoJSON: ['geojson'] },
        defaultUri: defaultDir ? vscode.Uri.joinPath(defaultDir, 'untitled.geojson') : undefined,
      });
      if (!target) {
        return;
      }
      await vscode.workspace.fs.writeFile(
        target,
        new TextEncoder().encode(EMPTY_FEATURE_COLLECTION)
      );
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        GeojsonEditorProvider.viewType
      );
    })
  );
}

export function deactivate(): void {
  /* no-op */
}
