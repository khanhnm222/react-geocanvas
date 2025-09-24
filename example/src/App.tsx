import { GeoCanvasFull } from "react-geocanvas";

const sampleGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [50, 50],
            [150, 50],
            [150, 150],
            [50, 150],
            [50, 50],
          ],
        ],
      },
      properties: {},
    },
  ],
};

function App() {
  return (
    <div>
      <h1>react-geocanvas Example</h1>
      <GeoCanvasFull geojson={sampleGeoJSON as any} width={200} height={200} />
    </div>
  );
}

export default App;
