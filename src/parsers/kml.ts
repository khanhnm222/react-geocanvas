import type { Feature, FeatureCollection, Geometry } from 'geojson';

function parseCoords(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(parts => parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
    .map(parts => [parts[0], parts[1]]); // [lon, lat], ignore altitude
}

function firstTag(el: Element, tag: string): Element | null {
  return el.getElementsByTagName(tag)[0] ?? null;
}

function textOf(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}

function parsePoint(el: Element): Geometry | null {
  const coords = parseCoords(textOf(el, 'coordinates'));
  return coords.length > 0 ? { type: 'Point', coordinates: coords[0] } : null;
}

function parseLineString(el: Element): Geometry | null {
  const coords = parseCoords(textOf(el, 'coordinates'));
  return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
}

function parsePolygon(el: Element): Geometry | null {
  const outerEl = firstTag(el, 'outerBoundaryIs');
  if (!outerEl) return null;
  const outer = parseCoords(textOf(outerEl, 'coordinates'));
  if (outer.length < 3) return null;
  const rings: number[][][] = [outer];
  for (const innerEl of Array.from(el.getElementsByTagName('innerBoundaryIs'))) {
    const inner = parseCoords(textOf(innerEl, 'coordinates'));
    if (inner.length >= 3) rings.push(inner);
  }
  return { type: 'Polygon', coordinates: rings };
}

function parseGeometryEl(el: Element): Geometry | null {
  const tag = el.localName || el.tagName.split(':').pop() || el.tagName;
  if (tag === 'Point') return parsePoint(el);
  if (tag === 'LineString') return parseLineString(el);
  if (tag === 'Polygon') return parsePolygon(el);
  if (tag === 'MultiGeometry') {
    const geoms: Geometry[] = [];
    for (const child of Array.from(el.children)) {
      const g = parseGeometryEl(child);
      if (g) geoms.push(g);
    }
    if (geoms.length === 0) return null;
    if (geoms.length === 1) return geoms[0];
    return { type: 'GeometryCollection', geometries: geoms };
  }
  return null;
}

function parsePlacemark(pm: Element): Feature | null {
  // geometry
  let geometry: Geometry | null = null;
  const multiEl = firstTag(pm, 'MultiGeometry');
  if (multiEl) {
    geometry = parseGeometryEl(multiEl);
  } else {
    const pointEl = firstTag(pm, 'Point');
    if (pointEl) geometry = parsePoint(pointEl);
    if (!geometry) {
      const lineEl = firstTag(pm, 'LineString');
      if (lineEl) geometry = parseLineString(lineEl);
    }
    if (!geometry) {
      const polyEl = firstTag(pm, 'Polygon');
      if (polyEl) geometry = parsePolygon(polyEl);
    }
  }
  if (!geometry) return null;

  // properties
  const props: Record<string, unknown> = {};
  const name = textOf(pm, 'name');
  const desc = textOf(pm, 'description');
  if (name) props.name = name;
  if (desc) props.description = desc;

  for (const sd of Array.from(pm.getElementsByTagName('SimpleData'))) {
    const key = sd.getAttribute('name');
    if (key) props[key] = sd.textContent?.trim() ?? '';
  }
  for (const d of Array.from(pm.getElementsByTagName('Data'))) {
    const key = d.getAttribute('name');
    if (key) {
      const vEl = d.getElementsByTagName('value')[0];
      props[key] = vEl?.textContent?.trim() ?? '';
    }
  }

  return { type: 'Feature', geometry, properties: props };
}

export function parseKML(kmlString: string): FeatureCollection {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlString, 'application/xml');
  const features: Feature[] = [];
  for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
    const f = parsePlacemark(pm);
    if (f) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}