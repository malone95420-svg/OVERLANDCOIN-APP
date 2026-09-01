"use client";

import { BASEMAP_ORDER, BASEMAPS, type BasemapId } from "@/lib/mapBasemaps";

type Props = {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
};

export function MapBasemapControl({ value, onChange }: Props) {
  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-lg border border-border bg-bg-panel/95 shadow-lg backdrop-blur-sm"
      role="group"
      aria-label="Map basemap"
    >
      {BASEMAP_ORDER.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-cyan-accent/20 text-cyan-accent"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {BASEMAPS[id].label}
          </button>
        );
      })}
    </div>
  );
}
