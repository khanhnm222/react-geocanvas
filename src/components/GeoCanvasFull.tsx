// GeoJSON Canvas React Library (single-file reference + docs)
// File: src/GeoJSONCanvas.tsx
// TypeScript React component implemented for a small library that previews GeoJSON on an HTMLCanvasElement.

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { FeatureId, GeoJSONCanvasHandle, Styles } from '../types';

export type GeoJSONCanvasProps = {
  width?: number; // css pixels
  height?: number; // css pixels
  geojson: any; // FeatureCollection | Feature | Geometry
  padding?: number; // padding in px when fitting bounds
  styles?: Styles;
  background?: string | null;
  interactive?: boolean;
  onFeatureClick?: (feature: any, id?: FeatureId, ev?: MouseEvent) => void;
  onFeatureHover?: (feature: any | null, id?: FeatureId | null, ev?: MouseEvent | null) => void;
  getFeatureId?: (feature: any, index: number) => FeatureId;
  devicePixelRatio?: number;
  fitBoundsOnLoad?: boolean;
};

// Simple Mercator projection helpers (not full d3-geo). Works fine for world maps and web-mercator use.
function lonLatToMercator(lon: number, lat: number) {
  const x = (lon + 180) / 360;
  const y = (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
  return { x, y };
}

function extractFeatures(geojson: any) {
  const features: any[] = [];
  if (!geojson) return features;
  if (geojson.type === 'FeatureCollection') {
    for (const f of geojson.features || []) features.push(f);
  } else if (geojson.type === 'Feature') features.push(geojson);
  else if (geojson.type === 'GeometryCollection') {
    for (const g of geojson.geometries || []) features.push({ type: 'Feature', geometry: g, properties: {} });
  } else if (geojson.type && geojson.coordinates) features.push({ type: 'Feature', geometry: geojson, properties: {} });
  return features;
}

function getBoundsOfGeojson(geojson: any) {
  const features = extractFeatures(geojson);
  if (features.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visitCoords = (coords: number[] | any[]) => {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lon, lat] = coords as number[];
      const p = lonLatToMercator(lon, lat);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    } else {
      for (const c of coords) visitCoords(c);
    }
  };

  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;
    const { type, coordinates } = geom;
    if (type === 'Point') visitCoords(coordinates);
    else if (type === 'MultiPoint' || type === 'LineString') visitCoords(coordinates);
    else if (type === 'MultiLineString' || type === 'Polygon') visitCoords(coordinates);
    else if (type === 'MultiPolygon') visitCoords(coordinates);
    else if (type === 'GeometryCollection') {
      for (const g of geom.geometries || []) visitCoords(g.coordinates);
    }
  }

  return { minX, minY, maxX, maxY };
}

const defaultStyles: Styles = {
  point: { radius: 4, fill: '#1976d2', stroke: '#fff', lineWidth: 1 },
  line: { stroke: '#1976d2', lineWidth: 2 },
  polygon: { fill: 'rgba(25,118,210,0.2)', stroke: '#1976d2', lineWidth: 1 },
};

export const GeoCanvasFull = forwardRef<GeoJSONCanvasHandle, GeoJSONCanvasProps>(function GeoJSONCanvas(
  props,
  ref
) {
  const {
    width = 800,
    height = 600,
    geojson,
    padding = 20,
    styles = {},
    background = null,
    interactive = true,
    onFeatureClick,
    onFeatureHover,
    getFeatureId,
    devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    fitBoundsOnLoad = true,
  } = props;

  const mergedStyles = { ...defaultStyles, ...styles } as Styles;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    viewport: { scale: 1, translateX: 0, translateY: 0 },
    features: [] as any[],
    featureBounds: null as any,
    hoverId: null as FeatureId | null,
    dpr: devicePixelRatio,
  });

  // Build an internal representation of features with projected coordinates in [0..1] space (mercator x,y normalized)
  const buildInternalFeatures = useCallback((gj: any) => {
    const features = extractFeatures(gj).map((f: any, i: number) => ({
      id: (getFeatureId ? getFeatureId(f, i) : i) as FeatureId,
      feature: f,
    }));
    stateRef.current.features = features;
    stateRef.current.featureBounds = getBoundsOfGeojson(gj);
  }, [getFeatureId]);

  // Convert mercator normalized coordinates to canvas pixels (taking viewport into account)
  const mercatorToCanvas = useCallback((xNorm: number, yNorm: number, ctxW: number, ctxH: number) => {
    const vp = stateRef.current.viewport;
    // world coords normalized 0..1 => pixel coords
    const x = xNorm * ctxW * vp.scale + vp.translateX;
    const y = yNorm * ctxH * vp.scale + vp.translateY;
    return { x, y };
  }, []);

  const drawFeature = useCallback((ctx: CanvasRenderingContext2D, f: any, ctxW: number, ctxH: number) => {
    if (!f || !f.feature) return;
    const geom = f.feature.geometry;
    if (!geom) return;
    const drawCoords = (coords: any) => {
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [lon, lat] = coords as number[];
        const p = lonLatToMercator(lon, lat);
        const c = mercatorToCanvas(p.x, p.y, ctxW, ctxH);
        return c;
      }
      return null;
    };

    const tLine = mergedStyles.line!;
    const tPoly = mergedStyles.polygon!;
    const tPoint = mergedStyles.point!;

    const type = geom.type;
    if (type === 'Point') {
      const c = drawCoords(geom.coordinates) as any;
      if (!c) return;
      ctx.beginPath();
      ctx.arc(c.x, c.y, tPoint.radius || 3, 0, Math.PI * 2);
      if (tPoint.fill) { ctx.fillStyle = tPoint.fill; ctx.fill(); }
      if (tPoint.stroke) { ctx.lineWidth = tPoint.lineWidth || 1; ctx.strokeStyle = tPoint.stroke; ctx.stroke(); }
    } else if (type === 'MultiPoint') {
      for (const coord of geom.coordinates) {
        const c = drawCoords(coord) as any;
        if (!c) continue;
        ctx.beginPath();
        ctx.arc(c.x, c.y, tPoint.radius || 3, 0, Math.PI * 2);
        if (tPoint.fill) { ctx.fillStyle = tPoint.fill; ctx.fill(); }
        if (tPoint.stroke) { ctx.lineWidth = tPoint.lineWidth || 1; ctx.strokeStyle = tPoint.stroke; ctx.stroke(); }
      }
    } else if (type === 'LineString' || type === 'MultiLineString') {
      const lines = type === 'LineString' ? [geom.coordinates] : geom.coordinates;
      ctx.lineWidth = tLine.lineWidth || 1;
      ctx.strokeStyle = tLine.stroke || '#000';
      if (tLine.lineDash) ctx.setLineDash(tLine.lineDash);
      ctx.beginPath();
      for (const ring of lines) {
        let started = false;
        for (const coord of ring) {
          const c = drawCoords(coord) as any;
          if (!c) continue;
          if (!started) { ctx.moveTo(c.x, c.y); started = true; }
          else ctx.lineTo(c.x, c.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      const polys = type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      for (const poly of polys) {
        ctx.beginPath();
        let started = false;
        for (const ring of poly) {
          for (const coord of ring) {
            const c = drawCoords(coord) as any;
            if (!c) continue;
            if (!started) { ctx.moveTo(c.x, c.y); started = true; }
            else ctx.lineTo(c.x, c.y);
          }
          // close ring
        }
        if (tPoly.fill) { ctx.fillStyle = tPoly.fill; ctx.fill(); }
        if (tPoly.stroke) { ctx.lineWidth = tPoly.lineWidth || 1; ctx.strokeStyle = tPoly.stroke; ctx.stroke(); }
      }
    }
  }, [mercatorToCanvas, mergedStyles]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = stateRef.current.dpr || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, cssW, cssH);
    } else {
      ctx.clearRect(0, 0, cssW, cssH);
    }

    const features = stateRef.current.features || [];
    for (const f of features) {
      drawFeature(ctx, f, cssW, cssH);
    }
  }, [background, drawFeature]);

  // Fit bounds: find bounding box and compute scale/translate to fit into canvas
  const fitBounds = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = stateRef.current.featureBounds;
    if (!bounds) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const { minX, minY, maxX, maxY } = bounds;
    const worldW = (maxX - minX) || 1e-6;
    const worldH = (maxY - minY) || 1e-6;
    const scaleX = (cssW - padding * 2) / worldW;
    const scaleY = (cssH - padding * 2) / worldH;
    const scale = Math.min(scaleX, scaleY);
    const translateX = -minX * cssW * scale + padding + (cssW - (worldW * cssW * scale) - padding * 2) / 2;
    const translateY = -minY * cssH * scale + padding + (cssH - (worldH * cssH * scale) - padding * 2) / 2;
    stateRef.current.viewport = { scale, translateX, translateY };
    render();
  }, [padding, render]);

  useImperativeHandle(ref, () => ({
    fitBounds: () => fitBounds(),
    toDataURL: (type?: string, quality?: number) => (canvasRef.current ? canvasRef.current.toDataURL(type, quality) : ''),
  }));

  // Interaction helpers: simple point-in-polygon and point-to-line distance
  function pointInPolygon(x: number, y: number, poly: number[][]) {
    // ray-casting algorithm
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = Math.max(0, Math.min(1, t));
    const cx = x1 + tt * dx;
    const cy = y1 + tt * dy;
    return Math.hypot(px - cx, py - cy);
  }

  const hitTest = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const features = stateRef.current.features || [];
    // iterate backwards so top-most features are tested first
    for (let i = features.length - 1; i >= 0; i--) {
      const f = features[i];
      const geom = f.feature.geometry;
      if (!geom) continue;
      const type = geom.type;
      if (type === 'Point') {
        const p = lonLatToMercator(geom.coordinates[0], geom.coordinates[1]);
        const c = mercatorToCanvas(p.x, p.y, cssW, cssH);
        const r = (mergedStyles.point?.radius || 4) + 4;
        if (Math.hypot(c.x - x, c.y - y) <= r) return f;
      } else if (type === 'Polygon' || type === 'MultiPolygon') {
        const polys = type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        for (const poly of polys) {
          // test outer ring only for now
          const ring = poly[0];
          const ringPx: number[][] = ring.map((coord: number[]) => {
            const p = lonLatToMercator(coord[0], coord[1]);
            const c = mercatorToCanvas(p.x, p.y, cssW, cssH);
            return [c.x, c.y];
          });
          if (pointInPolygon(x, y, ringPx)) return f;
        }
      } else if (type === 'LineString' || type === 'MultiLineString') {
        const lines = type === 'LineString' ? [geom.coordinates] : geom.coordinates;
        const tolerance = (mergedStyles.line?.lineWidth || 2) + 6;
        for (const line of lines) {
          for (let vi = 0; vi < line.length - 1; vi++) {
            const a = line[vi];
            const b = line[vi + 1];
            const pa = mercatorToCanvas(lonLatToMercator(a[0], a[1]).x, lonLatToMercator(a[0], a[1]).y, cssW, cssH);
            const pb = mercatorToCanvas(lonLatToMercator(b[0], b[1]).x, lonLatToMercator(b[0], b[1]).y, cssW, cssH);
            const d = distanceToSegment(x, y, pa.x, pa.y, pb.x, pb.y);
            if (d <= tolerance) return f;
          }
        }
      }
    }
    return null;
  }, [mercatorToCanvas, mergedStyles]);

  useEffect(() => {
    buildInternalFeatures(geojson);
    // autoscale
    if (fitBoundsOnLoad) {
      // wait for layout
      requestAnimationFrame(() => { fitBounds(); });
    } else {
      render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, buildInternalFeatures]);

  // mouse interactions
  useEffect(() => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastHoverId: any = null;

    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left);
      const y = (ev.clientY - rect.top);
      const hit = hitTest(x, y);
      const hitId = hit ? hit.id : null;
      if (hitId !== lastHoverId) {
        lastHoverId = hitId;
        if (onFeatureHover) onFeatureHover(hit ? hit.feature : null, hitId, ev);
      }
    };

    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left);
      const y = (ev.clientY - rect.top);
      const hit = hitTest(x, y);
      if (hit && onFeatureClick) onFeatureClick(hit.feature, hit.id, ev);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [interactive, hitTest, onFeatureClick, onFeatureHover]);

  // initial sizing: set canvas CSS size; user can override with width/height props
  const style: React.CSSProperties = { width: width + 'px', height: height + 'px', display: 'block' };

  return (
    <canvas
      ref={canvasRef}
      style={style}
      role="img"
      aria-label="GeoJSON preview canvas"
    />
  );
});


/*
  README & usage (included in this single-file library preview)

  # geojson-canvas

  A small lightweight React component that renders GeoJSON onto a HTMLCanvasElement for fast previewing of Points, Lines and Polygons.

  ## Features
  - Fast canvas rendering for large datasets
  - Basic Mercator projection (suitable for most web maps)
  - Fit-to-bounds
  - Interaction: hover and click with geometry hit-testing
  - Exposes imperative handle for fitBounds and export

  ## Installation
  Copy `GeoJSONCanvas.tsx` into your project, or publish as an npm/pnpm package. No runtime dependencies.

  ## Example

  ```tsx
  import React, { useRef } from 'react';
  import GeoJSONCanvas from './GeoJSONCanvas';

  const example = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [100.5, 13.75] } },
      { type: 'Feature', properties: { name: 'B' }, geometry: { type: 'Polygon', coordinates: [[[100,13],[101,13],[101,14],[100,14],[100,13]]] } }
    ]
  };

  export default function App() {
    const ref = useRef<any>(null);
    return (
      <div>
        <button onClick={() => ref.current?.fitBounds()}>Fit</button>
        <GeoJSONCanvas
          ref={ref}
          geojson={example}
          width={900}
          height={600}
          onFeatureClick={(f)=>console.log('clicked', f)}
          onFeatureHover={(f)=>console.log('hover', f)}
        />
      </div>
    );
  }
  ```

  ## Extending
  - Replace the simple mercator functions with d3-geo if you need advanced projections.
  - Add a tiles/background layer for basemaps (draw image tiles behind features).
  - Add clustering or WEBGL backend for truly massive datasets.

  ## Notes
  - This code focuses on a good DX for embedding as a component in applications or libs. It is intentionally dependency-free so you can control the bundle size.
*/
