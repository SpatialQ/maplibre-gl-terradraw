import { describe, expect, it } from 'vitest';
import {
	bearingDegrees,
	destination,
	distanceMeters,
	handleCoordinates,
	handleRoles,
	paramsFromFeature,
	rebuildShapeFeature,
	resizeShape,
	ringForParams,
	type ShapeParams
} from './shapeGeometry';

const center: [number, number] = [-115.1391, 36.1699];

const arcDefaults = {
	innerRadiusMeters: 0,
	startBearing: 0,
	endBearing: 0,
	arcDirection: 'clockwise' as const
};

describe('parametric shapes', () => {
	it('closes a 64-step circle on the stored radius', () => {
		const params: ShapeParams = {
			mode: 'circle',
			center,
			radiusMeters: 500,
			...arcDefaults,
			xSemiAxis: 500,
			ySemiAxis: 500,
			angle: 0
		};
		const ring = ringForParams(params, 64, 9);
		expect(ring).toHaveLength(65);
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		for (const point of ring.slice(0, -1)) {
			expect(Math.abs(distanceMeters(center, point) - 500)).toBeLessThan(0.05);
		}
	});

	it('places an ellipse axis end on the stored bearing', () => {
		const params: ShapeParams = {
			mode: 'ellipse',
			center,
			radiusMeters: 0,
			...arcDefaults,
			xSemiAxis: 200,
			ySemiAxis: 80,
			angle: 30
		};
		const handles = handleCoordinates(params);
		const xEnd = handles[1];
		const yEnd = handles[3];
		expect(xEnd).toBeTruthy();
		expect(yEnd).toBeTruthy();
		expect(Math.abs(distanceMeters(center, xEnd as [number, number]) - 200)).toBeLessThan(0.05);
		expect(Math.abs(distanceMeters(center, yEnd as [number, number]) - 80)).toBeLessThan(0.05);
		expect(Math.abs(bearingDegrees(center, xEnd as [number, number]) - 30)).toBeLessThan(0.05);
	});

	it('rotates an ellipse rim and keeps the other axis', () => {
		const params: ShapeParams = {
			mode: 'ellipse',
			center,
			radiusMeters: 0,
			...arcDefaults,
			xSemiAxis: 200,
			ySemiAxis: 80,
			angle: 30
		};
		const xPointer = destination(center[0], center[1], 250, 70);
		const turnedX = resizeShape(params, 'x', xPointer);
		expect(turnedX.ySemiAxis).toBe(80);
		expect(Math.abs(turnedX.xSemiAxis - 250)).toBeLessThan(0.05);
		expect(Math.abs(turnedX.angle - 70)).toBeLessThan(0.05);
		const yPointer = destination(center[0], center[1], 120, 10);
		const turnedY = resizeShape(params, 'y', yPointer);
		expect(turnedY.xSemiAxis).toBe(200);
		expect(Math.abs(turnedY.ySemiAxis - 120)).toBeLessThan(0.05);
		expect(Math.abs(((((turnedY.angle + 90) % 360) + 360) % 360) - 10)).toBeLessThan(0.05);
	});

	it('puts rectangle handles on the corners and keeps the opposite corner', () => {
		for (const mode of ['rectangle', 'angled-rectangle'] as const) {
			const params: ShapeParams = {
				mode,
				center,
				radiusMeters: 0,
				...arcDefaults,
				xSemiAxis: 100,
				ySemiAxis: 40,
				angle: mode === 'rectangle' ? 0 : 40
			};
			const ring = ringForParams(params, 64, 9);
			const before = handleCoordinates(params);
			expect(
				distanceMeters(before[1] as [number, number], ring[2] as [number, number])
			).toBeLessThan(0.05);
			expect(
				distanceMeters(before[2] as [number, number], ring[1] as [number, number])
			).toBeLessThan(0.05);
			expect(
				distanceMeters(before[3] as [number, number], ring[3] as [number, number])
			).toBeLessThan(0.05);
			expect(
				distanceMeters(before[4] as [number, number], ring[0] as [number, number])
			).toBeLessThan(0.05);
			const fixed = before[4] as [number, number];
			const dragged = before[1] as [number, number];
			const next = resizeShape(params, 'xy', [dragged[0] + 0.002, dragged[1] + 0.001]);
			const after = handleCoordinates(next);
			expect(next.angle).toBe(params.angle);
			expect(distanceMeters(fixed, after[4] as [number, number])).toBeLessThan(0.05);
			expect(next.xSemiAxis).not.toBe(params.xSemiAxis);
			expect(next.ySemiAxis).not.toBe(params.ySemiAxis);
		}
	});

	it('derives a north-up rectangle at angle 0', () => {
		const feature = {
			type: 'Feature',
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[-115.14, 36.16],
						[-115.13, 36.16],
						[-115.13, 36.17],
						[-115.14, 36.17],
						[-115.14, 36.16]
					]
				]
			},
			properties: { mode: 'rectangle' }
		};
		const params = paramsFromFeature(feature);
		expect(params?.angle).toBe(0);
		expect(params?.xSemiAxis).toBeGreaterThan(100);
		expect(params?.ySemiAxis).toBeGreaterThan(100);
		const rebuilt = rebuildShapeFeature(feature);
		expect((rebuilt.properties as unknown as { angle: number }).angle).toBe(0);
		expect((rebuilt.geometry as { coordinates: number[][][] }).coordinates[0]).toHaveLength(5);
	});

	it('rebuilds a dented circle from the stored radius', () => {
		const feature = {
			type: 'Feature',
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[-115.14, 36.17],
						[-115.13, 36.16],
						[-115.15, 36.15],
						[-115.14, 36.17]
					]
				]
			},
			properties: { mode: 'circle', radiusKilometers: 0.5, center }
		};
		const rebuilt = rebuildShapeFeature(feature, { steps: 64 });
		expect(rebuilt.geometry.coordinates[0]).toHaveLength(65);
		for (const point of rebuilt.geometry.coordinates[0].slice(0, -1)) {
			expect(Math.abs(distanceMeters(center, point as [number, number]) - 500)).toBeLessThan(0.05);
		}
	});

	it('rebuilds a sector from center, radius, and bearings', () => {
		const params: ShapeParams = {
			mode: 'sector',
			center,
			radiusMeters: 400,
			innerRadiusMeters: 0,
			startBearing: 10,
			endBearing: 80,
			arcDirection: 'anticlockwise',
			xSemiAxis: 400,
			ySemiAxis: 400,
			angle: 0
		};
		const ring = ringForParams(params, 64, 9);
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		expect(distanceMeters(center, ring[0] as [number, number])).toBeLessThan(0.05);
		expect(Math.abs(distanceMeters(center, ring[1] as [number, number]) - 400)).toBeLessThan(0.05);
		expect(Math.abs(bearingDegrees(center, ring[1] as [number, number]) - 10)).toBeLessThan(0.05);
		const end = ring[ring.length - 2] as [number, number];
		expect(Math.abs(distanceMeters(center, end) - 400)).toBeLessThan(0.05);
		expect(Math.abs(bearingDegrees(center, end) - 80)).toBeLessThan(0.05);
		expect(handleRoles('sector')).toEqual(['center', 'start', 'end']);
		const handles = handleCoordinates(params);
		expect(handles).toHaveLength(3);
		expect(Math.abs(bearingDegrees(center, handles[1] as [number, number]) - 10)).toBeLessThan(
			0.05
		);
		expect(Math.abs(bearingDegrees(center, handles[2] as [number, number]) - 80)).toBeLessThan(
			0.05
		);
	});

	it('resizes a sector start handle radius and bearing', () => {
		const params: ShapeParams = {
			mode: 'sector',
			center,
			radiusMeters: 400,
			innerRadiusMeters: 0,
			startBearing: 10,
			endBearing: 80,
			arcDirection: 'anticlockwise',
			xSemiAxis: 400,
			ySemiAxis: 400,
			angle: 0
		};
		const pointer = destination(center[0], center[1], 550, 25);
		const next = resizeShape(params, 'start', pointer);
		expect(Math.abs(next.radiusMeters - 550)).toBeLessThan(0.05);
		expect(Math.abs(next.startBearing - 25)).toBeLessThan(0.05);
		expect(next.endBearing).toBe(80);
	});

	it('infers sector params from a terra-draw style ring', () => {
		const params: ShapeParams = {
			mode: 'sector',
			center,
			radiusMeters: 300,
			innerRadiusMeters: 0,
			startBearing: 20,
			endBearing: 110,
			arcDirection: 'anticlockwise',
			xSemiAxis: 300,
			ySemiAxis: 300,
			angle: 0
		};
		const ring = ringForParams(params, 32, 9);
		const inferred = paramsFromFeature({
			geometry: { type: 'Polygon', coordinates: [ring] },
			properties: { mode: 'sector' }
		});
		expect(inferred).toBeTruthy();
		expect(Math.abs((inferred as ShapeParams).radiusMeters - 300)).toBeLessThan(0.5);
		expect(Math.abs((inferred as ShapeParams).startBearing - 20)).toBeLessThan(0.5);
		expect(Math.abs((inferred as ShapeParams).endBearing - 110)).toBeLessThan(0.5);
		expect((inferred as ShapeParams).arcDirection).toBe('anticlockwise');
	});

	it('rebuilds a sensor with outer and inner arcs', () => {
		const params: ShapeParams = {
			mode: 'sensor',
			center,
			radiusMeters: 500,
			innerRadiusMeters: 200,
			startBearing: 0,
			endBearing: 90,
			arcDirection: 'anticlockwise',
			xSemiAxis: 500,
			ySemiAxis: 500,
			angle: 0
		};
		const ring = ringForParams(params, 64, 9);
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		expect(Math.abs(distanceMeters(center, ring[0] as [number, number]) - 500)).toBeLessThan(0.05);
		expect(handleRoles('sensor')).toEqual([
			'center',
			'outer-start',
			'outer-end',
			'inner-start',
			'inner-end'
		]);
		const handles = handleCoordinates(params);
		expect(handles).toHaveLength(5);
		expect(Math.abs(distanceMeters(center, handles[1] as [number, number]) - 500)).toBeLessThan(
			0.05
		);
		expect(Math.abs(distanceMeters(center, handles[3] as [number, number]) - 200)).toBeLessThan(
			0.05
		);
		const feature = {
			type: 'Feature',
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			},
			properties: {
				mode: 'sensor',
				center,
				radiusKilometers: 0.5,
				innerRadiusKilometers: 0.2,
				startBearing: 0,
				endBearing: 90,
				arcDirection: 'anticlockwise'
			}
		};
		const rebuilt = rebuildShapeFeature(feature, { steps: 64 });
		expect((rebuilt.properties as { radiusKilometers: number }).radiusKilometers).toBeCloseTo(0.5);
		expect(
			(rebuilt.properties as { innerRadiusKilometers: number }).innerRadiusKilometers
		).toBeCloseTo(0.2);
		expect(rebuilt.geometry.coordinates[0].length).toBeGreaterThan(8);
	});

	it('resizes sensor outer and inner handles', () => {
		const params: ShapeParams = {
			mode: 'sensor',
			center,
			radiusMeters: 500,
			innerRadiusMeters: 200,
			startBearing: 0,
			endBearing: 90,
			arcDirection: 'anticlockwise',
			xSemiAxis: 500,
			ySemiAxis: 500,
			angle: 0
		};
		const outer = resizeShape(params, 'outer-end', destination(center[0], center[1], 600, 70));
		expect(Math.abs(outer.radiusMeters - 600)).toBeLessThan(0.05);
		expect(Math.abs(outer.endBearing - 70)).toBeLessThan(0.05);
		expect(outer.innerRadiusMeters).toBe(200);
		const inner = resizeShape(params, 'inner-start', destination(center[0], center[1], 150, 15));
		expect(Math.abs(inner.innerRadiusMeters - 150)).toBeLessThan(0.05);
		expect(Math.abs(inner.startBearing - 15)).toBeLessThan(0.05);
		expect(inner.radiusMeters).toBe(500);
	});

	it('returns null for a sensor without stored params', () => {
		const params = paramsFromFeature({
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[-115.14, 36.17],
						[-115.13, 36.16],
						[-115.15, 36.15],
						[-115.14, 36.17]
					]
				]
			},
			properties: { mode: 'sensor' }
		});
		expect(params).toBeNull();
	});
});
