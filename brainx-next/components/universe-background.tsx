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
  const viewportRef = useRef({ x, y, zoom });

  useEffect(() => {
    viewportRef.current = { x, y, zoom };
  }, [x, y, zoom]);

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
          x: Math.random() * 3000 - 1500,
          y: Math.random() * 3000 - 1500,
          z: Math.random() * 100 + 1,
          size: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.1 + 0.02,
          alpha: Math.random() * 0.5 + 0.2,
        });
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const { x, y, zoom } = viewportRef.current;

      starsRef.current.forEach((star) => {
        star.y -= star.speed;
        if (star.y < -1500) star.y = 1500;

        const parallaxFactor = 50 / star.z;

        const drawX = cx + (star.x + x * parallaxFactor) * (zoom * 0.5 + 0.5);
        const drawY = cy + (star.y + y * parallaxFactor) * (zoom * 0.5 + 0.5);

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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
