/**
 * Quest map basemap (tile layer) definitions + localStorage persistence.
 */

export type BasemapId = "street" | "topo" | "satellite";

export type BasemapDef = {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string | string[];
};

export const BASEMAP_STORAGE_KEY = "overlandcoin.map.basemap.v1";

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
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
    subdomains: "abc",
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
};

export const BASEMAP_ORDER: BasemapId[] = ["street", "topo", "satellite"];

export function isBasemapId(value: unknown): value is BasemapId {
  return value === "street" || value === "topo" || value === "satellite";
}

export function loadBasemapId(): BasemapId {
  if (typeof window === "undefined") return "street";
  try {
    const raw = localStorage.getItem(BASEMAP_STORAGE_KEY);
    if (isBasemapId(raw)) return raw;
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
