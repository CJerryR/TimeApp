import type { TimeMateApi } from '../preload/preload';

declare global {
  interface Window {
    timeMate: TimeMateApi;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: '';
  }
}

export {};
