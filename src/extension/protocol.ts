// Message protocol shared between the extension host and the webview.
// (Imported by the webview via a relative path; also compiled by the host tsc.)

/** A user-defined property field, configured in workspace settings. */
export interface FieldDef {
  /** Property key stored in the GeoJSON feature. */
  key: string;
  /** Editor type for this field. `color` edits a #rrggbb hex with a picker. */
  type: 'string' | 'number' | 'boolean' | 'enum' | 'color';
  /** Display label; falls back to `key` when omitted. */
  label?: string;
  /** Allowed values for `type: 'enum'`. */
  options?: string[];
}

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | { type: 'init'; text: string }
  | { type: 'update'; text: string }
  | { type: 'fields'; fields: FieldDef[] };

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  | { type: 'openFieldSettings' };
