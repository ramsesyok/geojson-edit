import { toLonLat } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';

// GeoJSON has no Circle type. We store a circle as a Point (its center) plus a
// `radius` property in ground meters. Because the map is Web Mercator (EPSG:3857)
// where distances are stretched by sec(latitude), we convert between the circle
// geometry's projected radius and real ground meters using the center latitude.

function secLat(center3857: Coordinate): number {
  const lat = toLonLat(center3857)[1];
  return 1 / Math.cos((lat * Math.PI) / 180);
}

/** Projected (EPSG:3857) radius -> ground meters, at the circle's center latitude. */
export function projectedRadiusToMeters(projRadius: number, center3857: Coordinate): number {
  return projRadius / secLat(center3857);
}

/** Ground meters -> projected (EPSG:3857) radius, at the circle's center latitude. */
export function metersToProjectedRadius(groundMeters: number, center3857: Coordinate): number {
  return groundMeters * secLat(center3857);
}
