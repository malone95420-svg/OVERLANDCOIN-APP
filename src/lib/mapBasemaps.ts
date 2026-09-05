/**
 * Quest map basemap (tile layer) definitions + localStorage persistence.
 * All layers are key-free public tile endpoints (no Mapbox/Google Maps keys).
 */

export type BasemapId = "satellite" | "topo" | "street" | "voyager";

export type BasemapDef = {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string | string[];
};

export const BASEMAP_STORAGE_KEY = "overlandcoin.map.basemap.v4";

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
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
  street: {
    id: "street",
    label: "Street",
    // Esri Canvas World Dark Gray Base — dark theme matching app, no API key
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
  voyager: {
    id: "voyager",
    label: "Voyager",
    // CartoCDN Voyager — free public tiles, no API key
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  },
};

/** Base44 order: Satellite | Topo | Street | Voyager */
export const BASEMAP_ORDER: BasemapId[] = ["satellite", "topo", "street", "voyager"];

export function isBasemapId(value: unknown): value is BasemapId {
  return (
    value === "satellite" ||
    value === "topo" ||
    value === "street" ||
    value === "voyager"
  );
}

/** Map legacy outdoor/outdoors ids to voyager. */
function migrateLegacy(raw: string | null): BasemapId | null {
  if (!raw) return null;
  if (isBasemapId(raw)) return raw;
  if (raw === "outdoors" || raw === "outdoor") return "voyager";
  return null;
}

export function loadBasemapId(): BasemapId {
  if (typeof window === "undefined") return "street";
  try {
    const raw = localStorage.getItem(BASEMAP_STORAGE_KEY);
    const migrated = migrateLegacy(raw);
    if (migrated) return migrated;
    for (const legacyKey of [
      "overlandcoin.map.basemap.v3",
      "overlandcoin.map.basemap.v2",
      "overlandcoin.map.basemap.v1",
    ]) {
      const legacy = migrateLegacy(localStorage.getItem(legacyKey));
      if (legacy) {
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
