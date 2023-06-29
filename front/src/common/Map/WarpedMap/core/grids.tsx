/* eslint-disable prefer-destructuring, no-plusplus */
import { Feature, LineString, Position } from 'geojson';
import { clamp, cloneDeep, meanBy } from 'lodash';
import length from '@turf/length';
import center from '@turf/center';
import { featureCollection, lineString, polygon } from '@turf/helpers';
import destination from '@turf/destination';
import bearing from '@turf/bearing';

import {
  featureToPointsGrid,
  GridFeature,
  Grids,
  PointsGrid,
  pointsGridToFeature,
} from './helpers';
import vec, { Vec2 } from './vec-lib';

/**
 * This function takes a path, and returns two isomorphic grids:
 * - The `regular` grid is vertical grid, with each pair of triangles making a
 *   perfectly regular triangle (considering the earth is flat, ie lat/lng are
 *   considered as x/y)
 * - The `warped` grid follows the path
 * Using these two grids, it becomes possible to project any point from one grid
 * to the other.
 */
export function getGrids(line: Feature<LineString>, params?: { stripsPerSide?: number }): Grids {
  const l = line.geometry.coordinates.length;
  if (l <= 2) throw new Error('line must have at least 3 points');

  const stripsPerSide = params?.stripsPerSide || 2;

  const totalLength = length(line);
  const step = totalLength / (l - 1);
  const c = center(line);
  const flatGrid = featureCollection([]) as GridFeature;

  // Generate flat line:
  const flatLineStart = destination(c, totalLength / 2, 180);
  const flatLinePoints: Position[] = [];
  for (let i = 0; i < l; i++)
    flatLinePoints.push(destination(flatLineStart, -i * step, 180).geometry.coordinates);
  const flatLine = lineString(flatLinePoints);

  // Generate flat grid:
  for (let i = 0; i < l - 1; i++) {
    const p0 = flatLine.geometry.coordinates[i];
    const p1 = flatLine.geometry.coordinates[i + 1];
    for (let direction = -1; direction <= 1; direction += 2) {
      for (let j = 0; j < stripsPerSide; j++) {
        const p00 = destination(p0, step * j, direction * 90).geometry.coordinates;
        const p01 = destination(p0, step * (j + 1), direction * 90).geometry.coordinates;
        const p10 = destination(p1, step * j, direction * 90).geometry.coordinates;
        const p11 = destination(p1, step * (j + 1), direction * 90).geometry.coordinates;
        flatGrid.features.push(
          polygon([[p00, p10, p01, p00]], {
            triangleId: `step:${i}/strip:${direction * (j + 1)}/inside`,
          })
        );
        flatGrid.features.push(
          polygon([[p11, p10, p01, p11]], {
            triangleId: `step:${i}/strip:${direction * (j + 1)}/outside`,
          })
        );
      }
    }
  }

  // Generate "twisted" grid:
  // 1. Store points for each triangle:
  const points: PointsGrid = [];
  for (let i = 0; i < l; i++) {
    points[i] = {};
    const p = line.geometry.coordinates[i];
    const pP = line.geometry.coordinates[i === 0 ? i : i - 1];
    const pN = line.geometry.coordinates[i === l - 1 ? i : i + 1];
    const angle = bearing(pP, pN) + 90;
    points[i][0] = p;
    for (let direction = -1; direction <= 1; direction += 2) {
      for (let j = 1; j <= stripsPerSide; j++) {
        points[i][direction * j] = destination(p, step * j * direction, angle).geometry.coordinates;
      }
    }
  }

  // 2. Store triangles:
  const grid = pointsGridToFeature(points);

  return { warped: grid, regular: flatGrid };
}

/**
 * This grid created by `getGrids` are a bit brute, and can have some weird
 * knots, when the input path is too curved. This function helps to get a
 * better warped curve, by moving each point (except the path and the first and
 * last rows) towards the barycenter of its neighbors.
 */
export function straightenGrid(
  grid: GridFeature,
  steps: number,
  settings?: { force?: number; iterations?: number }
): GridFeature {
  const force = clamp(settings?.force || 0.5, 0, 1);
  const iterations = Math.max(1, settings?.iterations || 1);

  if (iterations > 1) {
    let iter = grid;
    for (let i = 0; i < iterations; i++) iter = straightenGrid(iter, steps, { force });
    return iter;
  }

  const points = featureToPointsGrid(grid, steps);
  const rows = points.length;
  const newPoints: PointsGrid = [];
  const stripsPerSide = (Object.keys(points[0]).length - 1) / 2;

  newPoints[0] = cloneDeep(points[0]);
  newPoints[rows - 1] = cloneDeep(points[rows - 1]);

  for (let i = 1; i < rows - 1; i++) {
    newPoints[i] = {};

    for (let direction = -1; direction <= 1; direction += 2) {
      newPoints[i][0] = points[i][0];

      for (let j = 1; j <= stripsPerSide; j++) {
        const current = points[i][direction * j];
        const top = (points[i - 1] || {})[direction * j];
        const bottom = (points[i + 1] || {})[direction * j];
        const left = (points[i] || {})[direction * j - 1];
        const right = (points[i] || {})[direction * j + 1];

        const neighbors = [
          top,
          bottom,
          // When there is no neighbor on one side, we mirror the one from the
          // other side:
          left || vec.add(current as Vec2, vec.vector(right as Vec2, current as Vec2)),
          right || vec.add(current as Vec2, vec.vector(left as Vec2, current as Vec2)),
        ];

        newPoints[i][direction * j] = [
          meanBy(neighbors, (a) => a[0]) * force + current[0] * (1 - force),
          meanBy(neighbors, (a) => a[1]) * force + current[1] * (1 - force),
        ];
      }
    }
  }

  return pointsGridToFeature(newPoints);
}