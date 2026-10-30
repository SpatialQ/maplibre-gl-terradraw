export declare const SHAPE_STEPS = 64;
export declare const PARAMETRIC_MODES: readonly ["circle", "ellipse", "rectangle", "angled-rectangle"];
export type ParametricMode = (typeof PARAMETRIC_MODES)[number];
export type LngLat = [number, number];
export type HandleRole = 'center' | 'rim' | 'x' | 'x-neg' | 'y' | 'y-neg';
export type ShapeParams = {
    mode: ParametricMode;
    center: LngLat;
    radiusMeters: number;
    xSemiAxis: number;
    ySemiAxis: number;
    angle: number;
};
type FeatureLike = {
    geometry?: {
        type?: string;
        coordinates?: unknown;
    };
    properties?: Record<string, unknown> | null;
};
export declare function isParametricMode(mode: unknown): mode is ParametricMode;
export declare function destination(lon: number, lat: number, distanceM: number, bearingDeg: number): LngLat;
export declare function distanceMeters(a: LngLat, b: LngLat): number;
export declare function bearingDegrees(a: LngLat, b: LngLat): number;
export declare function toLocal(center: LngLat, point: LngLat, angleDeg: number): {
    x: number;
    y: number;
};
export declare function fromLocal(center: LngLat, xMeters: number, yMeters: number, angleDeg: number): LngLat;
export declare function parseCenter(value: unknown): LngLat | null;
export declare function formatCenter(center: LngLat): string;
export declare function ringForParams(params: ShapeParams, steps?: number, precision?: number): LngLat[];
export declare function handleRoles(mode: ParametricMode): HandleRole[];
export declare function handleCoordinates(params: ShapeParams): LngLat[];
export declare function paramsFromFeature(feature: FeatureLike): ShapeParams | null;
export declare function shapeProperties(params: ShapeParams): Record<string, unknown>;
export declare function resizeShape(params: ShapeParams, role: HandleRole, pointer: LngLat, dragOrigin?: {
    center: LngLat;
    pointer: LngLat;
}): ShapeParams;
export declare function rebuildShapeFeature<T extends FeatureLike>(feature: T, options?: {
    steps?: number;
    precision?: number;
}): T;
export {};
//# sourceMappingURL=shapeGeometry.d.ts.map