import { useState, useEffect } from 'react';

export function useCanvasSize(percentage: number = 0.9): number {
  const [canvasSize, setCanvasSize] = useState(0);

  useEffect(() => {
    const updateSize = () => {
      // Get percentage of the viewport
      const vw = window.innerWidth * percentage;
      const vh = window.innerHeight * percentage;

      // Use the smaller dimension to maintain square aspect ratio
      const size = Math.min(vw, vh);
      setCanvasSize(size);
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [percentage]);

  return canvasSize;
}
