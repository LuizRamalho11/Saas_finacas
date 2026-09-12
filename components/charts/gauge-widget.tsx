"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GaugeWidgetProps {
  /** 0 a 1 */
  progress: number;
  label: string;
  caption?: string;
  /** Texto exibido no centro. Se ausente, mostra o percentual. */
  display?: string;
  colorVar?: string;
  /** Marca um alvo no trilho (0 a 1), ex.: ritmo esperado da meta. */
  markerAt?: number;
  size?: number;
  className?: string;
}

/**
 * Medidor circular em SVG puro (arco de 270°), com trilho, gradiente e
 * ponteiro no fim do arco — o widget "gauge" das referências.
 */
export function GaugeWidget({
  progress,
  label,
  caption,
  display,
  colorVar = "--brand",
  markerAt,
  size = 184,
  className,
}: GaugeWidgetProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const sweep = 270; // arco aberto na base
  const circumference = 2 * Math.PI * radius;
  const arcLength = (sweep / 360) * circumference;
  const gradientId = React.useId();

  const pointAt = (fraction: number, distance: number) => {
    const angle = (135 + fraction * sweep) * (Math.PI / 180);
    return [center + distance * Math.cos(angle), center + distance * Math.sin(angle)] as const;
  };

  const [knobX, knobY] = pointAt(clamped, radius);
  const marker = markerAt === undefined ? null : {
    inner: pointAt(Math.min(1, Math.max(0, markerAt)), radius - stroke / 2 - 1),
    outer: pointAt(Math.min(1, Math.max(0, markerAt)), radius + stroke / 2 + 1),
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label}: ${Math.round(clamped * 100)}%`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={`hsl(var(${colorVar}) / 0.55)`} />
              <stop offset="100%" stopColor={`hsl(var(${colorVar}))`} />
            </linearGradient>
          </defs>
          <g transform={`rotate(135 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="hsl(var(--surface-2))"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLength * clamped} ${circumference}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          </g>
          {marker ? (
            <line
              x1={marker.inner[0]}
              y1={marker.inner[1]}
              x2={marker.outer[0]}
              y2={marker.outer[1]}
              stroke="hsl(var(--fg-subtle))"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
          <circle cx={knobX} cy={knobY} r={5} fill="hsl(var(--surface))" stroke={`hsl(var(${colorVar}))`} strokeWidth={3} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          <span className="text-2xl font-semibold tabular tracking-tight text-foreground">
            {display ?? `${Math.round(clamped * 100)}%`}
          </span>
          <span className="max-w-[7rem] text-[11px] leading-tight text-muted-foreground">{label}</span>
        </div>
      </div>
      {caption ? <p className="text-center text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
