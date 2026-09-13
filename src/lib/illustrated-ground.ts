import type { Map } from 'maplibre-gl';

const IDS = ['illustrated-parking', 'illustrated-roads', 'illustrated-paths', 'illustrated-steps', 'illustrated-cycleways'];
/** Only committed OSM geometry: no invented lawns, trees, or entrance paths. */
export function setIllustratedGround(map: Map, visible: boolean, before: string) {
  if (!visible && !map.getSource('illustrated-ground')) return;
  if (!map.getLayer('illustrated-campus-tone')) {
    // A tinted illustration extent, not a claim that the entire area is lawn.
    map.addLayer({ id: 'illustrated-campus-tone', type: 'fill', source: 'satellite-zones', paint: { 'fill-color': '#e4eadb', 'fill-opacity': 0.75 } }, 'satellite-zones-outline');
  }
  map.setLayoutProperty('illustrated-campus-tone', 'visibility', visible ? 'visible' : 'none');
  if (!map.getSource('illustrated-ground')) {
    map.addSource('illustrated-ground', { type: 'geojson', data: '/illustrated/ground.geojson' });
    map.addLayer({ id: IDS[0], type: 'fill', source: 'illustrated-ground', filter: ['==', ['get', 'kind'], 'parking'], paint: { 'fill-color': '#c8c7bc', 'fill-outline-color': '#a3a69d' } }, before);
    map.addLayer({ id: IDS[1], type: 'line', source: 'illustrated-ground', filter: ['==', ['get', 'kind'], 'road'], paint: { 'line-color': '#b9bdb4', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 1, 20, 36] }, layout: { 'line-cap': 'round', 'line-join': 'round' } }, before);
    map.addLayer({ id: IDS[2], type: 'line', source: 'illustrated-ground', filter: ['==', ['get', 'kind'], 'path'], paint: { 'line-color': '#eee7d4', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 0.4, 20, 12] }, layout: { 'line-cap': 'round', 'line-join': 'round' } }, before);
    map.addLayer({ id: IDS[3], type: 'line', source: 'illustrated-ground', filter: ['==', ['get', 'kind'], 'steps'], paint: { 'line-color': '#9a704b', 'line-width': 3, 'line-dasharray': [1, 1] } }, before);
    map.addLayer({ id: IDS[4], type: 'line', source: 'illustrated-ground', filter: ['==', ['get', 'kind'], 'cycleway'], paint: { 'line-color': '#819a91', 'line-width': 2, 'line-dasharray': [3, 2] } }, before);
  }
  for (const id of IDS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}
