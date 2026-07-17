import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import CircleGeom from 'ol/geom/Circle';
import { unByKey } from 'ol/Observable';
import { isEmpty } from 'ol/extent';
import { altKeyOnly, primaryAction, shiftKeyOnly, singleClick } from 'ol/events/condition';
import type { Interaction } from 'ol/interaction';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { VectorSourceEvent } from 'ol/source/Vector';
import type Geometry from 'ol/geom/Geometry';
import type SimpleGeometry from 'ol/geom/SimpleGeometry';
import type BaseEvent from 'ol/events/Event';
import type { EventsKey } from 'ol/events';
import type { Coordinate } from 'ol/coordinate';
import { createBasemapLayer } from './basemap';
import {
  createGeojsonLayer,
  createHighlightLayer,
  loadGeojsonText,
  selectedStyle,
  serializeGeojson,
} from './geojsonLayer';
import { vscode } from '../vscodeApi';

export type Tool = 'modify' | 'Point' | 'LineString' | 'Polygon' | 'Circle' | 'delete';

const SYNC_DEBOUNCE_MS = 300;

/**
 * Owns the OpenLayers map, its editing interactions, and the two-way sync with
 * the extension host. React only drives the active tool and forwards documents.
 */
export class MapController {
  private readonly map: Map;
  private readonly overlayLayer: VectorLayer;
  private readonly source: VectorSource;
  private readonly highlightSource: VectorSource;
  private readonly sourceKeys: EventsKey[];

  private dynamicInteractions: Interaction[] = [];
  private clickKey: EventsKey | null = null;
  private selectKeys: EventsKey[] = [];
  private currentSelect: Select | null = null;

  private applyingRemote = false;
  private lastText: string | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private hasFitted = false;
  private clipboardFeature: Feature | null = null;

  // Deferred editing: while a feature is selected, its map + panel edits are a
  // draft that is not written to the host until commitEdit(). committedGeom is
  // the last-committed geometry used to revert on 取消 / deselect.
  private selectedFeature: Feature | null = null;
  private committedGeom: Geometry | null = null;
  private committedProps: Record<string, unknown> | null = null;
  private editDirty = false;
  private reverting = false;
  private committing = false;

  constructor(
    target: HTMLElement,
    pmtilesUri: string,
    private readonly onSelectionChange?: (feature: Feature | null) => void,
    private readonly onEditDirtyChange?: (dirty: boolean) => void
  ) {
    const { layer, source } = createGeojsonLayer();
    this.overlayLayer = layer;
    this.source = source;

    const highlight = createHighlightLayer();
    this.highlightSource = highlight.source;

    this.map = new Map({
      target,
      layers: [layer, highlight.layer],
      view: new View({ center: fromLonLat([0, 20]), zoom: 2, maxZoom: 18 }),
    });

    // Basemap loads asynchronously; insert it beneath the GeoJSON overlay.
    createBasemapLayer(pmtilesUri)
      .then((basemap) => {
        if (!this.disposed) {
          this.map.getLayers().insertAt(0, basemap);
        }
      })
      .catch((e) => console.error('basemap load failed:', e));

    this.sourceKeys = this.source.on(
      ['addfeature', 'changefeature', 'removefeature'],
      this.onSourceChanged
    );

    window.addEventListener('keydown', this.onKeyDown);

    this.setTool('modify');
  }

  // Esc ends editing; Ctrl/Cmd+C copies the selected feature; Ctrl/Cmd+V pastes
  // a duplicate. Ignored while typing in the property panel.
  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      return;
    }

    if (e.key === 'Escape') {
      const features = this.currentSelect?.getFeatures();
      if (features && features.getLength() > 0) {
        features.clear();
        e.preventDefault();
      }
      return;
    }

    const modifier = e.ctrlKey || e.metaKey;
    if (modifier && (e.key === 'c' || e.key === 'C')) {
      this.copySelected();
      e.preventDefault();
    } else if (modifier && (e.key === 'v' || e.key === 'V')) {
      this.pasteClipboard();
      e.preventDefault();
    }
  };

  /** Copy the currently selected feature into the in-editor clipboard. */
  private copySelected(): void {
    const selected = this.currentSelect?.getFeatures().item(0) as Feature | undefined;
    if (selected) {
      const clone = selected.clone();
      // clone() copies the current per-feature style, which for a selected
      // feature is the Select highlight. Clear it so the pasted feature uses the
      // layer style and can actually be deselected.
      clone.setStyle(undefined);
      this.clipboardFeature = clone;
    }
  }

  /** Paste a duplicate of the clipboard feature, offset a bit from the original. */
  private pasteClipboard(): void {
    if (!this.clipboardFeature) {
      return;
    }
    const copy = this.clipboardFeature.clone();
    copy.setId(undefined); // avoid duplicate ids
    // Offset by ~24px in the current view so the copy doesn't overlap exactly.
    const d = 24 * (this.map.getView().getResolution() ?? 1);
    copy.getGeometry()?.translate(d, -d);
    this.source.addFeature(copy); // fires addfeature -> edit sync

    // Select the pasted feature when in edit mode.
    const selected = this.currentSelect?.getFeatures();
    if (selected) {
      selected.clear();
      selected.push(copy);
    }
  }

  /** Switch the active editing tool. */
  setTool(tool: Tool): void {
    for (const interaction of this.dynamicInteractions) {
      this.map.removeInteraction(interaction);
    }
    this.dynamicInteractions = [];
    if (this.clickKey) {
      unByKey(this.clickKey);
      this.clickKey = null;
    }
    for (const k of this.selectKeys) {
      unByKey(k);
    }
    this.selectKeys = [];
    this.currentSelect = null;
    this.onSelectionChange?.(null);

    // Switching tools ends the current selection; discard its uncommitted draft.
    if (this.selectedFeature && this.editDirty && !this.applyingRemote) {
      this.revertFeature(this.selectedFeature);
    }
    this.selectedFeature = null;
    this.committedGeom = null;
    this.committedProps = null;
    this.setHighlightVertex(null);
    this.setEditDirty(false);

    if (tool === 'modify') {
      // Click to select a feature: it is highlighted and its vertices get ●
      // handles; only the selected feature is editable. Clicking empty space
      // deselects it (Select's default), which ends the edit.
      const select = new Select({
        layers: [this.overlayLayer],
        style: selectedStyle,
        hitTolerance: 6,
        // Reserve Alt+click for vertex deletion so it doesn't change selection.
        condition: (e) => singleClick(e) && !altKeyOnly(e),
      });
      this.currentSelect = select;
      const selected = select.getFeatures();

      // Shift+drag translates the whole feature (all geometry types). Requiring
      // Shift unifies the move gesture and prevents accidental plain-drag moves.
      const translate = new Translate({ features: selected, condition: shiftKeyOnly });
      // Plain drag edits vertices / resizes a circle; Shift-drags are left to
      // Translate. Alt+click on a vertex deletes it.
      const modify = new Modify({
        features: selected,
        condition: (e) => primaryAction(e) && !shiftKeyOnly(e),
        deleteCondition: (e) => altKeyOnly(e) && singleClick(e),
      });

      this.selectKeys = selected.on(['add', 'remove'], () => {
        const feature = selected.getLength() ? (selected.item(0) as Feature) : null;
        this.onSelectionSwitched(feature);
        // A Point has no editable vertices — its only "edit" is moving it. Keep
        // Modify off for points so they, too, move only with Shift+drag.
        modify.setActive(!!feature && feature.getGeometry()?.getType() !== 'Point');
        this.onSelectionChange?.(feature);
      });
      const snap = new Snap({ source: this.source });
      this.map.addInteraction(select);
      this.map.addInteraction(translate);
      this.map.addInteraction(modify);
      this.map.addInteraction(snap); // Snap must be added last to take effect.
      this.dynamicInteractions = [select, translate, modify, snap];
    } else if (tool === 'delete') {
      this.clickKey = this.map.on('click', (ev) => {
        const hit = this.map.forEachFeatureAtPixel(ev.pixel, (f) => f, {
          layerFilter: (l) => l === this.overlayLayer,
          hitTolerance: 6,
        });
        if (hit) {
          this.source.removeFeature(hit as Feature);
        }
      });
    } else {
      const draw = new Draw({ source: this.source, type: tool });
      const snap = new Snap({ source: this.source });
      this.map.addInteraction(draw);
      this.map.addInteraction(snap);
      this.dynamicInteractions = [draw, snap];
    }
  }

  /** Apply a document received from the host without triggering an echo edit. */
  loadFromHost(text: string): void {
    if (text === this.lastText) {
      return;
    }
    this.lastText = text;
    this.applyingRemote = true;
    try {
      // The old selected feature is about to be removed; drop the selection so
      // the property panel doesn't hold a stale feature.
      this.currentSelect?.getFeatures().clear();
      loadGeojsonText(this.source, text);
    } finally {
      this.applyingRemote = false;
    }

    // On the first load with data, zoom to the features' extent.
    if (!this.hasFitted && this.source.getFeatures().length > 0) {
      const extent = this.source.getExtent();
      if (extent && !isEmpty(extent)) {
        this.map.getView().fit(extent, { padding: [48, 48, 48, 48], maxZoom: 12 });
        this.hasFitted = true;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    if (this.clickKey) {
      unByKey(this.clickKey);
    }
    for (const k of this.selectKeys) {
      unByKey(k);
    }
    unByKey(this.sourceKeys);
    this.map.setTarget(undefined);
  }

  /** Highlight a single vertex (in map projection) whose field is focused. */
  setHighlightVertex(coord: Coordinate | null): void {
    this.highlightSource.clear();
    if (coord) {
      this.highlightSource.addFeature(new Feature(new Point(coord)));
    }
  }

  // --- Deferred editing of the selected feature ------------------------------

  /** Commit the selected feature's draft (map + panel edits) and sync to host. */
  commitEdit(): void {
    if (!this.selectedFeature) {
      return;
    }
    this.committing = true;
    try {
      this.committedGeom = this.selectedFeature.getGeometry()?.clone() ?? null;
      this.committedProps = this.snapshotProps(this.selectedFeature);
    } finally {
      this.committing = false;
    }
    this.setEditDirty(false);
    this.syncNow();
  }

  /** Discard the selected feature's uncommitted edits (revert to snapshot). */
  revertEdit(): void {
    if (this.selectedFeature) {
      this.revertFeature(this.selectedFeature);
    }
  }

  /** Snapshot the newly selected feature; revert the one we're leaving if dirty. */
  private onSelectionSwitched(next: Feature | null): void {
    if (this.selectedFeature && this.selectedFeature !== next && this.editDirty && !this.applyingRemote) {
      // Leaving a feature (deselect / switch) discards its uncommitted edits.
      this.revertFeature(this.selectedFeature);
    }
    this.selectedFeature = next;
    this.committedGeom = next?.getGeometry()?.clone() ?? null;
    this.committedProps = next ? this.snapshotProps(next) : null;
    this.setHighlightVertex(null);
    this.setEditDirty(false);
  }

  /** Feature properties (excluding geometry) as a plain snapshot. */
  private snapshotProps(feature: Feature): Record<string, unknown> {
    const props = { ...feature.getProperties() };
    delete props.geometry;
    return props;
  }

  /** Restore the committed geometry and properties into the live feature. */
  private revertFeature(feature: Feature): void {
    this.reverting = true;
    try {
      const snap = this.committedGeom;
      const geom = feature.getGeometry();
      if (snap && geom) {
        if (geom instanceof CircleGeom && snap instanceof CircleGeom) {
          geom.setCenterAndRadius(snap.getCenter(), snap.getRadius());
        } else {
          const coords = (snap as SimpleGeometry).getCoordinates();
          if (coords) {
            (geom as SimpleGeometry).setCoordinates(coords);
          }
        }
      }
      if (this.committedProps) {
        const committed = this.committedProps;
        // Drop keys added since the snapshot, then restore the committed values.
        for (const k of Object.keys(feature.getProperties())) {
          if (k !== 'geometry' && !(k in committed)) {
            feature.unset(k, true);
          }
        }
        feature.setProperties({ ...committed }, true);
      }
    } finally {
      this.reverting = false;
    }
    this.setEditDirty(false);
  }

  private setEditDirty(dirty: boolean): void {
    if (this.editDirty !== dirty) {
      this.editDirty = dirty;
      this.onEditDirtyChange?.(dirty);
    }
  }

  private onSourceChanged = (evt: BaseEvent | Event): void => {
    const e = evt as unknown as VectorSourceEvent;
    if (this.applyingRemote || this.reverting) {
      return; // remote load or our own revert — never echo
    }
    if (e.type === 'changefeature' && e.feature === this.selectedFeature && !this.committing) {
      // A draft edit of the selected feature: hold the sync until 更新.
      this.setEditDirty(true);
      return;
    }
    this.scheduleSync();
  };

  private scheduleSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => this.syncNow(), SYNC_DEBOUNCE_MS);
  }

  private syncNow(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.disposed) {
      return;
    }
    const text = serializeGeojson(this.source);
    this.lastText = text;
    vscode.postMessage({ type: 'edit', text });
  }
}
