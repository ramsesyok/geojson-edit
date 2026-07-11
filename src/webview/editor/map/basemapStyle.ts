import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import type { FeatureLike } from 'ol/Feature';

// Port of the MapLibre demotiles vector style (maplibre/demotiles) to
// OpenLayers style functions, so the embedded basemap matches the reference.
// Source-layers in world.pmtiles: "countries", "geolines", "centroids".

export const OCEAN_COLOR = '#D8F2FF';
const COASTLINE_COLOR = '#198EC8';
const BOUNDARY_COLOR = 'rgba(255, 255, 255, 0.85)';
const GEOLINE_COLOR = '#1077B0';
const LABEL_COLOR = 'rgba(8, 37, 77, 1)';
const LABEL_HALO_COLOR = '#ffffff';
const FALLBACK_FILL = '#EAB38F';

// country ADM0_A3 -> fill color (verbatim from demotiles style.json)
const COUNTRY_COLOR_GROUPS: [string, string[]][] = [
  ['#D6C7FF', ['ARM', 'ATG', 'AUS', 'BTN', 'CAN', 'COG', 'CZE', 'GHA', 'GIN', 'HTI', 'ISL', 'JOR', 'KHM', 'KOR', 'LVA', 'MLT', 'MNE', 'MOZ', 'PER', 'SAH', 'SGP', 'SLV', 'SOM', 'TJK', 'TUV', 'UKR', 'WSM']],
  ['#EBCA8A', ['AZE', 'BGD', 'CHL', 'CMR', 'CSI', 'DEU', 'DJI', 'GUY', 'HUN', 'IOA', 'JAM', 'LBN', 'LBY', 'LSO', 'MDG', 'MKD', 'MNG', 'MRT', 'NIU', 'NZL', 'PCN', 'PYF', 'SAU', 'SHN', 'STP', 'TTO', 'UGA', 'UZB', 'ZMB']],
  ['#C1E599', ['AGO', 'ASM', 'ATF', 'BDI', 'BFA', 'BGR', 'BLZ', 'BRA', 'CHN', 'CRI', 'ESP', 'HKG', 'HRV', 'IDN', 'IRN', 'ISR', 'KNA', 'LBR', 'LCA', 'MAC', 'MUS', 'NOR', 'PLW', 'POL', 'PRI', 'SDN', 'TUN', 'UMI', 'USA', 'USG', 'VIR', 'VUT']],
  ['#E7E58F', ['ARE', 'ARG', 'BHS', 'CIV', 'CLP', 'DMA', 'ETH', 'GAB', 'GRD', 'HMD', 'IND', 'IOT', 'IRL', 'IRQ', 'ITA', 'KOS', 'LUX', 'MEX', 'NAM', 'NER', 'PHL', 'PRT', 'RUS', 'SEN', 'SUR', 'TZA', 'VAT']],
  ['#98DDA1', ['AUT', 'BEL', 'BHR', 'BMU', 'BRB', 'CYN', 'DZA', 'EST', 'FLK', 'GMB', 'GUM', 'HND', 'JEY', 'KGZ', 'LIE', 'MAF', 'MDA', 'NGA', 'NRU', 'SLB', 'SOL', 'SRB', 'SWZ', 'THA', 'TUR', 'VEN', 'VGB']],
  ['#83D5F4', ['AIA', 'BIH', 'BLM', 'BRN', 'CAF', 'CHE', 'COM', 'CPV', 'CUB', 'ECU', 'ESB', 'FSM', 'GAZ', 'GBR', 'GEO', 'KEN', 'LTU', 'MAR', 'MCO', 'MDV', 'NFK', 'NPL', 'PNG', 'PRY', 'QAT', 'SLE', 'SPM', 'SYC', 'TCA', 'TKM', 'TLS', 'VNM', 'WEB', 'WSB', 'YEM', 'ZWE']],
  ['#B1BBF9', ['ABW', 'ALB', 'AND', 'ATC', 'BOL', 'COD', 'CUW', 'CYM', 'CYP', 'EGY', 'FJI', 'GGY', 'IMN', 'KAB', 'KAZ', 'KWT', 'LAO', 'MLI', 'MNP', 'MSR', 'MYS', 'NIC', 'NLD', 'PAK', 'PAN', 'PRK', 'ROU', 'SGS', 'SVN', 'SWE', 'TGO', 'TWN', 'VCT', 'ZAF']],
  ['#FFFFFF', ['ATA', 'GRL']],
];

const COUNTRY_COLORS: Record<string, string> = {};
for (const [color, codes] of COUNTRY_COLOR_GROUPS) {
  for (const code of codes) {
    COUNTRY_COLORS[code] = color;
  }
}

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
const geolineStyle = new Style({
  stroke: new Stroke({ color: GEOLINE_COLOR, width: 1, lineDash: [3, 3] }),
  zIndex: 3,
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
    const code = feature.get('ADM0_A3') as string | undefined;
    const fill = fillStyleFor((code && COUNTRY_COLORS[code]) || FALLBACK_FILL);
    coastStyle.getStroke()?.setWidth(interpolate(zoom, COAST_WIDTH));
    boundaryStyle.getStroke()?.setWidth(interpolate(zoom, BOUNDARY_WIDTH));
    return [fill, coastStyle, boundaryStyle];
  }

  if (layer === 'geolines') {
    return geolineStyle;
  }

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
