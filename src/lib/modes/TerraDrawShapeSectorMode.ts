import {
	TerraDrawCircleMode,
	type GeoJSONStoreFeatures,
	type TerraDrawAdapterStyling,
	type TerraDrawKeyboardEvent,
	type TerraDrawMouseEvent
} from 'terra-draw';
import {
	SHAPE_STEPS,
	bearingDegrees,
	distanceMeters,
	ringForParams,
	shapeProperties,
	type ArcDirection,
	type ShapeParams
} from './shapeGeometry';

type HexColor = `#${string}`;
type HexColorStyling = HexColor | ((feature: GeoJSONStoreFeatures) => HexColor | undefined);
type NumericStyling = number | ((feature: GeoJSONStoreFeatures) => number | undefined);

export type ShapeSectorStyling = {
	fillColor: HexColorStyling;
	fillOpacity: NumericStyling;
	outlineColor: HexColorStyling;
	outlineWidth: NumericStyling;
	outlineOpacity: NumericStyling;
};

export type ShapeSectorModeOptions = {
	styles?: Partial<ShapeSectorStyling>;
	/** Arc outline steps. Default 64. */
	segments?: number;
};

type DrawPhase = 'idle' | 'radius' | 'sweep';

function directionFromBearings(startBearing: number, endBearing: number): ArcDirection {
	const start = (startBearing * Math.PI) / 180;
	const end = (endBearing * Math.PI) / 180;
	// East/north cross of the start and end unit vectors.
	const cross = Math.sin(start) * Math.cos(end) - Math.cos(start) * Math.sin(end);
	// Match arcSweepDegrees naming: increasing bearing = 'anticlockwise'.
	return cross < 0 ? 'anticlockwise' : 'clockwise';
}

/**
 * Three-click sector: center, start of the arc (radius + start bearing), then
 * the end bearing. Stores center, radius, bearings, and arcDirection.
 */
export class TerraDrawShapeSectorMode extends TerraDrawCircleMode {
	mode = 'sector' as const;
	private phase: DrawPhase = 'idle';
	private origin: [number, number] | null = null;
	private radiusMeters = 0;
	private startBearing = 0;
	private endBearing = 0;
	private arcDirection: ArcDirection = 'clockwise';
	private directionSet = false;
	private currentId: string | number | null = null;
	private readonly steps: number;

	constructor(options?: ShapeSectorModeOptions) {
		const steps = Math.trunc(options?.segments ?? SHAPE_STEPS);
		super({
			styles: (options?.styles ?? {}) as NonNullable<
				ConstructorParameters<typeof TerraDrawCircleMode>[0]
			>['styles'],
			segments: steps >= 8 ? steps : SHAPE_STEPS
		});
		this.steps = steps >= 8 ? steps : SHAPE_STEPS;
	}

	/** @internal */
	styleFeature(feature: GeoJSONStoreFeatures): TerraDrawAdapterStyling {
		return {
			pointColor: '#3f97e0',
			pointWidth: 0,
			pointOutlineColor: '#ffffff',
			pointOutlineWidth: 0,
			polygonFillColor: this.getHexColorStylingValue(this.styles.fillColor, '#3f97e0', feature),
			polygonFillOpacity: this.getNumericStylingValue(this.styles.fillOpacity, 0.3, feature),
			polygonOutlineColor: this.getHexColorStylingValue(
				this.styles.outlineColor,
				'#3f97e0',
				feature
			),
			polygonOutlineWidth: this.getNumericStylingValue(this.styles.outlineWidth, 4, feature),
			polygonOutlineOpacity: this.getNumericStylingValue(this.styles.outlineOpacity, 1, feature),
			lineStringColor: '#3f97e0',
			lineStringWidth: 0,
			zIndex: 0
		};
	}

	onDragStart() {}

	/** @internal */
	onDrag() {}

	/** @internal */
	onDragEnd() {}

	/** @internal */
	afterFeatureAdded() {}

	/** @internal */
	afterFeatureUpdated() {}

	/** @internal */
	validateFeature(): { valid: boolean } {
		return { valid: true };
	}

	/** @internal */
	start() {
		this.setStarted();
		this.setCursor('crosshair');
	}

	/** @internal */
	stop() {
		this.cleanUp();
		this.setStopped();
		this.setCursor('unset');
	}

	/** @internal */
	cleanUp() {
		this.discard();
	}

	/** @internal */
	onKeyUp(event: TerraDrawKeyboardEvent) {
		if (event.key === 'Escape') this.discard();
	}

	/** @internal */
	onClick(event: TerraDrawMouseEvent) {
		if (event.button !== 'left') return;
		const point: [number, number] = [event.lng, event.lat];
		if (this.phase === 'idle' || !this.origin) {
			this.origin = point;
			this.radiusMeters = 1;
			this.startBearing = 0;
			this.endBearing = 1;
			this.arcDirection = 'anticlockwise';
			this.directionSet = false;
			this.phase = 'radius';
			this.write('commit', true);
			this.setDrawing();
			return;
		}
		if (this.phase === 'radius') {
			const length = distanceMeters(this.origin, point);
			if (length < 1) return;
			this.radiusMeters = length;
			this.startBearing = bearingDegrees(this.origin, point);
			this.endBearing = this.startBearing;
			this.directionSet = false;
			this.phase = 'sweep';
			this.write('commit', true);
			return;
		}
		this.captureSweep(point);
		if (this.radiusMeters < 1) return;
		const featureId = this.currentId;
		this.write('finish', false);
		this.phase = 'idle';
		this.origin = null;
		this.currentId = null;
		this.setStarted();
		if (featureId != null) {
			this.onFinish(featureId, { mode: this.mode, action: 'draw' });
		}
	}

	/** @internal */
	onMouseMove(event: TerraDrawMouseEvent) {
		if (!this.origin || this.phase === 'idle') return;
		const point: [number, number] = [event.lng, event.lat];
		if (this.phase === 'radius') {
			const length = distanceMeters(this.origin, point);
			if (length < 1) return;
			this.radiusMeters = length;
			this.startBearing = bearingDegrees(this.origin, point);
			this.endBearing = this.startBearing;
		} else {
			this.captureSweep(point);
		}
		this.write('commit', true);
	}

	private captureSweep(point: [number, number]) {
		if (!this.origin) return;
		this.endBearing = bearingDegrees(this.origin, point);
		if (!this.directionSet && Math.abs(this.endBearing - this.startBearing) > 1e-3) {
			this.arcDirection = directionFromBearings(this.startBearing, this.endBearing);
			this.directionSet = true;
		}
		if (Math.abs(this.startBearing - this.endBearing) < 1e-6) {
			this.endBearing = (this.startBearing + 1) % 360;
			this.arcDirection = 'anticlockwise';
			this.directionSet = true;
		}
	}

	private params(): ShapeParams | null {
		if (!this.origin) return null;
		return {
			mode: 'sector',
			center: this.origin,
			radiusMeters: this.radiusMeters,
			innerRadiusMeters: 0,
			startBearing: this.startBearing,
			endBearing: this.endBearing,
			arcDirection: this.arcDirection,
			xSemiAxis: this.radiusMeters,
			ySemiAxis: this.radiusMeters,
			angle: 0
		};
	}

	private write(updateType: 'commit' | 'finish', drawing: boolean) {
		const params = this.params();
		const host = this as unknown as {
			coordinatePrecision?: number;
			mutateFeature?: {
				createPolygon: (input: {
					coordinates: [number, number][];
					properties: Record<string, unknown>;
				}) => { id: string | number } | null;
				updatePolygon: (input: {
					featureId: string | number;
					coordinateMutations: { type: 'replace'; coordinates: [number, number][][] };
					propertyMutations: Record<string, unknown>;
					context: { updateType: 'commit' | 'finish' };
				}) => unknown;
			};
		};
		if (!params || !host.mutateFeature) return;
		const precision = host.coordinatePrecision ?? 9;
		const ring = ringForParams(params, this.steps, precision);
		const properties = {
			mode: this.mode,
			...shapeProperties(params),
			currentlyDrawing: drawing
		};
		if (this.currentId == null) {
			const created = host.mutateFeature.createPolygon({
				coordinates: ring,
				properties
			});
			if (!created) return;
			this.currentId = created.id;
			return;
		}
		host.mutateFeature.updatePolygon({
			featureId: this.currentId,
			coordinateMutations: { type: 'replace', coordinates: [ring] },
			propertyMutations: properties,
			context: { updateType }
		});
	}

	private discard() {
		const host = this as unknown as {
			mutateFeature?: { deleteFeaturesIfPresent: (ids: Array<string | number>) => void };
		};
		if (this.currentId != null) host.mutateFeature?.deleteFeaturesIfPresent([this.currentId]);
		this.currentId = null;
		this.origin = null;
		this.phase = 'idle';
		this.directionSet = false;
		if (this.state === 'drawing') this.setStarted();
	}
}
