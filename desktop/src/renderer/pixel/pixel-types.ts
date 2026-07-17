import type { PetPlacement, PetState } from '../../shared/types';

export type PixelScale = 2 | 3 | 4;

export type PixelSpriteFrameSources = Record<PetPlacement, Record<PetState, string>>;

export interface PixelAnchor {
  type: 'baseline' | 'seat' | 'foot';
  point: [number, number];
  seat?: [number, number];
  foot?: [number, number];
}

export interface PixelSpriteManifest {
  schema: 'timemate.pixel-sprite.v1';
  version: number;
  id: string;
  displayName: string;
  kind: 'pixel-sprite';
  modelKind: 'pixel-sprite';
  renderEngine: 'pixel-sprite';
  logicalSize: [number, number];
  paletteTarget: number;
  sprite: {
    file: string;
    size: [number, number];
    columns: number;
    rows: number;
  };
  stateOrder: PetState[];
  placements: Record<PetPlacement, { row: number; anchor: PixelAnchor }>;
  sizes: { small: PixelScale; standard: PixelScale; large: PixelScale };
  source: string;
  rendering: 'nearest-neighbor';
  transparentCorners: boolean;
}

export interface PixelSpriteModel {
  id: string;
  displayName: string;
  kind: 'pixel-sprite';
  version: string;
  alt: string;
  previewSrc: string;
  frameSrcs: PixelSpriteFrameSources;
  manifest: PixelSpriteManifest;
}

export interface PixelFrameBinding {
  id: string;
  key: string;
  src: string;
  state: PetState;
  placement: PetPlacement;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: PixelAnchor;
}
