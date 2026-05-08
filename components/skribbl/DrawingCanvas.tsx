"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

const W = 720;
const H = 480;

export const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#facc15", "#16a34a",
  "#06b6d4", "#3b82f6", "#7c5cff", "#ec4899", "#8b4513", "#94a3b8",
];

export type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

export type DrawingMessage =
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear" };

export function DrawingCanvas({
  canDraw,
  channel,
}: {
  canDraw: boolean;
  channel: RealtimeChannel | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");

  // Render a stroke onto the local canvas.
  const renderStroke = (s: Stroke) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || s.points.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  // Listen for incoming broadcast strokes from the drawer.
  useEffect(() => {
    if (!channel) return;
    const handler = (payload: { event: string; payload: DrawingMessage }) => {
      const msg = payload.payload;
      if (msg.type === "stroke") renderStroke(msg.stroke);
      else if (msg.type === "clear") clearCanvas();
    };
    channel.on("broadcast", { event: "draw" }, handler);
    return () => {
      // No off() in supabase-js for individual handlers; channel teardown
      // is owned by the parent.
    };
  }, [channel]);

  const sendStroke = (stroke: Stroke) => {
    if (!channel) return;
    channel.send({
      type: "broadcast",
      event: "draw",
      payload: { type: "stroke", stroke } satisfies DrawingMessage,
    });
  };

  const sendClear = () => {
    if (!channel) return;
    channel.send({
      type: "broadcast",
      event: "draw",
      payload: { type: "clear" } satisfies DrawingMessage,
    });
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = getPos(e);
    const c = tool === "eraser" ? "#ffffff" : color;
    const w = tool === "eraser" ? width * 4 : width;
    currentStroke.current = { color: c, width: w, points: [p] };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !currentStroke.current || !canDraw) return;
    const p = getPos(e);
    currentStroke.current.points.push(p);
    // Draw incrementally for instant feedback (don't redraw the whole stroke each move)
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && currentStroke.current.points.length >= 2) {
      const pts = currentStroke.current.points;
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      ctx.strokeStyle = currentStroke.current.color;
      ctx.lineWidth = currentStroke.current.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !currentStroke.current) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    drawingRef.current = false;
    // Broadcast the completed stroke to everyone else.
    sendStroke(currentStroke.current);
    currentStroke.current = null;
  };

  const handleClear = () => {
    if (!canDraw) return;
    clearCanvas();
    sendClear();
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-white shadow-2xl">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`w-full block ${canDraw ? "cursor-crosshair" : "cursor-default"}`}
          style={{ aspectRatio: `${W}/${H}`, touchAction: "none" }}
        />
        {!canDraw && (
          <div className="absolute top-3 left-3 px-3 py-1 rounded-md bg-black/60 text-white text-xs font-bold backdrop-blur-sm">
            👀 Watching
          </div>
        )}
      </div>

      {canDraw && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  setTool("brush");
                }}
                aria-label={`Color ${c}`}
                className={`w-7 h-7 rounded-md border-2 transition-transform ${
                  tool === "brush" && color === c
                    ? "scale-110 border-white"
                    : "border-[var(--border)] hover:scale-105"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {[2, 4, 8, 16].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                aria-label={`Brush ${w}`}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  width === w
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
                }`}
              >
                <span
                  className="rounded-full bg-white"
                  style={{ width: w, height: w }}
                />
              </button>
            ))}
            <div className="w-px h-6 bg-[var(--border)] mx-1" />
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                tool === "eraser"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-white"
              }`}
            >
              Eraser
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-red-500/15 text-red-300 hover:bg-red-500 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
