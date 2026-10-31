import type { ModeOptions } from '../interfaces/ModeOptions';
import {
	TerraDrawAngledRectangleMode,
	TerraDrawFreehandLineStringMode,
	TerraDrawFreehandMode,
	TerraDrawLineStringMode,
	TerraDrawMarkerMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawPolyLineMode,
	TerraDrawRectangleMode,
	TerraDrawRenderMode,
	ValidateNotSelfIntersecting,
	type GeoJSONStoreFeatures
} from 'terra-draw';
import markerSvgUrl from '../../scss/icons/marker-blue.svg';
import { TerraDrawTextMode } from '../modes/TerraDrawTextMode';
import { TerraDrawShapeCircleMode } from '../modes/TerraDrawShapeCircleMode';
import { TerraDrawShapeEllipseMode } from '../modes/TerraDrawShapeEllipseMode';
import { TerraDrawShapeSectorMode } from '../modes/TerraDrawShapeSectorMode';
import { TerraDrawShapeSensorMode } from '../modes/TerraDrawShapeSensorMode';
import { TerraDrawShapeSelectMode } from '../modes/TerraDrawShapeSelectMode';

/**
 * Validation function for polygon features to prevent self-intersecting polygons
 * @param feature - The GeoJSON feature to validate
 * @param e - Event object containing updateType
 * @returns Validation result with valid flag
 */
export const polygonValidation = (feature: GeoJSONStoreFeatures, e: { updateType: string }) => {
	const updateType = e.updateType;
	if (updateType === 'finish' || updateType === 'commit') {
		return ValidateNotSelfIntersecting(feature);
	}
	return { valid: true };
};

/**
 * get default Terra Draw mode instances.
 * @returns default TerraDrawMode objects. Key is TerraDraw mode name, and value is Terra Draw mode object instance
 */
export const getDefaultModeOptions = () => {
	const modeOptions: ModeOptions = {
		render: new TerraDrawRenderMode({
			modeName: 'render',
			styles: {}
		}),
		point: new TerraDrawPointMode({
			editable: true
		}),
		marker: new TerraDrawMarkerMode({
			editable: true,
			styles: {
				markerUrl: markerSvgUrl,
				markerWidth: 27,
				markerHeight: 27
			}
		}),
		linestring: new TerraDrawLineStringMode({
			editable: true
		}),
		polyline: new TerraDrawPolyLineMode(),
		polygon: new TerraDrawPolygonMode({
			editable: true,
			validation: polygonValidation
		}),
		rectangle: new TerraDrawRectangleMode(),
		'angled-rectangle': new TerraDrawAngledRectangleMode(),
		circle: new TerraDrawShapeCircleMode(),
		ellipse: new TerraDrawShapeEllipseMode(),
		freehand: new TerraDrawFreehandMode(),
		'freehand-linestring': new TerraDrawFreehandLineStringMode(),
		sensor: new TerraDrawShapeSensorMode(),
		sector: new TerraDrawShapeSectorMode(),
		select: new TerraDrawShapeSelectMode({
			flags: {
				point: {
					feature: {
						draggable: true
					}
				},
				marker: {
					feature: {
						draggable: true
					}
				},
				polygon: {
					feature: {
						draggable: true,
						rotateable: true,
						scaleable: true,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				linestring: {
					feature: {
						draggable: true,
						rotateable: true,
						scaleable: true,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				polyline: {
					feature: {
						draggable: true,
						rotateable: true,
						scaleable: true,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				freehand: {
					feature: {
						draggable: true,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				'freehand-linestring': {
					feature: {
						draggable: true,
						rotateable: true,
						scaleable: true,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				circle: {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false
					}
				},
				ellipse: {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false
					}
				},
				rectangle: {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false
					}
				},
				'angled-rectangle': {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false
					}
				},
				sensor: {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				sector: {
					feature: {
						draggable: true,
						rotateable: false,
						scaleable: false,
						coordinates: {
							midpoints: true,
							draggable: true,
							deletable: true
						}
					}
				},
				text: {
					feature: {
						draggable: true
					}
				}
			},
			styles: {
				selectedPointColor: (feature: GeoJSONStoreFeatures) => {
					if (feature.properties.mode === 'text') {
						return '#FFFFFF';
					}
				},
				selectedPointWidth: (feature: GeoJSONStoreFeatures) => {
					if (feature.properties.mode === 'text') {
						return 0;
					}
				}
			}
		}),
		delete: new TerraDrawRenderMode({
			modeName: 'delete',
			styles: {}
		}),
		'delete-selection': new TerraDrawRenderMode({
			modeName: 'delete-selection',
			styles: {}
		}),
		download: new TerraDrawRenderMode({
			modeName: 'download',
			styles: {}
		}),
		undo: new TerraDrawRenderMode({
			modeName: 'undo',
			styles: {}
		}),
		redo: new TerraDrawRenderMode({
			modeName: 'redo',
			styles: {}
		}),
		text: new TerraDrawTextMode({
			editable: true,
			placeholder: 'Enter Label here...',
			styles: {
				textColor: '#000000',
				textSize: 12,
				textSelectedSize: 14,
				textHaloWidth: 1,
				textHaloColor: '#FFFFFF',
				textSelectedHaloColor: '#E0B03F'
			}
		})
	};
	return modeOptions;
};
