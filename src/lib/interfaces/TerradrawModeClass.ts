import type { TerraDrawTextMode } from '../modes/TerraDrawTextMode';
import type { TerraDrawShapeEllipseMode } from '../modes/TerraDrawShapeEllipseMode';
import type { TerraDrawShapeSectorMode } from '../modes/TerraDrawShapeSectorMode';
import type { TerraDrawShapeSensorMode } from '../modes/TerraDrawShapeSensorMode';
import type { TerraDrawValhallaRoutingMode } from '../modes/TerraDrawValhallaRoutingMode';
import type { TerraDrawValhallaTimeIsochroneMode } from '../modes/TerraDrawValhallaTimeIsochroneMode';
import type { TerraDrawValhallaDistanceIsochroneMode } from '../modes/TerraDrawValhallaDistanceIsochroneMode';
import {
	TerraDrawAngledRectangleMode,
	TerraDrawCircleMode,
	TerraDrawEllipseMode,
	TerraDrawFreehandMode,
	TerraDrawFreehandLineStringMode,
	TerraDrawLineStringMode,
	TerraDrawPolyLineMode,
	TerraDrawMarkerMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawRectangleMode,
	TerraDrawSectorMode,
	TerraDrawSensorMode,
	TerraDrawRenderMode,
	TerraDrawSelectMode
} from 'terra-draw';

/**
 * TerraDraw mode class types
 */
export type TerradrawModeClass =
	| TerraDrawAngledRectangleMode
	| TerraDrawCircleMode
	| TerraDrawEllipseMode
	| TerraDrawFreehandMode
	| TerraDrawFreehandLineStringMode
	| TerraDrawLineStringMode
	| TerraDrawPolyLineMode
	| TerraDrawMarkerMode
	| TerraDrawPointMode
	| TerraDrawPolygonMode
	| TerraDrawRectangleMode
	| TerraDrawSectorMode
	| TerraDrawSensorMode
	| TerraDrawRenderMode
	| TerraDrawSelectMode
	| TerraDrawShapeEllipseMode
	| TerraDrawShapeSectorMode
	| TerraDrawShapeSensorMode
	| TerraDrawTextMode
	| TerraDrawValhallaRoutingMode
	| TerraDrawValhallaTimeIsochroneMode
	| TerraDrawValhallaDistanceIsochroneMode;
