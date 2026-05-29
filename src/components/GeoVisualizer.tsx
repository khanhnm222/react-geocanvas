import React, { useEffect, useRef, useCallback } from 'react';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { LegendConfig, drawLegend } from '../types';

export type GeoVisualizerStyle = {
  strokeStyle?: string;
  fillStyle?: string;
  lineWidth?: number;
  pointRadius?: number;
  pointFill?: string;
};

export type GeoVisualizerProps = {
  geojson: FeatureCollection | Feature | Geometry;
  width?: number;
  height?: number;
  padding?: number;
  /** Background color. Use 'transparent' for no background. Defaults to '#ffffff'. */
  background?: string;
  legend?: LegendConfig;
  style?: GeoVisualizerStyle;
};

// Web Mercator projection → normalized [0,1] space
function toMercator(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360;
  const r = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  return [x, y];
}

type Viewport = { scale: number; ox: number; oy: number; minX: number; minY: number };

function buildViewport(geojson: unknown, W: number, H: number, padding: number): Viewport | null {
  const pts: [number, number][] = [];

  function collect(c: unknown): void {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      pts.push(toMercator(c[0] as number, c[1] as number));
    } else {
      c.forEach(collect);
    }
  }

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o.type === 'FeatureCollection') (o.features as unknown[])?.forEach(visit);
    else if (o.type === 'Feature') visit(o.geometry);
    else if (o.type === 'GeometryCollection') (o.geometries as unknown[])?.forEach(visit);
    else if (o.coordinates !== undefined) collect(o.coordinates);
  }

  visit(geojson);
  if (pts.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = Math.min((W - 2 * padding) / spanX, (H - 2 * padding) / spanY);
  return { scale, ox: (W - spanX * scale) / 2, oy: (H - spanY * scale) / 2, minX, minY };
}

function project(lon: number, lat: number, vp: Viewport): { x: number; y: number } {
  const [mx, my] = toMercator(lon, lat);
  return { x: (mx - vp.minX) * vp.scale + vp.ox, y: (my - vp.minY) * vp.scale + vp.oy };
}

export const GeoVisualizer: React.FC<GeoVisualizerProps> = (props) => {
  const {
    geojson,
    width = 400,
    height = 400,
    padding = 20,
    background = '#ffffff',
    legend,
    style,
  } = props;

  const {
    strokeStyle = '#1976d2',
    fillStyle = 'rgba(25,118,210,0.2)',
    lineWidth = 1,
    pointRadius = 4,
    pointFill = '#1976d2',
  } = style ?? {};

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    if (background && background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    else ctx.clearRect(0, 0, width, height);

    const vp = buildViewport(geojson, width, height, padding);
    if (!vp) return;

    function drawGeom(geom: Record<string, unknown>): void {
      if (!geom || !vp) return;
      const { type } = geom;

      if (type === 'Point') {
        const coords = geom.coordinates as number[];
        const c = project(coords[0], coords[1], vp);
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, pointRadius, 0, Math.PI * 2);
        ctx!.fillStyle = pointFill; ctx!.fill();
        ctx!.strokeStyle = strokeStyle; ctx!.lineWidth = lineWidth; ctx!.stroke();
      }

      else if (type === 'MultiPoint') {
        for (const coord of geom.coordinates as number[][]) {
          const c = project(coord[0], coord[1], vp);
          ctx!.beginPath();
          ctx!.arc(c.x, c.y, pointRadius, 0, Math.PI * 2);
          ctx!.fillStyle = pointFill; ctx!.fill();
          ctx!.strokeStyle = strokeStyle; ctx!.lineWidth = lineWidth; ctx!.stroke();
        }
      }

      else if (type === 'LineString' || type === 'MultiLineString') {
        const lines = type === 'LineString'
          ? [geom.coordinates as number[][]]
          : geom.coordinates as number[][][];
        ctx!.beginPath();
        for (const line of lines) {
          line.forEach(([lon, lat], i) => {
            const c = project(lon, lat, vp);
            i === 0 ? ctx!.moveTo(c.x, c.y) : ctx!.lineTo(c.x, c.y);
          });
        }
        ctx!.strokeStyle = strokeStyle; ctx!.lineWidth = lineWidth; ctx!.stroke();
      }

      else if (type === 'Polygon' || type === 'MultiPolygon') {
        const polys = type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : geom.coordinates as number[][][][];
        for (const rings of polys) {
          ctx!.beginPath();
          for (const ring of rings) {
            ring.forEach(([lon, lat], i) => {
              const c = project(lon, lat, vp);
              i === 0 ? ctx!.moveTo(c.x, c.y) : ctx!.lineTo(c.x, c.y);
            });
            ctx!.closePath();
          }
          ctx!.fillStyle = fillStyle; ctx!.fill('evenodd');
          ctx!.strokeStyle = strokeStyle; ctx!.lineWidth = lineWidth; ctx!.stroke();
        }
      }

      else if (type === 'GeometryCollection') {
        for (const g of (geom.geometries as Record<string, unknown>[]) ?? []) drawGeom(g);
      }
    }

    function drawNode(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (o.type === 'FeatureCollection') (o.features as unknown[])?.forEach(drawNode);
      else if (o.type === 'Feature') drawGeom(o.geometry as Record<string, unknown>);
      else drawGeom(o);
    }

    drawNode(geojson);

    if (legend) drawLegend(ctx, legend, width, height);
  }, [geojson, width, height, padding, strokeStyle, fillStyle, lineWidth, pointRadius, pointFill, background, legend]);

  useEffect(() => { draw(); }, [draw]);

  return <canvas ref={canvasRef} width={width} height={height} />;
};