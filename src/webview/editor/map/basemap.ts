import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { createXYZ } from 'ol/tilegrid';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import { PMTiles } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import type VectorTile from 'ol/VectorTile';
import type RenderFeature from 'ol/render/Feature';

/**
 * pmtiles Source backed by an in-memory ArrayBuffer. The whole archive
 * (~3.8MB) is fetched once, so no HTTP Range and no local server is required.
 */
class BufferSource implements Source {
  constructor(private readonly buf: ArrayBuffer, private readonly key: string) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: this.buf.slice(offset, offset + length) };
  }
}

/**
 * Load the bundled world.pmtiles and build a "simple outline only" basemap
 * layer (lines, no fill, no labels) for the given webview resource URI.
 */
export async function createBasemapLayer(pmtilesUri: string): Promise<VectorTileLayer> {
  const resp = await fetch(pmtilesUri);
  if (!resp.ok) {
    throw new Error(`failed to fetch pmtiles: HTTP ${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  const pmtiles = new PMTiles(new BufferSource(buf, pmtilesUri));
  const header = await pmtiles.getHeader();

  const mvt = new MVT();
  const source = new VectorTileSource({
    format: mvt,
    tileGrid: createXYZ({ maxZoom: header.maxZoom }),
    tileUrlFunction: (coord) => `${coord[0]}/${coord[1]}/${coord[2]}`,
    tileLoadFunction: (tile, url) => {
      const vt = tile as VectorTile<RenderFeature>;
      // Outer loader stays synchronous (returns void); the async read + setFeatures
      // happens inside. This is the form proven to render in the PoC.
      vt.setLoader((extent, _resolution, projection) => {
        void (async () => {
          const [z, x, y] = url.split('/').map(Number);
          try {
            const t = await pmtiles.getZxy(z, x, y);
            if (!t) {
              vt.setFeatures([]);
              return;
            }
            const features = mvt.readFeatures(t.data, {
              extent,
              featureProjection: projection,
            }) as RenderFeature[];
            vt.setFeatures(features);
          } catch {
            vt.setFeatures([]);
          }
        })();
      });
    },
  });

  return new VectorTileLayer({
    source,
    style: () => new Style({ stroke: new Stroke({ color: '#5b8def', width: 1 }) }),
  });
}
