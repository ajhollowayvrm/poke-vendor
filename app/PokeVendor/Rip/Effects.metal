#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

static bool insideRect(float2 p, float4 r) {
    return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.z && p.y <= r.y + r.w;
}

/// The back of the page: the back color, with a little of the front print showing through.
static half4 pageBack(half4 c, half4 back, half light) {
    half3 front = c.rgb / max(c.a, 0.001h);
    half3 rgb = mix(back.rgb, front, 0.10h) * light;
    return half4(rgb * c.a, c.a);
}

/// A page that peels back from one corner, like the card of a blister pack.
/// The corner follows the finger, and the lifted part wraps around a cylinder of the given radius.
/// The shader draws the flat part and the cylinder. A shader can only sample near each point, so the
/// flap that lies flipped over on top is drawn by PeelEffect as a mirrored copy of the page.
/// `page` is the rect of the page in the layer: x, y, width, height.
[[ stitchable ]] half4 peel(float2 position, SwiftUI::Layer layer, float4 page, float2 corner, float2 finger,
                           float radius, half4 back) {
    float2 toCorner = corner - finger;
    float distance = length(toCorner);
    if (distance < 1.0) {
        return layer.sample(position);
    }
    float2 dir = toCorner / distance;
    float r = radius;
    // The fold line sits so that the flipped corner lands under the finger.
    float2 fold = finger + dir * ((distance - M_PI_F * r) * 0.5);
    float d = dot(position - fold, dir);

    if (d < 0.0) {
        // The flat part. The flap that is flipped all the way over is a separate view (PeelEffect).
        // The lifted page throws a soft shadow near the fold.
        half4 c = layer.sample(position);
        half shade = half(1.0 - 0.30 * exp(d / (r * 0.7)));
        return half4(c.rgb * shade, c.a);
    }

    if (d <= r) {
        // The top of the cylinder shows the back of the page.
        float upper = r * (M_PI_F - asin(d / r));
        float2 p2 = position + dir * (upper - d);
        if (insideRect(p2, page)) {
            half4 c = layer.sample(p2);
            if (c.a > 0.02h) {
                return pageBack(c, back, half(0.70 + 0.30 * (d / r)));
            }
        }
        // The bottom of the cylinder shows the front, darker as it turns away, with a thin highlight.
        float lower = r * asin(d / r);
        float2 p1 = position + dir * (lower - d);
        if (insideRect(p1, page)) {
            half4 c = layer.sample(p1);
            if (c.a > 0.02h) {
                float k = d / r;
                half light = half(1.0 - 0.50 * k * k);
                half spec = half(0.30 * exp(-pow((k - 0.30) * 5.0, 2.0)));
                return half4(c.rgb * light + spec * c.a, c.a);
            }
        }
    }

    // The page lifted off from here. The curl throws a shadow on what is under it.
    if (insideRect(position, page)) {
        float t = (d - r) / (r * 1.8);
        if (t < 1.0) {
            return half4(0.0h, 0.0h, 0.0h, half(0.40 * (1.0 - max(t, 0.0))));
        }
    }
    return half4(0.0h);
}
