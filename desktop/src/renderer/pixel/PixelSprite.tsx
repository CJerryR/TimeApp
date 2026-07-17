import type { CSSProperties } from 'react';
import type { PetPlacement, PetState } from '../../shared/types';
import { resolvePixelFrame } from './pixel-loader';
import type { PixelScale, PixelSpriteModel } from './pixel-types';

export function PixelSprite({
  model,
  state,
  placement,
  size,
  motionEnabled,
  className,
  alt = model.alt
}: {
  model: PixelSpriteModel;
  state: PetState;
  placement: PetPlacement;
  size: PixelScale;
  motionEnabled: boolean;
  className?: string;
  alt?: string;
}) {
  const frame = resolvePixelFrame(model, placement, state);
  const style = {
    width: frame.width * size,
    height: frame.height * size,
    '--pixel-scale': size
  } as CSSProperties;

  return (
    <img
      className={['pixel-sprite', 'pet-image', `state-${state}`, motionEnabled && 'motion-enabled', className].filter(Boolean).join(' ')}
      style={style}
      src={frame.src}
      alt={alt}
      draggable={false}
      data-pixel-sprite="true"
      data-model-kind="pixel-sprite"
      data-render-engine="pixel-sprite"
      data-state={state}
      data-placement={placement}
      data-frame-key={frame.key}
      data-frame-id={frame.id}
      data-frame-state={state}
      data-frame-placement={placement}
      data-frame-column={frame.column}
      data-frame-row={frame.row}
      data-anchor-type={frame.anchor.type}
      data-anchor-x={frame.anchor.point[0]}
      data-anchor-y={frame.anchor.point[1]}
      data-motion-enabled={motionEnabled ? 'true' : 'false'}
    />
  );
}
