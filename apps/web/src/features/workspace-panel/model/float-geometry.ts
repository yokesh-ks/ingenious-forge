/** Where a floating panel draws while it is dragged and where it may rest. */

import type { FloatRect } from "./panes";

export const FLOAT_MIN_SIZE = { width: 220, height: 140 };
/** How far past an edge a dragged panel can be pulled. */
const RESISTANCE = 120;

export interface FloatBounds {
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** The nearest rectangle that lies inside the viewport. */
export function legalRect(rect: FloatRect, bounds: FloatBounds): FloatRect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    x: clamp(rect.x, 0, bounds.width - width),
    y: clamp(rect.y, 0, bounds.height - height),
    width,
    height,
  };
}

const resist = (overflow: number) =>
  (Math.sign(overflow) * RESISTANCE * Math.abs(overflow)) / (RESISTANCE + Math.abs(overflow));

/** A dragged panel follows the pointer inside the viewport and resists past it. */
export function resistedRect(desired: FloatRect, bounds: FloatBounds): FloatRect {
  const legal = legalRect(desired, bounds);
  return {
    ...legal,
    x: legal.x + resist(desired.x - legal.x),
    y: legal.y + resist(desired.y - legal.y),
  };
}

/** A resize keeps the corner in the viewport and the panel above its minimum. */
export function resizedRect(
  rect: FloatRect,
  dx: number,
  dy: number,
  bounds: FloatBounds,
): FloatRect {
  return {
    ...rect,
    width: Math.max(FLOAT_MIN_SIZE.width, Math.min(rect.width + dx, bounds.width - rect.x)),
    height: Math.max(FLOAT_MIN_SIZE.height, Math.min(rect.height + dy, bounds.height - rect.y)),
  };
}
