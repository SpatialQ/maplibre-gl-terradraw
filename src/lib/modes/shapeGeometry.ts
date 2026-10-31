/**
 * Parametric circles, ellipses, rectangles, sectors, and sensors.
 *
 * Angle is degrees clockwise from north to the width axis (the first side).
 * Sector/sensor bearings are degrees clockwise from north.
 * Rings are rebuilt from these parameters. The polygon is only the outline.
 */

export const SHAPE_STEPS = 64;
const MIN_METERS = 1;
const EARTH_RADIUS_M = 6371008.8;

export const PARAMETRIC_MODES = [
	'circle',
	'ellipse',
	'rectangle',
	'angled-rectangle',
	'sector',
	'sensor'
] as const;

export type ParametricMode = (typeof PARAMETRIC_MODES)[number];
export type LngLat = [number, number];
export type ArcDirection = 'clockwise' | 'anticlockwise';
export type HandleRole =
	| 'center'
	| 'rim'
	| 'x'
	| 'x-neg'
	| 'y'
	| 'y-neg'
	| 'xy'
	| 'xy-neg'
	| 'x-neg-y'
	| 'x-neg-y-neg'
	| 'start'
	| 'end'
	| 'outer-start'
	| 'outer-end'
	| 'inner-start'
	| 'inner-end';

export type ShapeParams = {
	mode: ParametricMode;
	center: LngLat;
	/** Circle / sector / sensor-outer radius in meters. */
	radiusMeters: number;
	/** Sensor inner radius in meters. Unused for other modes. */
	innerRadiusMeters: number;
	/** Sector/sensor start bearing, degrees clockwise from north. */
	startBearing: number;
	/** Sector/sensor end bearing, degrees clockwise from north. */
	endBearing: number;
	/** Sector/sensor sweep direction from start to end. */
	arcDirection: ArcDirection;
	/** Half-extent along `angle`, meters. */
	xSemiAxis: number;
	/** Half-extent along `angle + 90`, meters. */
	ySemiAxis: number;
	/** Degrees clockwise from north. */
	angle: number;
};

type FeatureLike = {
	geometry?: { type?: string; coordinates?: unknown };
	properties?: Record<string, unknown> | null;
};

export function isParametricMode(mode: unknown): mode is ParametricMode {
	return PARAMETRIC_MODES.includes(mode as ParametricMode);
}

function toRad(degrees: number) {
	return (degrees * Math.PI) / 180;
}

function toDeg(radians: number) {
	return (radians * 180) / Math.PI;
}

export function wrapBearing(degrees: number) {
	return ((degrees % 360) + 360) % 360;
}

export function destination(
	lon: number,
	lat: number,
	distanceM: number,
	bearingDeg: number
): LngLat {
	if (!Number.isFinite(distanceM) || Math.abs(distanceM) < 1e-6) return [lon, lat];
	const delta = distanceM / EARTH_RADIUS_M;
	const theta = toRad(bearingDeg);
	const lat1 = toRad(lat);
	const lon1 = toRad(lon);
	const sinLat1 = Math.sin(lat1);
	const cosLat1 = Math.cos(lat1);
	const sinDelta = Math.sin(delta);
	const cosDelta = Math.cos(delta);
	const lat2 = Math.asin(sinLat1 * cosDelta + cosLat1 * sinDelta * Math.cos(theta));
	const lon2 =
		lon1 + Math.atan2(Math.sin(theta) * sinDelta * cosLat1, cosDelta - sinLat1 * Math.sin(lat2));
	return [toDeg(lon2), toDeg(lat2)];
}

export function distanceMeters(a: LngLat, b: LngLat) {
	const lat1 = toRad(a[1]);
	const lat2 = toRad(b[1]);
	const dLat = lat2 - lat1;
	const dLon = toRad(b[0] - a[0]);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(a: LngLat, b: LngLat) {
	const lat1 = toRad(a[1]);
	const lat2 = toRad(b[1]);
	const dLon = toRad(b[0] - a[0]);
	const y = Math.sin(dLon) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
	return wrapBearing(toDeg(Math.atan2(y, x)));
}

/** Meters east/north of `center` for a point in the shape frame. +x follows `angle`. */
export function toLocal(center: LngLat, point: LngLat, angleDeg: number) {
	const dist = distanceMeters(center, point);
	const bearing = toRad(bearingDegrees(center, point));
	const east = Math.sin(bearing) * dist;
	const north = Math.cos(bearing) * dist;
	const angle = toRad(angleDeg);
	return {
		x: east * Math.sin(angle) + north * Math.cos(angle),
		y: east * Math.cos(angle) - north * Math.sin(angle)
	};
}

export function fromLocal(
	center: LngLat,
	xMeters: number,
	yMeters: number,
	angleDeg: number
): LngLat {
	const angle = toRad(angleDeg);
	const east = xMeters * Math.sin(angle) + yMeters * Math.cos(angle);
	const north = xMeters * Math.cos(angle) - yMeters * Math.sin(angle);
	const dist = Math.hypot(east, north);
	if (dist < 1e-6) return [center[0], center[1]];
	const bearing = wrapBearing(toDeg(Math.atan2(east, north)));
	return destination(center[0], center[1], dist, bearing);
}

function roundCoord(value: number, precision: number) {
	const factor = 10 ** precision;
	return Math.round(value * factor) / factor;
}

function roundLngLat(point: LngLat, precision: number): LngLat {
	return [roundCoord(point[0], precision), roundCoord(point[1], precision)];
}

function finite(value: unknown) {
	const number =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(number) ? number : null;
}

export function parseCenter(value: unknown): LngLat | null {
	if (Array.isArray(value) && value.length >= 2) {
		const lon = finite(value[0]);
		const lat = finite(value[1]);
		if (lon == null || lat == null) return null;
		return [lon, lat];
	}
	if (typeof value === 'string') {
		const [lonRaw, latRaw] = value.split(',');
		const lon = finite(lonRaw);
		const lat = finite(latRaw);
		if (lon == null || lat == null) return null;
		return [lon, lat];
	}
	return null;
}

export function formatCenter(center: LngLat) {
	return `${center[0]},${center[1]}`;
}

export function parseArcDirection(value: unknown): ArcDirection | null {
	if (value === 'clockwise' || value === 'anticlockwise') return value;
	return null;
}

function ringOf(feature: FeatureLike): LngLat[] | null {
	if (feature.geometry?.type !== 'Polygon') return null;
	const rings = feature.geometry.coordinates;
	if (!Array.isArray(rings) || !Array.isArray(rings[0])) return null;
	const ring = (rings[0] as unknown[]).filter(
		(point): point is LngLat =>
			Array.isArray(point) && finite(point[0]) != null && finite(point[1]) != null
	);
	if (ring.length < 4) return null;
	return ring.map((point) => [Number(point[0]), Number(point[1])]);
}

function openRing(ring: LngLat[]) {
	const last = ring[ring.length - 1];
	const first = ring[0];
	if (last && first && last[0] === first[0] && last[1] === first[1]) return ring.slice(0, -1);
	return ring;
}

function centroid(ring: LngLat[]): LngLat | null {
	const points = openRing(ring);
	if (!points.length) return null;
	let lon = 0;
	let lat = 0;
	for (const point of points) {
		lon += point[0];
		lat += point[1];
	}
	return [lon / points.length, lat / points.length];
}

function blankAxes(
	radiusMeters = 0
): Pick<
	ShapeParams,
	| 'innerRadiusMeters'
	| 'startBearing'
	| 'endBearing'
	| 'arcDirection'
	| 'xSemiAxis'
	| 'ySemiAxis'
	| 'angle'
> {
	return {
		innerRadiusMeters: 0,
		startBearing: 0,
		endBearing: 0,
		arcDirection: 'clockwise',
		xSemiAxis: radiusMeters,
		ySemiAxis: radiusMeters,
		angle: 0
	};
}

/** Sweep degrees from start to end in the given direction (0..360). */
export function arcSweepDegrees(startBearing: number, endBearing: number, direction: ArcDirection) {
	const start = wrapBearing(startBearing);
	const end = wrapBearing(endBearing);
	if (direction === 'anticlockwise') return (end - start + 360) % 360 || 0;
	return (start - end + 360) % 360 || 0;
}

function bearingOnArc(
	startBearing: number,
	endBearing: number,
	midBearing: number,
	direction: ArcDirection
) {
	const start = wrapBearing(startBearing);
	const end = wrapBearing(endBearing);
	const mid = wrapBearing(midBearing);
	const sweep = arcSweepDegrees(start, end, direction);
	if (sweep < 1e-9) return Math.abs(mid - start) < 1e-6 || Math.abs(mid - start - 360) < 1e-6;
	const t = direction === 'anticlockwise' ? (mid - start + 360) % 360 : (start - mid + 360) % 360;
	return t <= sweep + 1e-6;
}

export function inferArcDirection(
	startBearing: number,
	endBearing: number,
	midBearing: number
): ArcDirection {
	const onClockwise = bearingOnArc(startBearing, endBearing, midBearing, 'clockwise');
	const onAnticlockwise = bearingOnArc(startBearing, endBearing, midBearing, 'anticlockwise');
	if (onClockwise && !onAnticlockwise) return 'clockwise';
	if (onAnticlockwise && !onClockwise) return 'anticlockwise';
	const cw = arcSweepDegrees(startBearing, endBearing, 'clockwise');
	const acw = arcSweepDegrees(startBearing, endBearing, 'anticlockwise');
	return cw <= acw ? 'clockwise' : 'anticlockwise';
}

/** Points along the arc from start to end inclusive. */
export function arcCoordinates(
	center: LngLat,
	radiusM: number,
	startBearing: number,
	endBearing: number,
	direction: ArcDirection,
	steps = SHAPE_STEPS,
	precision = 9
): LngLat[] {
	const start = wrapBearing(startBearing);
	const sweep = arcSweepDegrees(start, endBearing, direction);
	const count = Math.max(1, Math.round(Math.max(8, steps) * (sweep <= 1e-9 ? 1 : sweep / 360)));
	const sign = direction === 'anticlockwise' ? 1 : -1;
	const step = sweep <= 1e-9 ? 0 : (sign * sweep) / count;
	const points: LngLat[] = [];
	for (let i = 0; i <= count; i += 1) {
		points.push(
			roundLngLat(destination(center[0], center[1], radiusM, start + i * step), precision)
		);
	}
	return points;
}

export function ringForParams(params: ShapeParams, steps = SHAPE_STEPS, precision = 9): LngLat[] {
	const count = Math.max(8, Math.round(steps));
	const coords: LngLat[] = [];
	if (params.mode === 'rectangle' || params.mode === 'angled-rectangle') {
		const x = params.xSemiAxis;
		const y = params.ySemiAxis;
		const corners: Array<[number, number]> = [
			[-x, -y],
			[x, -y],
			[x, y],
			[-x, y]
		];
		for (const [localX, localY] of corners) {
			coords.push(roundLngLat(fromLocal(params.center, localX, localY, params.angle), precision));
		}
	} else if (params.mode === 'circle') {
		for (let i = 0; i < count; i += 1) {
			const bearing = (-i * 360) / count;
			coords.push(
				roundLngLat(
					destination(params.center[0], params.center[1], params.radiusMeters, bearing),
					precision
				)
			);
		}
	} else if (params.mode === 'sector') {
		const center = roundLngLat(params.center, precision);
		coords.push(center);
		const arc = arcCoordinates(
			params.center,
			params.radiusMeters,
			params.startBearing,
			params.endBearing,
			params.arcDirection,
			steps,
			precision
		);
		for (const point of arc) {
			const last = coords[coords.length - 1];
			if (!last || last[0] !== point[0] || last[1] !== point[1]) coords.push(point);
		}
		coords.push([center[0], center[1]]);
		return coords;
	} else if (params.mode === 'sensor') {
		const outer = arcCoordinates(
			params.center,
			params.radiusMeters,
			params.startBearing,
			params.endBearing,
			params.arcDirection,
			steps,
			precision
		);
		const inner = arcCoordinates(
			params.center,
			params.innerRadiusMeters,
			params.endBearing,
			params.startBearing,
			params.arcDirection === 'clockwise' ? 'anticlockwise' : 'clockwise',
			steps,
			precision
		);
		for (const point of outer) {
			const last = coords[coords.length - 1];
			if (!last || last[0] !== point[0] || last[1] !== point[1]) coords.push(point);
		}
		for (const point of inner) {
			const last = coords[coords.length - 1];
			if (!last || last[0] !== point[0] || last[1] !== point[1]) coords.push(point);
		}
		const first = coords[0];
		if (first) coords.push([first[0], first[1]]);
		return coords;
	} else {
		for (let i = 0; i < count; i += 1) {
			const t = (i / count) * Math.PI * 2;
			const x = params.xSemiAxis * Math.cos(t);
			const y = -params.ySemiAxis * Math.sin(t);
			coords.push(roundLngLat(fromLocal(params.center, x, y, params.angle), precision));
		}
	}
	const first = coords[0];
	if (first) coords.push([first[0], first[1]]);
	return coords;
}

export function handleRoles(mode: ParametricMode): HandleRole[] {
	if (mode === 'circle') return ['center', 'rim', 'rim', 'rim', 'rim'];
	if (mode === 'rectangle' || mode === 'angled-rectangle') {
		return ['center', 'xy', 'xy-neg', 'x-neg-y', 'x-neg-y-neg'];
	}
	if (mode === 'sector') return ['center', 'start', 'end'];
	if (mode === 'sensor') {
		return ['center', 'outer-start', 'outer-end', 'inner-start', 'inner-end'];
	}
	return ['center', 'x', 'x-neg', 'y', 'y-neg'];
}

function cornerSigns(role: HandleRole): { x: 1 | -1; y: 1 | -1 } | null {
	if (role === 'xy') return { x: 1, y: 1 };
	if (role === 'xy-neg') return { x: 1, y: -1 };
	if (role === 'x-neg-y') return { x: -1, y: 1 };
	if (role === 'x-neg-y-neg') return { x: -1, y: -1 };
	return null;
}

export function handleCoordinates(params: ShapeParams): LngLat[] {
	if (params.mode === 'circle') {
		return [
			params.center,
			destination(params.center[0], params.center[1], params.radiusMeters, 45),
			destination(params.center[0], params.center[1], params.radiusMeters, 135),
			destination(params.center[0], params.center[1], params.radiusMeters, 225),
			destination(params.center[0], params.center[1], params.radiusMeters, 315)
		];
	}
	if (params.mode === 'rectangle' || params.mode === 'angled-rectangle') {
		const { center: origin, xSemiAxis, ySemiAxis, angle } = params;
		return [
			origin,
			fromLocal(origin, xSemiAxis, ySemiAxis, angle),
			fromLocal(origin, xSemiAxis, -ySemiAxis, angle),
			fromLocal(origin, -xSemiAxis, ySemiAxis, angle),
			fromLocal(origin, -xSemiAxis, -ySemiAxis, angle)
		];
	}
	if (params.mode === 'sector') {
		return [
			params.center,
			destination(params.center[0], params.center[1], params.radiusMeters, params.startBearing),
			destination(params.center[0], params.center[1], params.radiusMeters, params.endBearing)
		];
	}
	if (params.mode === 'sensor') {
		return [
			params.center,
			destination(params.center[0], params.center[1], params.radiusMeters, params.startBearing),
			destination(params.center[0], params.center[1], params.radiusMeters, params.endBearing),
			destination(
				params.center[0],
				params.center[1],
				params.innerRadiusMeters,
				params.startBearing
			),
			destination(params.center[0], params.center[1], params.innerRadiusMeters, params.endBearing)
		];
	}
	return [
		params.center,
		fromLocal(params.center, params.xSemiAxis, 0, params.angle),
		fromLocal(params.center, -params.xSemiAxis, 0, params.angle),
		fromLocal(params.center, 0, params.ySemiAxis, params.angle),
		fromLocal(params.center, 0, -params.ySemiAxis, params.angle)
	];
}

function rectangleFromRing(
	mode: 'rectangle' | 'angled-rectangle',
	ring: LngLat[]
): ShapeParams | null {
	const corners = openRing(ring);
	if (corners.length < 4) return null;
	const [c0, c1, c2] = corners;
	if (!c0 || !c1 || !c2) return null;
	if (mode === 'rectangle') {
		const lons = corners.slice(0, 4).map((point) => point[0]);
		const lats = corners.slice(0, 4).map((point) => point[1]);
		const center: LngLat = [
			(Math.min(...lons) + Math.max(...lons)) / 2,
			(Math.min(...lats) + Math.max(...lats)) / 2
		];
		const xSemiAxis = distanceMeters(center, [center[0], Math.max(...lats)]);
		const ySemiAxis = distanceMeters(center, [Math.max(...lons), center[1]]);
		if (xSemiAxis < MIN_METERS || ySemiAxis < MIN_METERS) return null;
		return {
			mode,
			center,
			radiusMeters: 0,
			...blankAxes(),
			xSemiAxis,
			ySemiAxis,
			angle: 0
		};
	}
	const center: LngLat = [(c0[0] + c2[0]) / 2, (c0[1] + c2[1]) / 2];
	const xSemiAxis = distanceMeters(c0, c1) / 2;
	const ySemiAxis = distanceMeters(c1, c2) / 2;
	if (xSemiAxis < MIN_METERS || ySemiAxis < MIN_METERS) return null;
	return {
		mode,
		center,
		radiusMeters: 0,
		...blankAxes(),
		xSemiAxis,
		ySemiAxis,
		angle: bearingDegrees(c0, c1)
	};
}

function sectorFromRing(ring: LngLat[]): ShapeParams | null {
	const points = openRing(ring);
	if (points.length < 3) return null;
	const center = points[0];
	const start = points[1];
	const end = points[points.length - 1];
	if (!center || !start || !end) return null;
	const radiusMeters = distanceMeters(center, start);
	if (radiusMeters < MIN_METERS) return null;
	const startBearing = bearingDegrees(center, start);
	const endBearing = bearingDegrees(center, end);
	const mid = points[Math.floor(points.length / 2)];
	const midBearing = mid ? bearingDegrees(center, mid) : startBearing;
	return {
		mode: 'sector',
		center,
		radiusMeters,
		...blankAxes(radiusMeters),
		startBearing,
		endBearing,
		arcDirection: inferArcDirection(startBearing, endBearing, midBearing)
	};
}

function sectorParamsFromProps(
	mode: 'sector' | 'sensor',
	feature: FeatureLike,
	ring: LngLat[] | null
): ShapeParams | null {
	const storedCenter = parseCenter(feature.properties?.center);
	const radiusKm = finite(feature.properties?.radiusKilometers);
	const innerKm = finite(feature.properties?.innerRadiusKilometers);
	const startBearing = finite(feature.properties?.startBearing);
	const endBearing = finite(feature.properties?.endBearing);
	const arcDirection = parseArcDirection(feature.properties?.arcDirection);
	if (
		storedCenter &&
		radiusKm != null &&
		radiusKm > 0 &&
		startBearing != null &&
		endBearing != null &&
		arcDirection
	) {
		const radiusMeters = radiusKm * 1000;
		let innerRadiusMeters =
			mode === 'sensor' && innerKm != null && innerKm > 0 ? innerKm * 1000 : 0;
		if (mode === 'sensor') {
			innerRadiusMeters = Math.min(
				Math.max(MIN_METERS, innerRadiusMeters),
				Math.max(MIN_METERS, radiusMeters - MIN_METERS)
			);
		}
		return {
			mode,
			center: storedCenter,
			radiusMeters,
			...blankAxes(radiusMeters),
			innerRadiusMeters: mode === 'sensor' ? innerRadiusMeters : 0,
			startBearing: wrapBearing(startBearing),
			endBearing: wrapBearing(endBearing),
			arcDirection
		};
	}
	if (mode === 'sector' && ring) return sectorFromRing(ring);
	return null;
}

export function paramsFromFeature(feature: FeatureLike): ShapeParams | null {
	const mode = feature.properties?.mode;
	if (!isParametricMode(mode)) return null;
	const ring = ringOf(feature);
	const storedCenter = parseCenter(feature.properties?.center);
	if (mode === 'circle') {
		const radiusKm = finite(feature.properties?.radiusKilometers);
		const center = storedCenter || (ring ? centroid(ring) : null);
		if (!center) return null;
		let radiusMeters = radiusKm != null && radiusKm > 0 ? radiusKm * 1000 : 0;
		if (radiusMeters <= 0 && ring) {
			for (const point of openRing(ring)) {
				radiusMeters = Math.max(radiusMeters, distanceMeters(center, point));
			}
		}
		if (radiusMeters < MIN_METERS) return null;
		return {
			mode,
			center,
			radiusMeters,
			...blankAxes(radiusMeters)
		};
	}
	if (mode === 'sector' || mode === 'sensor') {
		return sectorParamsFromProps(mode, feature, ring);
	}
	const xSemiAxis = finite(feature.properties?.xSemiAxis);
	const ySemiAxis = finite(feature.properties?.ySemiAxis);
	const angle = finite(feature.properties?.angle);
	if (
		storedCenter &&
		xSemiAxis != null &&
		ySemiAxis != null &&
		xSemiAxis >= MIN_METERS &&
		ySemiAxis >= MIN_METERS
	) {
		return {
			mode,
			center: storedCenter,
			radiusMeters: 0,
			...blankAxes(),
			xSemiAxis,
			ySemiAxis,
			angle: mode === 'rectangle' ? 0 : (angle ?? 0)
		};
	}
	if (mode === 'ellipse' || !ring) return null;
	return rectangleFromRing(mode, ring);
}

export function shapeProperties(params: ShapeParams): Record<string, unknown> {
	if (params.mode === 'circle') {
		return {
			center: params.center,
			radiusKilometers: params.radiusMeters / 1000
		};
	}
	if (params.mode === 'sector') {
		return {
			center: params.center,
			radiusKilometers: params.radiusMeters / 1000,
			startBearing: wrapBearing(params.startBearing),
			endBearing: wrapBearing(params.endBearing),
			arcDirection: params.arcDirection
		};
	}
	if (params.mode === 'sensor') {
		return {
			center: params.center,
			radiusKilometers: params.radiusMeters / 1000,
			innerRadiusKilometers: params.innerRadiusMeters / 1000,
			startBearing: wrapBearing(params.startBearing),
			endBearing: wrapBearing(params.endBearing),
			arcDirection: params.arcDirection
		};
	}
	return {
		center: params.center,
		xSemiAxis: params.xSemiAxis,
		ySemiAxis: params.ySemiAxis,
		angle: params.mode === 'rectangle' ? 0 : params.angle
	};
}

/**
 * Move one handle. Circle and ellipse keep their center. An ellipse rim
 * follows the pointer, so that axis turns and changes length while the other
 * axis stays. A rectangle corner keeps the opposite corner and the stored angle.
 * Sector/sensor rim handles set that bearing and the shared (outer/inner) radius.
 */
export function resizeShape(
	params: ShapeParams,
	role: HandleRole,
	pointer: LngLat,
	dragOrigin?: { center: LngLat; pointer: LngLat }
): ShapeParams {
	if (role === 'center') {
		const origin = dragOrigin ?? { center: params.center, pointer };
		return {
			...params,
			center: [
				origin.center[0] + (pointer[0] - origin.pointer[0]),
				origin.center[1] + (pointer[1] - origin.pointer[1])
			]
		};
	}
	if (params.mode === 'circle' || role === 'rim') {
		const radiusMeters = Math.max(MIN_METERS, distanceMeters(params.center, pointer));
		return { ...params, radiusMeters, xSemiAxis: radiusMeters, ySemiAxis: radiusMeters };
	}
	if (params.mode === 'sector' && (role === 'start' || role === 'end')) {
		const radiusMeters = Math.max(MIN_METERS, distanceMeters(params.center, pointer));
		const bearing = bearingDegrees(params.center, pointer);
		return {
			...params,
			radiusMeters,
			xSemiAxis: radiusMeters,
			ySemiAxis: radiusMeters,
			startBearing: role === 'start' ? bearing : params.startBearing,
			endBearing: role === 'end' ? bearing : params.endBearing
		};
	}
	if (params.mode === 'sensor') {
		const bearing = bearingDegrees(params.center, pointer);
		const dist = Math.max(MIN_METERS, distanceMeters(params.center, pointer));
		if (role === 'outer-start' || role === 'outer-end') {
			const radiusMeters = Math.max(dist, params.innerRadiusMeters + MIN_METERS);
			return {
				...params,
				radiusMeters,
				xSemiAxis: radiusMeters,
				ySemiAxis: radiusMeters,
				startBearing: role === 'outer-start' ? bearing : params.startBearing,
				endBearing: role === 'outer-end' ? bearing : params.endBearing
			};
		}
		if (role === 'inner-start' || role === 'inner-end') {
			const innerRadiusMeters = Math.min(
				Math.max(MIN_METERS, dist),
				Math.max(MIN_METERS, params.radiusMeters - MIN_METERS)
			);
			return {
				...params,
				innerRadiusMeters,
				startBearing: role === 'inner-start' ? bearing : params.startBearing,
				endBearing: role === 'inner-end' ? bearing : params.endBearing
			};
		}
	}
	const rectLike = params.mode === 'rectangle' || params.mode === 'angled-rectangle';
	const signs = cornerSigns(role);
	if (rectLike && signs) {
		const fixed = fromLocal(
			params.center,
			-signs.x * params.xSemiAxis,
			-signs.y * params.ySemiAxis,
			params.angle
		);
		const local = toLocal(fixed, pointer, params.angle);
		const spanX = Math.abs(local.x) < MIN_METERS ? (local.x < 0 ? -1 : 1) * MIN_METERS : local.x;
		const spanY = Math.abs(local.y) < MIN_METERS ? (local.y < 0 ? -1 : 1) * MIN_METERS : local.y;
		const next = {
			...params,
			center: fromLocal(fixed, spanX / 2, spanY / 2, params.angle),
			xSemiAxis: Math.abs(spanX) / 2,
			ySemiAxis: Math.abs(spanY) / 2
		};
		if (next.mode === 'rectangle') next.angle = 0;
		return next;
	}
	if (
		params.mode === 'ellipse' &&
		(role === 'x' || role === 'x-neg' || role === 'y' || role === 'y-neg')
	) {
		const distance = Math.max(MIN_METERS, distanceMeters(params.center, pointer));
		const bearing = bearingDegrees(params.center, pointer);
		if (role === 'x' || role === 'x-neg') {
			return {
				...params,
				xSemiAxis: distance,
				angle: wrapBearing(role === 'x' ? bearing : bearing + 180)
			};
		}
		// +y is 90° clockwise from the width axis.
		return {
			...params,
			ySemiAxis: distance,
			angle: wrapBearing(role === 'y' ? bearing - 90 : bearing + 90)
		};
	}
	const local = toLocal(params.center, pointer, params.angle);
	const next = { ...params };
	if (role === 'x' || role === 'x-neg') next.xSemiAxis = Math.max(MIN_METERS, Math.abs(local.x));
	if (role === 'y' || role === 'y-neg') next.ySemiAxis = Math.max(MIN_METERS, Math.abs(local.y));
	return next;
}

export function rebuildShapeFeature<T extends FeatureLike>(
	feature: T,
	options?: { steps?: number; precision?: number }
): T {
	const params = paramsFromFeature(feature);
	if (!params || feature.geometry?.type !== 'Polygon') return feature;
	const steps = options?.steps ?? SHAPE_STEPS;
	const precision = options?.precision ?? 9;
	return {
		...feature,
		geometry: {
			type: 'Polygon',
			coordinates: [ringForParams(params, steps, precision)]
		},
		properties: {
			...(feature.properties || {}),
			...shapeProperties(params)
		}
	};
}
