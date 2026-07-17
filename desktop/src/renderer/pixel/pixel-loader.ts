import type { PetPlacement, PetState } from '../../shared/types';
import type { PixelFrameBinding, PixelScale, PixelSpriteModel } from './pixel-types';

export function normalizePixelScale(value: number): PixelScale {
  if (value === 2 || value === 3 || value === 4) return value;
  if (value < 0.85) return 2;
  if (value > 1.15) return 4;
  return 3;
}

export function resolvePixelFrame(
  model: PixelSpriteModel,
  placement: PetPlacement,
  state: PetState
): PixelFrameBinding {
  const { manifest } = model;
  const column = Math.max(0, manifest.stateOrder.indexOf(state));
  const row = manifest.placements[placement].row;
  const [width, height] = manifest.logicalSize;
  const key = `${placement}:${state}`;
  return {
    id: key,
    key,
    src: model.frameSrcs[placement][state],
    state,
    placement,
    column,
    row,
    x: column * width,
    y: row * height,
    width,
    height,
    anchor: manifest.placements[placement].anchor
  };
}
