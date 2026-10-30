/**
 * Parametric circles, ellipses, and rectangles.
 *
 * Angle is degrees clockwise from north to the width axis (the first side).
 * Rings are rebuilt from these parameters. The polygon is only the outline.
 */

export const SHAPE_STEPS = 64;
const MIN_METERS = 1;
const EARTH_RADIUS_M = 6371008.8;

export const PARAMETRIC_MODES = ['circle', 'ellipse', 'rectangle', 'angled-rectangle'] as const;

export type ParametricMode = (typeof PARAMETRIC_MODES)[number];
export type LngLat = [number, number];
export type HandleRole =
	'center' | 'rim' | 'x' | 'x-neg' | 'y' | 'y-neg' | 'xy' | 'xy-neg' | 'x-neg-y' | 'x-neg-y-neg';

export type ShapeParams = {
	mode: ParametricMode;
	center: LngLat;
	/** Circle radius in meters. */
	radiusMeters: number;
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
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
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
	const bearing = (toDeg(Math.atan2(east, north)) + 360) % 360;
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
		return { mode, center, radiusMeters: 0, xSemiAxis, ySemiAxis, angle: 0 };
	}
	const center: LngLat = [(c0[0] + c2[0]) / 2, (c0[1] + c2[1]) / 2];
	const xSemiAxis = distanceMeters(c0, c1) / 2;
	const ySemiAxis = distanceMeters(c1, c2) / 2;
	if (xSemiAxis < MIN_METERS || ySemiAxis < MIN_METERS) return null;
	return {
		mode,
		center,
		radiusMeters: 0,
		xSemiAxis,
		ySemiAxis,
		angle: bearingDegrees(c0, c1)
	};
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
			xSemiAxis: radiusMeters,
			ySemiAxis: radiusMeters,
			angle: 0
		};
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
		const wrap = (degrees: number) => (degrees + 360) % 360;
		if (role === 'x' || role === 'x-neg') {
			return {
				...params,
				xSemiAxis: distance,
				angle: wrap(role === 'x' ? bearing : bearing + 180)
			};
		}
		// +y is 90° clockwise from the width axis.
		return {
			...params,
			ySemiAxis: distance,
			angle: wrap(role === 'y' ? bearing - 90 : bearing + 90)
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
