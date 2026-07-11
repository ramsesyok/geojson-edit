import * as vscode from 'vscode';
import { GeojsonEditorProvider } from './geojsonEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(GeojsonEditorProvider.register(context));
}

export function deactivate(): void {
  /* no-op */
}
