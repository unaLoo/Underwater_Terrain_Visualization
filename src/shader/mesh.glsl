
#ifdef VERTEX_SHADER

layout(location = 0) in vec2 a_position;

uniform mat4 u_matrix;
uniform sampler2D float_dem_texture;
uniform vec2 u_dem_tl;
uniform float u_dem_size;
uniform float u_dem_scale;
uniform float u_skirt_height;
uniform float u_exaggeration;
uniform float u_altitudeDegree;
uniform float u_azimuthDegree;

const float MAPBOX_TILE_EXTENT = 8192.0;
const float SKIRT_OFFSET = 24575.0;
const float SKIRT_HEIGHT = 1000.0;
const float PI = 3.1415926535897932384626433832795;

out float v_height;
out float is_skirt;
out float v_hillshade;

////////////////////////////////////////////
/////////// DEM 
////////////////////////////////////////////
vec4 tileUvToDemSample(vec2 uv, float dem_size, float dem_scale, vec2 dem_tl) {
    vec2 pos = dem_size * (uv * dem_scale + dem_tl) + 1.0;// 1 -- 513
    vec2 f = fract(pos);
    return vec4((pos - f + 0.5) / (dem_size + 2.0), f);
}

float elevation(vec2 apos) {

    // float dd = 1.0 / (u_dem_size + 2.0);
    // vec4 r = tileUvToDemSample(apos / 8192.0, u_dem_size, u_dem_scale, u_dem_tl);
    // vec2 pos = r.xy;
    // vec2 f = r.zw;

    // float tl = texture(float_dem_texture, pos).r;
    // float tr = texture(float_dem_texture, pos + vec2(dd, 0)).r;
    // float bl = texture(float_dem_texture, pos + vec2(0, dd)).r;
    // float br = texture(float_dem_texture, pos + vec2(dd, dd)).r;

    // return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);

    vec2 pos = (u_dem_size * (apos / 8192.0 * u_dem_scale + u_dem_tl) + 1.0) / (u_dem_size + 2.0);
    float m = texture(float_dem_texture, pos).r;
    return m;
}

vec3 decomposeToPosAndSkirt(vec2 posWithComposedSkirt) {
    float skirt = float(posWithComposedSkirt.x >= SKIRT_OFFSET);
    vec2 pos = posWithComposedSkirt - vec2(skirt * SKIRT_OFFSET, 0.0);
    return vec3(pos, skirt);
}

////////////////////////////////////////////
/////////// HillShade 
////////////////////////////////////////////
float deg2rad(float deg) {
    return deg * PI / 180.0;
}

float rad2deg(float rad) {
    return rad * 180.0 / PI;
}

float calcZenith(float altitudeDegree) {
    // 入射角
    return deg2rad(90.0 - altitudeDegree);
}

float calcAzimuth(float azimuthDegree) {
    // 入射方向
    float validAzimuthDegree = mod(azimuthDegree + 360.0, 360.0);
    return deg2rad(360.0 - validAzimuthDegree + 90.0);
}

vec2 calcSlopeAndAspect(vec2 apos) {

    ///////////////
    // a,  b,  c,
    // d,  e,  f,
    // g,  h,  i
    //////////////
    float a = elevation(apos + vec2(-1.0, 1.0));
    float b = elevation(apos + vec2(0.0, 1.0));
    float c = elevation(apos + vec2(1.0, 1.0));
    float d = elevation(apos + vec2(-1.0, 0.0));
    float e = elevation(apos + vec2(0.0, 0.0));
    float f = elevation(apos + vec2(1.0, 0.0));
    float g = elevation(apos + vec2(-1.0, -1.0));
    float h = elevation(apos + vec2(0.0, -1.0));
    float i = elevation(apos + vec2(1.0, -1.0));

    float dzdx = ((c + 2.0 * e + h) - (a + 2.0 * d + f)) / 8.0;
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / 8.0;

    float slopeRad = atan(sqrt(dzdx * dzdx + dzdy * dzdy));

    float aspectRad = 0.0;
    if(dzdx != 0.0) {
        aspectRad = atan(dzdy, -dzdx);
        aspectRad = mix(aspectRad, 2.0 * PI + aspectRad, aspectRad < 0.0);
    } else {
        aspectRad = dzdy > 0.0 ? PI / 2.0 : (dzdy < 0.0 ? PI * 3.0 / 2.0 : 0.0);
    }
    return vec2(slopeRad, aspectRad);
}

float calcHillShade(float Zenith_rad, float Azimuth_rad, float Slope_rad, float Aspect_rad) {
    float hillShade = ((cos(Zenith_rad) * cos(Slope_rad)) +
        (sin(Zenith_rad) * sin(Slope_rad) * cos(Azimuth_rad - Aspect_rad)));
    return hillShade;
}

void main() {

    //// DME ////
    vec3 pos_skirt = decomposeToPosAndSkirt(a_position);
    vec2 pos = pos_skirt.xy;
    float skirt = pos_skirt.z;

    float height = elevation(pos);
    float z = height * u_exaggeration - skirt * u_skirt_height;
    gl_Position = u_matrix * vec4(pos.xy, z, 1.0);

    /// HillShade ///
    float zenithRad = calcZenith(u_altitudeDegree);
    float azimuthRad = calcAzimuth(u_azimuthDegree);
    vec2 slope_aspect = calcSlopeAndAspect(pos);

    float hillShade = calcHillShade(zenithRad, azimuthRad, slope_aspect.x, slope_aspect.y);

    v_height = height;
    is_skirt = skirt;
    v_hillshade = hillShade;
}
#endif

#ifdef FRAGMENT_SHADER
precision highp float;

in float v_height;
in float is_skirt;
in float v_hillshade;

out vec4 outColor;//OUTPUT RG32F

const float SKIRT_HEIGHT_FLAG = 24575.0;

void main() {
    // float height = v_height;
    // if(is_skirt > 0.0) {
    //     height = height + SKIRT_HEIGHT_FLAG;
    // }
    // float hs = 1.0;
    // outColor = vec4((v_height + 60.0) / 70.0, 0.4, 0.45, 1.0);
    outColor = vec4(v_height, v_hillshade, 0.0, 0.0);
}
#endif