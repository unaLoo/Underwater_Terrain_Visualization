#ifdef VERTEX_SHADER

precision highp float;

out vec2 texcoords;

vec4[] vertices = vec4[4](vec4(-1.0, -1.0, 0.0, 0.0), vec4(1.0, -1.0, 1.0, 0.0), vec4(-1.0, 1.0, 0.0, 1.0), vec4(1.0, 1.0, 1.0, 1.0));

void main() {

    vec4 attributes = vertices[gl_VertexID];

    gl_Position = vec4(attributes.xy, 0.0, 1.0);
    texcoords = attributes.zw;
}

#endif

#ifdef FRAGMENT_SHADER

precision highp int;
precision highp float;
precision highp usampler2D;

in vec2 texcoords;

uniform sampler2D showTexture1;
uniform sampler2D showTexture2;
uniform float mixAlpha;

out vec4 fragColor;

void main() {
    vec4 color1 = texture(showTexture1, texcoords);
    vec4 color2 = texture(showTexture2, texcoords);

    float alpha = mixAlpha;
    if(color1.a == 0.0 || color2.a == 0.0) {
        alpha = 0.0;
    }
    vec4 color = mix(color1, color2, alpha);
    fragColor = vec4(color);
    // fragColor = vec4(color.rgb, 0.5);
}

#endif