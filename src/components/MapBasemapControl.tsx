"use client";

import { BASEMAP_ORDER, BASEMAPS, type BasemapId } from "@/lib/mapBasemaps";

type Props = {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  /** Base44 places this bottom-center on the map. */
  placement?: "bottom-center" | "top-right";
};

export function MapBasemapControl({
  value,
  onChange,
  placement = "bottom-center",
}: Props) {
  const pos =
    placement === "bottom-center"
      ? "bottom-3 left-1/2 -translate-x-1/2"
      : "right-3 top-3";

  return (
    <div
      className={`pointer-events-auto absolute z-[1000] flex overflow-hidden rounded-full border border-white/15 bg-black/70 shadow-lg backdrop-blur-md ${pos}`}
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
            className={`px-3 py-1.5 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-xs ${
              active
                ? "bg-white text-slate-900"
                : "text-slate-200 hover:bg-white/10 hover:text-white"
            }`}
          >
            {BASEMAPS[id].label}
          </button>
        );
      })}
    </div>
  );
}
