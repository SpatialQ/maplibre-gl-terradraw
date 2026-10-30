import { TerraDrawSelectMode, type TerraDrawMouseEvent } from 'terra-draw';
export declare class TerraDrawShapeSelectMode extends TerraDrawSelectMode {
    private shapeHandles;
    private shapeDrag;
    constructor(options?: ConstructorParameters<typeof TerraDrawSelectMode>[0]);
    clearShapeHandles(): void;
    private deleteShapeHandles;
    afterFeatureUpdated(feature: {
        id?: string | number;
        properties?: {
            mode?: unknown;
        };
    }): void;
    onDragStart(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void): void;
    onDrag(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void): void;
    onDragEnd(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void): void;
    onMouseMove(event: TerraDrawMouseEvent): void;
    private host;
    private modeOf;
    private featureOf;
    private paramsOf;
    private writeShape;
    private commitMovedCenter;
    private hitHandle;
    private syncShapeHandles;
}
//# sourceMappingURL=TerraDrawShapeSelectMode.d.ts.map