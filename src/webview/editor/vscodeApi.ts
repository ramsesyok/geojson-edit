import type { FieldDef, HostToWebview, WebviewToHost } from '../../extension/protocol';

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi may only be called once per webview.
export const vscode: VsCodeApi = acquireVsCodeApi();

export type { FieldDef, HostToWebview, WebviewToHost };
