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

export type GeoJSONCanvasHandle = {
  fitBounds: () => void;
  toDataURL: (type?: string, quality?: number) => string;
};