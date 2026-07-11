// Message protocol shared between the extension host and the webview.
// (Imported by the webview via a relative path; also compiled by the host tsc.)

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | { type: 'init'; text: string }
  | { type: 'update'; text: string };

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'edit'; text: string };
