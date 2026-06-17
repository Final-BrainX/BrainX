"use client";

import { useEffect, useRef } from "react";
import { useViewport } from "@xyflow/react";

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  alpha: number;
};

export function UniverseBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { x, y, zoom } = useViewport();
  const starsRef = useRef<Star[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    
    window.addEventListener("resize", resize);
    resize();

    if (starsRef.current.length === 0) {
      for (let i = 0; i < 800; i++) {
        starsRef.current.push({
          x: Math.random() * 3000 - 1500, // wider area
          y: Math.random() * 3000 - 1500,
          z: Math.random() * 100 + 1, // depth 1 to 100
          size: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.1 + 0.02,
          alpha: Math.random() * 0.5 + 0.2,
        });
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep space background
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      starsRef.current.forEach((star) => {
        // Slow natural drift
        star.y -= star.speed;
        if (star.y < -1500) star.y = 1500;
        
        // Parallax effect driven by React Flow viewport
        // The further away (higher Z), the slower it moves when panning
        const parallaxFactor = 50 / star.z; 
        
        const drawX = cx + (star.x + x * parallaxFactor) * (zoom * 0.5 + 0.5);
        const drawY = cy + (star.y + y * parallaxFactor) * (zoom * 0.5 + 0.5);

        // Render only if within bounds roughly
        if (drawX >= -10 && drawX <= width + 10 && drawY >= -10 && drawY <= height + 10) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
          ctx.arc(drawX, drawY, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [x, y, zoom]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
