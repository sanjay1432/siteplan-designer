import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  DEFAULT_WORLD_BOUNDS,
  DEFAULT_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  fitBounds,
  zoomAtPoint,
  centerOrigin as computeCenterOrigin,
  type Bounds,
  type Viewport,
} from "./viewport";

export interface CanvasSize {
  width: number;
  height: number;
}

interface ViewportContextValue {
  viewport: Viewport;
  setViewport: Dispatch<SetStateAction<Viewport>>;
  canvasSize: CanvasSize;
  setCanvasSize: Dispatch<SetStateAction<CanvasSize>>;
  fitToBounds: (bounds?: Bounds, padding?: number) => void;
  fitToWorkspace: (padding?: number) => void;
  centerOrigin: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const ViewportContext =
  createContext<ViewportContextValue | null>(null);

export function ViewportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(() => {
    if (typeof window !== "undefined") {
      return {
        width: Math.max(window.innerWidth - 48, 100),
        height: Math.max(window.innerHeight - 80, 100),
      };
    }
    return { width: 800, height: 600 };
  });

  const [viewport, setViewport] = useState<Viewport>(() => {
    const width =
      typeof window !== "undefined"
        ? Math.max(window.innerWidth - 48, 100)
        : 800;
    const height =
      typeof window !== "undefined"
        ? Math.max(window.innerHeight - 80, 100)
        : 600;

    return fitBounds(
      DEFAULT_WORLD_BOUNDS,
      width,
      height,
      DEFAULT_PADDING,
    );
  });

  const fitToBounds = useCallback(
    (bounds: Bounds = DEFAULT_WORLD_BOUNDS, padding = DEFAULT_PADDING) => {
      if (canvasSize.width > 0 && canvasSize.height > 0) {
        setViewport(
          fitBounds(bounds, canvasSize.width, canvasSize.height, padding),
        );
      }
    },
    [canvasSize.width, canvasSize.height],
  );

  const fitToWorkspace = useCallback(
    (padding = DEFAULT_PADDING) => {
      fitToBounds(DEFAULT_WORLD_BOUNDS, padding);
    },
    [fitToBounds],
  );

  const centerOrigin = useCallback(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setViewport((current) =>
        computeCenterOrigin(
          canvasSize.width,
          canvasSize.height,
          current.zoom,
        ),
      );
    }
  }, [canvasSize.width, canvasSize.height]);

  const zoomIn = useCallback(() => {
    setViewport((current) => {
      const nextZoom = Math.min(current.zoom * 1.25, MAX_ZOOM);
      const centerPoint = {
        x: canvasSize.width > 0 ? canvasSize.width / 2 : 400,
        y: canvasSize.height > 0 ? canvasSize.height / 2 : 300,
      };
      return zoomAtPoint(current, centerPoint, nextZoom);
    });
  }, [canvasSize.width, canvasSize.height]);

  const zoomOut = useCallback(() => {
    setViewport((current) => {
      const nextZoom = Math.max(current.zoom / 1.25, MIN_ZOOM);
      const centerPoint = {
        x: canvasSize.width > 0 ? canvasSize.width / 2 : 400,
        y: canvasSize.height > 0 ? canvasSize.height / 2 : 300,
      };
      return zoomAtPoint(current, centerPoint, nextZoom);
    });
  }, [canvasSize.width, canvasSize.height]);

  return (
    <ViewportContext.Provider
      value={{
        viewport,
        setViewport,
        canvasSize,
        setCanvasSize,
        fitToBounds,
        fitToWorkspace,
        centerOrigin,
        zoomIn,
        zoomOut,
      }}
    >
      {children}
    </ViewportContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useViewport() {
  const context = useContext(ViewportContext);

  if (!context) {
    throw new Error(
      "useViewport must be used inside ViewportProvider",
    );
  }

  return context;
}