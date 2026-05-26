export type FeatureId = string | number;

export type PointStyle = {
  radius?: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
};

export type LineStyle = {
  stroke?: string;
  lineWidth?: number;
  lineDash?: number[];
};

export type FillStyle = {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
};

export type Styles = {
  point?: PointStyle;
  line?: LineStyle;
  polygon?: FillStyle;
};

export type GridConfig = {
  color?: string;
  lineWidth?: number;
  labelColor?: string;
  labelSize?: number;
  showLabels?: boolean;
};

export type GeoVisualizerHandle = {
  fitBounds: () => void;
  toDataURL: (type?: string, quality?: number) => string;
};

export type LegendItem = {
  label: string;
  color: string;
  type?: 'point' | 'line' | 'polygon';
};

export type LegendConfig = {
  items: LegendItem[];
  title?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

export function drawLegend(
  ctx: CanvasRenderingContext2D,
  legend: LegendConfig,
  canvasW: number,
  canvasH: number,
) {
  const { items, title, position = 'bottom-right' } = legend;
  if (!items || items.length === 0) return;

  const pad = 10;
  const itemH = 20;
  const swatchW = 12;
  const gap = 7;
  const fontSize = 12;
  const margin = 12;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;

  const titleW = title ? ctx.measureText(title).width + 4 : 0;
  const maxTextW = Math.max(...items.map(it => ctx.measureText(it.label).width));
  const boxW = Math.max(titleW, maxTextW + swatchW + gap) + pad * 2;
  const boxH = (title ? fontSize + 8 : 0) + items.length * itemH + pad * 2;

  let bx: number, by: number;
  if (position === 'top-left')     { bx = margin; by = margin; }
  else if (position === 'top-right')    { bx = canvasW - boxW - margin; by = margin; }
  else if (position === 'bottom-left')  { bx = margin; by = canvasH - boxH - margin; }
  else                                  { bx = canvasW - boxW - margin; by = canvasH - boxH - margin; }

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  let iy = by + pad;

  if (title) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#222';
    ctx.fillText(title, bx + pad, iy + fontSize);
    iy += fontSize + 8;
    ctx.font = `${fontSize}px sans-serif`;
  }

  for (const item of items) {
    const type = item.type ?? 'polygon';
    const cy = iy + itemH / 2;
    const sx = bx + pad;

    if (type === 'point') {
      ctx.beginPath();
      ctx.arc(sx + swatchW / 2, cy, swatchW / 2, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
    } else if (type === 'line') {
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx + swatchW, cy);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = item.color;
      ctx.fillRect(sx, cy - swatchW / 2, swatchW, swatchW);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx, cy - swatchW / 2, swatchW, swatchW);
    }

    ctx.fillStyle = '#333';
    ctx.fillText(item.label, sx + swatchW + gap, cy + fontSize / 3);
    iy += itemH;
  }

  ctx.restore();
}