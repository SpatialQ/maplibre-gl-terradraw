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
	toLocal,
	type ShapeParams
} from './shapeGeometry';

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
	/** Outline steps. Default 64. */
	segments?: number;
};

type DrawPhase = 'idle' | 'axis' | 'depth';

/**
 * Three-click ellipse: center, end of the first axis (length and bearing),
 * then the other axis. Angle is the map bearing of the first axis.
 */
export class TerraDrawShapeEllipseMode extends TerraDrawCircleMode {
	mode = 'ellipse' as const;
	private phase: DrawPhase = 'idle';
	private origin: [number, number] | null = null;
	private xSemiAxis = 0;
	private ySemiAxis = 0;
	private angle = 0;
	private currentId: string | number | null = null;
	private readonly steps: number;

	constructor(options?: ShapeEllipseModeOptions) {
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

	/** Circle drag must not run; the ellipse is three clicks. */
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
			this.xSemiAxis = 1;
			this.ySemiAxis = 1;
			this.angle = 0;
			this.phase = 'axis';
			this.write('commit', true);
			this.setDrawing();
			return;
		}
		if (this.phase === 'axis') {
			const length = distanceMeters(this.origin, point);
			if (length < 1) return;
			this.xSemiAxis = length;
			this.ySemiAxis = length;
			this.angle = bearingDegrees(this.origin, point);
			this.phase = 'depth';
			this.write('commit', true);
			return;
		}
		this.captureDepth(point);
		if (this.ySemiAxis < 1) return;
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
		if (this.phase === 'axis') {
			const length = distanceMeters(this.origin, point);
			if (length < 1) return;
			this.xSemiAxis = length;
			this.ySemiAxis = length;
			this.angle = bearingDegrees(this.origin, point);
		} else {
			this.captureDepth(point);
		}
		this.write('commit', true);
	}

	private captureDepth(point: [number, number]) {
		if (!this.origin) return;
		const local = toLocal(this.origin, point, this.angle);
		this.ySemiAxis = Math.max(1, Math.abs(local.y));
	}

	private params(): ShapeParams | null {
		if (!this.origin) return null;
		return {
			mode: 'ellipse',
			center: this.origin,
			radiusMeters: 0,
			innerRadiusMeters: 0,
			startBearing: 0,
			endBearing: 0,
			arcDirection: 'clockwise',
			xSemiAxis: this.xSemiAxis,
			ySemiAxis: this.ySemiAxis,
			angle: this.angle
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
			center: params.center,
			xSemiAxis: params.xSemiAxis,
			ySemiAxis: params.ySemiAxis,
			angle: params.angle,
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
		if (this.state === 'drawing') this.setStarted();
	}
}
