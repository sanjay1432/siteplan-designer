export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Canonical unit: millimetres (1 ft = 304.8 mm)
export const DEFAULT_WORKSPACE_SIZE_FT = 100;
export const DEFAULT_WORKSPACE_SIZE_MM = 30480; // 100 ft * 304.8 mm/ft

export const DEFAULT_WORLD_BOUNDS: Bounds = {
  minX: 0,
  minY: 0,
  maxX: DEFAULT_WORKSPACE_SIZE_MM,
  maxY: DEFAULT_WORKSPACE_SIZE_MM,
};

export const DEFAULT_PADDING = 60;
export const MIN_ZOOM = 0.0005;
export const MAX_ZOOM = 5;

export function screenToWorld(
  point: Point,
  viewport: Viewport,
): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(
  point: Point,
  viewport: Viewport,
): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

export function zoomAtPoint(
  viewport: Viewport,
  screenPoint: Point,
  nextZoom: number,
): Viewport {
  const worldPoint = screenToWorld(
    screenPoint,
    viewport,
  );

  return {
    zoom: nextZoom,
    panX: screenPoint.x - worldPoint.x * nextZoom,
    panY: screenPoint.y - worldPoint.y * nextZoom,
  };
}

export function fitBounds(
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = DEFAULT_PADDING,
): Viewport {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;

  if (
    boundsWidth <= 0 ||
    boundsHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return {
      zoom: 0.01,
      panX: viewportWidth / 2,
      panY: viewportHeight / 2,
    };
  }

  // Prevent padding from exceeding 25% of viewport dimension on smaller screens
  const effectivePadding = Math.max(
    0,
    Math.min(padding, viewportWidth / 4, viewportHeight / 4),
  );

  const availableWidth = viewportWidth - effectivePadding * 2;
  const availableHeight = viewportHeight - effectivePadding * 2;

  const zoomX = availableWidth / boundsWidth;
  const zoomY = availableHeight / boundsHeight;

  // Preserve aspect ratio by selecting the limiting zoom factor
  const zoom = Math.min(zoomX, zoomY);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    zoom,
    panX: viewportWidth / 2 - centerX * zoom,
    panY: viewportHeight / 2 - centerY * zoom,
  };
}

export function centerOrigin(
  viewportWidth: number,
  viewportHeight: number,
  currentZoom: number,
): Viewport {
  return {
    zoom: currentZoom,
    panX: viewportWidth / 2,
    panY: viewportHeight / 2,
  };
}

export function formatZoom(zoom: number): string {
  const percentage = zoom * 100;

  if (percentage >= 100) {
    return `${Math.round(percentage)}%`;
  }

  if (percentage >= 10) {
    if (Math.abs(percentage - Math.round(percentage)) < 0.05) {
      return `${Math.round(percentage)}%`;
    }
    return `${percentage.toFixed(1)}%`;
  }

  if (percentage >= 0.1) {
    return `${percentage.toFixed(1)}%`;
  }

  return `${percentage.toFixed(2)}%`;
}