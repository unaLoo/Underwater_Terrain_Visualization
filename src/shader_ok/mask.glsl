#ifdef VERTEX_SHADER

#define PI 3.141592653589793
#define RAD_TO_DEG 180.0/PI
#define DEG_TO_RAD PI/180.0

layout(location = 0) in vec4 aPosition;

out vec2 SSpos;

float mercatorXfromLng(float lng) {
    return (180.0 + lng) / 360.0;
}
float mercatorYfromLat(float lat) {
    return (180.0 - (RAD_TO_DEG * log(tan(PI / 4.0 + lat / 2.0 * DEG_TO_RAD)))) / 360.0;
}
vec2 mercatorFromLngLat(vec2 lngLat) {
    return vec2(mercatorXfromLng(lngLat.x), mercatorYfromLat(lngLat.y));
}

uniform mat4 u_matrix;

void main() {
    vec4 CSpos = u_matrix * vec4(mercatorFromLngLat(aPosition.xy), 0.0, 1.0);
    SSpos = CSpos.xy / CSpos.w * 0.5 + 0.5;
    gl_Position = CSpos;
}

#endif
#ifdef FRAGMENT_SHADER
precision lowp float;

in vec2 SSpos;

out float FragColor;
void main() {
    // FragColor = vec4(SSpos,0.0,1.0);
    FragColor = 1.0;

}

#endif