import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { FeatureId, GeoVisualizerHandle, GridConfig, LegendConfig, Styles, drawLegend } from '../types';

export type GeoVisualizerFullProps = {
  width?: number;
  height?: number;
  geojson: any; // FeatureCollection | Feature | Geometry
  padding?: number;
  styles?: Styles;
  /** Background color. Use 'transparent' for no background. Defaults to '#ffffff'. */
  background?: string | null;
  legend?: LegendConfig;
  interactive?: boolean;
  onFeatureClick?: (feature: any, id?: FeatureId, ev?: MouseEvent) => void;
  onFeatureHover?: (feature: any | null, id?: FeatureId | null, ev?: MouseEvent | null) => void;
  getFeatureId?: (feature: any, index: number) => FeatureId;
  devicePixelRatio?: number;
  fitBoundsOnLoad?: boolean;
  showGrid?: boolean;
  gridConfig?: GridConfig;
  /** Minimum size (px) of the data bounding box's largest dimension before zoom-out is blocked. Default: 20 */
  minDataPixels?: number;
};

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

function niceGridStep(range: number): number {
  const candidates = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];
  for (const s of candidates) {
    if (range / s <= 10) return s;
  }
  return 90;
}

function yNormToLat(yNorm: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * (180 / Math.PI);
}

function formatDeg(val: number, step: number): string {
  if (step >= 1) return `${Math.round(val)}°`;
  return `${val.toFixed(step >= 0.1 ? 1 : 2)}°`;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  vp: { scale: number; translateX: number; translateY: number },
  config: GridConfig,
) {
  const {
    color = 'rgba(0,0,0,0.12)',
    lineWidth = 1,
    labelColor = '#888',
    labelSize = 10,
    showLabels = true,
  } = config;

  const xNormLeft  = (0    - vp.translateX) / (cssW * vp.scale);
  const xNormRight = (cssW - vp.translateX) / (cssW * vp.scale);
  const yNormTop   = (0    - vp.translateY) / (cssH * vp.scale);
  const yNormBot   = (cssH - vp.translateY) / (cssH * vp.scale);

  const lonLeft  = xNormLeft  * 360 - 180;
  const lonRight = xNormRight * 360 - 180;
  const latTop   = yNormToLat(Math.max(-0.5, yNormTop));
  const latBot   = yNormToLat(Math.min(1.5,  yNormBot));

  const lonMin = Math.max(-180, lonLeft);
  const lonMax = Math.min(180, lonRight);
  const latMin = Math.max(-85, latBot);
  const latMax = Math.min(85, latTop);

  if (lonMax <= lonMin || latMax <= latMin) return;

  const lonStep = niceGridStep(lonMax - lonMin);
  const latStep = niceGridStep(latMax - latMin);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Longitude lines (vertical)
  const lonStart = Math.ceil(lonMin / lonStep) * lonStep;
  for (let lon = lonStart; lon <= lonMax + 1e-9; lon = Math.round((lon + lonStep) * 1e9) / 1e9) {
    const xNorm = (lon + 180) / 360;
    const px = xNorm * cssW * vp.scale + vp.translateX;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssH);
    ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = labelColor;
      ctx.font = `${labelSize}px sans-serif`;
      ctx.fillText(formatDeg(lon, lonStep), px + 3, labelSize + 4);
    }
  }

  // Latitude lines (horizontal)
  const latStart = Math.ceil(latMin / latStep) * latStep;
  for (let lat = latStart; lat <= latMax + 1e-9; lat = Math.round((lat + latStep) * 1e9) / 1e9) {
    const yNorm = lonLatToMercator(0, lat).y;
    const py = yNorm * cssH * vp.scale + vp.translateY;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(cssW, py);
    ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = labelColor;
      ctx.font = `${labelSize}px sans-serif`;
      ctx.fillText(formatDeg(lat, latStep), 4, py - 3);
    }
  }

  ctx.restore();
}

function clampViewport(
  vp: { scale: number; translateX: number; translateY: number },
  cssW: number,
  cssH: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  padding: number,
  minScale: number,
) {
  let { scale, translateX: tx, translateY: ty } = vp;

  if (minScale > 0) scale = Math.max(minScale, scale);
  if (!bounds || !cssW || !cssH) return { scale, translateX: tx, translateY: ty };

  const { minX, minY, maxX, maxY } = bounds;

  // X axis —————————————————————————————————————————————————
  // "Full" range: data entirely inside canvas (both edges within [padding, W-padding])
  const txFullMin = padding - minX * cssW * scale;        // data left edge  >= padding
  const txFullMax = cssW - padding - maxX * cssW * scale; // data right edge <= cssW-padding
  // "Partial" range: data overflows canvas (zoomed in) — keep at least padding px visible
  const txPartMin = padding - maxX * cssW * scale;
  const txPartMax = cssW - padding - minX * cssW * scale;

  if (txFullMin <= txFullMax) {
    // Data fits inside canvas: keep it fully within frame
    tx = Math.max(txFullMin, Math.min(txFullMax, tx));
  } else if (txPartMin <= txPartMax) {
    // Data overflows: allow panning through data but don't let it escape entirely
    tx = Math.max(txPartMin, Math.min(txPartMax, tx));
  }

  // Y axis —————————————————————————————————————————————————
  const tyFullMin = padding - minY * cssH * scale;
  const tyFullMax = cssH - padding - maxY * cssH * scale;
  const tyPartMin = padding - maxY * cssH * scale;
  const tyPartMax = cssH - padding - minY * cssH * scale;

  if (tyFullMin <= tyFullMax) {
    ty = Math.max(tyFullMin, Math.min(tyFullMax, ty));
  } else if (tyPartMin <= tyPartMax) {
    ty = Math.max(tyPartMin, Math.min(tyPartMax, ty));
  }

  return { scale, translateX: tx, translateY: ty };
}

const defaultStyles: Styles = {
  point: { radius: 4, fill: '#1976d2', stroke: '#fff', lineWidth: 1 },
  line: { stroke: '#1976d2', lineWidth: 2 },
  polygon: { fill: 'rgba(25,118,210,0.2)', stroke: '#1976d2', lineWidth: 1 },
};

export const GeoVisualizerFull = forwardRef<GeoVisualizerHandle, GeoVisualizerFullProps>(function GeoVisualizerFull(
  props,
  ref
) {
  const {
    width = 800,
    height = 600,
    geojson,
    padding = 20,
    styles = {},
    background = '#ffffff',
    legend,
    interactive = true,
    onFeatureClick,
    onFeatureHover,
    getFeatureId,
    devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    fitBoundsOnLoad = true,
    showGrid = false,
    gridConfig = {},
    minDataPixels = 20,
  } = props;

  const mergedStyles = useMemo(() => ({ ...defaultStyles, ...styles } as Styles), [styles]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    viewport: { scale: 1, translateX: 0, translateY: 0 },
    features: [] as any[],
    featureBounds: null as any,
    hoverId: null as FeatureId | null,
    dpr: devicePixelRatio,
    minScale: 0,
  });

  const buildInternalFeatures = useCallback((gj: any) => {
    const features = extractFeatures(gj).map((f: any, i: number) => ({
      id: (getFeatureId ? getFeatureId(f, i) : i) as FeatureId,
      feature: f,
    }));
    stateRef.current.features = features;
    stateRef.current.featureBounds = getBoundsOfGeojson(gj);
  }, [getFeatureId]);

  const mercatorToCanvas = useCallback((xNorm: number, yNorm: number, ctxW: number, ctxH: number) => {
    const vp = stateRef.current.viewport;
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

    if (background && background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, cssW, cssH);
    } else {
      ctx.clearRect(0, 0, cssW, cssH);
    }

    if (showGrid) drawGrid(ctx, cssW, cssH, stateRef.current.viewport, gridConfig);

    const features = stateRef.current.features || [];
    for (const f of features) {
      drawFeature(ctx, f, cssW, cssH);
    }

    if (legend) drawLegend(ctx, legend, cssW, cssH);
  }, [background, drawFeature, legend, showGrid, gridConfig]);

  const fitBounds = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = stateRef.current.featureBounds;
    if (!bounds) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    const { minX, minY, maxX, maxY } = bounds;
    const worldW = (maxX - minX) || 1e-6;
    const worldH = (maxY - minY) || 1e-6;
    // mercatorToCanvas: pixel = norm * canvasSize * scale + translate
    // We want: minNorm * W * scale + tx = leftEdge, maxNorm * W * scale + tx = rightEdge
    // → worldW * W * scale = W - 2*padding → scale = (W-2p)/(worldW*W)
    const scaleX = (cssW - padding * 2) / (worldW * cssW);
    const scaleY = (cssH - padding * 2) / (worldH * cssH);
    const scale = Math.min(scaleX, scaleY);
    // minScale: zoom out until the data's largest screen dimension = minDataPixels
    const largestDim = Math.max(worldW * cssW, worldH * cssH, 1);
    stateRef.current.minScale = minDataPixels / largestDim;
    const dataPixW = worldW * cssW * scale;
    const dataPixH = worldH * cssH * scale;
    const translateX = -minX * cssW * scale + (cssW - dataPixW) / 2;
    const translateY = -minY * cssH * scale + (cssH - dataPixH) / 2;
    stateRef.current.viewport = { scale, translateX, translateY };
    render();
  }, [padding, render, minDataPixels]);

  useImperativeHandle(ref, () => ({
    fitBounds: () => fitBounds(),
    toDataURL: (type?: string, quality?: number) => (canvasRef.current ? canvasRef.current.toDataURL(type, quality) : ''),
  }));

  function pointInPolygon(x: number, y: number, poly: number[][]) {
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
    return Math.hypot(px - (x1 + tt * dx), py - (y1 + tt * dy));
  }

  const hitTest = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const features = stateRef.current.features || [];
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
            if (distanceToSegment(x, y, pa.x, pa.y, pb.x, pb.y) <= tolerance) return f;
          }
        }
      }
    }
    return null;
  }, [mercatorToCanvas, mergedStyles]);

  useEffect(() => {
    buildInternalFeatures(geojson);
    if (fitBoundsOnLoad) {
      requestAnimationFrame(() => { fitBounds(); });
    } else {
      render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, buildInternalFeatures]);

  useEffect(() => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastHoverId: any = null;
    let isDragging = false;
    let hasDragged = false;
    let dragStart = { x: 0, y: 0 };
    let vpStart = { scale: 1, translateX: 0, translateY: 0 };

    canvas.style.cursor = 'grab';

    const onMouseDown = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      isDragging = true;
      hasDragged = false;
      dragStart = { x: ev.clientX, y: ev.clientY };
      vpStart = { ...stateRef.current.viewport };
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (isDragging) {
        const dx = ev.clientX - dragStart.x;
        const dy = ev.clientY - dragStart.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        stateRef.current.viewport = clampViewport(
          { scale: vpStart.scale, translateX: vpStart.translateX + dx, translateY: vpStart.translateY + dy },
          cssW, cssH, stateRef.current.featureBounds, padding, stateRef.current.minScale,
        );
        render();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
      const hit = hitTest(x, y);
      const hitId = hit ? hit.id : null;
      if (hitId !== lastHoverId) {
        lastHoverId = hitId;
        if (onFeatureHover) onFeatureHover(hit ? hit.feature : null, hitId, ev);
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      canvas.style.cursor = 'grab';
      if (!hasDragged) {
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const hit = hitTest(x, y);
        if (hit && onFeatureClick) onFeatureClick(hit.feature, hit.id, ev);
      }
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      const vp = stateRef.current.viewport;
      const desiredScale = vp.scale * factor;
      const newScale = stateRef.current.minScale > 0
        ? Math.max(stateRef.current.minScale, desiredScale)
        : desiredScale;
      // actualFactor derived from clamped scale: when scale can't change, translate also won't change.
      const actualFactor = newScale / vp.scale;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      stateRef.current.viewport = clampViewport(
        {
          scale: newScale,
          translateX: cx - actualFactor * (cx - vp.translateX),
          translateY: cy - actualFactor * (cy - vp.translateY),
        },
        cssW, cssH, stateRef.current.featureBounds, padding, stateRef.current.minScale,
      );
      render();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.style.cursor = '';
    };
  }, [interactive, hitTest, onFeatureClick, onFeatureHover, render, padding]);

  const canvasStyle: React.CSSProperties = { width: width + 'px', height: height + 'px', display: 'block' };

  return (
    <canvas
      ref={canvasRef}
      style={canvasStyle}
      role="img"
      aria-label="Geographic data canvas"
    />
  );
});