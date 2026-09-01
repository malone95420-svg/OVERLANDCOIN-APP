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

export const BASEMAP_STORAGE_KEY = "overlandcoin.map.basemap.v3";

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  street: {
    id: "street",
    label: "Street",
    // Esri Canvas World Dark Gray Base — dark theme matching app, no API key
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
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
    // OpenTopoMap — key-free topographic tiles
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    subdomains: "abc",
    maxZoom: 17,
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
    // migrate earlier storage keys if present
    for (const legacyKey of [
      "overlandcoin.map.basemap.v2",
      "overlandcoin.map.basemap.v1",
    ]) {
      const legacy = localStorage.getItem(legacyKey);
      if (isBasemapId(legacy)) {
        localStorage.setItem(BASEMAP_STORAGE_KEY, legacy);
        return legacy;
      }
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
