import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Shapefile binary format (.shp) parser — supports shape types 0,1,3,5,8,11,13,15,18,21,23,25,28

function i32be(v: DataView, o: number) { return v.getInt32(o, false); }
function i32le(v: DataView, o: number) { return v.getInt32(o, true); }
function f64le(v: DataView, o: number) { return v.getFloat64(o, true); }
function xy(v: DataView, o: number): [number, number] { return [f64le(v, o), f64le(v, o + 8)]; }

function readPolyParts(v: DataView, base: number) {
  // base = offset after shape type int32
  // layout: BBox(32b) + NumParts(4b) + NumPoints(4b) + Parts[](n*4b) + Points[](m*16b)
  const numParts = i32le(v, base + 32);
  const numPoints = i32le(v, base + 36);
  const parts: number[] = [];
  for (let i = 0; i < numParts; i++) parts.push(i32le(v, base + 40 + i * 4));
  const ptsBase = base + 40 + numParts * 4;
  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) points.push(xy(v, ptsBase + i * 16));
  return { parts, points };
}

// Signed area (shoelace) — negative = CCW in screen coords, positive = CW
function signedArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a / 2;
}

function parseRecord(v: DataView, contentOffset: number): Geometry | null {
  const st = i32le(v, contentOffset);
  const base = contentOffset + 4;

  if (st === 0) return null;

  // Point (1, 11, 21)
  if (st === 1 || st === 11 || st === 21) {
    return { type: 'Point', coordinates: xy(v, base) };
  }

  // MultiPoint (8, 18, 28)
  if (st === 8 || st === 18 || st === 28) {
    const n = i32le(v, base + 32);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push(xy(v, base + 36 + i * 16));
    if (pts.length === 0) return null;
    return pts.length === 1
      ? { type: 'Point', coordinates: pts[0] }
      : { type: 'MultiPoint', coordinates: pts };
  }

  // PolyLine (3, 13, 23)
  if (st === 3 || st === 13 || st === 23) {
    const { parts, points } = readPolyParts(v, base);
    if (parts.length === 0) return null;
    const lines: [number, number][][] = parts.map((start, i) => {
      const end = i + 1 < parts.length ? parts[i + 1] : points.length;
      return points.slice(start, end);
    });
    return lines.length === 1
      ? { type: 'LineString', coordinates: lines[0] }
      : { type: 'MultiLineString', coordinates: lines };
  }

  // Polygon (5, 15, 25)
  if (st === 5 || st === 15 || st === 25) {
    const { parts, points } = readPolyParts(v, base);
    if (parts.length === 0) return null;
    const rings: [number, number][][] = parts.map((start, i) => {
      const end = i + 1 < parts.length ? parts[i + 1] : points.length;
      return points.slice(start, end);
    });

    if (rings.length === 1) return { type: 'Polygon', coordinates: [rings[0]] };

    // Group rings: outer rings have CW winding (positive signed area in shapefile convention)
    // Each outer ring starts a new polygon; subsequent CCW rings are holes
    const polys: [number, number][][][] = [];
    let current: [number, number][][] | null = null;
    for (const ring of rings) {
      if (signedArea(ring) >= 0) {
        // outer ring
        if (current) polys.push(current);
        current = [ring];
      } else {
        // hole
        (current ?? (current = [ring])).push(ring);
      }
    }
    if (current) polys.push(current);

    return polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
  }

  return null;
}

export function parseShapefile(buffer: ArrayBuffer): FeatureCollection {
  const v = new DataView(buffer);
  if (v.byteLength < 100) throw new Error('File too small to be a valid shapefile');
  if (i32be(v, 0) !== 9994) throw new Error('Invalid shapefile: wrong file code');

  const fileBytes = i32be(v, 24) * 2;
  const features: Feature[] = [];
  let offset = 100;
  let idx = 0;

  while (offset + 8 <= fileBytes && offset + 8 <= v.byteLength) {
    const contentBytes = i32be(v, offset + 4) * 2;
    offset += 8;
    if (contentBytes <= 0 || offset + contentBytes > v.byteLength) break;
    try {
      const geom = parseRecord(v, offset);
      if (geom) features.push({ type: 'Feature', geometry: geom, properties: { _index: idx } });
    } catch {
      // skip invalid record
    }
    offset += contentBytes;
    idx++;
  }

  return { type: 'FeatureCollection', features };
}