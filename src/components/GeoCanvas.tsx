import React, { useEffect, useRef } from "react";

export type GeoCanvasProps = {
  geojson: GeoJSON.FeatureCollection;
  width?: number;
  height?: number;
  style?: {
    strokeStyle?: string;
    fillStyle?: string;
    lineWidth?: number;
  };
};

export const GeoCanvas: React.FC<GeoCanvasProps> = ({
  geojson,
  width = 400,
  height = 400,
  style = { strokeStyle: "black", fillStyle: "rgba(0,0,0,0.1)", lineWidth: 1 },
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = style.strokeStyle ?? "black";
    ctx.fillStyle = style.fillStyle ?? "rgba(0,0,0,0.1)";
    ctx.lineWidth = style.lineWidth ?? 1;

    geojson.features.forEach((f: any) => {
      if (f.geometry.type === "Polygon") {
        ctx.beginPath();
        (f.geometry.coordinates[0] as number[][]).forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // TODO: thêm LineString, Point...
    });
  }, [geojson, width, height, style]);

  return <canvas ref={canvasRef} width={width} height={height} />;
};
