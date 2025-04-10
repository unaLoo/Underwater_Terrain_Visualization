import { mat4, vec4, vec3 } from "gl-matrix"
import { createShader, createTexture2D, loadImage, createFrameBuffer, createRenderBuffer, enableAllExtensions, createVBO, createIBO, createCustomMipmapTexture2D, createFboPoolforMipmapTexture, calculateMipmapLevels, createShaderFromCode } from "./glLib"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as dat from 'dat.gui'
import earcut from 'earcut'
import axios from "axios"
import bbox from '@turf/bbox'
import { MercatorCoordinate } from "mapbox-gl";

class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = {};
        this.keys = [];
    }

    get(key) {
        if (key in this.cache) {
            // 如果键存在，将其移动到数组的末尾
            this.keys.splice(this.keys.indexOf(key), 1);
            this.keys.push(key);
            return this.cache[key];
        }
        return 0; // 如果键不在缓存中，返回0
    }

    put(key, value) {
        if (key in this.cache) {
            // 如果键已存在，更新其值并将其移动到数组的末尾
            this.keys.splice(this.keys.indexOf(key), 1);
        } else if (Object.keys(this.cache).length >= this.capacity) {
            // 如果缓存已满，移除数组开头的键（最早加入的键）
            const oldestKey = this.keys.shift();
            delete this.cache[oldestKey];
        }
        // 将新键值对添加到缓存和数组的末尾
        this.cache[key] = value;
        this.keys.push(key);
    }
}


//////////////////////////
import debugCode from './shader/debug.glsl'
import maskCode from './shader/mask.glsl'
import surfaceNormCode from './shader/surfaceNorm.glsl'
import meshCode from './shader/mesh.glsl'
import contourCode from './shader/contour.glsl'
// import surfaceCode from './shader/waterSurface.glsl'
import surfaceNoTileCode from './shader/waterSurfaceNoTile.glsl'
import showCode from './shader/show.glsl'
import modelCode from './shader/model.glsl'

export default class TerrainByProxyTile {

    constructor() {

        this.id = 'terrainLayer'
        this.type = 'custom'
        this.renderingMode = '3d'
        this.frame = 0.0

        this.proxyLayerID = 'pxy-layer'
        this.proxySourceID = 'pxy-source'

        this.maskURL = '/mask/CJ.geojson'
        // this.maskURL = '/mask/BH_BBOX.geojson'

        this.isReady = false

        this.canvasWidth = 0
        this.canvasHeight = 0

        this.altitudeDeg = 45.0
        this.azimuthDeg = 135.0
        this.exaggeration = 30.0
        this.withContour = 1.0
        this.withLighting = 1.0
        this.mixAlpha = 0.5
        // this.elevationRange = [-15.513999999999996, 4.3745000000000003] // BH
        this.elevationRange = [-66.513999999999996, 4.3745000000000003] // CJ
        this.interval = 1.0

        this.diffPower = 1.1

        // 如果是深色矢量底图，建议配色如下
        this.shallowColor = [122, 52, 22]
        this.deepColor = [130, 130, 130]

        // 如果是影像底图，建议配色如下
        // this.shallowColor = [50, 25, 0]
        // this.deepColor = [175, 175, 175]


        this.SamplerParams = [13.6, -11.5, 1.56, -22.4]
        this.LightPos = [-0.03, 0.1, 0.86]
        this.specularPower = 40

        // for mipmap
        this.level = 0

        this.modelConfigs = [
            {
                modelScale: 0.000005,
                modelZRotate: 0.0,
                modelPos: [120.33794466757358, 32.03551107103058],
            },
            {
                modelScale: 0.000005,
                modelZRotate: 20.0,
                modelPos: [120.43794466757358, 32.03551107103058],
            },
            {
                modelScale: 0.000005,
                modelZRotate: 45.0,
                modelPos: [120.53794466757358, 32.03551107103058],
            },
        ]

    }

    initProxy(map) {
        map.addSource('underwater-dem', {
            'type': 'raster-dem',
            // 'url': 'mapbox://mapbox.terrain-rgb',
            'tiles': [
                '/TTB/v0/terrain-rgb/{z}/{x}/{y}.png'
            ],
            'tileSize': 512,
            'maxzoom': 14
        })
        map.addSource(this.proxySourceID,
            {
                type: 'geojson',
                data: {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "properties": {},
                        "geometry": {
                            "coordinates": [[[-1, 1], [1, 1], [1, -1], [-1, -1], [-1, 1]]],
                            "type": "Polygon"
                        }
                    }]
                }
            }
        )
        // map.setTerrain({ 'source': 'underwater-dem', 'exaggeration': this.exaggeration });
        map.setTerrain({ 'source': 'underwater-dem', 'exaggeration': 1.0 });
        map.addLayer(
            {
                id: this.proxyLayerID,
                type: 'fill',
                source: this.proxySourceID,
                paint: {
                    'fill-color': '#006eff',
                    'fill-opacity': 0.01
                }
            }
        )
    }

    initGUI() {


        this._shallowColor = `rgb(${this.shallowColor[0]}, ${this.shallowColor[1]}, ${this.shallowColor[2]})`
        this._deepColor = `rgb(${this.deepColor[0]}, ${this.deepColor[1]}, ${this.deepColor[2]})`
        this.SamplerParams0 = this.SamplerParams[0]
        this.SamplerParams1 = this.SamplerParams[1]
        this.SamplerParams2 = this.SamplerParams[2]
        this.SamplerParams3 = this.SamplerParams[3]
        this.LightPosX = this.LightPos[0]
        this.LightPosY = this.LightPos[1]
        this.LightPosZ = this.LightPos[2]


        this.gui = new dat.GUI()
        // this.gui.add(this, 'altitudeDeg', 0, 90).step(1).onChange(() => { this.map.triggerRepaint() })
        // this.gui.add(this, 'azimuthDeg', 0, 360).step(1).onChange(() => { this.map.triggerRepaint() })
        // this.gui.add(this, 'exaggeration', 0, 30).step(1).onChange((value) => { this.map.setTerrain({ 'exaggeration': value }); this.map.triggerRepaint(); })
        // this.gui.add(this, 'withContour', 0, 1).step(1).onChange(() => { this.map.triggerRepaint() })
        // this.gui.add(this, 'withLighting', 0, 1).step(1).onChange(() => { this.map.triggerRepaint() })
        // this.gui.add(this, 'altitudeDeg', 0, 90).step(1).onChange(() => { })
        // this.gui.add(this, 'azimuthDeg', 0, 360).step(1).onChange(() => { })
        this.gui.add(this, 'exaggeration', 0, 100).step(1).onChange((value) => { this.map.setTerrain({ 'exaggeration': value }); })
        this.gui.add(this, 'withContour', 0, 1).step(1).onChange(() => { })
        this.gui.add(this, 'withLighting', 0, 1).step(1).onChange(() => { })


        this.gui.addColor(this, '_shallowColor').name('deepColor').onChange(value => { this.shallowColor = parseRGB(value) })
        this.gui.addColor(this, '_deepColor').name('shallowColor').onChange(value => { this.deepColor = parseRGB(value) })

        this.gui.add(this, 'SamplerParams0', 0, 30, 0.01).onChange(value => { this.SamplerParams[0] = value })
        this.gui.add(this, 'SamplerParams1', -100, 100, 0.1).onChange(value => { this.SamplerParams[1] = value })
        this.gui.add(this, 'SamplerParams2', 0, 30, 0.01).onChange(value => { this.SamplerParams[2] = value })
        this.gui.add(this, 'SamplerParams3', -100, 100, 0.1).onChange(value => { this.SamplerParams[3] = value })

        this.gui.add(this, 'LightPosX', -1, 1, 0.01).onChange(value => { this.LightPos[0] = value })
        this.gui.add(this, 'LightPosY', -1, 1, 0.01).onChange(value => { this.LightPos[1] = value })
        this.gui.add(this, 'LightPosZ', 0, 2, 0.01).onChange(value => { this.LightPos[2] = value })

        this.gui.add(this, 'specularPower', 0, 50, 1).onChange(() => { })

        this.gui.add(this, "mixAlpha", 0, 1, 0.01).onChange(() => { })
        this.gui.add(this, "diffPower", 0, 3, 0.01).onChange(() => { })

        this.gui.add(this, "interval", 0.1, 10, 0.1).onChange(() => { })

    }


    /**
     * 
     * @param {*} map 
     * @param {WebGL2RenderingContext} gl 
     */
    async onAdd(map, gl) {
        this.map = map
        this.gl = gl
        enableAllExtensions(gl)
        this.demStore = new LRUCache(100)
        this.initGUI()

        this.maskgeojson = (await axios.get(this.maskURL)).data

        this.initProxy(map)
        this.proxySouceCache = map.style.getOwnSourceCache(this.proxySourceID);

        this.canvasWidth = gl.canvas.width
        this.canvasHeight = gl.canvas.height

        ///////////////////////////////////////////////////
        ///////////////// Load shaders
        this.maskProgram = createShaderFromCode(gl, maskCode)
        this.surfaceNormProgram = createShaderFromCode(gl, surfaceNormCode)
        this.meshProgram = createShaderFromCode(gl, meshCode)
        this.contourProgram = createShaderFromCode(gl, contourCode)
        // this.surfaceProgram = createShaderFromCode(gl, surfaceCode)
        this.surfaceNoTileProgram = createShaderFromCode(gl, surfaceNoTileCode)
        this.showProgram = createShaderFromCode(gl, showCode)
        this.modelProgram = createShaderFromCode(gl, modelCode)







        ///////////////////////////////////////////////////
        ///////////////// create textures
        /// mask pass ///
        this.maskTexture = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.R8, gl.RED, gl.UNSIGNED_BYTE)

        /// surface normal pass ///
        const normalBitmap1 = await loadImage('/images/WaterNormal1.png')
        const normalBitmap2 = await loadImage('/images/WaterNormal2.png')
        this.normalTexture1 = createTexture2D(gl, normalBitmap1.width, normalBitmap1.height,
            gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, normalBitmap1, gl.LINEAR, false, true)
        this.normalTexture2 = createTexture2D(gl, normalBitmap2.width, normalBitmap2.height,
            gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, normalBitmap2, gl.LINEAR, false, true)
        this.surfaceNormTexure = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE)

        /// mesh pass ///
        this.meshTexture = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.RGBA32F, gl.RGBA, gl.FLOAT)
        const depthTexture = this.meshDepthTexture = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT)
        this.emptyDEMTexture = createTexture2D(gl, 1, 1, gl.R32F, gl.RED, gl.FLOAT, new Float32Array([this.elevationRange[0]]))

        /// contour pass ///
        const paletteBitmap = await loadImage('/images/contourPalette1D.png')
        this.paletteTexture = createTexture2D(gl, paletteBitmap.width, paletteBitmap.height, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paletteBitmap, gl.LINEAR)
        this.contourCanvasTexture = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE)

        /// water surface pass ///
        this.surfaceCanvasTexture = createTexture2D(gl, this.canvasWidth, this.canvasHeight, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE)







        ///////////////////////////////////////////////////
        ///////////////// Prepare buffers

        //// mask pass ////
        this.maskFbo = createFrameBuffer(gl, [this.maskTexture], null, null)

        let { vertexData, indexData } = parseMultipolygon(this.maskgeojson)
        let maskPosBuffer = createVBO(gl, vertexData)
        let maskIdxBuffer = createIBO(gl, indexData) //Uint16 --> gl.UNSIGNED_SHORT
        this.maskElements = indexData.length

        this.maskVao = gl.createVertexArray()
        gl.bindVertexArray(this.maskVao)
        gl.enableVertexAttribArray(0)
        gl.bindBuffer(gl.ARRAY_BUFFER, maskPosBuffer)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, maskIdxBuffer)
        gl.bindVertexArray(null)


        //// surface normal pass ////
        this.surfaceNormFbo = createFrameBuffer(gl, [this.surfaceNormTexure], null, null)
        let bbox = getGeoBBOX(this.maskgeojson)
        let surfaceNormBuffer = createVBO(gl, bbox)
        this.surfaceNormVAO = gl.createVertexArray()
        gl.bindVertexArray(this.surfaceNormVAO)
        gl.enableVertexAttribArray(0)
        gl.bindBuffer(gl.ARRAY_BUFFER, surfaceNormBuffer)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindVertexArray(null)


        //// mesh Pass ////
        // let renderBuffer = createRenderBuffer(gl, this.canvasWidth, this.canvasHeight)
        this.meshFbo = createFrameBuffer(gl, [this.meshTexture], this.meshDepthTexture, null)

        this.grid = createGrid(8192, 128 + 1)
        let posBuffer = createVBO(gl, this.grid.vertices)
        let idxBuffer = createIBO(gl, this.grid.indices)
        this.meshElements = this.grid.indices.length

        this.meshVao = gl.createVertexArray()
        gl.bindVertexArray(this.meshVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer)
        gl.bindVertexArray(null)


        //// contour pass /////
        this.contourFbo = createFrameBuffer(gl, [this.contourCanvasTexture], null, null)

        //// water surface pass ////
        this.surfaceFbo = createFrameBuffer(gl, [this.surfaceCanvasTexture], null, null)



        //// model ////
        const loader = new GLTFLoader();
        let gltf = this.gltf = await loader.loadAsync('/model/wind_turbine/scene.gltf')
        let supportMesh = gltf.scene.children[0].children[0].children[0].children[0].children[0]
        let bladesMesh = gltf.scene.children[0].children[0].children[0].children[1].children[0]
        bladesMesh.needRotate = true
        this.meshes = [this.initMeshforModel(supportMesh), this.initMeshforModel(bladesMesh)]



        await this.initDebug()

        this.isReady = true



    }

    /**
     * 
     * @param {WebGL2RenderingContext} gl 
     * @param {*} matrix 
     * @returns 
     */
    render(gl, matrix) {
        if (!this.isReady) { this.map.triggerRepaint(); return }
        this.frame++;

        const terrain = this.map.painter.terrain
        // terrain._exaggeration = 30.0
        const tr = this.map.transform

        // 远处的瓦片闪烁 --- mapbox有个projctionMatrixCache
        // 下面这个导致闪烁，minElevation应该是当前视角下最低的瓦片的海拔高度
        // const projMatrix = updateProjMatrix.call(this.map.transform, this.elevationRange[0] * this.exaggeration)
        const minElevationInTils = getMinElevationBelowMSL(terrain, this.exaggeration)
        const projMatrix = updateProjMatrix.call(this.map.transform, minElevationInTils)


        const tileIDs = this.getTiles2()
        const skirt = skirtHeight(tr.zoom, this.exaggeration, terrain.sourceCache._source.tileSize);
        const sourceCache = terrain.proxySourceCache
        const nowTime = performance.now()
        const cameraPos = this.map.transform._camera.position





        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 0: generate mask texture
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo)
        gl.viewport(0.0, 0.0, this.canvasWidth, this.canvasHeight)
        gl.clearColor(0.0, 0.0, 0.0, 0.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(this.maskProgram)
        gl.bindVertexArray(this.maskVao)

        gl.uniformMatrix4fv(gl.getUniformLocation(this.maskProgram, 'u_matrix'), false, matrix)
        gl.drawElements(gl.TRIANGLES, this.maskElements, gl.UNSIGNED_SHORT, 0)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)






        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 1: water surface normal pass 
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.surfaceNormFbo)
        gl.viewport(0.0, 0.0, this.canvasWidth, this.canvasHeight)
        gl.clearColor(0.0, 0.0, 0.0, 0.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(this.surfaceNormProgram)
        gl.bindVertexArray(this.surfaceNormVAO)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.normalTexture1)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.normalTexture2)

        gl.uniform1i(gl.getUniformLocation(this.surfaceNormProgram, 'u_normalTexture1'), 0)
        gl.uniform1i(gl.getUniformLocation(this.surfaceNormProgram, 'u_normalTexture2'), 1)
        gl.uniform1f(gl.getUniformLocation(this.surfaceNormProgram, 'u_time'), nowTime)
        gl.uniform4fv(gl.getUniformLocation(this.surfaceNormProgram, 'SamplerParams'), this.SamplerParams)
        gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceNormProgram, 'u_matrix'), false, matrix)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)






        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 2: terrain mesh pass 
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.meshFbo)
        gl.viewport(0.0, 0.0, this.canvasWidth, this.canvasHeight)

        gl.clearColor(9999.0, 0.0, 0.0, 0.0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.disable(gl.BLEND)

        gl.clear(gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LESS)

        gl.useProgram(this.meshProgram);
        gl.bindVertexArray(this.meshVao);
        gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_altitudeDegree'), this.altitudeDeg)
        gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_azimuthDegree'), this.azimuthDeg)
        for (const coord of tileIDs) {
            let canonical = coord.canonical
          
            const tile = sourceCache.getTile(coord);

            // const prevDemTile = terrain.prevTerrainTileForTile[coord.key];
            // const nextDemTile = terrain.terrainTileForTile[coord.key];
            // if (demTileChanged(prevDemTile, nextDemTile)) {
            //     console.log('dem tile changing')
            // }

            const proxyTileProjMatrix = coord.projMatrix
            // const tileMatrix = tr.calculateProjMatrix(tile.tileID.toUnwrapped()) // 和上面一样的效果

            const posMatrix = tr.calculatePosMatrix(tile.tileID.toUnwrapped(), tr.worldSize);
            const tileMatrix = mat4.multiply(mat4.create(), projMatrix, posMatrix);
            tr._projMatrixCache[tile.tileID.toUnwrapped().key] = new Float32Array(tileMatrix);


            const uniformValues = {
                'u_matrix': tileMatrix,
                'u_skirt_height': skirt,
                'u_exaggeration': this.exaggeration,
                'u_dem_size': 514 - 2,
            }
            const demTile = this.demStore.get(coord.key)
            if (!demTile) { 
                // console.log('no dem tile for', coord.toString()); 
            continue }
            const proxyId = tile.tileID.canonical;
            const demId = demTile.tileID.canonical;
            const demScaleBy = Math.pow(2, demId.z - proxyId.z);
            uniformValues[`u_dem_tl`] = [proxyId.x * demScaleBy % 1, proxyId.y * demScaleBy % 1];
            uniformValues[`u_dem_scale`] = demScaleBy;

            // const drapedTexture = tile.texture //地图纹理
            let demTexture = this.emptyDEMTexture
            if (demTile.demTexture && demTile.demTexture.texture)
                demTexture = demTile.demTexture.texture

            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, demTexture)
            gl.uniform1i(gl.getUniformLocation(this.meshProgram, 'float_dem_texture'), 0);

            gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, 'u_matrix'), false, uniformValues['u_matrix'])
            gl.uniform2fv(gl.getUniformLocation(this.meshProgram, 'u_dem_tl'), uniformValues['u_dem_tl']);
            gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_dem_size'), uniformValues['u_dem_size']);
            gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_dem_scale'), uniformValues['u_dem_scale']);
            gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_exaggeration'), uniformValues['u_exaggeration'])
            gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'u_skirt_height'), uniformValues['u_skirt_height'])
            gl.uniform3fv(gl.getUniformLocation(this.meshProgram, 'tileXYZ'), [canonical.x, canonical.y, canonical.z])

            gl.drawElements(gl.TRIANGLES, this.meshElements, gl.UNSIGNED_SHORT, 0);

        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)





        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 3: water surface pass 
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.surfaceFbo)
        gl.viewport(0.0, 0.0, this.canvasWidth, this.canvasHeight)
        gl.clearColor(0.0, 0.0, 0.0, 0.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.disable(gl.BLEND)

        gl.useProgram(this.surfaceNoTileProgram);
        gl.bindVertexArray(this.surfaceNormVAO)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.meshTexture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceNormTexure)

        gl.uniform1i(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_depethTexture'), 0)
        gl.uniform1i(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_maskTexture'), 1)
        gl.uniform1i(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_surfaceNormalTexture'), 2)
        gl.uniform3fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_cameraPos'), cameraPos)
        gl.uniform1f(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_time'), nowTime)
        gl.uniform2fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_elevationRange'), this.elevationRange)
        gl.uniform2fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_screenSize'), [this.canvasWidth, this.canvasHeight])
        gl.uniform3fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'shallowColor'), this.shallowColor)
        gl.uniform3fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'deepColor'), this.deepColor)
        gl.uniform4fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'SamplerParams'), this.SamplerParams)
        gl.uniform3fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'LightPos'), this.LightPos)
        gl.uniform1f(gl.getUniformLocation(this.surfaceNoTileProgram, 'specularPower'), this.specularPower)
        gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceNoTileProgram, 'u_matrix'), false, matrix)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)


        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 4: contour pass --> contourCanvasTexture 
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.contourFbo)
        gl.viewport(0.0, 0.0, gl.canvas.width, gl.canvas.height)

        gl.disable(gl.BLEND)

        gl.useProgram(this.contourProgram)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.meshTexture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture)
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)


        gl.uniform1i(gl.getUniformLocation(this.contourProgram, 'meshTexture'), 0)
        gl.uniform1i(gl.getUniformLocation(this.contourProgram, 'paletteTexture'), 1)
        gl.uniform1i(gl.getUniformLocation(this.contourProgram, 'maskTexture'), 2)
        gl.uniform2fv(gl.getUniformLocation(this.contourProgram, 'e'), this.elevationRange)
        gl.uniform1f(gl.getUniformLocation(this.contourProgram, 'interval'), this.interval)
        gl.uniform1f(gl.getUniformLocation(this.contourProgram, 'withContour'), this.withContour)
        gl.uniform1f(gl.getUniformLocation(this.contourProgram, 'withLighting'), this.withLighting)
        gl.uniform3fv(gl.getUniformLocation(this.contourProgram, 'LightPos'), this.LightPos)
        gl.uniform1f(gl.getUniformLocation(this.contourProgram, 'diffPower'), this.diffPower)
        gl.uniform3fv(gl.getUniformLocation(this.contourProgram, 'shallowColor'), this.shallowColor)
        gl.uniform3fv(gl.getUniformLocation(this.contourProgram, 'deepColor'), this.deepColor)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)




        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Pass 5: final mixing show pass 
        /////////////////////////////////////////////////////////////////////////////////////////////////////////

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0.0, 0.0, gl.canvas.width, gl.canvas.height)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        gl.useProgram(this.showProgram)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.contourCanvasTexture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceCanvasTexture)
        gl.uniform1i(gl.getUniformLocation(this.showProgram, 'showTexture1'), 0)
        gl.uniform1i(gl.getUniformLocation(this.showProgram, 'showTexture2'), 1)
        gl.uniform1f(gl.getUniformLocation(this.showProgram, 'mixAlpha'), this.mixAlpha)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

        // this.doDebug(this.maskTexture)
        // this.doDebug(this.meshTexture)
        // this.doDebug(this.surfaceCanvasTexture)
        // this.doDebug(this.contourCanvasTexture)




        // Pass 3: Model Render Pass
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        /*
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
        gl.enable(gl.DEPTH_TEST)
        gl.clear(gl.DEPTH_BUFFER_BIT)
        // gl.enable(gl.CULL_FACE)
        // gl.clearColor(0.2, 0.2, 0.2, 0.2)

        gl.useProgram(this.modelProgram)
        gl.uniformMatrix4fv(gl.getUniformLocation(this.modelProgram, 'uMatrix'), false, matrix)
        gl.uniform3fv(gl.getUniformLocation(this.modelProgram, 'uLightPosition'), this.LightPos)

        // for one model
        this.models = new Array(this.modelConfigs.length)
        for (let i = 0; i < this.modelConfigs.length; i++) {
            const modelConfig = this.modelConfigs[i]
            // forEach meshes, same meshes
            this.meshes.forEach(mesh => {
                let { modelMatrix, normalMatrix } = this.calcMatrixforModel(modelConfig, mesh, mesh.needRotate)
                gl.uniformMatrix4fv(gl.getUniformLocation(this.modelProgram, 'uModelMatrix'), false, modelMatrix)
                gl.uniformMatrix4fv(gl.getUniformLocation(this.modelProgram, 'uNormalMatrix'), false, normalMatrix)
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
                gl.bindVertexArray(mesh.vao);
                gl.drawElements(gl.TRIANGLES, mesh.geometry.index.count, gl.UNSIGNED_INT, 0);
            })
        }

*/


        this.map.triggerRepaint()
    }

    getTiles2() {

        const terrain = this.map.painter.terrain
        const proxySourceCache = terrain.proxySourceCache

        const accumulatedDrapes = []
        const proxies = terrain.proxiedCoords[proxySourceCache.id]

        for (const proxy of proxies) {
            const tile = proxySourceCache.getTileByID(proxy.proxyTileKey);
            accumulatedDrapes.push(tile.tileID);

            const prevDemTile = terrain.prevTerrainTileForTile[tile.tileID.key];
            const nextDemTile = terrain.terrainTileForTile[tile.tileID.key];
            if (prevDemTile && prevDemTile.demTexture) {
                this.demStore.put(tile.tileID.key, prevDemTile)
            }
            if (nextDemTile && nextDemTile.demTexture) {
                this.demStore.put(tile.tileID.key, nextDemTile)
            }
        }
        // console.log('accumulatedDrapes', accumulatedDrapes.length, accumulatedDrapes)
        return accumulatedDrapes
    }


    calcMatrixforModel(modelConfig, mesh, rotate = false) {
        let mercatorPos = MercatorCoordinate.fromLngLat(modelConfig.modelPos, 0)
        let modelMatrix = mat4.create()
        mat4.translate(modelMatrix, modelMatrix, [mercatorPos.x, mercatorPos.y, 0])
        mat4.scale(modelMatrix, modelMatrix, [modelConfig.modelScale, modelConfig.modelScale, modelConfig.modelScale])
        mat4.rotateX(modelMatrix, modelMatrix, 0.5 * Math.PI)
        mat4.rotateY(modelMatrix, modelMatrix, modelConfig.modelZRotate)
        mat4.multiply(modelMatrix, modelMatrix, mesh.matrixWorld.elements)
        rotate && mat4.rotateZ(modelMatrix, modelMatrix, this.frame * 0.05)

        let normalMatrix = mat4.create()
        mat4.invert(normalMatrix, modelMatrix)
        mat4.transpose(normalMatrix, normalMatrix)
        return {
            modelMatrix,
            normalMatrix
        }
    }

    initMeshforModel(mesh) {
        let gl = this.gl;
        const vertPosBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertPosBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.geometry.attributes.position.array, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.geometry.attributes.normal.array, gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.geometry.attributes.uv.array, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.geometry.index.array, gl.STATIC_DRAW);//uint32
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        let vao = mesh.vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertPosBuffer);
        gl.vertexAttribPointer(0, mesh.geometry.attributes.position.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.vertexAttribPointer(1, mesh.geometry.attributes.normal.itemSize, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(2);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.vertexAttribPointer(2, mesh.geometry.attributes.uv.itemSize, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bindVertexArray(null);

        // addon
        const imageBitmap = mesh.material.map.source.data;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imageBitmap.width, imageBitmap.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
        gl.bindTexture(gl.TEXTURE_2D, null);

        mesh.texture = texture;
        return mesh
    }


    async initDebug() {
        this.debugProgram = createShaderFromCode(this.gl, debugCode)
    }
    // temp
    doDebug(texture) {
        let gl = this.gl
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        // gl.disable(gl.BLEND)
        // gl.clearColor(1.0, 0.0, 0.0, 1.0)
        // gl.clear(gl.COLOR_BUFFER_BIT)
        gl.viewport(0.0, 0.0, gl.canvas.width, gl.canvas.height)
        gl.useProgram(this.debugProgram)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture)
        gl.uniform1f(gl.getUniformLocation(this.debugProgram, 'mipmap'), 0.0)
        gl.uniform1i(gl.getUniformLocation(this.debugProgram, 'debugTexture'), 0)
        gl.uniform1i(gl.getUniformLocation(this.debugProgram, 'paletteTexture'), 1)
        gl.uniform1f(gl.getUniformLocation(this.debugProgram, 'debugLevel'), 0)
        gl.uniform2fv(gl.getUniformLocation(this.debugProgram, 'u_screenSize'), [this.canvasWidth, this.canvasHeight])
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    }
}



//#region helper functions
function parseMultipolygon(geojson) {

    // const geojson = (await axios.get(geojsonURL)).data
    let coordinate = geojson.features[0].geometry.coordinates[0]
    var data = earcut.flatten(coordinate)
    var triangle = earcut(data.vertices, data.holes, data.dimensions)
    coordinate = data.vertices.flat()
    return {
        vertexData: coordinate,
        indexData: triangle,
    }
}

function createGrid(TILE_EXTENT, count) {

    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    const EXTENT = TILE_EXTENT;
    const size = count + 2;

    // Around the grid, add one more row/column padding for "skirt".
    let vertices = [];
    let indices = [];
    let linesIndices = [];

    const step = EXTENT / (count - 1);
    const gridBound = EXTENT + step / 2;
    const bound = gridBound + step;

    // Skirt offset of 0x5FFF is chosen randomly to encode boolean value (skirt
    // on/off) with x position (max value EXTENT = 4096) to 16-bit signed integer.
    const skirtOffset = 24575; // 0x5FFF

    for (let y = -step; y < bound; y += step) {
        for (let x = -step; x < bound; x += step) {
            const offset = (x < 0 || x > gridBound || y < 0 || y > gridBound) ? skirtOffset : 0;
            const xi = clamp(Math.round(x), 0, EXTENT);
            const yi = clamp(Math.round(y), 0, EXTENT);
            vertices.push(xi + offset, yi);
        }
    }

    const skirtIndicesOffset = (size - 3) * (size - 3) * 2;
    const quad = (i, j) => {
        const index = j * size + i;
        indices.push(index + 1, index, index + size);
        indices.push(index + size, index + size + 1, index + 1);
    };
    for (let j = 1; j < size - 2; j++) {
        for (let i = 1; i < size - 2; i++) {
            quad(i, j);
        }
    }
    // Padding (skirt) indices:
    [0, size - 2].forEach(j => {
        for (let i = 0; i < size - 1; i++) {
            quad(i, j);
            quad(j, i);
        }
    });
    return {
        vertices,
        indices,
        skirtIndicesOffset,
        linesIndices
    }
}

function skirtHeight(zoom, terrainExaggeration, tileSize) {
    // Skirt height calculation is heuristic: provided value hides
    // seams between tiles and it is not too large: 9 at zoom 22, ~20000m at zoom 0.
    if (terrainExaggeration === 0) return 0;
    const exaggerationFactor = (terrainExaggeration < 1.0 && tileSize === 514) ? 0.25 / terrainExaggeration : 1.0;
    return 10 * Math.pow(1.5, 22 - zoom) * Math.max(terrainExaggeration, 1.0) * exaggerationFactor;
}

function getMinElevationBelowMSL(terrain, exaggeration) {
    let min = 0.0;
    // The maximum DEM error in meters to be conservative (SRTM).
    const maxDEMError = 30.0;
    terrain._visibleDemTiles.filter(tile => tile.dem).forEach(tile => {
        const minMaxTree = (tile.dem).tree;
        min = Math.min(min, minMaxTree.minimums[0]);
    });
    return min === 0.0 ? min : (min - maxDEMError) * exaggeration;
}

function farthestPixelDistanceOnPlane(tr, minElevation, pixelsPerMeter) {
    // Find the distance from the center point [width/2 + offset.x, height/2 + offset.y] to the
    // center top point [width/2 + offset.x, 0] in Z units, using the law of sines.
    // 1 Z unit is equivalent to 1 horizontal px at the center of the map
    // (the distance between[width/2, height/2] and [width/2 + 1, height/2])
    const fovAboveCenter = tr.fovAboveCenter;

    // Adjust distance to MSL by the minimum possible elevation visible on screen,
    // this way the far plane is pushed further in the case of negative elevation.

    // 貌似 tr.elevation 就是 terrain
    const minElevationInPixels = minElevation * pixelsPerMeter;
    const cameraToSeaLevelDistance = ((tr._camera.position[2] * tr.worldSize) - minElevationInPixels) / Math.cos(tr._pitch);
    const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * cameraToSeaLevelDistance / Math.sin(Math.max(Math.PI / 2.0 - tr._pitch - fovAboveCenter, 0.01));

    // Calculate z distance of the farthest fragment that should be rendered.
    const furthestDistance = Math.sin(tr._pitch) * topHalfSurfaceDistance + cameraToSeaLevelDistance;
    const horizonDistance = cameraToSeaLevelDistance * (1 / tr._horizonShift);

    // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
    return Math.min(furthestDistance * 1.01, horizonDistance);
}

function updateProjMatrix(minElevation) {

    if (!this.height) return;

    const offset = this.centerOffset;

    // Z-axis uses pixel coordinates when globe mode is enabled
    const pixelsPerMeter = this.pixelsPerMeter;


    const projectionT = getProjectionInterpolationT(this.projection, this.zoom, this.width, this.height, 1024);

    // 'this._pixelsPerMercatorPixel' is the ratio between pixelsPerMeter in the current projection relative to Mercator.
    // This is useful for converting e.g. camera position between pixel spaces as some logic
    // such as raycasting expects the scale to be in mercator pixels
    this._pixelsPerMercatorPixel = this.projection.pixelSpaceConversion(this.center.lat, this.worldSize, projectionT);

    this.cameraToCenterDistance = 0.5 / Math.tan(this._fov * 0.5) * this.height * this._pixelsPerMercatorPixel;

    this._updateCameraState();

    this._farZ = farthestPixelDistanceOnPlane(this, minElevation, pixelsPerMeter);

    // The larger the value of nearZ is
    // - the more depth precision is available for features (good)
    // - clipping starts appearing sooner when the camera is close to 3d features (bad)
    //
    // Smaller values worked well for mapbox-gl-js but deckgl was encountering precision issues
    // when rendering it's layers using custom layers. This value was experimentally chosen and
    // seems to solve z-fighting issues in deckgl while not clipping buildings too close to the camera.
    this._nearZ = this.height / 50;

    const zUnit = this.projection.zAxisUnit === "meters" ? pixelsPerMeter : 1.0;
    const worldToCamera = this._camera.getWorldToCamera(this.worldSize, zUnit);

    let cameraToClip;

    const cameraToClipPerspective = this._camera.getCameraToClipPerspective(this._fov, this.width / this.height, this._nearZ, this._farZ);
    // Apply offset/padding
    cameraToClipPerspective[8] = -offset.x * 2 / this.width;
    cameraToClipPerspective[9] = offset.y * 2 / this.height;


    cameraToClip = cameraToClipPerspective;

    // @ts-expect-error - TS2345 - Argument of type 'Float64Array' is not assignable to parameter of type 'ReadonlyMat4'.
    const worldToClipPerspective = mat4.mul([], cameraToClipPerspective, worldToCamera);
    // @ts-expect-error - TS2345 - Argument of type 'Float64Array' is not assignable to parameter of type 'ReadonlyMat4'.
    let m = mat4.mul([], cameraToClip, worldToCamera);

    if (this.projection.isReprojectedInTileSpace) {
        // Projections undistort as you zoom in (shear, scale, rotate).
        // Apply the undistortion around the center of the map.
        const mc = this.locationCoordinate(this.center);
        const adjustments = mat4.identity([]);
        mat4.translate(adjustments, adjustments, [mc.x * this.worldSize, mc.y * this.worldSize, 0]);
        mat4.multiply(adjustments, adjustments, getProjectionAdjustments(this));
        mat4.translate(adjustments, adjustments, [-mc.x * this.worldSize, -mc.y * this.worldSize, 0]);
        mat4.multiply(m, m, adjustments);
        // @ts-expect-error - TS2345 - Argument of type 'number[] | Float32Array' is not assignable to parameter of type 'mat4'.
        mat4.multiply(worldToClipPerspective, worldToClipPerspective, adjustments);
        this.inverseAdjustmentMatrix = getProjectionAdjustmentInverted(this);
    } else {
        this.inverseAdjustmentMatrix = [1, 0, 0, 1];
    }

    // The mercatorMatrix can be used to transform points from mercator coordinates
    // ([0, 0] nw, [1, 1] se) to GL coordinates. / zUnit compensates for scaling done in worldToCamera.
    // @ts-expect-error - TS2322 - Type 'mat4' is not assignable to type 'number[]'. | TS2345 - Argument of type 'number[] | Float32Array' is not assignable to parameter of type 'ReadonlyMat4'.
    this.mercatorMatrix = mat4.scale([], m, [this.worldSize, this.worldSize, this.worldSize / zUnit, 1.0]);

    // this.projMatrix = m;
    return m
}

function getProjectionInterpolationT(projection, zoom, width, height, maxSize = Infinity) {
    const range = projection.range;
    if (!range) return 0;

    const size = Math.min(maxSize, Math.max(width, height));
    // The interpolation ranges are manually defined based on what makes
    // sense in a 1024px wide map. Adjust the ranges to the current size
    // of the map. The smaller the map, the earlier you can start unskewing.
    const rangeAdjustment = Math.log(size / 1024) / Math.LN2;
    const zoomA = range[0] + rangeAdjustment;
    const zoomB = range[1] + rangeAdjustment;
    const t = smoothstep(zoomA, zoomB, zoom);
    return t;
}

function smoothstep(e0, e1, x) {
    x = clamp((x - e0) / (e1 - e0), 0, 1);
    return x * x * (3 - 2 * x);
}

function sortByDistanceToCamera(tileIDs, painter) {
    const cameraCoordinate = painter.transform.pointCoordinate(painter.transform.getCameraPoint());
    const cameraPoint = { x: cameraCoordinate.x, y: cameraCoordinate.y };

    tileIDs.sort((a, b) => {
        if (b.overscaledZ - a.overscaledZ) return b.overscaledZ - a.overscaledZ;

        const aPoint = {
            x: a.canonical.x + (1 << a.canonical.z) * a.wrap,
            y: a.canonical.y
        };

        const bPoint = {
            x: b.canonical.x + (1 << b.canonical.z) * b.wrap,
            y: b.canonical.y
        };

        const cameraScaled = {
            x: cameraPoint.x * (1 << a.canonical.z),
            y: cameraPoint.y * (1 << a.canonical.z)
        };

        cameraScaled.x -= 0.5;
        cameraScaled.y -= 0.5;

        const distSqr = (point1, point2) => {
            const dx = point1.x - point2.x;
            const dy = point1.y - point2.y;
            return dx * dx + dy * dy;
        };

        return distSqr(cameraScaled, aPoint) - distSqr(cameraScaled, bPoint);
    });
}

function demTileChanged(prev, next) {
    if (prev == null || next == null)
        return false;
    if (!prev.hasData() || !next.hasData())
        return false;
    if (prev.demTexture == null || next.demTexture == null)
        return false;
    return prev.tileID.key !== next.tileID.key;
}

function parseRGB(rgbString) {
    const regex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/;
    const match = rgbString.match(regex);
    if (match) {
        const [_, r, g, b] = match;
        return [parseInt(r), parseInt(g), parseInt(b)];
    } else {
        throw new Error('Invalid RGB string');
    }
}

function getGeoBBOX(geojson) {
    const _bbox = bbox(geojson)
    // [
    //     120.04373606134682,
    //     31.173901952209473,
    //     121.96623240116922,
    //     32.08401085804678
    // ]

    const lb = [_bbox[0], _bbox[1]]
    const rb = [_bbox[2], _bbox[1]]
    const lt = [_bbox[0], _bbox[3]]
    const rt = [_bbox[2], _bbox[3]]

    return [lb, rb, lt, rt].flat()
}
//#endregion