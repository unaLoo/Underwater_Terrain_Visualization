import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import TerrainByProxyTile from './dem-proxyTile'
// import TerrainByProxyTile from "./debug";

mapboxgl.accessToken = 'pk.eyJ1IjoieWNzb2t1IiwiYSI6ImNrenozdWdodDAza3EzY3BtdHh4cm5pangifQ.ZigfygDi2bK4HXY1pWh-wg'
// initialize map
export const initMap = () => {

    const map = new mapboxgl.Map({
        // style: 'mapbox://styles/mapbox/dark-v11',
        // style: EmptyStyle,
        // style: 'mapbox://styles/mapbox/light-v11',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        container: 'map',
        projection: 'mercator',
        antialias: true,
        maxZoom: 16,

        // maxPitch: 70,
        center: mapInitialConfig.center,
        zoom: mapInitialConfig.zoom,
        pitch: mapInitialConfig.pitch,
    }).on('load', () => {

        getMapViewInfo(map)

        map.addLayer(new TerrainByProxyTile())

        map.on('moveend', () => {
            setMapViewInfo(map)
        })


        map.addControl(new mapboxgl.NavigationControl());
        // map.showTerrainWireframe = true
        // map.showTileBoundaries = true;
        // query terrain elevation on click
        // const popup = new mapboxgl.Popup({
        //     closeButton: false,
        //     closeOnClick: false,
        //     anchor: 'bottom',
        // });
        // map.on('click', e => {
        //     const coordinate = [e.lngLat.lng, e.lngLat.lat];
        //     const elevation = map.queryTerrainElevation(coordinate);
        //     console.log(coordinate, elevation)
        //     popup.setLngLat(coordinate).setHTML(`<p>高程: ${elevation.toFixed(2)}米</p>`).addTo(map);
        // })


    })
}

const debounce = (func, delay = 300) => {
    let timer = null
    return function (...args) {
        timer && clearTimeout(timer)
        timer = setTimeout(() => {
            func.apply(this, args)
        }, delay)
    }
}


const getMapViewInfo = (map) => {
    const view = localStorage.getItem('mapViewInfo')
    if (view) {
        const { center, zoom, pitch, bearing } = JSON.parse(view)
        map.setCenter(center)
        map.setZoom(zoom)
        map.setPitch(pitch)
        map.setBearing(bearing)
    }
}

const setMapViewInfo = debounce((map) => {
    const center = map.getCenter()
    const zoom = map.getZoom()
    const pitch = map.getPitch()
    const bearing = map.getBearing()
    const view = {
        center,
        zoom,
        pitch,
        bearing
    }
    localStorage.setItem('mapViewInfo', JSON.stringify(view))
})


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
    // center: [120.53794466757358, 32.03061107103058],
    center: [120.2803920596891106, 34.3030449664098393],
    // zoom: 9,
    zoom: 13,
    pitch: 0,
}
