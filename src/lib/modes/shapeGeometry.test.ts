import { describe, expect, it } from 'vitest';
import {
	bearingDegrees,
	destination,
	distanceMeters,
	handleCoordinates,
	paramsFromFeature,
	rebuildShapeFeature,
	resizeShape,
	ringForParams,
	type ShapeParams
} from './shapeGeometry';

const center: [number, number] = [-115.1391, 36.1699];

describe('parametric shapes', () => {
	it('closes a 64-step circle on the stored radius', () => {
		const params: ShapeParams = {
			mode: 'circle',
			center,
			radiusMeters: 500,
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
});
