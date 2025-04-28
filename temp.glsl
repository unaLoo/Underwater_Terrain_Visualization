#version 300 es


precision highp float;
#define EPSILON 0.0000001
#define PI 3.141592653589793
#ifdef RENDER_CUTOFF
    float cutoff_opacity(vec4 cutoff_params, float depth) {
        float near = cutoff_params.x;
        float far = cutoff_params.y;
        float cutoffStart = cutoff_params.z;
        float cutoffEnd = cutoff_params.w;
        float linearDepth = (depth-near)/(far-near);
        return clamp((linearDepth-cutoffStart)/(cutoffEnd-cutoffStart), 0.0, 1.0);
    }
#endif

#define EXTENT 8192.0
#define RAD_TO_DEG 180.0/PI
#define DEG_TO_RAD PI/180.0
#define GLOBE_RADIUS EXTENT/PI/2.0
float wrap(float n, float min, float max) {
    float d = max-min;
    float w = mod(mod(n-min, d)+d, d)+min;
    return (w == min) ? max : w;
}

vec2 unpack_float(const float packedValue) {
    int packedIntValue = int(packedValue);
    int v0 = packedIntValue/256;
    return vec2(v0, packedIntValue-v0*256);
}
vec2 unpack_opacity(const float packedOpacity) {
    int intOpacity = int(packedOpacity)/2;
    return vec2(float(intOpacity)/127.0, mod(packedOpacity, 2.0));
}
vec4 decode_color(const vec2 encodedColor) {
    return vec4(
    unpack_float(encodedColor[0])/255.0, unpack_float(encodedColor[1])/255.0
    );
}
float unpack_mix_vec2(const vec2 packedValue, const float t) {
    return mix(packedValue[0], packedValue[1], t);
}
vec4 unpack_mix_color(const vec4 packedColors, const float t) {
    vec4 minColor = decode_color(vec2(packedColors[0], packedColors[1]));
    vec4 maxColor = decode_color(vec2(packedColors[2], packedColors[3]));
    return mix(minColor, maxColor, t);
}
vec2 get_pattern_pos(const vec2 pixel_coord_upper, const vec2 pixel_coord_lower, const vec2 pattern_size, const vec2 units_to_pixels, const vec2 pos) {
    vec2 offset = mod(mod(mod(pixel_coord_upper, pattern_size)*256.0, pattern_size)*256.0+pixel_coord_lower, pattern_size);
    return (units_to_pixels*pos+offset)/pattern_size;
}
vec2 get_pattern_pos(const vec2 pixel_coord_upper, const vec2 pixel_coord_lower, const vec2 pattern_size, const float tile_units_to_pixels, const vec2 pos) {
    return get_pattern_pos(pixel_coord_upper, pixel_coord_lower, pattern_size, vec2(tile_units_to_pixels), pos);
}
float mercatorXfromLng(float lng) {
    return (180.0+lng)/360.0;
}
float mercatorYfromLat(float lat) {
    return (180.0-(RAD_TO_DEG*log(tan(PI/4.0+lat/2.0*DEG_TO_RAD))))/360.0;
}
vec3 latLngToECEF(vec2 latLng) {
    latLng = DEG_TO_RAD*latLng;
    float cosLat = cos(latLng[0]);
    float sinLat = sin(latLng[0]);
    float cosLng = cos(latLng[1]);
    float sinLng = sin(latLng[1]);
    float sx = cosLat*sinLng*GLOBE_RADIUS;
    float sy = -sinLat*GLOBE_RADIUS;
    float sz = cosLat*cosLng*GLOBE_RADIUS;
    return vec3(sx, sy, sz);
}
#ifdef RENDER_CUTOFF
    uniform vec4 u_cutoff_params;
    out float v_cutoff_opacity;
#endif
const vec4 AWAY = vec4(-1000.0, -1000.0, -1000.0, 1);
const float skirtOffset = 24575.0;
vec3 decomposeToPosAndSkirt(vec2 posWithComposedSkirt) {
    float skirt = float(posWithComposedSkirt.x >= skirtOffset);
    vec2 pos = posWithComposedSkirt-vec2(skirt*skirtOffset, 0.0);
    return vec3(pos, skirt);
}

#define ELEVATION_SCALE 7.0
#define ELEVATION_OFFSET 450.0

    vec3 elevationVector(vec2 pos) {
        return vec3(0, 0, 1);
    }

    uniform highp sampler2D u_dem;
    uniform highp sampler2D u_dem_prev;
    uniform vec2 u_dem_tl;
    uniform vec2 u_dem_tl_prev;
    uniform float u_dem_scale;
    uniform float u_dem_scale_prev;
    uniform float u_dem_size;
    uniform float u_dem_lerp;
    uniform float u_exaggeration;
    uniform float u_meter_to_dem;
    uniform mat4 u_label_plane_matrix_inv;
    vec4 tileUvToDemSample(vec2 uv, float dem_size, float dem_scale, vec2 dem_tl) {
        vec2 pos = dem_size*(uv*dem_scale+dem_tl)+1.0;
        vec2 f = fract(pos);
        return vec4((pos-f+0.5)/(dem_size+2.0), f);
    }
    float currentElevation(vec2 apos) {

        vec2 pos = (u_dem_size*(apos/8192.0*u_dem_scale+u_dem_tl)+1.5)/(u_dem_size+2.0);
        return u_exaggeration*texture(u_dem, pos).r;

    }
    float prevElevation(vec2 apos) {

        vec2 pos = (u_dem_size*(apos/8192.0*u_dem_scale_prev+u_dem_tl_prev)+1.5)/(u_dem_size+2.0);
        return u_exaggeration*texture(u_dem_prev, pos).r;
       
    }
    #ifdef TERRAIN_VERTEX_MORPHING
        float elevation(vec2 apos) {
            #ifdef ZERO_EXAGGERATION
                return 0.0;
            #endif
            float nextElevation = currentElevation(apos);
            float prevElevation = prevElevation(apos);
            return mix(prevElevation, nextElevation, u_dem_lerp);
        }
    #else
        float elevation(vec2 apos) {
            #ifdef ZERO_EXAGGERATION
                return 0.0;
            #endif
            return currentElevation(apos);
        }
    #endif
    vec4 fourSample(vec2 pos, vec2 off) {
        float tl = texture(u_dem, pos).r;
        float tr = texture(u_dem, pos+vec2(off.x, 0.0)).r;
        float bl = texture(u_dem, pos+vec2(0.0, off.y)).r;
        float br = texture(u_dem, pos+off).r;
        return vec4(tl, tr, bl, br);
    }
    float flatElevation(vec2 pack) {
        vec2 apos = floor(pack/8.0);
        vec2 span = 10.0*(pack-apos*8.0);
        vec2 uvTex = (apos-vec2(1.0, 1.0))/8190.0;
        float size = u_dem_size+2.0;
        float dd = 1.0/size;
        vec2 pos = u_dem_size*(uvTex*u_dem_scale+u_dem_tl)+1.0;
        vec2 f = fract(pos);
        pos = (pos-f+0.5)*dd;
        vec4 h = fourSample(pos, vec2(dd));
        float z = mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
        vec2 w = floor(0.5*(span*u_meter_to_dem-1.0));
        vec2 d = dd*w;
        h = fourSample(pos-d, 2.0*d+vec2(dd));
        vec4 diff = abs(h.xzxy-h.ywzw);
        vec2 slope = min(vec2(0.25), u_meter_to_dem*0.5*(diff.xz+diff.yw)/(2.0*w+vec2(1.0)));
        vec2 fix = slope*span;
        float base = z+max(fix.x, fix.y);
        return u_exaggeration*base;
    }
    float elevationFromUint16(float word) {
        return u_exaggeration*(word/ELEVATION_SCALE-ELEVATION_OFFSET);
    }

#ifdef DEPTH_OCCLUSION
    uniform highp sampler2D u_depth;
    uniform highp vec2 u_depth_size_inv;
    uniform highp vec2 u_depth_range_unpack;
    uniform highp float u_occluder_half_size;
    uniform highp float u_occlusion_depth_offset;
    #ifdef DEPTH_D24
        float unpack_depth(float depth) {
            return depth*u_depth_range_unpack.x+u_depth_range_unpack.y;
        }
        vec4 unpack_depth4(vec4 depth) {
            return depth*u_depth_range_unpack.x+vec4(u_depth_range_unpack.y);
        }
    #else
        highp float unpack_depth_rgba(vec4 rgba_depth) {
            const highp vec4 bit_shift = vec4(1.0/(255.0*255.0*255.0), 1.0/(255.0*255.0), 1.0/255.0, 1.0);
            return dot(rgba_depth, bit_shift)*2.0-1.0;
        }
    #endif
    bool isOccluded(vec4 frag) {
        vec3 coord = frag.xyz/frag.w;
        #ifdef DEPTH_D24
            float depth = unpack_depth(texture(u_depth, (coord.xy+1.0)*0.5).r);
        #else
            float depth = unpack_depth_rgba(texture(u_depth, (coord.xy+1.0)*0.5));
        #endif
        return coord.z+u_occlusion_depth_offset > depth;
    }
    highp vec4 getCornerDepths(vec2 coord) {
        highp vec3 df = vec3(u_occluder_half_size*u_depth_size_inv, 0.0);
        highp vec2 uv = 0.5*coord.xy+0.5;
        #ifdef DEPTH_D24
            highp vec4 depth = vec4(
            texture(u_depth, uv-df.xz).r, texture(u_depth, uv+df.xz).r, texture(u_depth, uv-df.zy).r, texture(u_depth, uv+df.zy).r
            );
            depth = unpack_depth4(depth);
        #else
            highp vec4 depth = vec4(
            unpack_depth_rgba(texture(u_depth, uv-df.xz)), unpack_depth_rgba(texture(u_depth, uv+df.xz)), unpack_depth_rgba(texture(u_depth, uv-df.zy)), unpack_depth_rgba(texture(u_depth, uv+df.zy))
            );
        #endif
        return depth;
    }
    highp float occlusionFadeMultiSample(vec4 frag) {
        highp vec3 coord = frag.xyz/frag.w;
        highp vec2 uv = 0.5*coord.xy+0.5;
        int NX = 3;
        int NY = 4;
        highp vec2 df = u_occluder_half_size*u_depth_size_inv;
        highp vec2 oneStep = 2.0*u_occluder_half_size*u_depth_size_inv/vec2(NX-1, NY-1);
        highp float res = 0.0;
        for (int y = 0; y < NY;++y) {
            for (int x = 0; x < NX;++x) {
                #ifdef DEPTH_D24
                    highp float depth = unpack_depth(texture(u_depth, uv-df+vec2(float(x)*oneStep.x, float(y)*oneStep.y)).r);
                #else
                    highp float depth = unpack_depth_rgba(texture(u_depth, uv-df+vec2(float(x)*oneStep.x, float(y)*oneStep.y)));
                #endif
                res += 1.0-clamp(300.0*(coord.z+u_occlusion_depth_offset-depth), 0.0, 1.0);
            }
    
        }
        res = clamp(2.0*res/float(NX*NY)-0.5, 0.0, 1.0);
        return res;
    }
    highp float occlusionFade(vec4 frag) {
        highp vec3 coord = frag.xyz/frag.w;
        highp vec4 depth = getCornerDepths(coord.xy);
        return dot(vec4(0.25), vec4(1.0)-clamp(300.0*(vec4(coord.z+u_occlusion_depth_offset)-depth), 0.0, 1.0));
    }
#else
    bool isOccluded(vec4 frag) {
        return false;
    }
    highp float occlusionFade(vec4 frag) {
        return 1.0;
    }
    highp float occlusionFadeMultiSample(vec4 frag) {
        return 1.0;
    }
#endif//DEPTH_OCCLUSION


uniform mat4 u_matrix;
uniform float u_skirt_height;
in vec2 a_pos;
out vec2 v_pos0;


void main() {
    vec3 decomposedPosAndSkirt = decomposeToPosAndSkirt(a_pos);
    float skirt = decomposedPosAndSkirt.z;
    vec2 decodedPos = decomposedPosAndSkirt.xy;
    float elevation = elevation(decodedPos)-skirt*u_skirt_height;
    v_pos0 = decodedPos/8192.0;
    gl_Position = u_matrix*vec4(decodedPos, elevation, 1.0);

}