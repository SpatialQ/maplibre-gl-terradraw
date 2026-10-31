import { TerraDrawSelectMode, type TerraDrawMouseEvent } from 'terra-draw';
import {
	destination,
	handleCoordinates,
	handleRoles,
	isParametricMode,
	paramsFromFeature,
	resizeShape,
	ringForParams,
	shapeProperties,
	SHAPE_STEPS,
	type HandleRole,
	type LngLat,
	type ShapeParams
} from './shapeGeometry';

type Host = {
	selected: Array<string | number>;
	flags: Record<string, { feature?: { draggable?: boolean; coordinates?: unknown } }>;
	pointerDistance?: number;
	dragEventThrottle: number;
	dragEventCount: number;
	pixelDistance?: { measure: (event: TerraDrawMouseEvent, coordinate: LngLat) => number };
	dragFeature?: {
		canDrag: (event: TerraDrawMouseEvent, featureId: string | number) => boolean;
		startDragging: (event: TerraDrawMouseEvent, featureId: string | number) => void;
		drag: (event: TerraDrawMouseEvent) => void;
		isDragging: () => boolean;
	};
	selectionPoints?: { delete: () => void };
	midPoints?: { delete: () => void };
	readFeature?: {
		getProperties: (id: string | number) => Record<string, unknown>;
		getGeometry: (id: string | number) => { type: string; coordinates: LngLat[][] };
	};
	mutateFeature?: {
		createGuidancePoints: (input: {
			coordinates: LngLat[];
			type: string;
			additionalProperties?: (index: number) => Record<string, unknown>;
		}) => Array<string | number>;
		updateGuidancePoints: (
			points: Array<{ featureId: string | number; coordinate: LngLat }>
		) => void;
		deleteFeaturesIfPresent: (ids: Array<string | number>) => void;
		updatePolygon: (input: {
			featureId: string | number;
			coordinateMutations?: { type: 'replace'; coordinates: LngLat[][] };
			propertyMutations?: Record<string, unknown>;
			context: { updateType: 'commit' | 'finish' };
		}) => unknown;
	};
	setCursor: (cursor: string) => void;
	onFinish: (id: string | number, context: { mode: string; action: string }) => void;
	coordinatePrecision?: number;
};

type ShapeDrag = {
	featureId: string | number;
	role: HandleRole;
	origin: ShapeParams;
	originPointer: LngLat;
};

/**
 * Select mode that edits circles, ellipses, rectangles, sectors, and sensors
 * from their center, size, and angle. Other modes keep the standard vertex
 * handles. Parametric modes without stored params (legacy sensors) also fall
 * back to vertex handles.
 */
export class TerraDrawShapeSelectMode extends TerraDrawSelectMode {
	private shapeHandles: { featureId: string | number | null; ids: Array<string | number> } = {
		featureId: null,
		ids: []
	};
	private shapeDrag: ShapeDrag | null = null;

	constructor(options?: ConstructorParameters<typeof TerraDrawSelectMode>[0]) {
		super(options);
		const proto = TerraDrawSelectMode.prototype as unknown as Record<string, unknown>;
		if (typeof proto['select'] !== 'function') return;
		const hook = (name: string) => {
			const method = proto[name];
			if (typeof method !== 'function') {
				throw new Error(`TerraDrawSelectMode.${name} is missing`);
			}
			return (method as (...args: never[]) => void).bind(this);
		};
		const baseSelect = hook('select') as (featureId: string | number, fromCursor?: boolean) => void;
		const baseDeselect = hook('deselect') as (id: string | number) => void;
		const baseDelete = hook('deleteSelected') as () => void;
		const self = this as unknown as Host & Record<string, unknown>;
		self['select'] = (featureId: string | number, fromCursor?: boolean) => {
			const mode = this.modeOf(featureId);
			const flags = mode ? self.flags?.[mode] : undefined;
			const hadCoordinates = Boolean(
				flags?.feature && Object.prototype.hasOwnProperty.call(flags.feature, 'coordinates')
			);
			const coordinates = flags?.feature?.coordinates;
			const useShapeHandles = this.usesShapeHandles(featureId);
			if (flags?.feature && useShapeHandles) delete flags.feature.coordinates;
			try {
				baseSelect(featureId, fromCursor);
			} finally {
				if (hadCoordinates && flags?.feature) flags.feature.coordinates = coordinates;
			}
			if (self.selected[0] !== featureId || !useShapeHandles) return;
			self.selectionPoints?.delete();
			self.midPoints?.delete();
			this.syncShapeHandles(featureId);
		};
		self['deselect'] = (id: string | number) => {
			this.clearShapeHandles();
			baseDeselect(id);
		};
		self['deleteSelected'] = () => {
			this.clearShapeHandles();
			baseDelete();
		};
	}

	/** Drop the shape handles, if they are still in the store. */
	clearShapeHandles() {
		this.shapeDrag = null;
		this.deleteShapeHandles();
	}

	private deleteShapeHandles() {
		const ids = this.shapeHandles.ids;
		this.shapeHandles = { featureId: null, ids: [] };
		if (ids.length) this.host().mutateFeature?.deleteFeaturesIfPresent(ids);
	}

	/** @internal */
	afterFeatureUpdated(feature: { id?: string | number; properties?: { mode?: unknown } }) {
		if (
			feature.id != null &&
			feature.id === this.host().selected?.[0] &&
			this.usesShapeHandles(feature.id)
		) {
			if (!this.shapeDrag) this.syncShapeHandles(feature.id);
			return;
		}
		super.afterFeatureUpdated(feature as never);
	}

	/** @internal */
	onDragStart(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void) {
		const host = this.host();
		const selectedId = host.selected?.[0];
		if (selectedId == null || !this.usesShapeHandles(selectedId)) {
			super.onDragStart(event, setMapDraggability);
			return;
		}
		const hit = this.hitHandle(event);
		if (hit) {
			const origin = this.paramsOf(selectedId);
			if (!origin) return;
			this.shapeDrag = {
				featureId: selectedId,
				role: hit,
				origin,
				originPointer: [event.lng, event.lat]
			};
			host.dragEventCount = 0;
			host.setCursor('grabbing');
			setMapDraggability(false);
			return;
		}
		if (host.dragFeature?.canDrag(event, selectedId)) {
			host.dragFeature.startDragging(event, selectedId);
			host.dragEventCount = 0;
			host.setCursor('grabbing');
			setMapDraggability(false);
		}
	}

	/** @internal */
	onDrag(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void) {
		const host = this.host();
		const selectedId = host.selected?.[0];
		if (selectedId == null || !this.usesShapeHandles(selectedId)) {
			super.onDrag(event, setMapDraggability);
			return;
		}
		host.dragEventCount += 1;
		if (host.dragEventThrottle > 1 && host.dragEventCount % host.dragEventThrottle === 0) return;
		if (this.shapeDrag && this.shapeDrag.featureId === selectedId) {
			const next = resizeShape(this.shapeDrag.origin, this.shapeDrag.role, [event.lng, event.lat], {
				center: this.shapeDrag.origin.center,
				pointer: this.shapeDrag.originPointer
			});
			this.writeShape(selectedId, next, 'commit');
			setMapDraggability(false);
			return;
		}
		if (host.dragFeature?.isDragging()) {
			host.dragFeature.drag(event);
			this.syncShapeHandles(selectedId, true);
			setMapDraggability(false);
			return;
		}
		setMapDraggability(true);
	}

	/** @internal */
	onDragEnd(event: TerraDrawMouseEvent, setMapDraggability: (enabled: boolean) => void) {
		const host = this.host();
		const selectedId = host.selected?.[0];
		if (selectedId == null || !this.usesShapeHandles(selectedId)) {
			super.onDragEnd(event, setMapDraggability);
			return;
		}
		if (this.shapeDrag) {
			const next = resizeShape(this.shapeDrag.origin, this.shapeDrag.role, [event.lng, event.lat], {
				center: this.shapeDrag.origin.center,
				pointer: this.shapeDrag.originPointer
			});
			this.shapeDrag = null;
			this.writeShape(selectedId, next, 'finish');
			host.onFinish(selectedId, { mode: this.mode, action: 'dragCoordinate' });
			host.setCursor('pointer');
			setMapDraggability(true);
			return;
		}
		if (host.dragFeature?.isDragging()) {
			this.commitMovedCenter(selectedId);
		}
		super.onDragEnd(event, setMapDraggability);
		this.syncShapeHandles(selectedId);
	}

	/** @internal */
	onMouseMove(event: TerraDrawMouseEvent) {
		const host = this.host();
		const selectedId = host.selected?.[0];
		if (selectedId == null || !this.usesShapeHandles(selectedId)) {
			super.onMouseMove(event);
			return;
		}
		if (this.hitHandle(event)) {
			host.setCursor('pointer');
			return;
		}
		if (host.dragFeature?.canDrag(event, selectedId)) {
			host.setCursor('move');
			return;
		}
		host.setCursor('unset');
	}

	private host() {
		return this as unknown as Host;
	}

	private modeOf(featureId: string | number): string | undefined {
		const mode = this.host().readFeature?.getProperties(featureId)?.mode;
		return typeof mode === 'string' ? mode : undefined;
	}

	private usesShapeHandles(featureId: string | number) {
		const mode = this.modeOf(featureId);
		return isParametricMode(mode) && this.paramsOf(featureId) != null;
	}

	private featureOf(featureId: string | number) {
		const host = this.host();
		if (!host.readFeature) return null;
		return {
			geometry: host.readFeature.getGeometry(featureId),
			properties: host.readFeature.getProperties(featureId)
		};
	}

	private paramsOf(featureId: string | number, centerFromRing = false): ShapeParams | null {
		const feature = this.featureOf(featureId);
		if (!feature) return null;
		const params = paramsFromFeature(feature);
		if (!params || !centerFromRing) return params;
		const ring = feature.geometry?.coordinates?.[0];
		if (!Array.isArray(ring) || ring.length < 4) return params;
		const open =
			ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
				? ring.slice(0, -1)
				: ring;
		if (!open.length) return params;
		if (params.mode === 'sector') {
			return { ...params, center: [open[0][0], open[0][1]] };
		}
		if (params.mode === 'sensor') {
			const expected = destination(
				params.center[0],
				params.center[1],
				params.radiusMeters,
				params.startBearing
			);
			return {
				...params,
				center: [
					params.center[0] + (open[0][0] - expected[0]),
					params.center[1] + (open[0][1] - expected[1])
				]
			};
		}
		let lon = 0;
		let lat = 0;
		for (const point of open) {
			lon += point[0];
			lat += point[1];
		}
		return { ...params, center: [lon / open.length, lat / open.length] };
	}

	private writeShape(
		featureId: string | number,
		params: ShapeParams,
		updateType: 'commit' | 'finish'
	) {
		const host = this.host();
		if (!host.mutateFeature) return;
		const ring = ringForParams(params, SHAPE_STEPS, host.coordinatePrecision ?? 9);
		host.mutateFeature.updatePolygon({
			featureId,
			coordinateMutations: { type: 'replace', coordinates: [ring] },
			propertyMutations: shapeProperties(params),
			context: { updateType }
		});
		this.syncShapeHandles(featureId);
	}

	private commitMovedCenter(featureId: string | number) {
		const params = this.paramsOf(featureId, true);
		if (!params) return;
		this.writeShape(featureId, params, 'commit');
	}

	private hitHandle(event: TerraDrawMouseEvent): HandleRole | null {
		const host = this.host();
		if (!host.pixelDistance || !host.readFeature || !this.shapeHandles.ids.length) return null;
		const limit = host.pointerDistance || 40;
		let best: { role: HandleRole; distance: number } | null = null;
		for (const id of this.shapeHandles.ids) {
			const geometry = host.readFeature.getGeometry(id) as unknown as { coordinates?: LngLat };
			const coordinate = geometry?.coordinates;
			if (!coordinate) continue;
			const distance = host.pixelDistance.measure(event, coordinate);
			const role = host.readFeature.getProperties(id)?.shapeHandle as HandleRole | undefined;
			if (!role || distance > limit) continue;
			if (!best || distance < best.distance) best = { role, distance };
		}
		return best?.role ?? null;
	}

	private syncShapeHandles(featureId: string | number, centerFromRing = false) {
		const host = this.host();
		const params = this.paramsOf(
			featureId,
			centerFromRing || Boolean(host.dragFeature?.isDragging())
		);
		if (!params || !host.mutateFeature) return;
		const coordinates = handleCoordinates(params);
		const roles = handleRoles(params.mode);
		if (
			this.shapeHandles.featureId !== featureId ||
			this.shapeHandles.ids.length !== coordinates.length
		) {
			this.deleteShapeHandles();
			const ids = host.mutateFeature.createGuidancePoints({
				coordinates,
				type: 'selectionPoint',
				additionalProperties: (index) => ({
					selectionPointFeatureId: featureId,
					index,
					shapeHandle: roles[index]
				})
			});
			this.shapeHandles = { featureId, ids };
			return;
		}
		host.mutateFeature.updateGuidancePoints(
			this.shapeHandles.ids.map((id, index) => ({
				featureId: id,
				coordinate: coordinates[index] as LngLat
			}))
		);
	}
}
