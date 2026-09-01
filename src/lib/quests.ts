export type Quest = {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  rewardOlC: number;
  difficulty: "Easy" | "Moderate" | "Hard";
  region: string;
};

/** Demo quests for the map — illustrative outdoor locations only. */
export const DEMO_QUESTS: Quest[] = [
  {
    id: "q1",
    title: "Moab Rim Sunrise",
    description: "Reach the overlook at sunrise and log your location proof.",
    lat: 38.5733,
    lng: -109.5498,
    rewardOlC: 250,
    difficulty: "Moderate",
    region: "Utah, USA",
  },
  {
    id: "q2",
    title: "Death Valley Dunes Traverse",
    description: "Complete a dunes traverse and check in at the trail marker.",
    lat: 36.5054,
    lng: -117.0794,
    rewardOlC: 400,
    difficulty: "Hard",
    region: "California, USA",
  },
  {
    id: "q3",
    title: "Banff Icefields Edge",
    description: "Explore the parkway edge and capture your adventure proof.",
    lat: 51.4968,
    lng: -115.9281,
    rewardOlC: 350,
    difficulty: "Moderate",
    region: "Alberta, Canada",
  },
  {
    id: "q4",
    title: "Patagonia Wind Pass",
    description: "Cross the pass checkpoint and submit location evidence.",
    lat: -49.3315,
    lng: -72.8864,
    rewardOlC: 500,
    difficulty: "Hard",
    region: "Chile / Argentina",
  },
  {
    id: "q5",
    title: "Sahara Oasis Trail",
    description: "Find the oasis waypoint and log your overland stop.",
    lat: 31.7917,
    lng: -7.0926,
    rewardOlC: 300,
    difficulty: "Moderate",
    region: "Morocco",
  },
  {
    id: "q6",
    title: "Outback Red Center",
    description: "Reach the red-center marker and complete the check-in.",
    lat: -23.698,
    lng: 133.8807,
    rewardOlC: 450,
    difficulty: "Hard",
    region: "Northern Territory, AU",
  },
  {
    id: "q7",
    title: "Coastal Fjord Camp",
    description: "Camp at the fjord lookout and verify your stay.",
    lat: 62.1015,
    lng: 7.0618,
    rewardOlC: 200,
    difficulty: "Easy",
    region: "Norway",
  },
  {
    id: "q8",
    title: "Atlas Crest Viewpoint",
    description: "Summit the crest viewpoint for a location reward.",
    lat: 31.0601,
    lng: -7.915,
    rewardOlC: 275,
    difficulty: "Moderate",
    region: "High Atlas, Morocco",
  },
];
