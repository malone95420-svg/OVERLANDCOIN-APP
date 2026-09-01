/**
 * Quest map basemap (tile layer) definitions + localStorage persistence.
 * All layers are key-free public tile endpoints (no Mapbox/Google Maps keys).
 */

export type BasemapId = "street" | "topo" | "satellite" | "outdoors";

export type BasemapDef = {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string | string[];
};

export const BASEMAP_STORAGE_KEY = "overlandcoin.map.basemap.v2";

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  street: {
    id: "street",
    label: "Street",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
  topo: {
    id: "topo",
    label: "Topo",
    // Esri World Topo Map — public ArcGIS tiles, no API key
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
    maxZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  outdoors: {
    id: "outdoors",
    label: "Outdoors",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
};

export const BASEMAP_ORDER: BasemapId[] = ["street", "topo", "satellite", "outdoors"];

export function isBasemapId(value: unknown): value is BasemapId {
  return (
    value === "street" ||
    value === "topo" ||
    value === "satellite" ||
    value === "outdoors"
  );
}

export function loadBasemapId(): BasemapId {
  if (typeof window === "undefined") return "street";
  try {
    const raw = localStorage.getItem(BASEMAP_STORAGE_KEY);
    if (isBasemapId(raw)) return raw;
    // migrate v1 storage key if present
    const legacy = localStorage.getItem("overlandcoin.map.basemap.v1");
    if (isBasemapId(legacy)) {
      localStorage.setItem(BASEMAP_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return "street";
}

export function saveBasemapId(id: BasemapId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BASEMAP_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
