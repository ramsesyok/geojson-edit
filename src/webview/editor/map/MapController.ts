import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { fromLonLat } from 'ol/proj';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import { unByKey } from 'ol/Observable';
import { isEmpty } from 'ol/extent';
import { altKeyOnly, singleClick } from 'ol/events/condition';
import type { Interaction } from 'ol/interaction';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { EventsKey } from 'ol/events';
import { createBasemapLayer } from './basemap';
import { createGeojsonLayer, loadGeojsonText, selectedStyle, serializeGeojson } from './geojsonLayer';
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

  constructor(
    target: HTMLElement,
    pmtilesUri: string,
    private readonly onSelectionChange?: (feature: Feature | null) => void
  ) {
    const { layer, source } = createGeojsonLayer();
    this.overlayLayer = layer;
    this.source = source;

    this.map = new Map({
      target,
      layers: [layer],
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

    this.setTool('modify');
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
      this.selectKeys = selected.on(['add', 'remove'], () =>
        this.onSelectionChange?.(selected.getLength() ? (selected.item(0) as Feature) : null)
      );
      // Translate = drag the whole feature to move it (parallel move).
      // Modify = drag a vertex. Modify is added after Translate so it wins near
      // vertices; dragging the body falls through to Translate.
      const translate = new Translate({ features: selected });
      // Alt+click on a vertex deletes it (OL default; set explicitly for clarity).
      // OL keeps the geometry valid (line >= 2 points, polygon ring >= 3).
      const modify = new Modify({
        features: selected,
        deleteCondition: (e) => altKeyOnly(e) && singleClick(e),
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

  private onSourceChanged = (): void => {
    if (this.applyingRemote) {
      return; // change came from the host; do not echo it back
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      const text = serializeGeojson(this.source);
      this.lastText = text;
      vscode.postMessage({ type: 'edit', text });
    }, SYNC_DEBOUNCE_MS);
  };
}
