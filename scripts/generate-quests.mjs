/**
 * Generates src/data/quests/seed.json with realistic overland waypoints.
 *
 * Sources:
 *  1) Hand-curated LOCATIONS (classic overland corridors)
 *  2) OpenStreetMap Overpass API (trailhead / camp / viewpoint / picnic / hut)
 *  3) GeoNames US+CA dumps as a reliable fallback when Overpass is flaky
 *
 * Wyoming is oversampled (~400–700 of new quests). Dedupes within ~150m.
 * Run: node scripts/generate-quests.mjs
 */
/** Known real-world trailheads / parks / overland corridors [title, region, lat, lng, difficulty, minTier, terrainTags[], desc] */
const LOCATIONS = [
  // USA Southwest
  ["Moab Rim Overlook", "Utah, USA", 38.5733, -109.5498, "Moderate", 2, ["rock","desert"], "Overlook above Moab — graded access with rocky sections."],
  ["Gemini Bridges Trailhead", "Utah, USA", 38.5915, -109.6621, "Moderate", 2, ["rock","dirt"], "Classic Moab sandstone trailhead."],
  ["Poison Spider Mesa", "Utah, USA", 38.5748, -109.615, "Hard", 4, ["rock","ledge"], "Technical mesa trail — high clearance + lockers recommended."],
  ["Hell's Revenge Trailhead", "Utah, USA", 38.5695, -109.505, "Legendary", 5, ["slickrock","extreme"], "Iconic Moab slickrock — Extreme builds only."],
  ["White Rim Road (Island in the Sky)", "Utah, USA", 38.459, -109.821, "Hard", 3, ["desert","dirt"], "Canyonlands White Rim — long remote dirt road."],
  ["Elephant Hill Trailhead", "Utah, USA", 38.146, -109.854, "Legendary", 5, ["rock","technical"], "Needles District — notorious steep rock steps."],
  ["Shafer Trail Overlook", "Utah, USA", 38.453, -109.812, "Hard", 3, ["cliff","dirt"], "Switchbacks off Island in the Sky mesa."],
  ["Fins & Things Trailhead", "Utah, USA", 38.575, -109.48, "Hard", 4, ["slickrock"], "Sand Hollow–style fins near Moab."],
  ["Onion Creek Road", "Utah, USA", 38.696, -109.33, "Moderate", 2, ["canyon","dirt"], "Scenic creek canyon drive east of Moab."],
  ["Kane Creek Boulevard", "Utah, USA", 38.545, -109.575, "Hard", 3, ["rock","dirt"], "Along the Colorado River cliffs."],
  ["Hole in the Rock Road", "Utah, USA", 37.426, -111.356, "Moderate", 2, ["desert","remote"], "Grand Staircase long dirt corridor."],
  ["Burr Trail Switchbacks", "Utah, USA", 37.855, -111.02, "Hard", 3, ["cliff","dirt"], "Steep switchbacks in Capitol Reef country."],
  ["Notch Peak Trailhead", "Utah, USA", 39.143, -113.408, "Moderate", 2, ["desert","dirt"], "House Range remote access."],
  ["Little Sahara Sand Dunes", "Utah, USA", 39.725, -112.355, "Hard", 3, ["sand"], "Sand play — A/T or M/T recommended."],
  ["Paiute ATV Trail (Circleville)", "Utah, USA", 38.17, -112.27, "Moderate", 2, ["dirt","forest"], "Long multi-use trail system."],
  // Arizona
  ["Sedona Schnebly Hill Road", "Arizona, USA", 34.87, -111.71, "Hard", 3, ["rock","redrock"], "Steep red-rock climb above Sedona."],
  ["Broken Arrow Trailhead", "Arizona, USA", 34.83, -111.745, "Hard", 4, ["rock","technical"], "Famous Sedona rock crawling corridor."],
  ["Mingus Mountain Forest Road", "Arizona, USA", 34.695, -112.125, "Moderate", 2, ["forest","dirt"], "Prescott NF high-country roads."],
  ["Apache Trail (AZ-88)", "Arizona, USA", 33.555, -111.35, "Moderate", 2, ["cliff","dirt"], "Historic Salt River canyon road."],
  ["Canyon de Chelly Overlook Road", "Arizona, USA", 36.14, -109.47, "Easy", 1, ["scenic"], "Paved/graded overlook approaches."],
  ["Monument Valley Visitor Approach", "Arizona / Utah, USA", 36.98, -110.11, "Easy", 1, ["desert","scenic"], "Iconic butte country — graded access."],
  ["Organ Pipe Cactus Scenic Loop", "Arizona, USA", 31.955, -112.8, "Moderate", 2, ["desert","dirt"], "Sonoran desert loop road."],
  ["Mogollon Rim Road", "Arizona, USA", 34.32, -110.95, "Moderate", 2, ["forest","dirt"], "High pine rim forest roads."],
  ["Turquoise Trail near Jerome", "Arizona, USA", 34.75, -112.11, "Moderate", 2, ["dirt","mountain"], "Mingus / Jerome backroads."],
  ["Lake Havasu Backcountry", "Arizona, USA", 34.48, -114.32, "Hard", 3, ["desert","sand"], "Colorado River desert tracks."],
  // California
  ["Death Valley Dunes (Mesquite)", "California, USA", 36.605, -117.115, "Moderate", 2, ["sand","desert"], "Mesquite Flat dunes access."],
  ["Racetrack Playa Road", "California, USA", 36.681, -117.56, "Hard", 3, ["wash","remote"], "Long washboard to the sailing stones."],
  ["Titus Canyon Road", "California, USA", 36.845, -117.05, "Hard", 3, ["canyon","one-way"], "One-way canyon through Grapevine Mtns."],
  ["Anza-Borrego Slot Canyon Area", "California, USA", 33.27, -116.25, "Hard", 3, ["desert","sand"], "Desert washes and slots."],
  ["Joshua Tree Geology Tour Road", "California, USA", 33.935, -116.07, "Moderate", 2, ["desert","dirt"], "Park geology auto tour."],
  ["Hungry Valley SVRA", "California, USA", 34.78, -118.85, "Hard", 3, ["dirt","ohv"], "State OHV recreation area."],
  ["Corral Canyon (Cleveland NF)", "California, USA", 32.75, -116.55, "Hard", 4, ["rock","mountain"], "Southern CA technical trails."],
  ["Fordyce Creek Trail", "California, USA", 39.35, -120.55, "Legendary", 5, ["rock","water"], "Sierra hardcore rock & water crossings."],
  ["Rubicon Trail (Wentworth Springs)", "California, USA", 39.01, -120.25, "Legendary", 5, ["granite","extreme"], "World-famous granite trail."],
  ["Owl Canyon Campground Roads", "California, USA", 34.95, -117.0, "Easy", 1, ["desert"], "Barstow desert camping access."],
  ["Alabama Hills Movie Road", "California, USA", 36.605, -118.11, "Easy", 1, ["scenic","dirt"], "Lone Pine classic dirt loops."],
  ["Saline Valley Warm Springs Road", "California, USA", 36.7, -117.85, "Hard", 3, ["remote","desert"], "Long remote Death Valley approach."],
  ["Panamint Valley Road", "California, USA", 36.1, -117.35, "Moderate", 2, ["desert"], "Desert valley corridor."],
  // Colorado / Rockies
  ["Alpine Loop (Lake City)", "Colorado, USA", 38.03, -107.38, "Hard", 3, ["high-alpine","dirt"], "San Juan high passes — Engineer / Cinnamon."],
  ["Imogene Pass", "Colorado, USA", 37.935, -107.73, "Hard", 4, ["high-alpine","rock"], "13k+ pass between Ouray and Telluride."],
  ["Black Bear Pass", "Colorado, USA", 37.895, -107.775, "Legendary", 5, ["cliff","extreme"], "One-way cliff shelf — Extreme only."],
  ["Yankee Boy Basin", "Colorado, USA", 37.98, -107.76, "Hard", 3, ["alpine","rock"], "Wildflower basin above Ouray."],
  ["Mosquito Pass", "Colorado, USA", 39.28, -106.16, "Hard", 3, ["high-alpine"], "Highest through-pass in CO."],
  ["Webster Pass", "Colorado, USA", 39.53, -105.82, "Hard", 3, ["alpine","dirt"], "Montezuma / Handcart Gulch area."],
  ["Mount Antero Road", "Colorado, USA", 38.675, -106.245, "Hard", 3, ["high-alpine"], "Gem-hunting high road."],
  ["Red Cone / Radical Hill", "Colorado, USA", 39.55, -105.85, "Legendary", 5, ["rock","extreme"], "Very steep alpine shelves."],
  ["Pearl Pass", "Colorado, USA", 39.02, -106.84, "Hard", 4, ["rock","alpine"], "Aspen to Crested Butte classic."],
  ["Schofield Pass", "Colorado, USA", 39.015, -107.05, "Hard", 3, ["forest","dirt"], "Crested Butte / Marble corridor."],
  ["Independence Pass Overlook", "Colorado, USA", 39.108, -106.564, "Easy", 1, ["scenic","paved"], "Scenic highway overlook (stock OK)."],
  ["Great Sand Dunes Medano Pass", "Colorado, USA", 37.79, -105.505, "Hard", 3, ["sand","creek"], "Creek + sand corridor through the dunes."],
  // Pacific NW
  ["Olympic Coast Mora Road Area", "Washington, USA", 47.91, -124.64, "Easy", 1, ["coast","forest"], "Coastal rainforest approaches."],
  ["Mount St. Helens Forest Roads", "Washington, USA", 46.2, -122.15, "Moderate", 2, ["volcanic","dirt"], "Blast-zone forest roads."],
  ["Oregon Dunes OHV", "Oregon, USA", 43.72, -124.17, "Hard", 3, ["sand","coast"], "Coastal dune riding."],
  ["Steens Mountain Loop", "Oregon, USA", 42.64, -118.58, "Moderate", 2, ["high-desert","dirt"], "Remote SE Oregon high desert."],
  ["Wallowa Mountains FR", "Oregon, USA", 45.27, -117.22, "Moderate", 2, ["forest","mountain"], "NE Oregon alpine forest roads."],
  ["Idaho Panther Creek Road", "Idaho, USA", 45.05, -114.35, "Hard", 3, ["remote","dirt"], "Frank Church wilderness edge."],
  ["Silver City Ghost Town Road", "Idaho, USA", 43.0, -116.73, "Moderate", 2, ["desert","historic"], "Owyhee ghost town approach."],
  ["Stanley Hot Springs Area Roads", "Idaho, USA", 44.22, -115.0, "Moderate", 2, ["forest"], "Sawtooth foothill access."],
  // Southwest more
  ["White Sands Access Road", "New Mexico, USA", 32.78, -106.17, "Easy", 1, ["sand","scenic"], "National park dune approaches."],
  ["Quebradas Backcountry Byway", "New Mexico, USA", 34.15, -106.75, "Moderate", 2, ["desert","dirt"], "Socorro County scenic byway."],
  ["Forest Road 191 (Gila)", "New Mexico, USA", 33.25, -108.25, "Hard", 3, ["forest","remote"], "Gila National Forest remote roads."],
  ["Chaco Canyon Approach", "New Mexico, USA", 36.06, -107.96, "Moderate", 2, ["dirt","washboard"], "Washboard county roads to Chaco."],
  ["Shiprock Overlook Area", "New Mexico, USA", 36.69, -108.84, "Easy", 1, ["desert","scenic"], "Navajo Nation landmark views."],
  ["Guadalupe Mountains Salt Basin", "Texas, USA", 31.9, -104.86, "Moderate", 2, ["desert"], "West Texas desert flats."],
  ["Big Bend River Road", "Texas, USA", 29.18, -103.0, "Hard", 3, ["desert","remote"], "Remote river corridor in Big Bend."],
  ["Big Bend Old Ore Road", "Texas, USA", 29.25, -103.05, "Hard", 3, ["desert","rock"], "Historic ore haul road."],
  ["Black Gap WMA Roads", "Texas, USA", 29.5, -102.9, "Hard", 3, ["desert","remote"], "Trans-Pecos wildlife management roads."],
  ["Caprock Canyons Trailway", "Texas, USA", 34.4, -101.05, "Easy", 1, ["canyon","dirt"], "Panhandle canyon country."],
  // Midwest / East mild
  ["Upper Peninsula Two Hearted", "Michigan, USA", 46.7, -85.42, "Moderate", 2, ["forest","sand"], "UP forest & sand roads."],
  ["Pictured Rocks Backroads", "Michigan, USA", 46.55, -86.35, "Moderate", 2, ["forest","dirt"], "Munising forest access."],
  ["Ozark National Forest FR", "Arkansas, USA", 35.7, -93.3, "Moderate", 2, ["forest","dirt"], "Ozark highland forest roads."],
  ["Ouachita Trail Forest Roads", "Arkansas / Oklahoma, USA", 34.7, -94.35, "Moderate", 2, ["forest"], "Ouachita Mountains FRs."],
  ["Tail of the Dragon Overlook", "Tennessee / North Carolina, USA", 35.495, -83.92, "Easy", 1, ["paved","scenic"], "Famous paved mountain road — stock OK."],
  ["Cherohala Skyway Pullouts", "Tennessee / North Carolina, USA", 35.35, -84.05, "Easy", 1, ["paved","scenic"], "High scenic parkway."],
  ["Dolly Sods Wilderness Roads", "West Virginia, USA", 39.02, -79.35, "Moderate", 2, ["forest","mud"], "Allegheny highland gravel."],
  ["Baxter State Park Perimeter", "Maine, USA", 45.9, -68.95, "Moderate", 2, ["forest","dirt"], "North Maine woods access."],
  ["White Mountain NF Roads", "New Hampshire, USA", 44.1, -71.3, "Moderate", 2, ["forest","dirt"], "White Mountains forest roads."],
  ["Adirondack Backroads", "New York, USA", 44.15, -74.3, "Moderate", 2, ["forest"], "ADK dirt & seasonal roads."],
  // Alaska / Canada
  ["Denali Park Road (Savage)", "Alaska, USA", 63.72, -149.3, "Easy", 1, ["scenic","gravel"], "Park road to Savage River."],
  ["Dalton Highway Coldfoot", "Alaska, USA", 67.25, -150.2, "Hard", 3, ["remote","gravel"], "Haul Road arctic corridor."],
  ["Taylor Highway Chicken", "Alaska, USA", 64.07, -141.94, "Moderate", 2, ["remote","gravel"], "Top of the World Highway approach."],
  ["McCarthy Road", "Alaska, USA", 61.43, -142.92, "Hard", 3, ["remote","gravel"], "Wrangell-St. Elias access."],
  ["Banff Icefields Parkway Pullout", "Alberta, Canada", 51.4968, -115.9281, "Easy", 1, ["scenic","paved"], "Columbia Icefield corridor overlooks."],
  ["Kananaskis Forestry Roads", "Alberta, Canada", 50.65, -115.0, "Moderate", 2, ["forest","dirt"], "Front Range forestry roads."],
  ["Mackenzie Highway Edge", "NWT, Canada", 61.5, -118.5, "Moderate", 2, ["remote","gravel"], "Northern gravel highway."],
  ["Demoster Highway Tombstone", "Yukon, Canada", 64.45, -138.22, "Hard", 3, ["remote","arctic"], "Arctic Circle gravel adventure."],
  ["Trans-Labrador Highway", "Newfoundland & Labrador, Canada", 53.3, -60.3, "Moderate", 2, ["remote","gravel"], "Long remote eastern gravel."],
  ["Cabot Trail Highlands", "Nova Scotia, Canada", 46.75, -60.6, "Easy", 1, ["scenic","paved"], "Cape Breton coastal loop."],
  ["Jasper Maligne Lake Road", "Alberta, Canada", 52.73, -117.64, "Easy", 1, ["scenic"], "Maligne Lake scenic access."],
  ["Chilcotin Backroads", "British Columbia, Canada", 51.8, -123.5, "Hard", 3, ["remote","dirt"], "BC interior plateau tracks."],
  // Mexico / Central
  ["Baja Cataviña Boulder Field", "Baja California, Mexico", 29.73, -114.72, "Moderate", 2, ["desert","dirt"], "Central Baja desert highway side roads."],
  ["Bahía de los Ángeles Spur", "Baja California, Mexico", 28.95, -113.56, "Moderate", 2, ["desert","coast"], "Sea of Cortez spur road."],
  ["Sierra de la Laguna Foothills", "Baja California Sur, Mexico", 23.5, -109.95, "Hard", 3, ["mountain","dirt"], "Cabo hinterland mountain tracks."],
  ["Copper Canyon Rim Roads", "Chihuahua, Mexico", 27.5, -107.8, "Hard", 3, ["canyon","dirt"], "Barrancas del Cobre rim tracks."],
  ["Yucatán Cenote Backroads", "Quintana Roo, Mexico", 20.6, -87.45, "Easy", 1, ["jungle","dirt"], "Jungle tracks to cenotes."],
  // South America
  ["Patagonia Wind Pass (Torres)", "Chile / Argentina", -50.94, -72.97, "Hard", 3, ["patagonia","wind"], "Torres del Paine approach roads."],
  ["Ruta 40 Perito Moreno Area", "Santa Cruz, Argentina", -49.3, -72.0, "Moderate", 2, ["patagonia","gravel"], "Legendary Ruta 40 gravel sections."],
  ["Carretera Austral Villa O'Higgins", "Aysén, Chile", -48.47, -72.56, "Hard", 3, ["remote","gravel"], "End of the Austral highway."],
  ["Salar de Uyuni Access", "Potosí, Bolivia", -20.46, -66.83, "Hard", 3, ["saltflat","high-altitude"], "Salt flat corridors — high altitude."],
  ["Atacama Valle de la Luna", "Antofagasta, Chile", -22.92, -68.3, "Easy", 1, ["desert","scenic"], "Moon Valley scenic approaches."],
  ["Ruta del Fin del Mundo", "Tierra del Fuego, Argentina", -54.8, -68.3, "Moderate", 2, ["patagonia","remote"], "Near Ushuaia end-of-world roads."],
  ["Laguna Colorada Approach", "Potosí, Bolivia", -22.2, -67.77, "Hard", 3, ["high-altitude","remote"], "Altiplano colored lagoon."],
  ["Cordillera Blanca Spur", "Ancash, Peru", -9.45, -77.55, "Hard", 3, ["andes","dirt"], "High Andean valley spurs."],
  ["Lençóis Maranhenses Edge", "Maranhão, Brazil", -2.55, -43.0, "Hard", 3, ["sand","coast"], "Sand dune park periphery."],
  ["Chapada Diamantina Roads", "Bahia, Brazil", -12.6, -41.4, "Moderate", 2, ["plateau","dirt"], "Brazilian plateau dirt roads."],
  // Europe
  ["Norwegian Fjord Camp (Geiranger)", "Norway", 62.1015, 7.0618, "Easy", 1, ["fjord","scenic"], "Geirangerfjord lookout approaches."],
  ["Trollstigen Plateau", "Norway", 62.457, 7.674, "Moderate", 2, ["mountain","scenic"], "Troll's Path mountain road."],
  ["Lofoten Unstad Access", "Norway", 68.2, 13.55, "Moderate", 2, ["arctic","coast"], "Arctic surfing / coastal tracks."],
  ["Scottish Highlands Applecross", "Scotland, UK", 57.43, -5.81, "Moderate", 2, ["mountain","singletrack"], "Bealach na Bà classic."],
  ["Cairngorms Estate Tracks", "Scotland, UK", 57.1, -3.67, "Moderate", 2, ["moor","dirt"], "Highland estate tracks."],
  ["Iceland F-Road Landmannalaugar", "Iceland", 63.99, -19.06, "Hard", 4, ["f-road","river"], "Highland F-roads with river fords."],
  ["Iceland Askja Route (F88)", "Iceland", 65.03, -16.75, "Hard", 4, ["f-road","remote"], "Remote highland volcano approach."],
  ["Iceland Kerlingarfjöll", "Iceland", 64.65, -19.28, "Hard", 3, ["f-road","geothermal"], "Central highland geothermal area."],
  ["Alps Col de l'Iseran", "France", 45.417, 7.092, "Easy", 1, ["alpine","paved"], "Highest paved pass in the Alps."],
  ["Grossglockner High Alpine", "Austria", 47.07, 12.84, "Easy", 1, ["alpine","paved"], "Classic high alpine road."],
  ["Transfăgărășan Summit", "Romania", 45.6, 24.62, "Easy", 1, ["alpine","paved"], "Famous Transylvanian alpine road."],
  ["Dolomites Passo Sella", "Italy", 46.51, 11.76, "Easy", 1, ["alpine","paved"], "Dolomite pass pullouts."],
  ["Pyrenees Col du Tourmalet", "France", 42.908, 0.145, "Easy", 1, ["alpine","paved"], "Tour de France legendary climb."],
  ["Faroe Islands Mountain Roads", "Faroe Islands", 62.1, -6.9, "Moderate", 2, ["coast","wind"], "Windy island mountain roads."],
  ["Swedish Lapland Forest Tracks", "Sweden", 66.5, 19.5, "Moderate", 2, ["arctic","forest"], "Boreal forest tracks."],
  ["Finnish Lake District Gravel", "Finland", 61.5, 28.0, "Easy", 1, ["lake","gravel"], "Lakeland gravel loops."],
  // Africa
  ["Sahara Oasis Trail (Merzouga)", "Morocco", 31.1, -4.01, "Hard", 3, ["sand","desert"], "Erg Chebbi dune edge."],
  ["Atlas Crest Viewpoint", "High Atlas, Morocco", 31.0601, -7.915, "Hard", 3, ["mountain","dirt"], "High Atlas crest tracks."],
  ["Tizi n'Tichka Pass Area", "Morocco", 31.285, -7.38, "Moderate", 2, ["mountain"], "Atlas highway pass spurs."],
  ["Anti-Atlas Ameln Valley", "Morocco", 29.8, -8.9, "Moderate", 2, ["desert","mountain"], "Anti-Atlas village tracks."],
  ["Namib Naukluft Park Edge", "Namibia", -24.5, 15.8, "Hard", 3, ["desert","sand"], "Namib desert corridors."],
  ["Skeleton Coast Spur", "Namibia", -19.0, 12.6, "Hard", 4, ["remote","sand"], "Remote coastal desert — Extreme-capable preferred."],
  ["Sossusvlei 2x4 Parking", "Namibia", -24.73, 15.29, "Moderate", 2, ["sand","desert"], "Dune access; deep sand beyond needs 4WD."],
  ["Makgadikgadi Pans Edge", "Botswana", -20.5, 25.5, "Hard", 3, ["saltpan","remote"], "Salt pan tracks — seasonal."],
  ["Central Kalahari Game Tracks", "Botswana", -22.0, 24.0, "Hard", 4, ["remote","sand"], "Deep Kalahari sand tracks."],
  ["Drakensberg Sani Pass", "South Africa / Lesotho", -29.59, 29.29, "Hard", 4, ["mountain","switchback"], "Famous switchback into Lesotho."],
  ["Garden Route Backroads", "South Africa", -33.98, 22.45, "Easy", 1, ["coast","scenic"], "Coastal scenic gravel options."],
  ["Serengeti Southern Tracks", "Tanzania", -2.85, 35.0, "Hard", 3, ["savanna","dirt"], "Park southern circuit tracks."],
  ["Simien Mountains Road", "Ethiopia", 13.2, 38.05, "Hard", 3, ["high-altitude","dirt"], "Ethiopian highland escarpment."],
  ["Atlas Desert Agafay", "Morocco", 31.45, -8.0, "Moderate", 2, ["desert","rock"], "Stone desert near Marrakech."],
  // Middle East / Asia
  ["Wadi Rum Desert Tracks", "Jordan", 29.58, 35.42, "Hard", 3, ["desert","sand"], "Lawrence of Arabia desert valleys."],
  ["Negev Desert Makhtesh Ramon", "Israel", 30.58, 34.8, "Moderate", 2, ["desert","canyon"], "Crater rim and floor tracks."],
  ["Empty Quarter Edge (Liwa)", "UAE", 23.13, 53.78, "Hard", 4, ["sand","dunes"], "Mega-dune country — sand driving skill required."],
  ["Al Hajar Mountain Tracks", "Oman", 23.2, 57.4, "Hard", 3, ["mountain","rock"], "Omani mountain wadis and tracks."],
  ["Pamir Highway Murghab", "Tajikistan", 38.17, 73.97, "Hard", 3, ["high-altitude","remote"], "Roof of the World corridor."],
  ["Karakoram Highway Passu", "Gilgit-Baltistan, Pakistan", 36.46, 74.88, "Moderate", 2, ["mountain","scenic"], "KKH Hunza valley approaches."],
  ["Ladakh Pangong Approach", "Ladakh, India", 33.75, 78.7, "Hard", 3, ["high-altitude","dirt"], "High altitude lake approach."],
  ["Spiti Valley Kaza Road", "Himachal Pradesh, India", 32.22, 78.07, "Hard", 3, ["high-altitude","remote"], "Trans-Himalayan Spiti corridor."],
  ["Mongolia Gobi Yolyn Am", "Ömnögovi, Mongolia", 43.5, 104.1, "Hard", 3, ["steppe","remote"], "Gobi canyon & steppe tracks."],
  ["Mongolia Orkhon Valley Tracks", "Övörkhangai, Mongolia", 47.0, 102.8, "Moderate", 2, ["steppe"], "Central Mongolian steppe."],
  ["Altai Mountains Kosh-Agach", "Altai Republic, Russia", 50.0, 88.67, "Hard", 3, ["steppe","mountain"], "Russian Altai borderlands."],
  ["Tian Shan Kyrgyz Jailoo", "Kyrgyzstan", 42.0, 76.5, "Hard", 3, ["mountain","dirt"], "High pasture mountain tracks."],
  ["Zhangye Danxia Edge Roads", "Gansu, China", 38.95, 100.2, "Easy", 1, ["scenic","desert"], "Rainbow hills scenic approaches."],
  ["Taklamakan Desert Highway Spur", "Xinjiang, China", 39.0, 83.0, "Hard", 3, ["desert","remote"], "Tarim basin desert spurs."],
  // Australia / NZ / Pacific
  ["Outback Red Center (Alice)", "Northern Territory, AU", -23.698, 133.8807, "Moderate", 2, ["outback","dirt"], "Red Centre dirt loops near Alice Springs."],
  ["Uluru Kata Tjuta Roads", "Northern Territory, AU", -25.34, 131.03, "Easy", 1, ["outback","scenic"], "Park sealed / graded approaches."],
  ["Simpson Desert French Line", "South Australia / NT, AU", -26.0, 137.5, "Legendary", 5, ["sand","remote"], "Classic desert crossing — Extreme prep required."],
  ["Gibb River Road (El Questro)", "Western Australia, AU", -16.0, 128.0, "Hard", 3, ["outback","creek"], "Kimberley iconic unsealed highway."],
  ["Cape York Telegraph Track", "Queensland, AU", -11.8, 142.5, "Legendary", 5, ["creek","mud","remote"], "Far north technical creek crossings."],
  ["Flinders Ranges Brachina", "South Australia, AU", -31.35, 138.63, "Moderate", 2, ["outback","dirt"], "Scenic gorge geological drive."],
  ["Wilpena Pound Access", "South Australia, AU", -31.53, 138.6, "Easy", 1, ["outback","scenic"], "Pound resort & lookout access."],
  ["Fraser Island (K'gari) Beach", "Queensland, AU", -25.25, 153.17, "Hard", 3, ["sand","beach"], "Beach highway — tide aware."],
  ["High Country Billy Goat Bluff", "Victoria, AU", -37.4, 146.7, "Legendary", 5, ["steep","extreme"], "Infamous steep High Country track."],
  ["Tasmania Western Explorer", "Tasmania, AU", -41.85, 145.2, "Moderate", 2, ["forest","gravel"], "Remote west coast gravel."],
  ["New Zealand Skippers Canyon", "Otago, NZ", -44.95, 168.67, "Hard", 3, ["cliff","gravel"], "Narrow cliff shelf historic road."],
  ["New Zealand Molesworth", "Marlborough, NZ", -42.0, 173.2, "Moderate", 2, ["high-country","gravel"], "Largest NZ farm high-country road."],
  ["New Zealand 4WD Rainbow Station", "Tasman, NZ", -41.95, 172.85, "Hard", 3, ["high-country"], "Rainbow Road backcountry."],
  ["Stewart Island Oban Roads", "Southland, NZ", -46.9, 168.13, "Easy", 1, ["coast"], "Island gravel near Oban."],
  // More USA classics
  ["Telluride Ophir Pass", "Colorado, USA", 37.85, -107.83, "Hard", 3, ["alpine","rock"], "San Juan Ophir Pass."],
  ["California Hot Springs Trail", "California, USA", 35.88, -118.67, "Moderate", 2, ["forest","dirt"], "Sequoia NF foothill roads."],
  ["Paiute Wilderness Edge", "Arizona, USA", 36.9, -113.7, "Hard", 3, ["desert","remote"], "NW Arizona desert tracks."],
  ["Valley of the Gods Road", "Utah, USA", 37.24, -109.85, "Moderate", 2, ["desert","dirt"], "Monument Valley cousin loop."],
  ["Moki Dugway", "Utah, USA", 37.27, -109.95, "Hard", 2, ["cliff","gravel"], "Steep gravel dugway — nerves of steel."],
  ["House Rock Valley Road", "Arizona / Utah, USA", 36.95, -112.05, "Moderate", 2, ["desert","dirt"], "Paria / Vermilion Cliffs access."],
  ["Paria Canyon Trailhead", "Utah, USA", 37.0, -111.85, "Moderate", 2, ["desert","slot"], "Wire Pass / Buckskin Gulch area."],
  ["Comb Ridge Dirt Roads", "Utah, USA", 37.4, -109.65, "Moderate", 2, ["desert","dirt"], "Bears Ears region tracks."],
  ["Lockhart Basin", "Utah, USA", 38.35, -109.7, "Hard", 4, ["rock","remote"], "Technical Lockhart Basin trail."],
  ["Chicken Corners", "Utah, USA", 38.48, -109.7, "Hard", 3, ["cliff","dirt"], "Colorado River cliffside track."],
  ["Strike Ravine", "Utah, USA", 38.55, -109.55, "Legendary", 5, ["technical","rock"], "Moab extreme obstacle run."],
  ["Golden Spike OHV", "Utah, USA", 41.62, -112.55, "Moderate", 2, ["desert","dirt"], "Promontory peninsula OHV."],
  ["Pismo Oceano Dunes", "California, USA", 35.1, -120.63, "Hard", 3, ["sand","beach"], "Coastal dune SVRA."],
  ["Dumont Dunes", "California, USA", 35.68, -116.3, "Hard", 3, ["sand"], "Mojave dune complex."],
  ["Glamis Imperial Sand Dunes", "California, USA", 32.98, -115.1, "Hard", 3, ["sand"], "Huge Imperial Valley dune field."],
  ["Johnson Valley OHV", "California, USA", 34.4, -116.6, "Hard", 3, ["desert","ohv"], "King of the Hammers country."],
  ["Hammers Trail (KOH)", "California, USA", 34.37, -116.6, "Legendary", 5, ["rock","extreme"], "King of the Hammers rock gardens."],
  ["Borrego Badlands", "California, USA", 33.25, -116.1, "Hard", 3, ["desert","sand"], "Anza-Borrego badlands washes."],
  ["Coyote Canyon", "California, USA", 33.4, -116.45, "Hard", 3, ["desert","creek"], "Seasonal canyon in Anza-Borrego."],
  ["Ghost Mountain Road", "California, USA", 33.0, -116.35, "Moderate", 2, ["desert"], "Marshal South homestead approach."],
  ["Table Mesa Road", "Arizona, USA", 33.95, -112.15, "Hard", 3, ["desert","ohv"], "North Phoenix desert OHV."],
  ["Hieroglyphic Mountains", "Arizona, USA", 33.9, -112.4, "Hard", 3, ["desert","rock"], "Wickenburg area trails."],
  ["Crown King Road", "Arizona, USA", 34.2, -112.35, "Hard", 3, ["mountain","dirt"], "Bradshaw Mountains ghost town road."],
  ["Senator Highway", "Arizona, USA", 34.4, -112.4, "Moderate", 2, ["forest","dirt"], "Prescott to Crown King historic."],
  ["Pearce Ferry Road", "Arizona, USA", 36.1, -113.9, "Moderate", 2, ["desert","dirt"], "Grand Canyon west approach."],
  ["Toroweap / Tuweep Road", "Arizona, USA", 36.2, -113.05, "Hard", 3, ["remote","dirt"], "Remote North Rim viewpoint road."],
  ["North Rim Point Sublime", "Arizona, USA", 36.2, -112.25, "Hard", 3, ["forest","dirt"], "Long dirt to Sublime overlook."],
  ["Kaibab Plateau Roads", "Arizona, USA", 36.45, -112.15, "Moderate", 2, ["forest","dirt"], "North Kaibab forest roads."],
  ["San Rafael Swell Reef", "Utah, USA", 38.9, -110.6, "Hard", 3, ["desert","rock"], "Swell backcountry roads."],
  ["Goblin Valley Backroads", "Utah, USA", 38.57, -110.7, "Moderate", 2, ["desert"], "Near Goblin Valley SP."],
  ["Factory Butte Area", "Utah, USA", 38.45, -110.9, "Hard", 3, ["desert","clay"], "Badlands clay & dirt."],
  ["Cathedral Valley Loop", "Utah, USA", 38.48, -111.2, "Hard", 3, ["desert","remote"], "Capitol Reef north district loop."],
  ["Notom-Bullfrog Road", "Utah, USA", 37.95, -111.0, "Moderate", 2, ["desert","dirt"], "Capitol Reef east side corridor."],
  ["Smoky Mountain Road", "Utah, USA", 37.3, -111.55, "Hard", 3, ["desert","remote"], "Grand Staircase remote connector."],
  ["Cottonwood Canyon Road", "Utah, USA", 37.3, -111.85, "Moderate", 2, ["desert","dirt"], "Kodachrome to GSENM."],
  ["Paria Movie Set Road", "Utah, USA", 37.25, -111.95, "Moderate", 2, ["desert"], "Old movie set wash access."],
  ["Grand Gulch Approach", "Utah, USA", 37.45, -110.15, "Moderate", 2, ["desert","dirt"], "Cedar Mesa canyon country."],
  ["Natural Bridges Loop", "Utah, USA", 37.6, -110.0, "Easy", 1, ["scenic","paved"], "Park scenic drive."],
  ["Abajo Mountains FR", "Utah, USA", 37.85, -109.45, "Moderate", 2, ["forest","dirt"], "Blue Mountains forest roads."],
  ["La Sal Mountain Loop Spurs", "Utah, USA", 38.45, -109.25, "Moderate", 2, ["forest","dirt"], "La Sals above Moab."],
  ["Geyser Pass Road", "Utah, USA", 38.5, -109.25, "Moderate", 2, ["forest","dirt"], "La Sal high pass."],
  ["Miners Basin", "Utah, USA", 38.52, -109.2, "Hard", 3, ["alpine","rock"], "La Sal alpine basin."],
  // Pacific islands / more Asia-Pacific
  ["Big Island Saddle Road Spurs", "Hawaii, USA", 19.7, -155.45, "Moderate", 2, ["volcanic","gravel"], "High lava saddle side roads."],
  ["Maui Haleakalā Crater Road", "Hawaii, USA", 20.71, -156.25, "Easy", 1, ["volcanic","paved"], "Summit highway — stock OK."],
  ["New Caledonia Dirt Capes", "New Caledonia", -22.3, 166.9, "Moderate", 2, ["coast","dirt"], "Island coastal dirt roads."],
  ["Fiji Highlands Gravel", "Fiji", -17.8, 178.0, "Moderate", 2, ["tropical","gravel"], "Interior highland gravel."],
  // Extra fillers with real coords
  ["Zion Kolob Terrace Road", "Utah, USA", 37.3, -113.1, "Moderate", 2, ["plateau","paved"], "Kolob Terrace scenic climb."],
  ["Cedar Breaks Overlook", "Utah, USA", 37.63, -112.84, "Easy", 1, ["scenic","paved"], "High alpine amphitheater."],
  ["Bryce Point Sunrise", "Utah, USA", 37.6, -112.16, "Easy", 1, ["scenic","paved"], "Hoodoo amphitheater overlook."],
  ["Arches Delicate Arch Viewpoint", "Utah, USA", 38.73, -109.5, "Easy", 1, ["scenic","paved"], "Park road to viewpoint."],
  ["Canyonlands Grand View Point", "Utah, USA", 38.39, -109.86, "Easy", 1, ["scenic","paved"], "Island in the Sky overlook."],
  ["Mesa Verde Cliff Palace Area", "Colorado, USA", 37.16, -108.47, "Easy", 1, ["scenic","paved"], "Park mesa-top roads."],
  ["Great Basin Wheeler Peak", "Nevada, USA", 39.0, -114.3, "Easy", 1, ["scenic","paved"], "Scenic drive toward Wheeler."],
  ["Great Basin Snake Creek", "Nevada, USA", 38.9, -114.25, "Moderate", 2, ["desert","dirt"], "Snake Creek dirt access."],
  ["Black Rock Desert Playa", "Nevada, USA", 40.78, -119.2, "Moderate", 2, ["playa","desert"], "Vast playa — weather dependent."],
  ["Pyramid Lake Dirt Spurs", "Nevada, USA", 39.98, -119.5, "Moderate", 2, ["desert","dirt"], "Paiute lake desert tracks."],
  ["Lake Tahoe Rubicon Access", "California, USA", 39.0, -120.12, "Hard", 4, ["granite","forest"], "Rubicon western approaches."],
  ["Lassen Forest Roads", "California, USA", 40.5, -121.5, "Moderate", 2, ["volcanic","forest"], "Lassen NF forest roads."],
  ["Crater Lake Rim Drive", "Oregon, USA", 42.94, -122.1, "Easy", 1, ["scenic","paved"], "Caldera rim drive."],
  ["Newberry Caldera Roads", "Oregon, USA", 43.7, -121.25, "Moderate", 2, ["volcanic","dirt"], "Central Oregon volcanic roads."],
  ["Three Sisters Backroads", "Oregon, USA", 44.1, -121.75, "Moderate", 2, ["forest","dirt"], "Cascades forest roads."],
  ["Mount Hood NF Roads", "Oregon, USA", 45.35, -121.7, "Moderate", 2, ["forest","dirt"], "Hood forest road network."],
  ["North Cascades FR", "Washington, USA", 48.5, -120.7, "Moderate", 2, ["forest","mountain"], "North Cascades forest roads."],
  ["Olympic Hot Springs Road", "Washington, USA", 48.0, -123.7, "Easy", 1, ["forest"], "Olympic NP approach (gated seasons)."],
  ["Glacier Going-to-the-Sun", "Montana, USA", 48.7, -113.7, "Easy", 1, ["scenic","paved"], "Classic alpine parkway."],
  ["Glacier Many Glacier Road", "Montana, USA", 48.8, -113.65, "Easy", 1, ["scenic"], "Many Glacier valley road."],
  ["Beartooth Highway Summit", "Montana / Wyoming, USA", 45.0, -109.4, "Easy", 1, ["alpine","paved"], "Highest paved road in the Northern Rockies."],
  ["Chief Joseph Scenic Byway", "Wyoming, USA", 44.75, -109.5, "Easy", 1, ["scenic","paved"], "Absaroka scenic byway."],
  ["Yellowstone Blacktail Plateau", "Wyoming, USA", 44.8, -110.55, "Moderate", 2, ["dirt","wildlife"], "Seasonal dirt loop."],
  ["Tetons Gros Ventre Road", "Wyoming, USA", 43.6, -110.5, "Moderate", 2, ["dirt","wildlife"], "Slide Lake corridor."],
  ["Wind River Reservation Roads", "Wyoming, USA", 43.2, -109.0, "Moderate", 2, ["high-plains","dirt"], "Central WY dirt corridors."],
  ["Bighorn Medicine Wheel Road", "Wyoming, USA", 44.82, -107.92, "Moderate", 2, ["alpine","gravel"], "High gravel to Medicine Wheel."],
  ["Badlands Sage Creek Rim", "South Dakota, USA", 43.75, -102.2, "Moderate", 2, ["prairie","dirt"], "Wilderness loop dirt."],
  ["Black Hills Forest Roads", "South Dakota, USA", 43.9, -103.6, "Moderate", 2, ["forest","dirt"], "Black Hills NF roads."],
  ["Theodore Roosevelt Scenic", "North Dakota, USA", 46.95, -103.45, "Easy", 1, ["badlands","scenic"], "Park scenic drives."],
  ["Boundary Waters FR", "Minnesota, USA", 48.0, -91.5, "Moderate", 2, ["forest","dirt"], "Superior NF access roads."],
  ["Porcupine Mountains Roads", "Michigan, USA", 46.75, -89.75, "Moderate", 2, ["forest"], "Porkies forest roads."],
  ["Shenandoah Skyline Drive", "Virginia, USA", 38.5, -78.45, "Easy", 1, ["scenic","paved"], "Blue Ridge parkway cousin."],
  ["Blue Ridge Parkway Mabry Mill", "Virginia, USA", 36.75, -80.4, "Easy", 1, ["scenic","paved"], "Classic BRP stop."],
  ["Great Smoky Cades Cove", "Tennessee, USA", 35.6, -83.85, "Easy", 1, ["scenic","paved"], "Loop road in the Cove."],
  ["Cherokee NF Unaka Roads", "Tennessee, USA", 36.1, -82.3, "Moderate", 2, ["forest","dirt"], "Unaka Mountain forest roads."],
  ["Chattahoochee NF Roads", "Georgia, USA", 34.75, -83.9, "Moderate", 2, ["forest","dirt"], "North Georgia mountain FRs."],
  ["Florida Ocala Scrub Roads", "Florida, USA", 29.15, -81.75, "Moderate", 2, ["sand","scrub"], "Ocala NF sand tracks."],
  ["Big Cypress Loop Road", "Florida, USA", 25.85, -81.05, "Moderate", 2, ["swamp","dirt"], "Everglades neighbor loop."],
  ["Everglades Flamingo Road", "Florida, USA", 25.14, -80.94, "Easy", 1, ["scenic","paved"], "Park road to Flamingo."],
  ["Organ Mountains Dripping Springs", "New Mexico, USA", 32.33, -106.58, "Easy", 1, ["desert","scenic"], "Organ Mountains foothills."],
  ["White Mountain Wilderness FR", "New Mexico, USA", 33.4, -105.8, "Moderate", 2, ["forest","dirt"], "Sacramento Mountains FRs."],
  ["Valles Caldera Roads", "New Mexico, USA", 35.87, -106.52, "Moderate", 2, ["volcanic","dirt"], "Caldera preserve roads."],
  ["Bandelier Backcountry", "New Mexico, USA", 35.78, -106.27, "Moderate", 2, ["canyon","dirt"], "Pajarito Plateau access."],
  ["Carson NF Cruces Basin", "New Mexico, USA", 36.9, -106.2, "Hard", 3, ["forest","remote"], "Northern NM remote basin."],
  ["San Juan NF Piedra Road", "Colorado, USA", 37.25, -107.35, "Moderate", 2, ["forest","dirt"], "SW Colorado forest roads."],
  ["Rio Grande NF Stunner Pass", "Colorado, USA", 37.35, -106.55, "Hard", 3, ["alpine","dirt"], "Southern CO alpine pass."],
  ["Culebra Range Access", "Colorado, USA", 37.1, -105.2, "Hard", 3, ["alpine","private-adjacent"], "Sangre de Cristo approaches."],
  ["Great Sand Dunes Medano Creek", "Colorado, USA", 37.74, -105.51, "Moderate", 2, ["sand","creek"], "Creek bed driving (seasonal)."],
  ["Sangre de Cristo Crestone", "Colorado, USA", 37.99, -105.7, "Moderate", 2, ["dirt","mountain"], "Crestone trailhead roads."],
  ["Arkansas River Collegiate Peaks", "Colorado, USA", 38.9, -106.2, "Moderate", 2, ["alpine","dirt"], "Buena Vista / Twin Lakes spurs."],
  ["Taylor Park Reservoir Roads", "Colorado, USA", 38.85, -106.55, "Moderate", 2, ["forest","dirt"], "Gunnison NF high park."],
  ["Kebler Pass", "Colorado, USA", 38.85, -107.1, "Moderate", 2, ["forest","gravel"], "Crested Butte to Paonia gravel."],
  ["Ohio Pass", "Colorado, USA", 38.78, -107.1, "Moderate", 2, ["forest","dirt"], "Historic narrow-gauge corridor."],
  ["Cinnamon Pass Summit", "Colorado, USA", 37.98, -107.5, "Hard", 3, ["high-alpine","rock"], "Alpine Loop eastern pass."],
  ["Engineer Pass Summit", "Colorado, USA", 38.0, -107.55, "Hard", 3, ["high-alpine","rock"], "Alpine Loop western pass."],
  ["California Gulch", "Colorado, USA", 37.95, -107.48, "Hard", 4, ["alpine","rock"], "Animas Forks area gulch."],
  ["Corkscrew Gulch", "Colorado, USA", 37.92, -107.65, "Hard", 4, ["alpine","rock"], "Ouray technical gulch."],
  ["Poughkeepsie Gulch", "Colorado, USA", 37.95, -107.58, "Legendary", 5, ["extreme","rock"], "Very technical San Juan gulch."],
  ["Hurricane Pass", "Colorado, USA", 37.88, -107.75, "Hard", 4, ["alpine","rock"], "Near Black Bear complex."],
  ["Magnolia Mill Road", "Colorado, USA", 39.75, -105.6, "Moderate", 2, ["forest","dirt"], "Front Range mountain roads."],
  ["Rollins Pass East", "Colorado, USA", 39.93, -105.67, "Hard", 3, ["alpine","historic"], "Hill Route historic railbed."],
  ["Mount Evans Summit Road", "Colorado, USA", 39.59, -105.64, "Easy", 1, ["alpine","paved"], "One of America's highest paved roads."],
  ["Guanella Pass", "Colorado, USA", 39.6, -105.71, "Easy", 1, ["alpine","paved"], "Georgetown to Grant scenic."],
  ["Boreas Pass", "Colorado, USA", 39.41, -105.97, "Moderate", 2, ["alpine","gravel"], "Breckenridge historic rail grade."],
  ["Georgia Pass", "Colorado, USA", 39.45, -105.9, "Hard", 3, ["alpine","dirt"], "Jefferson / Swan River divide."],
  ["French Pass", "Colorado, USA", 39.4, -105.85, "Hard", 3, ["alpine","dirt"], "Near Boreas / Georgia complex."],
  ["Mosquito Pass North Approach", "Colorado, USA", 39.3, -106.15, "Hard", 3, ["high-alpine"], "Leadville side of Mosquito."],
  ["Hagerman Pass", "Colorado, USA", 39.25, -106.48, "Hard", 3, ["alpine","dirt"], "Leadville to Basalt historic."],
  ["Timberline Lake Road", "Colorado, USA", 39.35, -106.25, "Moderate", 2, ["alpine","dirt"], "Near Leadville alpine lakes."],
  ["Winfield Ghost Town", "Colorado, USA", 38.98, -106.42, "Moderate", 2, ["alpine","dirt"], "Clear Creek canyon ghost town."],
  ["Huron Peak Trailhead Road", "Colorado, USA", 38.95, -106.42, "Moderate", 2, ["alpine","dirt"], "Collegiate Peaks 14er access."],
  ["Ptarmigan Lake Road", "Colorado, USA", 38.7, -106.3, "Hard", 3, ["alpine","rock"], "Buena Vista high lake road."],
  ["Tincup Pass", "Colorado, USA", 38.75, -106.47, "Hard", 3, ["alpine","rock"], "St. Elmo to Tincup classic."],
  ["Cumberland Pass", "Colorado, USA", 38.7, -106.48, "Moderate", 2, ["alpine","dirt"], "Pitkin / Tincup high pass."],
  ["Waunita Pass", "Colorado, USA", 38.55, -106.55, "Moderate", 2, ["forest","dirt"], "Gunnison country pass."],
  ["Old Monarch Pass", "Colorado, USA", 38.5, -106.35, "Moderate", 2, ["alpine","dirt"], "Historic Monarch alignment."],
  ["Marshall Pass", "Colorado, USA", 38.4, -106.2, "Moderate", 2, ["alpine","dirt"], "Salida to Gunnison historic."],
  ["Poncha Pass Spurs", "Colorado, USA", 38.42, -106.08, "Easy", 1, ["scenic"], "US-285 pass area."],
  ["Medano Pass Primitive Road", "Colorado, USA", 37.85, -105.45, "Hard", 3, ["sand","creek","alpine"], "Full Medano Pass crossing."],
  ["Music Pass Trailhead", "Colorado, USA", 37.92, -105.45, "Moderate", 2, ["alpine","dirt"], "Sangre wilderness trailhead."],
  ["Rainbow Trail Access FR", "Colorado, USA", 38.2, -105.8, "Moderate", 2, ["forest","dirt"], "Salida area Rainbow Trail FRs."],
  ["South Colony Lakes Road", "Colorado, USA", 37.95, -105.55, "Hard", 3, ["alpine","rock"], "Crestone Peak approach road."],
];

import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from "fs";
import { createInterface } from "readline";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(__dirname, "cache");
const OUT_DIR = join(ROOT, "src/data/quests");
const DEDUPE_METERS = 150;
const TARGET_NEW = 2000;
const WY_TARGET_MIN = 400;
const WY_TARGET_MAX = 700;

/** Deterministic 0..n-1 from string */
function hashInt(s, n) {
  const h = createHash("sha256").update(String(s)).digest();
  return h.readUInt32BE(0) % n;
}

function rewardFor(difficulty, minTier, seedKey) {
  const base = { Easy: 150, Moderate: 275, Hard: 400, Legendary: 650 }[difficulty] || 250;
  return base + minTier * 25 + hashInt(seedKey, 50);
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Grid-bucket dedupe to avoid O(n^2) full scans */
function makeDedupeIndex() {
  const cell = 0.002; // ~220m
  const buckets = new Map();
  const key = (lat, lng) => `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
  return {
    hasNear(lat, lng, meters = DEDUPE_METERS) {
      const i0 = Math.floor(lat / cell);
      const j0 = Math.floor(lng / cell);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const arr = buckets.get(`${i0 + di}:${j0 + dj}`);
          if (!arr) continue;
          for (const p of arr) {
            if (haversineM(lat, lng, p.lat, p.lng) < meters) return true;
          }
        }
      }
      return false;
    },
    add(lat, lng) {
      const k = key(lat, lng);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ lat, lng });
    },
  };
}

const HARD_RE =
  /\b(4wd|4x4|4-wheel|four[\s-]?wheel|jeep|ohv|atv|technical|wilderness|remote|alpine|ford|slickrock|rock crawl|extreme|ledge|shelf road|high clearance)\b/i;
const LEGENDARY_RE = /\b(extreme|rubicon|hell'?s revenge|black bear|fordyce|cape york|simpson desert)\b/i;
const EASY_RE = /\b(scenic|overlook|viewpoint|visitor|picnic|parkway|paved|interpretive)\b/i;

function classifyFromName(name, fcode, elev) {
  const n = name || "";
  if (LEGENDARY_RE.test(n)) return { difficulty: "Legendary", minTier: 5, tags: ["extreme", "remote"] };
  if (HARD_RE.test(n) || fcode === "GAP" || (elev != null && elev >= 3000)) {
    const tags = ["dirt", "mountain"];
    if (elev != null && elev >= 3000) tags.push("high-alpine");
    if (/rock|ledge|slick/i.test(n)) tags.push("rock");
    return { difficulty: "Hard", minTier: elev != null && elev >= 3500 ? 4 : 3, tags };
  }
  if (fcode === "PRK" || EASY_RE.test(n) || fcode === "viewpoint" || fcode === "picnic_site") {
    return { difficulty: "Easy", minTier: 1, tags: ["scenic"] };
  }
  if (fcode === "CMP" || fcode === "camp_site") {
    return { difficulty: "Moderate", minTier: 2, tags: ["dirt", "forest"] };
  }
  if (fcode === "TRL" || fcode === "trailhead") {
    return { difficulty: "Moderate", minTier: 2, tags: ["dirt", "forest"] };
  }
  if (fcode === "MT" || fcode === "RDGE" || fcode === "CLF") {
    return { difficulty: "Hard", minTier: 3, tags: ["mountain", "dirt"] };
  }
  if (fcode === "LK" || fcode === "SPNG" || fcode === "FALL") {
    return { difficulty: "Moderate", minTier: 2, tags: ["scenic", "dirt"] };
  }
  return { difficulty: "Moderate", minTier: 2, tags: ["dirt"] };
}

function titleFor(name, fcode) {
  const n = name.trim().replace(/\s+/g, " ");
  if (/camp|trail|park|pass|gap|overlook|viewpoint|picnic|hut/i.test(n)) return n;
  const suffix = {
    CMP: "Camp",
    camp_site: "Camp",
    TRL: "Trail",
    trailhead: "Trailhead",
    PRK: "Park",
    GAP: "Gap",
    PASS: "Pass",
    viewpoint: "Viewpoint",
    picnic_site: "Picnic Site",
    wilderness_hut: "Hut",
    MT: "Peak Area",
    LK: "Lake Access",
    SPNG: "Spring",
    RDGE: "Ridge",
    AREA: "Recreation Area",
    FALL: "Falls",
    VAL: "Valley",
    RSV: "Reservoir Access",
    CLF: "Cliff Overlook",
    MESA: "Mesa",
    BUTE: "Butte",
    PLAT: "Plateau",
    RESV: "Reserve",
  }[fcode];
  return suffix ? `${n} ${suffix}` : n;
}

function descFor(title, region, fcode, difficulty) {
  const place = region.replace(/, USA|, Canada/g, "");
  const byCode = {
    CMP: `Dispersed / developed camp access in ${place} — verify fire rules and surface conditions.`,
    camp_site: `Camp site waypoint in ${place}. High-clearance helpful on approach spurs.`,
    TRL: `Named trail corridor in ${place}. Overland staging / trailhead-style check-in.`,
    trailhead: `Trailhead access in ${place}.`,
    PRK: `Park / recreation site in ${place}. Stock vehicles often OK to the pin.`,
    GAP: `Mountain gap / pass notch in ${place}. Expect grades, weather, and possible snow seasonally.`,
    viewpoint: `Scenic viewpoint in ${place}.`,
    picnic_site: `Picnic site pullout in ${place}.`,
    wilderness_hut: `Backcountry hut vicinity in ${place}.`,
    MT: `Mountain waypoint in ${place}. Approach roads may be rough.`,
    LK: `Lake access area in ${place}.`,
    SPNG: `Named spring area in ${place}.`,
    RDGE: `Ridge access in ${place}.`,
    FALL: `Waterfall area access in ${place}.`,
    VAL: `Valley corridor in ${place}.`,
    RSV: `Reservoir access in ${place}.`,
    AREA: `Recreation area in ${place}.`,
  };
  const base = byCode[fcode] || `Overland waypoint in ${place}.`;
  if (difficulty === "Hard" || difficulty === "Legendary") {
    return `${base} Rated ${difficulty} — clearance / recovery gear recommended.`;
  }
  return base;
}

function isBadName(name) {
  if (!name || name.length < 3) return true;
  if (/^unnamed/i.test(name)) return true;
  if (/^\d+$/.test(name.trim())) return true;
  if (/^(a|the|north|south|east|west)\s*\d+$/i.test(name)) return true;
  if (/indian reserve|pre-reserve|réserve indienne/i.test(name)) return true;
  if (/^\{\d+\}/.test(name)) return true; // odd GNIS glyphs
  // Yellowstone-style cryptic site codes ("3L9") without a real place name
  if (/^[0-9A-Z]{2,5}$/i.test(name.trim())) return true;
  if (/^\d[A-Z]\d\b/i.test(name) && name.length < 14) return true;
  return false;
}

const STATE_REGION = {
  WY: "Wyoming, USA",
  CO: "Colorado, USA",
  UT: "Utah, USA",
  MT: "Montana, USA",
  ID: "Idaho, USA",
  NM: "New Mexico, USA",
  AZ: "Arizona, USA",
  NV: "Nevada, USA",
  OR: "Oregon, USA",
  WA: "Washington, USA",
  CA: "California, USA",
  SD: "South Dakota, USA",
  ND: "North Dakota, USA",
  AK: "Alaska, USA",
  TX: "Texas, USA",
  NE: "Nebraska, USA",
  KS: "Kansas, USA",
  OK: "Oklahoma, USA",
};
const CA_REGION = {
  "01": "Alberta, Canada",
  "02": "British Columbia, Canada",
  "12": "Yukon, Canada",
  "13": "NWT, Canada",
  "11": "Saskatchewan, Canada",
  "03": "Manitoba, Canada",
};

const WEST_US = new Set(Object.keys(STATE_REGION));
const CA_WEST = new Set(["01", "02", "12", "13", "11"]);
const CORE = new Set(["CMP", "TRL", "PRK", "GAP"]);
const EXTRA_WY = new Set(["MT", "LK", "SPNG", "RDGE", "AREA", "FALL", "CLF", "MESA", "BUTE", "PLAT"]);
const CA_CORE = new Set(["PRK", "MT", "GAP", "CMP", "TRL", "AREA", "RESV"]);

async function parseGeonamesFile(path, { country }) {
  if (!existsSync(path)) return [];
  const out = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const row = line.split("\t");
    if (row.length < 11) continue;
    const name = row[1];
    const lat = parseFloat(row[4]);
    const lng = parseFloat(row[5]);
    const fcode = row[7];
    const admin1 = row[10];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (isBadName(name)) continue;
    let region, keep = false;
    if (country === "US") {
      if (!WEST_US.has(admin1)) continue;
      if (admin1 === "WY") keep = CORE.has(fcode) || EXTRA_WY.has(fcode);
      else keep = CORE.has(fcode);
      region = STATE_REGION[admin1];
    } else {
      if (!CA_WEST.has(admin1)) continue;
      keep = CA_CORE.has(fcode);
      region = CA_REGION[admin1] || "Canada";
    }
    if (!keep) continue;
    let elev = null;
    if (row[15]) elev = parseInt(row[15], 10);
    else if (row[16]) elev = parseInt(row[16], 10);
    if (!Number.isFinite(elev)) elev = null;
    out.push({
      name,
      lat,
      lng,
      fcode,
      region,
      admin1,
      elev,
      source: "geonames",
      priority: priorityScore(admin1, fcode, country),
    });
  }
  return out;
}

function priorityScore(admin1, fcode, country) {
  // Higher = take first. Wyoming CORE boosted heavily.
  let p = 0;
  if (admin1 === "WY") p += 1000;
  else if (["CO", "UT", "MT", "ID", "AZ", "NM", "NV", "OR", "WA"].includes(admin1)) p += 400;
  else if (admin1 === "CA" || admin1 === "02" || admin1 === "01") p += 300;
  else p += 100;
  const codeBoost = { CMP: 50, PRK: 45, GAP: 40, camp_site: 50, viewpoint: 42, picnic_site: 35, trailhead: 38, TRL: 30, MT: 15, LK: 12, SPNG: 10, RDGE: 10, AREA: 20, RESV: 18, FALL: 14, CLF: 12 };
  p += codeBoost[fcode] || 0;
  if (country === "CA") p += 20;
  return p;
}

async function ensureGeonames() {
  mkdirSync(CACHE, { recursive: true });
  const files = [
    { zip: "US.zip", txt: "US.txt", url: "https://download.geonames.org/export/dump/US.zip" },
    { zip: "CA.zip", txt: "CA.txt", url: "https://download.geonames.org/export/dump/CA.zip" },
  ];
  for (const f of files) {
    const txtPath = join(CACHE, f.txt);
    if (existsSync(txtPath)) continue;
    const zipPath = join(CACHE, f.zip);
    if (!existsSync(zipPath)) {
      console.log(`Downloading ${f.url} ...`);
      const res = await fetch(f.url, { headers: { "User-Agent": "OverlandCoinQuestBot/1.0" } });
      if (!res.ok) throw new Error(`Failed to download ${f.url}: ${res.status}`);
      writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    }
    console.log(`Unzipping ${f.zip} ...`);
    const { execSync } = await import("child_process");
    execSync(`unzip -o -q ${JSON.stringify(f.zip)} ${JSON.stringify(f.txt)}`, { cwd: CACHE });
  }
}

async function fetchOverpassBbox(name, south, west, north, east) {
  const outPath = join(CACHE, `${name}.json`);
  if (existsSync(outPath)) {
    try {
      const d = JSON.parse(readFileSync(outPath, "utf8"));
      if (Array.isArray(d.elements)) return d.elements;
    } catch {
      /* refetch */
    }
  }
  const query = `[out:json][timeout:60];(
  node["tourism"~"^(viewpoint|camp_site|picnic_site|wilderness_hut)$"](${south},${west},${north},${east});
  node["highway"="trailhead"](${south},${west},${north},${east});
  node["tourism"="information"]["information"="trailhead"](${south},${west},${north},${east});
  node["amenity"="parking"]["hiking"="yes"](${south},${west},${north},${east});
);out body;`;
  const endpoints = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  for (const url of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Overpass ${name} via ${url} (try ${attempt})...`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": "OverlandCoinQuestBot/1.0",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const d = JSON.parse(text);
        if (!Array.isArray(d.elements)) throw new Error("no elements");
        writeFileSync(outPath, JSON.stringify(d));
        console.log(`  -> ${d.elements.length} elements`);
        return d.elements;
      } catch (e) {
        console.warn(`  failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }
  return [];
}

function elementsToCandidates(elements, region, admin1) {
  const out = [];
  for (const e of elements) {
    if (e.type !== "node" || e.lat == null) continue;
    const tags = e.tags || {};
    const name = tags.name || tags["name:en"];
    if (isBadName(name)) continue;
    const fcode =
      tags.tourism || tags.highway || tags.leisure || tags.amenity || "poi";
    out.push({
      name,
      lat: e.lat,
      lng: e.lon,
      fcode,
      region,
      admin1,
      elev: tags.ele ? parseFloat(tags.ele) : null,
      source: "overpass",
      priority: priorityScore(admin1, fcode, "US") + 80,
    });
  }
  return out;
}

/** Per-region caps for non-Wyoming fill */
const REGION_CAPS = {
  // Interleave Canada early so phase-B soft fill cannot starve it
  "British Columbia, Canada": 90,
  "Alberta, Canada": 70,
  "Colorado, USA": 180,
  "Utah, USA": 150,
  "California, USA": 180,
  "Montana, USA": 130,
  "Arizona, USA": 120,
  "Oregon, USA": 120,
  "Idaho, USA": 100,
  "New Mexico, USA": 90,
  "Washington, USA": 90,
  "Yukon, Canada": 35,
  "Nevada, USA": 80,
  "Alaska, USA": 60,
  "Texas, USA": 70,
  "NWT, Canada": 25,
  "South Dakota, USA": 40,
  "Saskatchewan, Canada": 25,
  "North Dakota, USA": 25,
  "Nebraska, USA": 30,
  "Kansas, USA": 25,
  "Oklahoma, USA": 25,
};

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1) Curated base from LOCATIONS
  const curated = LOCATIONS.map((row, i) => {
    const [title, region, lat, lng, difficulty, minTier, terrainTags, description] = row;
    return {
      id: `q${String(i + 1).padStart(4, "0")}`,
      title,
      description,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      rewardOlC: rewardFor(difficulty, minTier, `curated:${title}:${lat}:${lng}`),
      difficulty,
      region,
      minTier,
      terrainTags,
      radiusMeters: 100,
      _source: "curated",
    };
  });

  const index = makeDedupeIndex();
  for (const q of curated) index.add(q.lat, q.lng);

  // 2) GeoNames candidates
  await ensureGeonames();
  console.log("Parsing GeoNames US/CA ...");
  const geoUs = await parseGeonamesFile(join(CACHE, "US.txt"), { country: "US" });
  const geoCa = await parseGeonamesFile(join(CACHE, "CA.txt"), { country: "CA" });
  console.log(`GeoNames candidates: US=${geoUs.length} CA=${geoCa.length}`);

  // 3) Overpass (Wyoming tiles + a few western tiles); uses cache when present
  const overpassTiles = [
    ["wy_nw", 43.0, -111.05, 45.01, -107.55, "Wyoming, USA", "WY"],
    ["wy_ne", 43.0, -107.55, 45.01, -104.05, "Wyoming, USA", "WY"],
    ["wy_sw", 40.99, -111.05, 43.0, -107.55, "Wyoming, USA", "WY"],
    ["wy_se", 40.99, -107.55, 43.0, -104.05, "Wyoming, USA", "WY"],
    ["co_west", 37.5, -109.0, 41.0, -106.0, "Colorado, USA", "CO"],
    ["ut_east", 37.0, -111.0, 41.0, -109.0, "Utah, USA", "UT"],
    ["mt_south", 44.5, -113.0, 46.5, -108.0, "Montana, USA", "MT"],
  ];
  let overpassCands = [];
  for (const [name, s, w, n, e, region, admin1] of overpassTiles) {
    const els = await fetchOverpassBbox(name, s, w, n, e);
    overpassCands = overpassCands.concat(elementsToCandidates(els, region, admin1));
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Overpass named candidates: ${overpassCands.length}`);

  // 4) Merge & sort by priority
  const candidates = [...overpassCands, ...geoUs, ...geoCa].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  );

  const selected = [];
  const regionCounts = {};
  let wyCount = 0;
  const WY_TARGET = Math.floor((WY_TARGET_MIN + WY_TARGET_MAX) / 2); // ~550

  const bump = (region) => {
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  };

  const tryAdd = (c, { wyMax = WY_TARGET_MAX, regionCap = null } = {}) => {
    if (selected.length >= TARGET_NEW) return false;
    if (index.hasNear(c.lat, c.lng)) return false;
    const isWy = c.admin1 === "WY" || c.region === "Wyoming, USA";
    if (isWy) {
      if (wyCount >= wyMax) return false;
    } else {
      const cap = regionCap ?? REGION_CAPS[c.region] ?? 40;
      if ((regionCounts[c.region] || 0) >= cap) return false;
    }
    const { difficulty, minTier, tags } = classifyFromName(c.name, c.fcode, c.elev);
    const title = titleFor(c.name, c.fcode);
    const lat = Number(c.lat.toFixed(5));
    const lng = Number(c.lng.toFixed(5));
    selected.push({
      cand: c,
      quest: {
        title,
        description: descFor(title, c.region, c.fcode, difficulty),
        lat,
        lng,
        rewardOlC: rewardFor(difficulty, minTier, `${c.source}:${title}:${lat}:${lng}`),
        difficulty,
        region: c.region,
        minTier,
        terrainTags: tags,
        radiusMeters: 100,
        _source: c.source,
      },
    });
    index.add(lat, lng);
    bump(c.region);
    if (isWy) wyCount++;
    return true;
  };

  // Phase A — Wyoming CORE-first toward mid target
  for (const c of candidates) {
    if (wyCount >= WY_TARGET) break;
    if (c.admin1 !== "WY" && c.region !== "Wyoming, USA") continue;
    // Prefer camp/park/gap/trailhead over mountain extras early
    if (!CORE.has(c.fcode) && !["camp_site","viewpoint","picnic_site","trailhead","wilderness_hut"].includes(c.fcode)) continue;
    tryAdd(c, { wyMax: WY_TARGET });
  }
  for (const c of candidates) {
    if (wyCount >= WY_TARGET) break;
    if (c.admin1 !== "WY" && c.region !== "Wyoming, USA") continue;
    tryAdd(c, { wyMax: WY_TARGET });
  }

  // Phase B — fill each region toward its soft cap for geographic spread
  const regionOrder = Object.keys(REGION_CAPS);
  for (const region of regionOrder) {
    const soft = Math.min(REGION_CAPS[region], Math.floor(REGION_CAPS[region] * 0.55));
    for (const c of candidates) {
      if ((regionCounts[region] || 0) >= soft) break;
      if (selected.length >= TARGET_NEW) break;
      if (c.region !== region) continue;
      tryAdd(c);
    }
  }

  // Phase C — fill remaining slots (allow WY up to MAX)
  for (const c of candidates) {
    if (selected.length >= TARGET_NEW) break;
    tryAdd(c, { wyMax: WY_TARGET_MAX });
  }

  // Phase D — if WY still under MIN, force-fill
  if (wyCount < WY_TARGET_MIN) {
    for (const c of candidates) {
      if (wyCount >= WY_TARGET_MIN) break;
      if (c.admin1 !== "WY" && c.region !== "Wyoming, USA") continue;
      tryAdd(c, { wyMax: WY_TARGET_MAX });
    }
  }

  // Trim to ~TARGET_NEW while protecting WY count in [MIN,MAX]
  let finalNew = selected.map((s) => s.quest);
  if (finalNew.length > TARGET_NEW) {
    // Drop non-WY from the end (lowest priority were appended later... actually highest priority first)
    // Prefer dropping non-WY extras
    const wy = finalNew.filter((q) => q.region === "Wyoming, USA");
    const other = finalNew.filter((q) => q.region !== "Wyoming, USA");
    const keepWy = wy.slice(0, WY_TARGET_MAX);
    const keepOther = other.slice(0, Math.max(0, TARGET_NEW - keepWy.length));
    finalNew = [...keepWy, ...keepOther];
  }

  const all = [
    ...curated.map(({ _source, ...q }) => q),
    ...finalNew.map(({ _source, ...q }, i) => ({
      ...q,
      id: `q${String(curated.length + i + 1).padStart(4, "0")}`,
    })),
  ];

  // Optional: split by region if huge (>1.5MB)
  const singlePath = join(OUT_DIR, "seed.json");
  const payload = JSON.stringify(all, null, 2) + "\n";
  writeFileSync(singlePath, payload);

  const wyTotal = all.filter((q) => /Wyoming/i.test(q.region)).length;
  const naTotal = all.filter((q) => /, USA|, Canada/i.test(q.region)).length;
  const bySource = { curated: curated.length, overpass: 0, geonames: 0 };
  for (const s of selected) {
    if (s.quest._source === "overpass") bySource.overpass++;
    if (s.quest._source === "geonames") bySource.geonames++;
  }
  // recount sources from finalNew length vs selected — use region stats
  console.log(
    JSON.stringify(
      {
        total: all.length,
        curated: curated.length,
        added: finalNew.length,
        wyomingTotal: wyTotal,
        naTotal,
        bytes: payload.length,
        sources: {
          curated: curated.length,
          overpass: selected.filter((s) => s.quest._source === "overpass" && finalNew.includes(s.quest)).length,
          geonames: selected.filter((s) => s.quest._source === "geonames" && finalNew.includes(s.quest)).length,
        },
        regionSample: Object.fromEntries(
          Object.entries(
            all.reduce((m, q) => {
              m[q.region] = (m[q.region] || 0) + 1;
              return m;
            }, {}),
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${all.length} quests to ${singlePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
