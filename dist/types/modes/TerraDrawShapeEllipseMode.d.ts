import { TerraDrawCircleMode, type GeoJSONStoreFeatures, type TerraDrawAdapterStyling, type TerraDrawKeyboardEvent, type TerraDrawMouseEvent } from 'terra-draw';
type HexColor = `#${string}`;
type HexColorStyling = HexColor | ((feature: GeoJSONStoreFeatures) => HexColor | undefined);
type NumericStyling = number | ((feature: GeoJSONStoreFeatures) => number | undefined);
export type ShapeEllipseStyling = {
    fillColor: HexColorStyling;
    fillOpacity: NumericStyling;
    outlineColor: HexColorStyling;
    outlineWidth: NumericStyling;
    outlineOpacity: NumericStyling;
};
export type ShapeEllipseModeOptions = {
    styles?: Partial<ShapeEllipseStyling>;
    segments?: number;
};
export declare class TerraDrawShapeEllipseMode extends TerraDrawCircleMode {
    mode: "ellipse";
    private phase;
    private origin;
    private xSemiAxis;
    private ySemiAxis;
    private angle;
    private currentId;
    private readonly steps;
    constructor(options?: ShapeEllipseModeOptions);
    styleFeature(feature: GeoJSONStoreFeatures): TerraDrawAdapterStyling;
    onDragStart(): void;
    onDrag(): void;
    onDragEnd(): void;
    afterFeatureAdded(): void;
    afterFeatureUpdated(): void;
    validateFeature(): {
        valid: boolean;
    };
    start(): void;
    stop(): void;
    cleanUp(): void;
    onKeyUp(event: TerraDrawKeyboardEvent): void;
    onClick(event: TerraDrawMouseEvent): void;
    onMouseMove(event: TerraDrawMouseEvent): void;
    private captureDepth;
    private params;
    private write;
    private discard;
}
export {};
//# sourceMappingURL=TerraDrawShapeEllipseMode.d.ts.map