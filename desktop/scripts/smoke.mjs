import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const verificationDir = path.join(root, 'verification');
const screenshotDir = path.join(verificationDir, `smoke-screenshots-${runId}`);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timemate-smoke-'));
const userDataDir = path.join(tempDir, 'user-data');
const visualUserDataDir = path.join(tempDir, 'visual-user-data');
const finalResultPath = path.join(verificationDir, `smoke-result-${runId}.json`);
const timeoutMs = 45000;
const visualTimeoutMs = 45000;
const ONE_MIB = 1024 * 1024;
const PAGE_CASES = [
  {
    id: 'home',
    label: '当前',
    headingSelector: ':scope > .page-head h1',
    expectedHeadings: ['夜深了。', '早上好。', '中午好。', '下午好。', '晚上好。'],
    keySelector: '[data-now-card]'
  },
  { id: 'chat', label: '对话', headingSelector: '.chat-header h1', expectedHeadings: ['若涵'], keySelector: '[data-chat-composer]' },
  { id: 'planner', label: '规划', headingSelector: ':scope > .page-head h1', expectedHeadings: ['规划'], keySelector: '.legacy-calendar-panel' },
  { id: 'memory', label: '记忆', headingSelector: '.memory-page-head h1', expectedHeadings: ['记忆'], keySelector: '.memory-toolbar' },
  { id: 'integrations', label: '接入', headingSelector: '.integrations-page-head h1', expectedHeadings: ['接入'], keySelector: '.integrations-surface' },
  { id: 'settings', label: '设置', headingSelector: '.settings-page-head h1', expectedHeadings: ['设置'], keySelector: '.settings-workspace' }
];
const VISUAL_PROFILES = [
  { id: 'desktop-light-motion', width: 1180, height: 780, theme: 'light', reducedMotion: false, reducedTransparency: false },
  { id: 'narrow-dark-reduced', width: 420, height: 900, theme: 'dark', reducedMotion: true, reducedTransparency: false },
  { id: 'tablet-light-motion', width: 760, height: 720, theme: 'light', reducedMotion: false, reducedTransparency: false }
];

fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(visualUserDataDir, { recursive: true });
fs.mkdirSync(verificationDir, { recursive: true });

function phaseResultPath(phase) {
  return path.join(verificationDir, `smoke-result-${runId}-${phase}.json`);
}

function prefixedChecks(phase, checks) {
  return Object.fromEntries(Object.entries(checks ?? {}).map(([key, value]) => [`${phase}.${key}`, value]));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countBooleanChecks(value) {
  return Object.values(value ?? {}).filter((item) => typeof item === 'boolean').length;
}

function allBooleanChecksPass(value) {
  return Object.values(value ?? {}).filter((item) => typeof item === 'boolean').every(Boolean);
}

function cssTimeToMs(value) {
  const match = String(value ?? '').trim().match(/^([\d.]+)(ms|s)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  return match[2] === 's' ? amount * 1000 : amount;
}

function isIdentityTransform(value) {
  const transform = String(value ?? '').trim();
  if (!transform || transform === 'none') return true;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const values = matrix[1].split(',').map(Number);
    return values.length === 6
      && Math.abs(values[0] - 1) < 0.001
      && Math.abs(values[1]) < 0.001
      && Math.abs(values[2]) < 0.001
      && Math.abs(values[3] - 1) < 0.001
      && Math.abs(values[4]) < 0.001
      && Math.abs(values[5]) < 0.001;
  }
  return false;
}

function motionSettled(point, expectedView) {
  return point?.sample.containerPresent
    && point.sample.view === expectedView
    && point.sample.pageCount === 1
    && isIdentityTransform(point.sample.transform)
    && Number(point.sample.opacity) >= 0.999
    && point.sample.animations.every((animation) =>
      animation.playState === 'finished'
      || animation.progress === null
      || Number(animation.progress) >= 0.999
    );
}

function motionSamplesPresent(points, expectedView, reducedMotion) {
  const expectedPhases = [
    { phase: 'start', requestedMs: 0 },
    { phase: 'middle', requestedMs: 120 },
    { phase: 'end', requestedMs: 420 }
  ];
  return points.length === expectedPhases.length
    && points.every((point, index) =>
      point.phase === expectedPhases[index].phase
      && point.requestedMs === expectedPhases[index].requestedMs
      && Number.isFinite(point.actualMs)
      && point.actualMs >= point.requestedMs
      && point.sample?.containerPresent
      && point.sample.view === expectedView
      && point.sample.pageCount === 1
      && point.sample.reducedMotion === String(reducedMotion)
      && Boolean(point.screenshot?.path)
      && fs.existsSync(point.screenshot.path)
      && point.screenshot.width > 0
      && point.screenshot.height > 0
    )
    && points.every((point, index) => index === 0 || point.actualMs > points[index - 1].actualMs)
    && motionSettled(points.at(-1), expectedView);
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Expected a PNG screenshot.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error('Could not allocate a remote debugging port.'));
      });
    });
  });
}

async function waitForValue(read, description, timeout = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    try {
      const value = await read();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}.${lastError ? ` ${String(lastError)}` : ''}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}.`)), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP connection closed while waiting for ${pending.method}.`));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out.`));
      }, 10000);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Renderer evaluation failed.');
  }
  return result.result?.value;
}

async function waitForRenderer(client, predicate, description, timeout = 10000) {
  return waitForValue(async () => evaluate(client, `Boolean(${predicate})`), description, timeout);
}

async function setVisualSettings(client, theme, reducedMotion, reducedTransparency = false) {
  await evaluate(client, `
    (async () => {
      const snapshot = await window.timeMate.getSnapshot();
      await window.timeMate.updateSettings({
        appearance: {
          ...snapshot.settings.appearance,
          colorScheme: ${JSON.stringify(theme)},
          reducedTransparency: ${JSON.stringify(reducedTransparency)}
        },
        reducedMotion: ${JSON.stringify(reducedMotion)}
      });
      return true;
    })()
  `);
  await client.send('Page.reload', { ignoreCache: true });
  await waitForRenderer(
    client,
    `document.querySelector('.app-shell')
      && document.documentElement.dataset.theme === ${JSON.stringify(theme)}
      && document.documentElement.hasAttribute('data-reduce-motion') === ${JSON.stringify(reducedMotion)}
      && document.documentElement.hasAttribute('data-reduce-transparency') === ${JSON.stringify(reducedTransparency)}`,
    `${theme} theme, reducedMotion=${reducedMotion}, reducedTransparency=${reducedTransparency}`
  );
}

async function setViewport(client, profile) {
  await client.send('Emulation.clearDeviceMetricsOverride');
  await evaluate(client, `window.resizeTo(${profile.width}, ${profile.height}); true`);
  await waitForValue(async () => evaluate(client, `
    window.outerWidth === ${profile.width} && window.outerHeight === ${profile.height}
  `), `${profile.width}x${profile.height} Electron window bounds`);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: profile.width,
    screenHeight: profile.height,
    screenOrientation: { type: 'landscapePrimary', angle: 0 }
  });
  await delay(100);
  const metrics = await evaluate(client, `({
    bounds: {
      width: window.outerWidth,
      height: window.outerHeight,
      screenX: window.screenX,
      screenY: window.screenY
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? null,
      visualHeight: window.visualViewport?.height ?? null,
      devicePixelRatio: window.devicePixelRatio
    }
  })`);
  const { bounds, viewport } = metrics;
  return { requested: { width: profile.width, height: profile.height }, windowBounds: bounds, cssViewport: viewport };
}

async function switchPage(client, page, waitMs = 0) {
  await evaluate(client, `
    (() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.title?.startsWith(${JSON.stringify(page.label)}));
      if (!button) throw new Error('Missing navigation button: ${page.label}');
      button.click();
      document.querySelector('.workspace')?.scrollTo(0, 0);
      return true;
    })()
  `);
  await waitForRenderer(
    client,
    `document.querySelector('.workspace > .workspace-view > .page[data-view="${page.id}"]')
      && document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length === 1`,
    `${page.label} page`
  );
  if (waitMs) await delay(waitMs);
}

async function inspectPage(client, page) {
  return evaluate(client, `
    (() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
          && rect.width > 0
          && rect.height > 0
          && rect.right > 0
          && rect.bottom > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
      };
      const cssTimeMs = (value) => {
        const match = String(value ?? '').trim().match(/^([\d.]+)(ms|s)$/);
        if (!match) return 0;
        const amount = Number(match[1]);
        return match[2] === 's' ? amount * 1000 : amount;
      };
      const relativeLuminance = (value) => {
        const hex = String(value ?? '').trim().replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
        const channels = hex.match(/../g).map((part) => parseInt(part, 16) / 255).map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        );
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrastRatio = (foreground, background) => {
        const foregroundLum = relativeLuminance(foreground);
        const backgroundLum = relativeLuminance(background);
        if (foregroundLum === null || backgroundLum === null) return null;
        const lighter = Math.max(foregroundLum, backgroundLum);
        const darker = Math.min(foregroundLum, backgroundLum);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const rootStyle = getComputedStyle(document.documentElement);
      const workspace = document.querySelector('.workspace');
      const page = document.querySelector('.workspace > .workspace-view > .page[data-view="${page.id}"]');
      const heading = page?.querySelector(${JSON.stringify(page.headingSelector)});
      const keyElement = page?.matches(${JSON.stringify(page.keySelector)})
        ? page
        : page?.querySelector(${JSON.stringify(page.keySelector)});
      const headingText = heading?.textContent?.trim() ?? '';
      const pageStyle = page ? getComputedStyle(page) : undefined;
      const pageRect = page?.getBoundingClientRect();
      const workspaceRect = workspace?.getBoundingClientRect();
      const documentOverflow = Math.max(
        document.documentElement.scrollWidth - window.innerWidth,
        document.body.scrollWidth - window.innerWidth,
        workspace ? workspace.scrollWidth - workspace.clientWidth : 0
      );
      const animations = page ? page.getAnimations({ subtree: true }).map((animation) => {
        const timing = animation.effect?.getComputedTiming();
        const keyframes = animation.effect?.getKeyframes?.() ?? [];
        const hasSpatialMotion = keyframes.some((frame) =>
          ['transform', 'translate', 'scale', 'rotate', 'left', 'right', 'top', 'bottom', 'width', 'height', 'clipPath', 'inset']
            .some((property) => frame[property] !== undefined)
        );
        return {
          playState: animation.playState,
          currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
          duration: typeof timing?.duration === 'number' ? timing.duration : null,
          progress: timing?.progress ?? null,
          transforms: keyframes.map((frame) => frame.transform).filter(Boolean),
          hasSpatialMotion
        };
      }) : [];
      const spatialProperties = /^(?:all|transform|translate|scale|rotate|left|right|top|bottom|width|height|min-width|max-width|min-height|max-height|inset|clip-path|grid-template-rows|grid-template-columns)$/;
      const transitionDurations = page ? [page, ...page.querySelectorAll('*')].flatMap((element) => {
        const style = getComputedStyle(element);
        const properties = style.transitionProperty.split(',').map((value) => value.trim());
        const durations = style.transitionDuration.split(',').map(cssTimeMs);
        return properties.flatMap((property, index) => spatialProperties.test(property) ? [durations[index % durations.length] ?? 0] : []);
      }) : [];
      const animationDurations = animations
        .filter((animation) => animation.hasSpatialMotion)
        .map((animation) => Number(animation.duration) || 0);
      const monthView = page?.querySelector('#view-month');
      const monthGrid = page?.querySelector('#view-month .m-grid');
      const monthWeekHead = page?.querySelector('#view-month .m-weekhead');
      const monthBounds = monthView?.getBoundingClientRect();
      const plannerToolbarTitle = page?.querySelector('.legacy-calendar-toolbar .title');
      const plannerToolbarActions = page?.querySelector('.legacy-calendar-actions');
      const plannerToolbarTitleRect = plannerToolbarTitle?.getBoundingClientRect();
      const plannerToolbarActionsRect = plannerToolbarActions?.getBoundingClientRect();
      const plannerActionRects = [...(plannerToolbarActions?.children ?? [])]
        .filter((element) => visible(element))
        .map((element) => element.getBoundingClientRect());
      const rectsOverlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const interactiveElements = [...(page?.querySelectorAll('button, a[href], input, select, textarea, [role="button"]') ?? [])]
        .filter((element) => visible(element));
      const accessibleName = (element) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const labelledText = labelledBy
          ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim()
          : '';
        const labels = 'labels' in element ? [...(element.labels ?? [])].map((label) => label.textContent?.trim() ?? '').join(' ').trim() : '';
        return element.getAttribute('aria-label')?.trim()
          || labelledText
          || labels
          || element.textContent?.trim()
          || element.getAttribute('title')?.trim()
          || element.getAttribute('placeholder')?.trim()
          || '';
      };
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const weekdayReachability = Object.fromEntries(['周五', '周六', '周日'].map((label) => {
        const element = [...(monthWeekHead?.children ?? [])].find((item) => item.textContent?.trim() === label);
        const rect = element?.getBoundingClientRect();
        return [label, Boolean(
          element
          && rect
          && getComputedStyle(element).display !== 'none'
          && getComputedStyle(element).visibility !== 'hidden'
          && monthBounds
          && rect.left >= monthBounds.left - 1
          && rect.right <= monthBounds.right + 1
          && rect.left >= -1
          && rect.right <= window.innerWidth + 1
        )];
      }));
      return {
        page: ${JSON.stringify(page.id)},
        label: ${JSON.stringify(page.label)},
        theme: document.documentElement.dataset.theme,
        reducedMotion: String(document.documentElement.hasAttribute('data-reduce-motion')),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          visualWidth: window.visualViewport?.width ?? null,
          visualHeight: window.visualViewport?.height ?? null,
          devicePixelRatio: window.devicePixelRatio
        },
        scroll: {
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          workspaceWidth: workspace?.scrollWidth ?? null,
          workspaceClientWidth: workspace?.clientWidth ?? null,
          overflowPx: Math.max(0, documentOverflow)
        },
        noHorizontalOverflow: documentOverflow <= 1,
        plannerMonth: {
          weekdayReachability,
          toolbarNoOverlap: Boolean(
            plannerToolbarTitleRect
            && plannerToolbarActionsRect
            && !rectsOverlap(plannerToolbarTitleRect, plannerToolbarActionsRect)
            && plannerActionRects.every((rect, index) =>
              plannerActionRects.slice(index + 1).every((other) => !rectsOverlap(rect, other))
            )
          ),
          noInternalHorizontalOverflow: Boolean(
            monthView
            && monthGrid
            && monthWeekHead
            && monthView.scrollWidth - monthView.clientWidth <= 1
            && monthGrid.scrollWidth - monthGrid.clientWidth <= 1
            && monthWeekHead.scrollWidth - monthWeekHead.clientWidth <= 1
          )
        },
        spatialMotion: {
          maxMs: Math.max(0, ...transitionDurations, ...animationDurations),
          transitionMaxMs: Math.max(0, ...transitionDurations),
          animationMaxMs: Math.max(0, ...animationDurations)
        },
        pageCount: document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length,
        activeNavCount: document.querySelectorAll('.nav-button[aria-current="page"]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        scrimCount: document.querySelectorAll('.sheet-scrim').length,
        pageVisible: visible(page),
        headingText,
        headingMatches: ${JSON.stringify(page.expectedHeadings)}.includes(headingText),
        headingVisible: visible(heading) && ${JSON.stringify(page.expectedHeadings)}.includes(headingText),
        keyElementVisible: visible(keyElement),
        accessibility: {
          interactiveCount: interactiveElements.length,
          unnamedInteractiveCount: interactiveElements.filter((element) => !accessibleName(element)).length,
          positiveTabIndexCount: interactiveElements.filter((element) => Number(element.getAttribute('tabindex')) > 0).length,
          duplicateIdCount: new Set(duplicateIds).size
        },
        pageRect: pageRect ? { left: pageRect.left, top: pageRect.top, right: pageRect.right, bottom: pageRect.bottom } : null,
        workspaceRect: workspaceRect ? { left: workspaceRect.left, top: workspaceRect.top, right: workspaceRect.right, bottom: workspaceRect.bottom } : null,
        motionTokens: {
          fast: rootStyle.getPropertyValue('--dur-fast').trim(),
          base: rootStyle.getPropertyValue('--dur-base').trim(),
          slow: rootStyle.getPropertyValue('--dur-slow').trim(),
          standardEase: rootStyle.getPropertyValue('--ease-standard').trim()
        },
        contrastTokens: {
          label3: rootStyle.getPropertyValue('--label-3').trim(),
          contentSolid: rootStyle.getPropertyValue('--glass-content-solid').trim(),
          controlSolid: rootStyle.getPropertyValue('--glass-control-solid').trim(),
          label3OnContentSolid: contrastRatio(
            rootStyle.getPropertyValue('--label-3').trim(),
            rootStyle.getPropertyValue('--glass-content-solid').trim()
          ),
          label3OnControlSolid: contrastRatio(
            rootStyle.getPropertyValue('--label-3').trim(),
            rootStyle.getPropertyValue('--glass-control-solid').trim()
          )
        },
        pageMotion: {
          animationName: pageStyle?.animationName ?? '',
          animationDuration: pageStyle?.animationDuration ?? '',
          transitionDuration: pageStyle?.transitionDuration ?? '',
          transform: pageStyle?.transform ?? '',
          opacity: pageStyle?.opacity ?? ''
        },
        animations
      };
    })()
  `);
}

async function captureScreenshot(client, fileName) {
  const capture = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  const buffer = Buffer.from(capture.data, 'base64');
  const filePath = path.join(screenshotDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, ...pngDimensions(buffer) };
}

async function motionSample(client) {
  return evaluate(client, `
    (() => {
      const container = document.querySelector('.workspace > .workspace-view');
      const page = container?.querySelector(':scope > .page[data-view]');
      const style = container ? getComputedStyle(container) : undefined;
      const animations = container ? container.getAnimations({ subtree: false }).map((animation) => {
        const timing = animation.effect?.getComputedTiming();
        const keyframes = animation.effect?.getKeyframes?.() ?? [];
        return {
          playState: animation.playState,
          currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
          duration: typeof timing?.duration === 'number' ? timing.duration : null,
          progress: timing?.progress ?? null,
          transforms: keyframes.map((frame) => frame.transform).filter(Boolean),
          opacities: keyframes.map((frame) => frame.opacity).filter((value) => value !== undefined)
        };
      }) : [];
      return {
        elapsedMs: performance.now() - (window.__timeMateSmokeMotionStart ?? performance.now()),
        containerPresent: Boolean(container),
        view: page?.getAttribute('data-view') ?? null,
        pageCount: document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        reducedMotion: String(document.documentElement.hasAttribute('data-reduce-motion')),
        animationName: style?.animationName ?? '',
        animationDuration: style?.animationDuration ?? '',
        transitionProperty: style?.transitionProperty ?? '',
        transitionDuration: style?.transitionDuration ?? '',
        transform: style?.transform ?? '',
        opacity: style?.opacity ?? '',
        animations
      };
    })()
  `);
}

async function startMotionTransition(client, page) {
  await evaluate(client, `
    (() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.title?.startsWith(${JSON.stringify(page.label)}));
      if (!button) throw new Error('Missing transition target: ${page.label}');
      window.__timeMateSmokeMotionStart = performance.now();
      button.click();
      return true;
    })()
  `);
  await waitForRenderer(client, `document.querySelector('.workspace > .workspace-view > .page[data-view="${page.id}"]')`, `${page.label} transition target`);
}

async function waitForMotionElapsed(client, elapsedMs) {
  await evaluate(client, `
    new Promise((resolve) => {
      const remaining = ${elapsedMs} - (performance.now() - (window.__timeMateSmokeMotionStart ?? performance.now()));
      setTimeout(resolve, Math.max(0, remaining));
    })
  `);
}

async function captureMotionEvidence(client, prefix) {
  const points = [];
  const phases = [
    { phase: 'start', requestedMs: 0 },
    { phase: 'middle', requestedMs: 120 },
    { phase: 'end', requestedMs: 420 }
  ];
  for (const point of phases) {
    await waitForMotionElapsed(client, point.requestedMs);
    const sample = await motionSample(client);
    const screenshot = await captureScreenshot(client, `motion-${prefix}-${String(point.requestedMs).padStart(3, '0')}ms.png`);
    points.push({ ...point, actualMs: sample.elapsedMs, sample, screenshot });
  }
  return points;
}

async function inspectRapidSwitching(client) {
  return evaluate(client, `
    (async () => {
      const navButtons = [...document.querySelectorAll('.nav-button')].filter((button) =>
        ['当前', '对话', '规划', '记忆', '接入', '设置'].some((label) => button.title?.startsWith(label))
      );
      for (let index = 0; index < 24; index += 1) navButtons[index % navButtons.length]?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterPages = {
        pageCount: document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length,
        activeNavCount: document.querySelectorAll('.nav-button[aria-current="page"]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        scrimCount: document.querySelectorAll('.sheet-scrim').length,
        views: [...document.querySelectorAll('.workspace > .workspace-view > .page[data-view]')].map((page) => page.getAttribute('data-view'))
      };

      const memoryButton = navButtons.find((button) => button.title?.startsWith('记忆'));
      memoryButton?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const openButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '记一条');
      for (let index = 0; index < 4; index += 1) openButton?.click();
      await Promise.resolve();
      const afterDialogs = {
        pageCount: document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        scrimCount: document.querySelectorAll('.sheet-scrim').length
      };

      for (let index = 0; index < 18; index += 1) navButtons[(index * 5) % navButtons.length]?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterMixed = {
        pageCount: document.querySelectorAll('.workspace > .workspace-view > .page[data-view]').length,
        activeNavCount: document.querySelectorAll('.nav-button[aria-current="page"]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        scrimCount: document.querySelectorAll('.sheet-scrim').length,
        views: [...document.querySelectorAll('.workspace > .workspace-view > .page[data-view]')].map((page) => page.getAttribute('data-view'))
      };
      return { afterPages, afterDialogs, afterMixed };
    })()
  `);
}

async function runVisualValidation() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const resultPath = phaseResultPath('visual');
  fs.rmSync(resultPath, { force: true });
  const port = await findFreePort();
  const child = spawn(electronPath, [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-features=UseSkiaRenderer',
    '--in-process-gpu',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '.'
  ], {
    cwd: root,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TIMEMATE_SMOKE_VIEWPORT: '1',
      TIMEMATE_USER_DATA_DIR: visualUserDataDir
    }
  });

  let output = '';
  let client;
  let timer;
  child.stdout.on('data', (chunk) => {
    const message = chunk.toString();
    output += message;
    process.stdout.write(message);
  });
  child.stderr.on('data', (chunk) => {
    const message = chunk.toString();
    output += message;
    process.stderr.write(message);
  });

  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Visual smoke timed out after ${visualTimeoutMs}ms.`)), visualTimeoutMs);
    });
    const work = (async () => {
      const target = await waitForValue(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (!response.ok) return undefined;
        const targets = await response.json();
        return targets.find((item) => item.type === 'page' && item.title === 'TimeMate' && !item.url.includes('pet.html'));
      }, 'TimeMate renderer debugging target', 10000);

      client = new CdpClient(target.webSocketDebuggerUrl);
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      await client.send('Page.bringToFront');
      await waitForRenderer(client, `document.querySelector('.app-shell')`, 'TimeMate application shell');
      const matrix = [];
      const screenshots = [];
      const viewportRuns = [];

      for (const profile of VISUAL_PROFILES) {
        const viewportRun = await setViewport(client, profile);
        viewportRuns.push({ profile: profile.id, ...viewportRun });
        await setVisualSettings(client, profile.theme, profile.reducedMotion, profile.reducedTransparency);
        for (const page of PAGE_CASES) {
          await switchPage(client, page, 420);
          const evidence = await inspectPage(client, page);
          const screenshot = await captureScreenshot(client, `page-${page.id}-${profile.id}.png`);
          screenshots.push(screenshot);
          matrix.push({ profile: profile.id, expected: profile, evidence, screenshot });
        }
      }

      const narrowProfile = VISUAL_PROFILES.find((profile) => profile.id === 'narrow-dark-reduced');
      await setViewport(client, narrowProfile);
      await setVisualSettings(client, narrowProfile.theme, narrowProfile.reducedMotion, narrowProfile.reducedTransparency);
      const narrowAdaptiveEvidence = await evaluate(client, `
        (async () => {
          const nav = document.querySelector('.sidebar');
          const navRect = nav?.getBoundingClientRect();
          const navStyle = nav ? getComputedStyle(nav) : null;
          const visibleNavButtons = [...document.querySelectorAll('.sidebar .nav-button')].filter((button) => {
            const style = getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== 'none' && rect.width > 0 && rect.height > 0;
          });
          const chatButton = [...document.querySelectorAll('.nav-button')].find((button) => button.title?.startsWith('对话'));
          chatButton?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const composer = document.querySelector('.chat-composer');
          const composerRect = composer?.getBoundingClientRect();
          const heading = document.querySelector('.workspace h1');
          const headingStyle = heading ? getComputedStyle(heading) : null;
          return {
            viewportWidth: window.innerWidth,
            navPosition: navStyle?.position ?? null,
            visibleNavButtonCount: visibleNavButtons.length,
            navRect: navRect ? { top: navRect.top, bottom: navRect.bottom } : null,
            composerRect: composerRect ? { top: composerRect.top, bottom: composerRect.bottom } : null,
            composerClearOfNav: Boolean(composerRect && navRect && composerRect.bottom <= navRect.top + 1),
            headingFocused: document.activeElement === heading,
            headingOutlineHidden: headingStyle?.outlineStyle === 'none' || headingStyle?.outlineWidth === '0px',
            skipLinkPresent: Boolean(document.querySelector('.skip-link[href="#main-workspace"]'))
          };
        })()
      `);
      const narrowChatScreenshot = await captureScreenshot(client, 'accessibility-narrow-chat.png');
      screenshots.push(narrowChatScreenshot);

      await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await delay(80);
      const touchTargetEvidence = { pages: [] };
      for (const page of PAGE_CASES) {
        await switchPage(client, page, 60);
        const pageTargets = await evaluate(client, `
          (() => {
            const visible = (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity) > 0
                && rect.width > 0
                && rect.height > 0
                && rect.right > 0
                && rect.bottom > 0
                && rect.left < innerWidth
                && rect.top < innerHeight;
            };
            const elements = [...document.querySelectorAll(
              'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="radio"], [role="menuitemradio"]'
            )].filter((element, index, all) => all.indexOf(element) === index && visible(element));
            const targets = elements.map((element) => {
              const labelledTarget = element.matches('input:not([type="range"])') ? element.closest('label') : null;
              const effectiveTarget = labelledTarget && visible(labelledTarget) ? labelledTarget : element;
              const rect = effectiveTarget.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                role: element.getAttribute('role'),
                className: element.className?.toString?.() ?? '',
                name: element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || '',
                width: rect.width,
                height: rect.height,
                proxy: effectiveTarget !== element ? effectiveTarget.tagName.toLowerCase() : null
              };
            });
            return {
              page: ${JSON.stringify(page.id)},
              coarsePointer: matchMedia('(pointer: coarse)').matches,
              count: targets.length,
              minimumWidth: Math.min(...targets.map((target) => target.width)),
              minimumHeight: Math.min(...targets.map((target) => target.height)),
              violations: targets.filter((target) => target.width < 43.5 || target.height < 43.5)
            };
          })()
        `);
        touchTargetEvidence.pages.push(pageTargets);
      }
      const touchTargetScreenshot = await captureScreenshot(client, 'accessibility-touch-targets.png');
      screenshots.push(touchTargetScreenshot);

      await switchPage(client, PAGE_CASES.find((page) => page.id === 'settings'), 80);
      const settingsKeyboardEvidence = await evaluate(client, `
        (async () => {
          const tabs = [...document.querySelectorAll('.settings-nav [role="tab"]')];
          const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const press = async (target, key) => {
            target.focus();
            target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await settle();
          };
          await press(tabs[1], 'End');
          const endOk = document.activeElement === tabs.at(-1) && tabs.at(-1)?.getAttribute('aria-selected') === 'true';
          await press(tabs.at(-1), 'Home');
          const homeOk = document.activeElement === tabs[0] && tabs[0]?.getAttribute('aria-selected') === 'true';
          await press(tabs[0], 'ArrowRight');
          const arrowOk = document.activeElement === tabs[1] && tabs[1]?.getAttribute('aria-selected') === 'true';
          const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
          const tabbable = tabs.filter((tab) => tab.tabIndex === 0);
          const closedExpandables = [...document.querySelectorAll('.settings-expandable[aria-hidden="true"]')];
          const focusBeforeInertProbe = document.activeElement;
          const closedFocusBlocked = closedExpandables.every((panel) =>
            [...panel.querySelectorAll('button, input, select, textarea, [tabindex]')].every((element) => {
              element.focus();
              return !panel.contains(document.activeElement);
            })
          );
          focusBeforeInertProbe?.focus();
          return {
            tabCount: tabs.length,
            endOk,
            homeOk,
            arrowOk,
            selectedCount: selected.length,
            tabbableCount: tabbable.length,
            selectedIsTabbable: selected[0] === tabbable[0],
            closedExpandableCount: closedExpandables.length,
            closedExpandablesInert: closedExpandables.every((panel) => panel.inert === true),
            closedFocusBlocked
          };
        })()
      `);

      await switchPage(client, PAGE_CASES.find((page) => page.id === 'memory'), 80);
      const sheetKeyboardEvidence = await evaluate(client, `
        (async () => {
          const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const opener = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('记一条'));
          opener?.focus();
          opener?.click();
          await settle();
          const dialog = document.querySelector('[role="dialog"]');
          const focusable = [...(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
            .filter((element) => element.getClientRects().length > 0);
          const first = focusable[0];
          const last = focusable.at(-1);
          const dialogBackdrop = dialog ? getComputedStyle(dialog).backdropFilter : null;
          last?.focus();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
          await Promise.resolve();
          const forwardWrap = document.activeElement === first;
          first?.focus();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
          await Promise.resolve();
          const backwardWrap = document.activeElement === last;
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          await settle();
          return {
            opened: Boolean(dialog),
            focusableCount: focusable.length,
            dialogBackdrop,
            forwardWrap,
            backwardWrap,
            escapeClosed: !document.querySelector('[role="dialog"]'),
            focusReturned: document.activeElement === opener
          };
        })()
      `);

      const overlayRoleEvidence = await evaluate(client, `
        (() => {
          const classes = ['sheet', 'toast', 'mood-wheel'];
          const probes = classes.map((className) => {
            const node = document.createElement('div');
            node.className = className;
            node.style.position = 'fixed';
            node.style.visibility = 'hidden';
            document.body.append(node);
            return node;
          });
          const expectedProbe = document.createElement('div');
          expectedProbe.style.backdropFilter = 'blur(var(--glass-role-popover-blur)) saturate(var(--glass-saturation-overlay))';
          document.body.append(expectedProbe);
          const expected = getComputedStyle(expectedProbe).backdropFilter;
          const filters = Object.fromEntries(probes.map((node) => [node.className, getComputedStyle(node).backdropFilter]));
          probes.forEach((node) => node.remove());
          expectedProbe.remove();
          return {
            expected,
            filters,
            allUsePopoverRole: Object.values(filters).every((value) => value === expected)
          };
        })()
      `);

      await switchPage(client, PAGE_CASES.find((page) => page.id === 'settings'), 80);
      await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-contrast', value: 'more' }]
      });
      await delay(80);
      const increasedContrastEvidence = await evaluate(client, `
        (() => {
          const activeTab = document.querySelector('.settings-nav-item[aria-selected="true"]');
          activeTab?.focus();
          const style = activeTab ? getComputedStyle(activeTab) : null;
          const root = getComputedStyle(document.documentElement);
          return {
            active: matchMedia('(prefers-contrast: more)').matches,
            activeTabBorderWidth: style?.borderTopWidth ?? null,
            focusOutlineWidth: style?.outlineWidth ?? null,
            label3: root.getPropertyValue('--label-3').trim(),
            contentSolid: root.getPropertyValue('--glass-content-solid').trim(),
            controlSolid: root.getPropertyValue('--glass-control-solid').trim()
          };
        })()
      `);
      const increasedContrastScreenshot = await captureScreenshot(client, 'accessibility-increased-contrast.png');
      screenshots.push(increasedContrastScreenshot);
      await client.send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });

      await setViewport(client, { id: 'compact-landscape', width: 640, height: 420 });
      await switchPage(client, PAGE_CASES.find((page) => page.id === 'chat'), 100);
      const compactChatEvidence = await evaluate(client, `
        (() => {
          const nav = document.querySelector('.sidebar')?.getBoundingClientRect();
          const composer = document.querySelector('.chat-composer')?.getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight },
            noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
            navInViewport: Boolean(nav && nav.bottom <= innerHeight + 1 && nav.left >= -1 && nav.right <= innerWidth + 1),
            composerClearOfNav: Boolean(nav && composer && composer.bottom <= nav.top + 1)
          };
        })()
      `);
      const compactChatScreenshot = await captureScreenshot(client, 'accessibility-compact-landscape-chat.png');
      screenshots.push(compactChatScreenshot);
      await switchPage(client, PAGE_CASES.find((page) => page.id === 'planner'), 100);
      const compactPlannerEvidence = await inspectPage(client, PAGE_CASES.find((page) => page.id === 'planner'));
      const compactPlannerScreenshot = await captureScreenshot(client, 'accessibility-compact-landscape-planner.png');
      screenshots.push(compactPlannerScreenshot);

      const desktopProfile = VISUAL_PROFILES[0];
      await setViewport(client, desktopProfile);
      await setVisualSettings(client, 'light', false, false);
      await switchPage(client, PAGE_CASES[0], 420);
      await startMotionTransition(client, PAGE_CASES[1]);
      const regularMotion = await captureMotionEvidence(client, 'regular');
      screenshots.push(...regularMotion.map((point) => point.screenshot));

      const narrowProfileForMotion = VISUAL_PROFILES.find((profile) => profile.id === 'narrow-dark-reduced');
      await setViewport(client, narrowProfileForMotion);
      await setVisualSettings(client, 'dark', true, false);
      await switchPage(client, PAGE_CASES[1], 30);
      await startMotionTransition(client, PAGE_CASES[2]);
      const reducedMotion = await captureMotionEvidence(client, 'reduced');
      screenshots.push(...reducedMotion.map((point) => point.screenshot));
      const rapidSwitching = await inspectRapidSwitching(client);

      await setVisualSettings(client, 'dark', true, true);
      await switchPage(client, PAGE_CASES.find((page) => page.id === 'settings'), 120);
      const reducedTransparencyEvidence = await evaluate(client, `
        (() => {
          const surface = document.querySelector('.settings-workspace');
          const surfaceStyle = surface ? getComputedStyle(surface) : null;
          const navStyle = getComputedStyle(document.querySelector('.app-shell'), '::before');
          return {
            enabled: document.documentElement.hasAttribute('data-reduce-transparency'),
            surfaceBackdrop: surfaceStyle?.backdropFilter ?? null,
            navBackdrop: navStyle?.backdropFilter ?? null,
            surfaceBackground: surfaceStyle?.backgroundColor ?? null,
            ambientBackground: getComputedStyle(document.querySelector('.app-shell')).backgroundImage
          };
        })()
      `);
      const reducedTransparencyScreenshot = await captureScreenshot(client, 'accessibility-reduced-transparency.png');
      screenshots.push(reducedTransparencyScreenshot);

      await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'forced-colors', value: 'active' }]
      });
      await delay(80);
      const forcedColorsEvidence = await evaluate(client, `
        (() => {
          const surface = document.querySelector('.settings-workspace');
          const activeNav = document.querySelector('.nav-button[aria-current="page"]');
          activeNav?.focus();
          const surfaceStyle = surface ? getComputedStyle(surface) : null;
          const navStyle = activeNav ? getComputedStyle(activeNav) : null;
          return {
            active: matchMedia('(forced-colors: active)').matches,
            surfaceBackdrop: surfaceStyle?.backdropFilter ?? null,
            surfaceBoxShadow: surfaceStyle?.boxShadow ?? null,
            activeNavBorderWidth: navStyle?.borderTopWidth ?? null,
            focusOutlineWidth: navStyle?.outlineWidth ?? null
          };
        })()
      `);
      const forcedColorsScreenshot = await captureScreenshot(client, 'accessibility-forced-colors.png');
      screenshots.push(forcedColorsScreenshot);
      await client.send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });

      const tokenEvidence = matrix.find((item) => item.profile === 'desktop-light-motion')?.evidence.motionTokens;
      const narrowPlannerEvidence = matrix.find((item) => item.profile === narrowProfileForMotion.id && item.evidence.page === 'planner')?.evidence;
      const plannerMatrixEvidence = matrix.filter((item) => item.evidence.page === 'planner');
      const regularAnimations = regularMotion.flatMap((point) => point.sample.animations);
      const checks = {
        viewportMatrixComplete: matrix.length === PAGE_CASES.length * VISUAL_PROFILES.length,
        desktopViewportExact: matrix.filter((item) => item.profile === desktopProfile.id).every((item) =>
          item.evidence.viewport.width === desktopProfile.width
          && item.evidence.viewport.height === desktopProfile.height
          && item.screenshot.width === desktopProfile.width
          && item.screenshot.height === desktopProfile.height
        ),
        narrowViewportExact: matrix.filter((item) => item.profile === narrowProfileForMotion.id).every((item) =>
          item.evidence.viewport.width === narrowProfileForMotion.width
          && item.evidence.viewport.height === narrowProfileForMotion.height
          && item.screenshot.width === narrowProfileForMotion.width
          && item.screenshot.height === narrowProfileForMotion.height
        ),
        narrowWindowBoundsAllowed: viewportRuns.some((item) => item.profile === narrowProfileForMotion.id
          && Math.abs(item.windowBounds.width - narrowProfileForMotion.width) <= 1
          && Math.abs(item.windowBounds.height - narrowProfileForMotion.height) <= 1
          && item.cssViewport.width === narrowProfileForMotion.width
        ),
        allPagesSingleAndVisible: matrix.every((item) => item.evidence.pageCount === 1
          && item.evidence.activeNavCount === 1
          && item.evidence.pageVisible
          && item.evidence.headingVisible
          && item.evidence.keyElementVisible
        ),
        noHorizontalOverflow: matrix.every((item) => item.evidence.noHorizontalOverflow),
        interactiveElementsNamed: matrix.every((item) => item.evidence.accessibility.unnamedInteractiveCount === 0),
        naturalTabOrder: matrix.every((item) => item.evidence.accessibility.positiveTabIndexCount === 0),
        uniqueDomIds: matrix.every((item) => item.evidence.accessibility.duplicateIdCount === 0),
        narrowPlannerWeekendReachable: Boolean(
          narrowPlannerEvidence
          && ['周五', '周六', '周日'].every((label) => narrowPlannerEvidence.plannerMonth.weekdayReachability[label])
        ),
        narrowPlannerMonthNoHorizontalOverflow: Boolean(narrowPlannerEvidence?.plannerMonth.noInternalHorizontalOverflow),
        allPlannerMonthNoHorizontalOverflow: plannerMatrixEvidence.length === VISUAL_PROFILES.length
          && plannerMatrixEvidence.every((item) => item.evidence.plannerMonth.noInternalHorizontalOverflow),
        allPlannerToolbarControlsDoNotOverlap: plannerMatrixEvidence.length === VISUAL_PROFILES.length
          && plannerMatrixEvidence.every((item) => item.evidence.plannerMonth.toolbarNoOverlap),
        compactPlannerMonthNoHorizontalOverflow: compactPlannerEvidence.plannerMonth.noInternalHorizontalOverflow,
        touchTargetsMeet44CssPx: touchTargetEvidence.pages.length === PAGE_CASES.length
          && touchTargetEvidence.pages.every((page) => page.coarsePointer && page.count > 0 && page.violations.length === 0),
        settingsRovingTabsKeyboard: settingsKeyboardEvidence.tabCount > 1
          && settingsKeyboardEvidence.endOk
          && settingsKeyboardEvidence.homeOk
          && settingsKeyboardEvidence.arrowOk
          && settingsKeyboardEvidence.selectedCount === 1
          && settingsKeyboardEvidence.tabbableCount === 1
          && settingsKeyboardEvidence.selectedIsTabbable,
        collapsedSettingsPanelsAreInert: settingsKeyboardEvidence.closedExpandableCount > 0
          && settingsKeyboardEvidence.closedExpandablesInert
          && settingsKeyboardEvidence.closedFocusBlocked,
        sheetKeyboardFocusLoop: sheetKeyboardEvidence.opened
          && sheetKeyboardEvidence.focusableCount > 1
          && sheetKeyboardEvidence.forwardWrap
          && sheetKeyboardEvidence.backwardWrap
          && sheetKeyboardEvidence.escapeClosed
          && sheetKeyboardEvidence.focusReturned,
        overlayRoleTokensApplied: overlayRoleEvidence.allUsePopoverRole
          && sheetKeyboardEvidence.dialogBackdrop === overlayRoleEvidence.expected,
        label3SolidFallbackContrastAA: matrix.every((item) =>
          Number(item.evidence.contrastTokens.label3OnContentSolid) >= 4.5
          && Number(item.evidence.contrastTokens.label3OnControlSolid) >= 4.5
        ),
        increasedContrastCovered: increasedContrastEvidence.active
          && parseFloat(increasedContrastEvidence.activeTabBorderWidth) >= 2
          && parseFloat(increasedContrastEvidence.focusOutlineWidth) >= 2.5,
        compactLandscapeReflows: compactChatEvidence.viewport.width === 640
          && compactChatEvidence.viewport.height === 420
          && compactChatEvidence.noHorizontalOverflow
          && compactChatEvidence.navInViewport
          && compactChatEvidence.composerClearOfNav
          && compactPlannerEvidence.noHorizontalOverflow
          && compactPlannerEvidence.pageVisible,
        spatialMotionWithin280ms: matrix.every((item) => item.evidence.spatialMotion.maxMs <= 280),
        lightThemeCovered: matrix.some((item) => item.evidence.theme === 'light'),
        darkThemeCovered: matrix.some((item) => item.evidence.theme === 'dark'),
        regularMotionCovered: matrix.some((item) => item.evidence.reducedMotion === 'false'),
        reducedMotionCovered: matrix.some((item) => item.evidence.reducedMotion === 'true'),
        narrowBottomNavigation: narrowAdaptiveEvidence.viewportWidth <= 640
          && narrowAdaptiveEvidence.navPosition === 'fixed'
          && narrowAdaptiveEvidence.visibleNavButtonCount === 6
          && narrowAdaptiveEvidence.navRect?.bottom <= narrowProfileForMotion.height,
        narrowChatComposerClearOfNavigation: narrowAdaptiveEvidence.composerClearOfNav,
        navigationFocusManaged: narrowAdaptiveEvidence.headingFocused && narrowAdaptiveEvidence.headingOutlineHidden,
        skipLinkPresent: narrowAdaptiveEvidence.skipLinkPresent,
        reducedTransparencyCovered: reducedTransparencyEvidence.enabled
          && reducedTransparencyEvidence.surfaceBackdrop === 'none'
          && reducedTransparencyEvidence.navBackdrop === 'none',
        forcedColorsCovered: forcedColorsEvidence.active
          && forcedColorsEvidence.surfaceBackdrop === 'none'
          && forcedColorsEvidence.surfaceBoxShadow === 'none'
          && parseFloat(forcedColorsEvidence.activeNavBorderWidth) >= 1
          && parseFloat(forcedColorsEvidence.focusOutlineWidth) >= 2.5,
        motionTokensPresent: Boolean(tokenEvidence?.fast && tokenEvidence?.base && tokenEvidence?.slow && tokenEvidence?.standardEase),
        regularMotionActive: regularMotion.some((point) => point.sample.reducedMotion === 'false'
          && (
            point.sample.animations.some((animation) => Number(animation.duration) >= 100
              && animation.transforms.length >= 2
              && new Set(animation.transforms).size >= 2
              && animation.transforms.some((transform) => /translate|scale/.test(transform))
            )
            || (point.sample.transitionProperty.split(',').map((value) => value.trim()).includes('transform')
              && point.sample.transitionDuration.split(',').some((value) => cssTimeToMs(value) >= 100))
          )
        ) && regularAnimations.length > 0,
        regularMotionSamplesPresent: motionSamplesPresent(regularMotion, 'chat', false),
        regularMotionSettles: motionSettled(regularMotion.at(-1), 'chat'),
        reducedMotionSuppressesDisplacement: reducedMotion.every((point) =>
          point.sample.reducedMotion === 'true'
          && isIdentityTransform(point.sample.transform)
          && point.sample.animations.every((animation) => animation.transforms.length === 0)
        ),
        reducedMotionSamplesPresent: motionSamplesPresent(reducedMotion, 'planner', true),
        reducedMotionSettles: motionSettled(reducedMotion.at(-1), 'planner'),
        rapidSwitchSinglePage: rapidSwitching.afterPages.pageCount === 1
          && rapidSwitching.afterPages.activeNavCount === 1
          && rapidSwitching.afterMixed.pageCount === 1
          && rapidSwitching.afterMixed.activeNavCount === 1,
        rapidSwitchSingleDialog: rapidSwitching.afterDialogs.dialogCount === 1
          && rapidSwitching.afterDialogs.scrimCount === 1
          && rapidSwitching.afterMixed.dialogCount === 0
          && rapidSwitching.afterMixed.scrimCount === 0
      };
      const result = {
        ok: Object.values(checks).every(Boolean),
        checks,
        profiles: VISUAL_PROFILES,
        pages: PAGE_CASES,
        viewportRuns,
        matrix,
        motion: { regular: regularMotion, reduced: reducedMotion },
        rapidSwitching,
        accessibility: {
          narrowAdaptiveEvidence,
          touchTargetEvidence,
          settingsKeyboardEvidence,
          sheetKeyboardEvidence,
          overlayRoleEvidence,
          increasedContrastEvidence,
          compactLandscape: { chat: compactChatEvidence, planner: compactPlannerEvidence },
          reducedTransparencyEvidence,
          forcedColorsEvidence
        },
        screenshots
      };
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
      if (!result.ok) {
        const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
        throw new Error(`Visual smoke checks failed: ${failed.join(', ')}. Result: ${resultPath}`);
      }
      console.log(`Visual smoke passed. Result: ${resultPath}`);
      return result;
    })();
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (output.trim()) console.error(output.trim());
    throw error;
  } finally {
    clearTimeout(timer);
    client?.close();
    if (!child.killed) child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000)
    ]);
  }
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function inspectBuildArtifacts() {
  const distDir = path.join(root, 'dist');
  const pixelAssetDir = path.join(root, 'src', 'renderer', 'assets', 'companions', 'ruohan-pixel-v1');
  const distFiles = listFiles(distDir);
  const pixelFiles = listFiles(pixelAssetDir);
  const distBytes = distFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
  const pixelBytes = pixelFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
  const largestPixelAsset = pixelFiles
    .map((file) => ({ file: path.relative(root, file), bytes: fs.statSync(file).size }))
    .sort((left, right) => right.bytes - left.bytes)[0];
  const normalizedPathSignatures = [
    ['pet', 'layered', '2d'].join(''),
    ['layered', '2d'].join(''),
    ['live', '2d'].join(''),
    ['cu', 'bism'].join(''),
    ['m', 'oc', '3'].join(''),
    ['model', '3'].join(''),
    ['companions', 'ruohan', 'default'].join(''),
    ['companions', 'ruohan', 'layered'].join(''),
    ['companions', 'ruohan', 'home', 'soft'].join(''),
    ['companions', 'ruohan', 'focus', 'clean'].join('')
  ];
  const contentSignatures = [
    ['pet', 'Layered', '2D'].join(''),
    ['layered', '-2d'].join(''),
    ['live', '2d'].join(''),
    ['cu', 'bism'].join(''),
    ['.', 'm', 'oc', '3'].join(''),
    ['.', 'model', '3.json'].join('')
  ].map((value) => value.toLowerCase());
  const legacyResourceViolations = [];

  for (const file of distFiles) {
    const relative = path.relative(distDir, file).replaceAll('\\', '/');
    const normalizedRelative = relative.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedPathSignatures.some((token) => normalizedRelative.includes(token))) {
      legacyResourceViolations.push({ file: relative, source: 'path' });
      continue;
    }
    if (!/\.(?:js|css|html|json|map)$/i.test(relative)) continue;
    const content = fs.readFileSync(file, 'utf8').toLowerCase();
    const signature = contentSignatures.find((token) => content.includes(token));
    if (signature) legacyResourceViolations.push({ file: relative, source: 'content', signature });
  }

  return {
    distExists: fs.existsSync(distDir),
    distFileCount: distFiles.length,
    distBytes,
    pixelAssetFileCount: pixelFiles.length,
    pixelAssetBytes: pixelBytes,
    largestPixelAsset,
    pixelAssetsUnderOneMiB: pixelBytes < ONE_MIB && Boolean(largestPixelAsset && largestPixelAsset.bytes < ONE_MIB),
    distLegacyResourceCount: legacyResourceViolations.length,
    distLegacyResourceViolations: legacyResourceViolations,
    distHasNoLegacyResources: legacyResourceViolations.length === 0
  };
}

function runPhase(phase) {
  const resultPath = phaseResultPath(phase);
  fs.rmSync(resultPath, { force: true });

  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-features=UseSkiaRenderer',
      '--in-process-gpu',
      '.'
    ], {
      cwd: root,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TIMEMATE_SMOKE: '1',
        TIMEMATE_SMOKE_PHASE: phase,
        TIMEMATE_USER_DATA_DIR: userDataDir,
        TIMEMATE_SMOKE_RESULT: resultPath,
        TIMEMATE_SMOKE_SCREENSHOT_DIR: screenshotDir
      }
    });

    let output = '';
    let timedOut = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Smoke ${phase} phase timed out after ${timeoutMs}ms.`));
        return;
      }

      if (!fs.existsSync(resultPath)) {
        reject(new Error(`Smoke ${phase} phase did not write a result file.${output.trim() ? `\n${output}` : ''}`));
        return;
      }

      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      if (!result.ok) {
        reject(new Error(`Smoke ${phase} phase failed.\n${JSON.stringify(result, null, 2)}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Electron ${phase} phase exited with code ${code}.`));
        return;
      }

      console.log(`Smoke ${phase} phase passed. Result: ${resultPath}`);
      resolve(result);
    });
  });
}

try {
  const build = inspectBuildArtifacts();
  if (!build.pixelAssetsUnderOneMiB || !build.distHasNoLegacyResources) {
    throw new Error(`Build artifact checks failed.\n${JSON.stringify(build, null, 2)}`);
  }
  const full = await runPhase('full');
  const persist = await runPhase('persist');
  const legacyContract = {
    booleanCheckCount: countBooleanChecks(build) + countBooleanChecks(full.checks) + countBooleanChecks(persist.checks),
    allBooleanChecksPass: allBooleanChecksPass(build) && allBooleanChecksPass(full.checks) && allBooleanChecksPass(persist.checks)
  };
  if (legacyContract.booleanCheckCount !== 104 || !legacyContract.allBooleanChecksPass) {
    throw new Error(`Legacy smoke contract changed or failed.\n${JSON.stringify(legacyContract, null, 2)}`);
  }
  const visual = await runVisualValidation();
  const result = {
    ok: true,
    phases: {
      full,
      persist,
      visual
    },
    build,
    legacyContract,
    checks: {
      ...prefixedChecks('build', build),
      ...prefixedChecks('full', full.checks),
      ...prefixedChecks('persist', persist.checks),
      'legacy.existing104Preserved': legacyContract.booleanCheckCount === 104 && legacyContract.allBooleanChecksPass,
      ...prefixedChecks('visual', visual.checks)
    }
  };

  fs.writeFileSync(finalResultPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Smoke test passed. Result: ${finalResultPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
