import { TerraDrawCircleMode } from 'terra-draw';

/**
 * Circle draw that keeps the center on the feature.
 * Terra Draw's circle mode otherwise drops the center when the gesture ends
 * and only stores `radiusKilometers`.
 */
export class TerraDrawShapeCircleMode extends TerraDrawCircleMode {
	private shapeWrapped = false;

	constructor(options?: ConstructorParameters<typeof TerraDrawCircleMode>[0]) {
		super({ ...options, segments: options?.segments ?? 64 });
	}

	/** @internal */
	start() {
		super.start();
		if (this.shapeWrapped) return;
		this.shapeWrapped = true;
		const self = this as unknown as {
			center?: [number, number];
			currentCircleId?: string | number;
			updateCircle?: (endPosition: [number, number], updateType: string) => unknown;
			mutateFeature?: {
				updatePolygon: (update: {
					featureId: string | number;
					propertyMutations: Record<string, unknown>;
					context: { updateType: string };
				}) => unknown;
			};
		};
		const proto = TerraDrawCircleMode.prototype as unknown as Record<string, unknown>;
		const updateCircle = proto['updateCircle'] as
			((endPosition: [number, number], updateType: string) => unknown) | undefined;
		if (typeof updateCircle !== 'function') return;
		const baseUpdate = updateCircle.bind(this);
		self['updateCircle'] = (endPosition: [number, number], updateType: string) => {
			const center = self.center ? ([self.center[0], self.center[1]] as [number, number]) : null;
			const updated = baseUpdate(endPosition, updateType);
			const featureId = self.currentCircleId;
			if (updated && center && featureId != null && self.mutateFeature) {
				self.mutateFeature.updatePolygon({
					featureId,
					propertyMutations: { center },
					context: { updateType }
				});
			}
			return updated;
		};
	}
}
