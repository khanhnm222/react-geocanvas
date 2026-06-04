import { useRef, useState, useCallback } from 'react';
import { GeoVisualizerFull, GeoVisualizer, parseKML, parseShapefile } from 'react-geovisualizer';
import type { GeoVisualizerHandle, Styles, LegendConfig } from 'react-geovisualizer';
import type { FeatureCollection } from 'geojson';
import './App.css';

// ── Static data — defined outside component to keep references stable ──────

const AUSTRALIA_DATA: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Australia', type: 'country' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [114.1, -21.9], [113.6, -24.0], [113.4, -26.3], [114.0, -28.0],
          [114.4, -30.0], [115.0, -33.5], [117.5, -35.0], [119.0, -34.0],
          [121.5, -33.8], [123.5, -33.8], [125.0, -33.9], [127.0, -34.1],
          [129.2, -35.1], [130.0, -31.5], [131.0, -31.5], [133.0, -32.5],
          [134.5, -35.2], [138.5, -35.5], [139.5, -37.0], [141.0, -38.5],
          [143.0, -38.8], [144.5, -38.0], [146.0, -38.5], [148.5, -37.5],
          [150.0, -37.5], [151.5, -32.0], [152.9, -28.5], [153.5, -28.0],
          [153.0, -27.0], [152.5, -25.0], [151.5, -23.0], [150.0, -22.0],
          [148.8, -20.5], [147.0, -19.0], [146.0, -18.5], [145.0, -17.5],
          [145.0, -16.0], [145.5, -15.0], [145.5, -14.0], [144.0, -14.5],
          [141.0, -16.0], [139.0, -16.5], [136.5, -13.8], [136.0, -12.0],
          [136.5, -12.5], [138.5, -13.5], [139.5, -17.0], [141.0, -17.0],
          [141.0, -26.0], [141.0, -29.0], [137.5, -29.0], [135.0, -22.0],
          [135.0, -19.0], [133.0, -15.5], [131.0, -11.5], [130.0, -11.5],
          [129.0, -13.0], [128.0, -14.5], [127.0, -14.0], [125.0, -16.5],
          [124.0, -17.0], [122.5, -18.5], [121.5, -19.5], [121.0, -21.0],
          [119.0, -21.0], [117.0, -20.5], [116.5, -21.5], [115.5, -21.5],
          [114.1, -21.9],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'East Coast Route', type: 'route' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [153.0, -27.5], [151.2, -33.9], [149.1, -35.3], [144.9, -37.8], [147.3, -42.9],
        ],
      },
    },
    { type: 'Feature', properties: { name: 'Sydney',    pop: 5200000 }, geometry: { type: 'Point', coordinates: [151.2093, -33.8688] } },
    { type: 'Feature', properties: { name: 'Melbourne', pop: 5078000 }, geometry: { type: 'Point', coordinates: [144.9631, -37.8136] } },
    { type: 'Feature', properties: { name: 'Brisbane',  pop: 2560000 }, geometry: { type: 'Point', coordinates: [153.0281, -27.4678] } },
    { type: 'Feature', properties: { name: 'Perth',     pop: 2085000 }, geometry: { type: 'Point', coordinates: [115.8605, -31.9505] } },
    { type: 'Feature', properties: { name: 'Adelaide',  pop: 1376000 }, geometry: { type: 'Point', coordinates: [138.6007, -34.9285] } },
    { type: 'Feature', properties: { name: 'Darwin',    pop:  147000 }, geometry: { type: 'Point', coordinates: [130.8456, -12.4634] } },
    { type: 'Feature', properties: { name: 'Hobart',    pop:  232000 }, geometry: { type: 'Point', coordinates: [147.3272, -42.8821] } },
    { type: 'Feature', properties: { name: 'Canberra',  pop:  462000 }, geometry: { type: 'Point', coordinates: [149.1300, -35.2809] } },
  ],
};

const AUSTRALIA_STYLES: Styles = {
  point:   { radius: 6,  fill: '#e53935', stroke: '#fff', lineWidth: 1.5 },
  line:    { stroke: '#1565c0', lineWidth: 2 },
  polygon: { fill: 'rgba(21,101,192,0.12)', stroke: '#1565c0', lineWidth: 1 },
};

const AUSTRALIA_LEGEND: LegendConfig = {
  title: 'Legend',
  position: 'bottom-right',
  items: [
    { label: 'Coastline', color: '#1565c0', type: 'polygon' },
    { label: 'Route',     color: '#1565c0', type: 'line' },
    { label: 'City',      color: '#e53935', type: 'point' },
  ],
};

const SE_ASIA_DATA: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPoint',
        coordinates: [
          [100.5, 13.75], [103.8, 1.35], [106.8, -6.2],
          [121.0, 14.6],  [126.9, 37.6], [139.7, 35.7],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [[100.5, 13.75], [103.8, 1.35], [106.8, -6.2]],
          [[121.0, 14.6],  [126.9, 37.6], [139.7, 35.7]],
        ],
      },
    },
  ],
};

const SE_ASIA_LEGEND: LegendConfig = {
  position: 'bottom-left',
  items: [
    { label: 'Cities',    color: '#2e7d32', type: 'point' },
    { label: 'Corridors', color: '#2e7d32', type: 'line' },
  ],
};

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Paris Sample</name>
    <Placemark>
      <name>Eiffel Tower</name>
      <Point><coordinates>2.2945,48.8584,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Notre-Dame</name>
      <Point><coordinates>2.3499,48.8530,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Louvre</name>
      <Point><coordinates>2.3376,48.8606,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Seine River (section)</name>
      <LineString>
        <coordinates>2.2500,48.8600 2.2945,48.8584 2.3200,48.8560 2.3499,48.8530 2.3800,48.8490 2.4100,48.8450</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Paris Centre</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>2.2800,48.8750 2.4000,48.8750 2.4000,48.8400 2.2800,48.8400 2.2800,48.8750</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

type TabId = 'interactive' | 'simple' | 'upload';

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'interactive', icon: '🗺', label: 'Interactive' },
  { id: 'simple',      icon: '🖼', label: 'Simple' },
  { id: 'upload',      icon: '📂', label: 'Upload' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('interactive');
  const [hoveredFeature, setHoveredFeature] = useState<Record<string, unknown> | null>(null);
  const [clickedFeature, setClickedFeature] = useState<Record<string, unknown> | null>(null);
  const [uploadedData, setUploadedData] = useState<object | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const canvasRef = useRef<GeoVisualizerHandle>(null);

  // Stable callbacks — setters from useState never change reference
  const handleFeatureHover = useCallback((f: { properties?: unknown } | null) => {
    setHoveredFeature((f?.properties as Record<string, unknown>) ?? null);
  }, []);

  const handleFeatureClick = useCallback((f: { properties?: unknown } | null) => {
    setClickedFeature((f?.properties as Record<string, unknown>) ?? null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploadError('');
    setUploadedData(null);
    setUploadFileName(file.name);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'geojson' || ext === 'json') {
        setUploadedData(JSON.parse(await file.text()));
      } else if (ext === 'kml') {
        setUploadedData(parseKML(await file.text()));
      } else if (ext === 'shp') {
        setUploadedData(parseShapefile(await file.arrayBuffer()));
      } else {
        setUploadError(`Unsupported format .${ext}. Use .geojson, .json, .kml or .shp`);
      }
    } catch (e: unknown) {
      setUploadError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const loadSampleKML = useCallback(() => {
    setUploadedData(parseKML(SAMPLE_KML));
    setUploadFileName('paris-sample.kml');
    setUploadError('');
  }, []);

  const handleExport = useCallback(() => {
    const url = canvasRef.current?.toDataURL('image/png');
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geovisualizer-export.png';
    a.click();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>react-geovisualizer</h1>
        <p>Render GeoJSON · KML · Shapefile on HTML5 Canvas — no map library needed</p>
      </header>

      <nav className="tabs">
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            className={`tab${activeTab === id ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Tab: Interactive ─────────────────────────────────────────────── */}
      {activeTab === 'interactive' && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>GeoVisualizerFull — Interactive</h2>
              <p>Hover and click features to inspect properties. Supports Point, LineString, Polygon, MultiGeometry.</p>
            </div>
            <div className="btn-group">
              <button className="btn" onClick={() => canvasRef.current?.fitBounds()}>Fit Bounds</button>
              <button className="btn btn-outline" onClick={handleExport}>Export PNG</button>
            </div>
          </div>

          <div className="canvas-scroll">
            <div className="canvas-row">
              <div className="canvas-wrap">
                <GeoVisualizerFull
                  ref={canvasRef}
                  geojson={AUSTRALIA_DATA}
                  width={700}
                  height={480}
                  background="#e8f0f7"
                  styles={AUSTRALIA_STYLES}
                  legend={AUSTRALIA_LEGEND}
                  onFeatureHover={handleFeatureHover}
                  onFeatureClick={handleFeatureClick}
                />
              </div>

              <div className="info-panel">
                <div className="info-box">
                  <div className="info-label">Hovered</div>
                  {hoveredFeature
                    ? <pre>{JSON.stringify(hoveredFeature, null, 2)}</pre>
                    : <span className="muted">Move cursor over a feature</span>}
                </div>
                <div className="info-box">
                  <div className="info-label">Clicked</div>
                  {clickedFeature
                    ? <pre>{JSON.stringify(clickedFeature, null, 2)}</pre>
                    : <span className="muted">Click a feature</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Tab: Simple ──────────────────────────────────────────────────── */}
      {activeTab === 'simple' && (
        <section className="section">
          <h2>GeoVisualizer — Simple</h2>
          <p>Static component with no interaction. Auto-fits bounds using Mercator projection. Supports all GeoJSON geometry types.</p>

          <div className="simple-grid">
            <div>
              <h3>Australia — Point + LineString + Polygon</h3>
              <div className="canvas-wrap">
                <GeoVisualizer
                  geojson={AUSTRALIA_DATA}
                  width={500}
                  height={380}
                  padding={24}
                  background="#e8f0f7"
                  style={{
                    strokeStyle: '#1565c0',
                    fillStyle: 'rgba(21,101,192,0.15)',
                    lineWidth: 1.5,
                    pointRadius: 5,
                    pointFill: '#e53935',
                  }}
                />
              </div>
            </div>

            <div>
              <h3>SE Asia — transparent background + legend</h3>
              <div className="canvas-wrap" style={{ background: 'linear-gradient(135deg,#c8e6c9,#a5d6a7)' }}>
                <GeoVisualizer
                  geojson={SE_ASIA_DATA}
                  width={400}
                  height={280}
                  padding={24}
                  background="transparent"
                  style={{ strokeStyle: '#2e7d32', fillStyle: 'rgba(46,125,50,0.15)', lineWidth: 2, pointRadius: 6, pointFill: '#2e7d32' }}
                  legend={SE_ASIA_LEGEND}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Tab: Upload ──────────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <section className="section">
          <h2>File Upload</h2>
          <p>Load a geographic file and render it on canvas. Supports GeoJSON, KML and Shapefile (.shp).</p>

          <label className="drop-zone">
            <input
              type="file"
              accept=".geojson,.json,.kml,.shp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <span className="drop-icon">📂</span>
            <span><strong>Click to choose a file</strong> or drag and drop here</span>
            <span className="muted">Supported: .geojson · .json · .kml · .shp</span>
          </label>

          <div className="upload-actions">
            <button className="btn btn-outline" onClick={loadSampleKML}>
              Load sample KML (Paris)
            </button>
          </div>

          {uploadError && <div className="alert alert-error">{uploadError}</div>}
          {uploadFileName && !uploadError && (
            <div className="alert alert-success">✓ Loaded: {uploadFileName}</div>
          )}

          {uploadedData && (
            <div className="canvas-wrap" style={{ marginTop: 20 }}>
              <GeoVisualizerFull
                geojson={uploadedData}
                width={700}
                height={460}
                background="#e8f0f7"
                fitBoundsOnLoad={true}
                styles={{
                  point:   { radius: 6, fill: '#7b1fa2', stroke: '#fff', lineWidth: 1.5 },
                  line:    { stroke: '#6a1b9a', lineWidth: 2 },
                  polygon: { fill: 'rgba(123,31,162,0.12)', stroke: '#7b1fa2', lineWidth: 1.5 },
                }}
              />
            </div>
          )}
        </section>
      )}

      <footer className="app-footer">
        <p>react-geovisualizer · MIT License · Supports GeoJSON · KML · Shapefile</p>
      </footer>
    </div>
  );
}