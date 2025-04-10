import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css";
import TerrainByProxyTile from './dem-proxyTile'

mapboxgl.accessToken = 'pk.eyJ1IjoieWNzb2t1IiwiYSI6ImNrenozdWdodDAza3EzY3BtdHh4cm5pangifQ.ZigfygDi2bK4HXY1pWh-wg'
// initialize map
export const initMap = () => {

    const map = new mapboxgl.Map({
        style: 'mapbox://styles/mapbox/dark-v11',
        // style: EmptyStyle,
        // style: 'mapbox://styles/mapbox/light-v11',
        // style: 'mapbox://styles/mapbox/satellite-streets-v12',
        container: 'map',
        projection: 'mercator',
        antialias: true,
        // maxZoom: 16,
        // maxPitch: 80,
        center: mapInitialConfig.center,
        zoom: mapInitialConfig.zoom,
        pitch: mapInitialConfig.pitch,
    }).on('load', () => {
        // map.showTileBoundaries = true;
        map.addLayer(new TerrainByProxyTile())
    })
}



////////// HELPERS ///////////
const EmptyStyle = {
    "version": 8,
    "name": "Empty",
    "sources": {
    },
    "layers": [
    ]
}
const mapInitialConfig = {
    center: [120.53794466757358, 32.03061107103058],
    zoom: 8,
    pitch: 0,
}
