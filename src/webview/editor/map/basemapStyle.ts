import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import type { FeatureLike } from 'ol/Feature';

// Basemap style for the demotiles vector tiles (maplibre/demotiles) rendered
// with OpenLayers. Countries use a single neutral fill and the "geolines"
// layer (equator, tropics, date line) is hidden.
// Source-layers in world.pmtiles: "countries", "geolines", "centroids".

export const OCEAN_COLOR = '#D8F2FF';
const COASTLINE_COLOR = '#198EC8';
const BOUNDARY_COLOR = 'rgba(255, 255, 255, 0.85)';
const LABEL_COLOR = 'rgba(8, 37, 77, 1)';
const LABEL_HALO_COLOR = '#ffffff';

// All countries share one neutral fill (no per-country coloring).
const COUNTRY_FILL = '#e4e4e4';

// Web Mercator resolution (m/px) at zoom 0.
const Z0_RESOLUTION = 156543.03392804097;

function zoomFromResolution(resolution: number): number {
  return Math.log2(Z0_RESOLUTION / resolution);
}

function interpolate(zoom: number, stops: [number, number][]): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, v0] = stops[i];
    const [z1, v1] = stops[i + 1];
    if (zoom >= z0 && zoom <= z1) {
      return v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0);
    }
  }
  return last[1];
}

// Thinner than the MapLibre reference: its widths render too heavy in OL.
const COAST_WIDTH: [number, number][] = [[0, 0.8], [6, 1.6], [14, 3], [22, 6]];
const BOUNDARY_WIDTH: [number, number][] = [[1, 0.5], [6, 1], [14, 2.5], [22, 5]];

// Reusable styles (widths/text updated per render; zoom is constant per frame).
// zIndex enforces draw order within the single layer: fill < coast < boundary
// < geolines < labels, regardless of feature order in the tile.
const fillCache = new Map<string, Style>();
const coastStyle = new Style({
  stroke: new Stroke({ color: COASTLINE_COLOR, width: 2 }),
  zIndex: 1,
});
const boundaryStyle = new Style({
  stroke: new Stroke({ color: BOUNDARY_COLOR, width: 1 }),
  zIndex: 2,
});
const labelStyle = new Style({
  text: new Text({
    font: '600 12px "Segoe UI", sans-serif',
    fill: new Fill({ color: LABEL_COLOR }),
    stroke: new Stroke({ color: LABEL_HALO_COLOR, width: 2 }),
    overflow: true,
  }),
  zIndex: 5,
});

function fillStyleFor(color: string): Style {
  let style = fillCache.get(color);
  if (!style) {
    style = new Style({ fill: new Fill({ color }), zIndex: 0 });
    fillCache.set(color, style);
  }
  return style;
}

/** Style function for the demotiles vector basemap. */
export function basemapStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
  const layer = feature.get('__layer');
  const zoom = zoomFromResolution(resolution);

  if (layer === 'countries') {
    const fill = fillStyleFor(COUNTRY_FILL);
    coastStyle.getStroke()?.setWidth(interpolate(zoom, COAST_WIDTH));
    boundaryStyle.getStroke()?.setWidth(interpolate(zoom, BOUNDARY_WIDTH));
    return [fill, coastStyle, boundaryStyle];
  }

  // "geolines" (equator, tropics, date line) are intentionally not drawn.

  if (layer === 'centroids') {
    const name = (feature.get('NAME') ?? feature.get('ABBREV') ?? '') as string;
    if (!name) {
      return undefined;
    }
    labelStyle.getText()?.setText(name);
    return labelStyle;
  }

  return undefined;
}
