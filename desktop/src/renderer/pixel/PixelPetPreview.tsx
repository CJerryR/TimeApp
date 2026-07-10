import type { CSSProperties } from 'react';
import type { ColorScheme, PetPlacement, PetState } from '../../shared/types';
import { pixelStateLabel, RUOHAN_PIXEL_MODEL } from '../pet-model';
import { resolvePixelFrame } from './pixel-loader';
import type { PixelScale } from './pixel-types';

export function PixelPetPreview({
  state,
  placement,
  size,
  theme,
  motionEnabled
}: {
  state: PetState;
  placement: PetPlacement;
  size: PixelScale;
  theme: ColorScheme;
  motionEnabled: boolean;
}) {
  const frame = resolvePixelFrame(RUOHAN_PIXEL_MODEL, placement, state);
  const style = {
    width: frame.width * size,
    height: frame.height * size,
    '--pixel-preview-scale': size,
    '--pixel-preview-anchor-bottom': `${(frame.height - frame.anchor.point[1]) * size}px`,
    '--pixel-preview-shadow-width': `${12 * size}px`,
    '--pixel-preview-shadow-height': `${2 * size}px`
  } as CSSProperties;

  return (
    <span
      className="pixel-pet-preview"
      role="img"
      aria-label={`若涵，当前状态：${pixelStateLabel(state)}`}
      style={style}
      data-model-id={RUOHAN_PIXEL_MODEL.id}
      data-state={state}
      data-placement={placement}
      data-theme-mode={theme}
      data-motion-enabled={motionEnabled ? 'true' : 'false'}
    >
      <span className="pixel-pet-preview-shadow" aria-hidden="true" />
      <img src={frame.src} alt="" aria-hidden="true" draggable={false} />
    </span>
  );
}
