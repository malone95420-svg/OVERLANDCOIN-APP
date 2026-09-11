#!/usr/bin/env python3
"""Give every quest a real About-this-location paragraph, keep people on public/safe access, bump rewards +200."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUEST_DIR = ROOT / "src" / "data" / "quests"

REWARD = {"Easy": 225, "Moderate": 275, "Hard": 350, "Legendary": 600}

GENERIC_RE = re.compile(
    r"Stock vehicles often OK|verify fire rules|Camp site waypoint in|"
    r"Park / recreation site in|High-clearance helpful on approach spurs|"
    r"Rated (Hard|Legendary|Moderate|Easy)|Dispersed / developed camp access",
    re.I,
)

SAFETY_RE = re.compile(
    r"\b(stay (on|behind|off)|public (land|road|access|park)|do not trespass|"
    r"pack out|check (weather|road|conditions|fire|current)|permit|"
    r"recovery|extra water|turn around|signed|legal route|boardwalk|"
    r"closures?|rope|high clearance|do not attempt|walk them first)\b",
    re.I,
)

STATE = {
    "alabama": "Alabama pine hills and Gulf-coast public land",
    "alaska": "Alaska, where distance and weather matter more than any single obstacle",
    "arizona": "Arizona red-rock, saguaro, and pine-rim country",
    "arkansas": "the Arkansas Ozarks and river-bluff national forest",
    "california": "California public land from coast to Sierra to desert",
    "colorado": "Colorado high country and mining-road basins",
    "connecticut": "Connecticut woodlands and shoreline parks",
    "delaware": "Delaware bay-shore parks",
    "florida": "Florida sand roads, springs, and subtropical preserves",
    "georgia": "Georgia's southern Appalachians and coastal-plain woods",
    "hawaii": "Hawaiʻi volcanic coasts and island parks",
    "idaho": "Idaho forest-service country and lava plains",
    "illinois": "Illinois river bluffs and prairie preserves",
    "indiana": "Indiana dunes and hardwood state forest",
    "iowa": "Iowa loess hills and river-corridor parks",
    "kansas": "Kansas high plains and chalk-badland gravel",
    "kentucky": "Kentucky ridge-and-hollow forest",
    "louisiana": "Louisiana swamp, levee roads, and Gulf marsh",
    "maine": "Maine's granite coast and north woods",
    "maryland": "Maryland Piedmont and Chesapeake parks",
    "massachusetts": "Massachusetts coastal preserves and state forest",
    "michigan": "Michigan dunes, two-tracks, and north-woods loops",
    "minnesota": "Minnesota lake country and prairie edges",
    "mississippi": "Mississippi pine belt and river bluffs",
    "missouri": "Missouri Ozark hollows and forest gravel",
    "montana": "Montana high plains and Rocky Mountain approaches",
    "nebraska": "Nebraska Sandhills and river-bluff gravel",
    "nevada": "Nevada basin-and-range valleys and playas",
    "new hampshire": "New Hampshire notches and granite forest",
    "new jersey": "New Jersey pinelands and Highlands",
    "new mexico": "New Mexico mesas, bosque, and malpais",
    "new york": "New York Adirondacks, gorges, and state forest",
    "north carolina": "North Carolina Blue Ridge and coastal plain",
    "north dakota": "North Dakota badlands and prairie potholes",
    "ohio": "Ohio gorges and lake-shore parks",
    "oklahoma": "Oklahoma cross-timbers and Wichita granite",
    "oregon": "Oregon Cascades, high desert, and Pacific edge",
    "pennsylvania": "Pennsylvania ridge-and-valley forest",
    "rhode island": "Rhode Island coastal preserves",
    "south carolina": "South Carolina low country and piedmont forest",
    "south dakota": "South Dakota Badlands and Black Hills",
    "tennessee": "Tennessee plateau, Smokies foothills, and river gorges",
    "texas": "Texas Hill Country, Trans-Pecos, and Gulf prairie",
    "utah": "Utah slickrock, canyon country, and high plateaus",
    "vermont": "Vermont Green Mountain forest",
    "virginia": "Virginia Blue Ridge and Shenandoah country",
    "washington": "Washington Cascades, Olympics, and Columbia country",
    "west virginia": "West Virginia highlands and river gorges",
    "wisconsin": "Wisconsin north woods and driftless ridges",
    "wyoming": "Wyoming high plains, ranges, and long BLM tracks",
}

PROVINCE = {
    "alberta": "Alberta's Rockies front and prairie meeting the mountains",
    "british columbia": "British Columbia coast mountains and interior plateau",
    "manitoba": "Manitoba boreal shield and prairie lakes",
    "new brunswick": "New Brunswick forest and Fundy shore",
    "newfoundland and labrador": "Newfoundland and Labrador headlands and barrens",
    "northwest territories": "Northwest Territories highway country with hours between services",
    "nova scotia": "Nova Scotia highlands and Atlantic parks",
    "nunavut": "Nunavut tundra and community access",
    "ontario": "Ontario Shield lakes and provincial-park road ends",
    "prince edward island": "Prince Edward Island shore parks",
    "quebec": "Québec Shield forest and river gorges",
    "saskatchewan": "Saskatchewan parkland and northern lakes",
    "yukon": "Yukon gravel highways and boreal valleys",
}

COUNTRY = {
    "argentina": "Argentina's Andes, lake district, and Ruta 40 country",
    "chile": "Chile's volcanoes, Atacama, and Patagonian wind",
    "bolivia": "Bolivia's altiplano and salt-flat high roads",
    "peru": "Peru's Andean valleys and desert coast",
    "colombia": "Colombia's cordillera parks and coffee highlands",
    "ecuador": "Ecuador's volcano avenue and cloud-forest road ends",
    "brazil": "Brazil's highland parks and Atlantic forest",
    "mexico": "Mexico's sierra backroads and desert coast",
    "iceland": "Iceland's volcanic plateau and weather-ruled F-roads",
    "norway": "Norway's fjord shelves and public right-to-roam country",
    "italy": "Italy's alpine passes and national-park trailheads",
    "france": "France's alpine cols and gorge roads",
    "spain": "Spain's sierras and park trailheads",
    "japan": "Japan's volcanic parks and signed public trails",
    "new zealand": "New Zealand conservation-estate road ends",
    "australia": "Australian outback tracks and coastal national parks",
    "namibia": "Namibia's gravel desert and dune seas",
    "morocco": "Morocco's Atlas passes and Sahara edges",
    "nepal": "Nepal Himalayan road heads",
    "indonesia": "Indonesia's volcanic parks and island reserves",
    "south africa": "South African cape, escarpment, and reserve gates",
}

# First match wins — specific before generic.
KINDS: list[tuple[str, re.Pattern[str]]] = [
    ("camp", re.compile(r"camp\s*grounds?|campsite|camping|rv park|day use", re.I)),
    ("trailhead", re.compile(r"trailhead", re.I)),
    ("overlook", re.compile(r"overlook|viewpoint|vista|lookout|wayside|pullout|pull-out", re.I)),
    ("hot spring", re.compile(r"hot springs?|hotspring|thermal", re.I)),
    ("ghost", re.compile(r"ghost town", re.I)),
    ("ohv", re.compile(r"\bohv\b|\batv\b|svra", re.I)),
    ("dunes", re.compile(r"dunes?", re.I)),
    ("glacier", re.compile(r"glacier", re.I)),
    ("falls", re.compile(r"falls|waterfall", re.I)),
    ("pass", re.compile(r"\bpass\b|\bcol\b", re.I)),
    ("canyon", re.compile(r"canyon|gorge", re.I)),
    ("forest road", re.compile(r"forest road|forestry road|\bfr[- ]?\d", re.I)),
    ("highway", re.compile(r"highway|byway|parkway|\bdrive\b|\brim drive\b", re.I)),
    ("beach", re.compile(r"\bbeach\b|\bshore\b", re.I)),
    ("ruins", re.compile(r"ruin|pueblo|mission|\bfort\b|historic", re.I)),
    ("park", re.compile(r"\bpark\b|monument|preserve|sanctuary|recreation site", re.I)),
    ("lake", re.compile(r"\blake\b|reservoir", re.I)),
    ("road", re.compile(r"\broad\b|\bloop\b|\btrack\b|\bspur\b|backroad", re.I)),
]


def pick(key: str, options: list[str]) -> str:
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return options[int(h[:8], 16) % len(options)]


def kind_of(title: str) -> str:
    for name, pat in KINDS:
        if pat.search(title):
            return name
    return "place"


def place_clause(region: str) -> str:
    r = region.lower()
    for k, v in STATE.items():
        if k in r:
            return v
    for k, v in PROVINCE.items():
        if k in r:
            return v
    for k, v in COUNTRY.items():
        if k in r:
            return v
    if "canada" in r:
        return "Canadian public parks and crown-land approaches"
    if "usa" in r:
        return "U.S. public land and signed recreation access"
    short = region.split("—")[0].strip()
    return short or "a public overland pin"


def terrain_bit(tags: list[str]) -> str | None:
    t = set(tags)
    if t & {"slickrock"}:
        return "Sandstone here grips when dry and turns slick in even a thin rain."
    if t & {"dunes", "sand"}:
        return "Soft sand will hide the track and swallow a street tire without much warning."
    if t & {"geothermal"}:
        return "Ground and runoff can scald — stay on signed paths and boardwalks."
    if t & {"cliff"}:
        return "Edges drop away fast; keep people, pets, and tires on the traveled line."
    if t & {"creek", "water"}:
        return "Water depth changes after every storm, so walk a crossing before you commit."
    if t & {"snow", "alpine", "high-alpine", "high-altitude"}:
        return "Altitude and fast weather changes are part of the route, not a footnote."
    if t & {"canyon"}:
        return "Canyon walls cut weather and signal; flash flood is the hidden risk."
    if t & {"remote", "arctic"}:
        return "Services and cell coverage are farther than they look on the map."
    if t & {"desert"}:
        return "Shade is scarce and afternoon heat is the real gatekeeper."
    if t & {"mud", "clay"}:
        return "Wet clay will glaze a tire and shove you off the line."
    if t & {"volcanic"}:
        return "Volcanic rock is sharp, loose, and hard on both tires and ankles."
    if t & {"wildlife"}:
        return "Wildlife lives here — store food, give animals room, and never feed them."
    if t & {"historic"}:
        return "Markers and ruins are fragile public history, not climbing holds."
    if t & {"beach"}:
        return "Tide, salt, and soft sand will strand anyone who ignores the clock."
    if t & {"jungle"}:
        return "Mud and close vegetation hide washouts until you are already in them."
    if t & {"rock", "technical", "ledge"}:
        return "Rock and ledge want slow tires and honest clearance."
    if t & {"dirt", "gravel"}:
        return "Packed dirt and gravel are fine until the first storm cuts ruts into them."
    if t & {"forest"}:
        return "Forest canopy hides the next water bar until you are on it."
    return None


def activity(kind: str, title: str, qid: str) -> str:
    table = {
        "camp": f"Use {title} as a legal camp or staging pad — established sites only, fires only where posted.",
        "trailhead": "Park in the signed lot. Completing the quest means reaching this public trailhead, not finishing a summit.",
        "overlook": "Stop fully in the pullout, take the view, and stay behind any rail or signed edge.",
        "hot spring": "Soak only in signed pools, keep soap out of the water, and watch for scalding runoff.",
        "ghost": "Look and photograph. Do not enter unstable buildings or take artifacts.",
        "ohv": "Stay on designated OHV routes — open country beside the trail is usually not legal riding.",
        "dunes": "Air down only where it is allowed, stay off fenced vegetation, and know the riding-area boundary.",
        "glacier": "View ice from signed paths. Unguided glacier travel is a different trip.",
        "falls": "Stay on platforms and rails. Wet rock beside a waterfall is not a viewpoint.",
        "pass": "Cross in good weather and keep the narrowest shelf clear. If the cloud is on the deck, wait or turn around.",
        "canyon": "Keep to the traveled canyon road or trail and skip narrows when weather is upstream.",
        "forest road": "Drive the numbered public forest road, yield to work traffic, and expect deadfall after wind.",
        "highway": "This is a public road pin — use official pullouts, never the travel lane.",
        "beach": "Check tide and park rules, stay off fenced dunes, and rinse salt off later.",
        "ruins": "Stay behind barriers and leave every artifact where it sits.",
        "lake": "Shore and overlook access is the quest. Launch boats only at signed ramps.",
        "park": "Stay on park roads and marked paths, and camp only where signs allow.",
        "road": "Drive the public alignment and stop only where you can get completely off the traveled way.",
        "place": f"Check in on public ground at {title} and leave no new tracks.",
    }
    return table.get(kind, table["place"])


def light_safety(difficulty: str) -> str:
    if difficulty == "Easy":
        return "Stay on signed public access, respect closures, and pack out what you bring."
    if difficulty == "Moderate":
        return "Stick to public roads and trails, and check weather and surface conditions before you commit."
    if difficulty == "Hard":
        return "Go prepared: public land only, extra water, recovery gear, and a current local road check."
    return (
        "Remote or expert country — check park or road status, stay on legal routes, "
        "and do not push weather, ice, or exposure you cannot reverse."
    )


def existing_is_good(desc: str) -> bool:
    d = (desc or "").strip()
    if len(d) < 160 or GENERIC_RE.search(d):
        return False
    if d.count(".") + d.count("!") + d.count("?") < 2:
        return False
    return True


def expand_stub(desc: str, title: str, region: str) -> str | None:
    d = re.sub(r"\s+", " ", (desc or "").strip())
    if not d or GENERIC_RE.search(d):
        return None
    if len(d) < 24:
        return None
    d = d.rstrip(".")
    if not re.search(r"\b(is|are|was|were|sits|sits|lies|marks|runs|climbs|crosses|protects|began)\b", d, re.I):
        return f"Local overlanders know it as {d[0].lower() + d[1:]}, in {region.split('—')[0].strip()}."
    return d + "."


def demote_unsafe_rating(q: dict) -> str:
    title = (q.get("title") or "").lower()
    region = (q.get("region") or "").lower()
    diff = q.get("difficulty") or "Easy"
    if diff not in ("Hard", "Legendary"):
        return diff
    is_camp = bool(re.search(r"camp\s*grounds?|campsite|rv park|picnic|day use", title))
    if not is_camp:
        return diff
    lower48 = ("usa" in region or bool(re.search(r", [a-z]{2}\b", region))) and "alaska" not in region
    if "rv park" in title or "picnic" in title:
        return "Easy"
    if lower48:
        return "Easy" if diff == "Legendary" else "Moderate"
    if diff == "Legendary":
        return "Moderate"
    return diff


def compose(q: dict) -> str:
    title = (q.get("title") or "").strip()
    region = (q.get("region") or "").strip() or "public land"
    qid = q.get("id") or title
    tags = list(q.get("terrainTags") or [])
    difficulty = q.get("difficulty") or "Easy"
    kind = kind_of(title)
    desc = q.get("description") or ""

    if existing_is_good(desc):
        text = desc.strip()
        if not SAFETY_RE.search(text):
            text = text.rstrip() + " " + light_safety(difficulty)
        return tidy(text)

    region_short = region.split("—")[0].strip()
    where = place_clause(region)
    openers = [
        f"{title} is a public overland pin in {region_short}.",
        f"{title} sits in {region_short}.",
        f"This quest checks you in at {title} in {region_short}.",
    ]
    opening = pick(qid + "o", openers)
    if where.lower() not in opening.lower():
        opening = opening[:-1] + f", in {where}."

    parts = [opening]
    stub = expand_stub(desc, title, region)
    if stub:
        parts.append(stub)
    bit = terrain_bit(tags)
    if bit and (not stub or bit.split()[0] not in stub):
        parts.append(bit)
    parts.append(activity(kind, title, qid))
    parts.append(light_safety(difficulty))
    return tidy(" ".join(parts))


def tidy(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace(" ,", ",").replace("..", ".").replace("— —", "—")
    text = re.sub(r"\bin in ", "in ", text)
    # drop duplicate consecutive sentences
    sents = re.split(r"(?<=[.!?])\s+", text)
    out: list[str] = []
    seen: set[str] = set()
    for s in sents:
        key = re.sub(r"[^a-z0-9]+", "", s.lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    text = " ".join(out)
    if len(text) > 700:
        text = " ".join(out[:3] + out[-1:])
    return text


def enrich_file(path: Path) -> dict:
    data = json.loads(path.read_text())
    changed_desc = 0
    changed_diff = 0
    for q in data:
        old_diff = q.get("difficulty")
        new_diff = demote_unsafe_rating(q)
        if new_diff != old_diff:
            q["difficulty"] = new_diff
            changed_diff += 1
        new_desc = compose(q)
        if new_desc != (q.get("description") or ""):
            q["description"] = new_desc
            changed_desc += 1
        q["rewardOlC"] = REWARD.get(q.get("difficulty") or "Easy", REWARD["Easy"])
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return {"file": path.name, "n": len(data), "desc": changed_desc, "diff": changed_diff}


def main() -> None:
    for s in map(enrich_file, sorted(QUEST_DIR.glob("*.json"))):
        print(f"{s['file']}: {s['n']} quests, {s['desc']} descriptions, {s['diff']} difficulty demotes")


if __name__ == "__main__":
    main()
