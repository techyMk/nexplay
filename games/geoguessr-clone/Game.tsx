"use client";

/**
 * GeoGuessr — landmarks edition.
 *
 * The real GeoGuessr depends on Google Street View, which we don't
 * have. Instead, we ship a curated list of ~30 famous landmarks with
 * their latitude / longitude and a Wikipedia page slug. At round
 * start we pull the page's lead image from the Wikipedia REST API
 * (CORS-enabled, no API key, stable) and show it without naming the
 * place. The player clicks somewhere on a Leaflet world map, hits
 * "Guess", and we score them based on haversine distance to the
 * actual location. Five rounds per match, max 25,000 points.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GameOverlay } from "@/components/games/GameOverlay";
import { ScoreStatus } from "@/components/ScoreStatus";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

// ---------------------------------------------------------------------------
// Landmark data — picked for global spread, recognisability, and the
// availability of a clean lead image on Wikipedia. Tier hints how
// recognisable a place is; round-pickers use it to mix difficulty.
// ---------------------------------------------------------------------------

type Tier = 1 | 2 | 3;
type Landmark = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  /** Wikipedia page slug — fetched at round start to derive a lead
   *  image URL via the page-summary REST endpoint. */
  page: string;
  tier: Tier;
};

const LANDMARKS: Landmark[] = [
  // Tier 1 — household-name landmarks.
  { name: "Eiffel Tower", country: "France", lat: 48.8584, lng: 2.2945, page: "Eiffel_Tower", tier: 1 },
  { name: "Statue of Liberty", country: "USA", lat: 40.6892, lng: -74.0445, page: "Statue_of_Liberty", tier: 1 },
  { name: "Big Ben", country: "United Kingdom", lat: 51.5007, lng: -0.1246, page: "Big_Ben", tier: 1 },
  { name: "Sydney Opera House", country: "Australia", lat: -33.8568, lng: 151.2153, page: "Sydney_Opera_House", tier: 1 },
  { name: "Taj Mahal", country: "India", lat: 27.1751, lng: 78.0421, page: "Taj_Mahal", tier: 1 },
  { name: "Christ the Redeemer", country: "Brazil", lat: -22.9519, lng: -43.2105, page: "Christ_the_Redeemer_(statue)", tier: 1 },
  { name: "Pyramids of Giza", country: "Egypt", lat: 29.9792, lng: 31.1342, page: "Giza_pyramid_complex", tier: 1 },
  { name: "Colosseum", country: "Italy", lat: 41.8902, lng: 12.4922, page: "Colosseum", tier: 1 },
  { name: "Great Wall of China", country: "China", lat: 40.4319, lng: 116.5704, page: "Great_Wall_of_China", tier: 1 },
  { name: "Machu Picchu", country: "Peru", lat: -13.1631, lng: -72.5450, page: "Machu_Picchu", tier: 1 },

  // Tier 2 — well-known but more regional.
  { name: "Brandenburg Gate", country: "Germany", lat: 52.5163, lng: 13.3777, page: "Brandenburg_Gate", tier: 2 },
  { name: "Stonehenge", country: "United Kingdom", lat: 51.1789, lng: -1.8262, page: "Stonehenge", tier: 2 },
  { name: "Acropolis of Athens", country: "Greece", lat: 37.9715, lng: 23.7257, page: "Acropolis_of_Athens", tier: 2 },
  { name: "Petra", country: "Jordan", lat: 30.3285, lng: 35.4444, page: "Petra", tier: 2 },
  { name: "Hagia Sophia", country: "Türkiye", lat: 41.0086, lng: 28.9802, page: "Hagia_Sophia", tier: 2 },
  { name: "Sagrada Família", country: "Spain", lat: 41.4036, lng: 2.1744, page: "Sagrada_Família", tier: 2 },
  { name: "Burj Khalifa", country: "UAE", lat: 25.1972, lng: 55.2744, page: "Burj_Khalifa", tier: 2 },
  { name: "Mount Fuji", country: "Japan", lat: 35.3606, lng: 138.7274, page: "Mount_Fuji", tier: 2 },
  { name: "Niagara Falls", country: "USA / Canada", lat: 43.0962, lng: -79.0377, page: "Niagara_Falls", tier: 2 },
  { name: "Golden Gate Bridge", country: "USA", lat: 37.8199, lng: -122.4783, page: "Golden_Gate_Bridge", tier: 2 },

  // Tier 3 — harder. Distinctive but more obscure or regionally placed.
  { name: "Angkor Wat", country: "Cambodia", lat: 13.4125, lng: 103.867, page: "Angkor_Wat", tier: 3 },
  { name: "Easter Island Moai", country: "Chile", lat: -27.1212, lng: -109.3669, page: "Moai", tier: 3 },
  { name: "Neuschwanstein Castle", country: "Germany", lat: 47.5576, lng: 10.7498, page: "Neuschwanstein_Castle", tier: 3 },
  { name: "Salar de Uyuni", country: "Bolivia", lat: -20.1338, lng: -67.4891, page: "Salar_de_Uyuni", tier: 3 },
  { name: "Mont Saint-Michel", country: "France", lat: 48.6361, lng: -1.5115, page: "Mont-Saint-Michel", tier: 3 },
  { name: "Iguazu Falls", country: "Argentina / Brazil", lat: -25.6953, lng: -54.4367, page: "Iguazu_Falls", tier: 3 },
  { name: "Forbidden City", country: "China", lat: 39.9163, lng: 116.3972, page: "Forbidden_City", tier: 3 },
  { name: "Marina Bay Sands", country: "Singapore", lat: 1.2834, lng: 103.8607, page: "Marina_Bay_Sands", tier: 3 },
  { name: "Plitvice Lakes", country: "Croatia", lat: 44.8654, lng: 15.582, page: "Plitvice_Lakes_National_Park", tier: 3 },
  { name: "Cappadocia (Göreme)", country: "Türkiye", lat: 38.6431, lng: 34.8289, page: "Cappadocia", tier: 3 },
];

const TOTAL_ROUNDS = 5;
const MAX_ROUND_SCORE = 5000;
/** Distance scale for the score curve. score = 5000 * exp(-km / DECAY).
 *  DECAY of 1500 km gives ~3033 at 1000km, ~1839 at 2000km, ~33 at 10000km. */
const SCORE_DECAY_KM = 1500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick TOTAL_ROUNDS landmarks with a tier mix: 2 easy, 2 medium, 1 hard. */
function pickRoundLandmarks(): Landmark[] {
  const t1 = shuffle(LANDMARKS.filter((l) => l.tier === 1)).slice(0, 2);
  const t2 = shuffle(LANDMARKS.filter((l) => l.tier === 2)).slice(0, 2);
  const t3 = shuffle(LANDMARKS.filter((l) => l.tier === 3)).slice(0, 1);
  return shuffle([...t1, ...t2, ...t3]);
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

function scoreForDistance(km: number): number {
  return Math.round(MAX_ROUND_SCORE * Math.exp(-km / SCORE_DECAY_KM));
}

/** Fetch the lead image URL for a Wikipedia page. Uses the MediaWiki
 *  action API's `pageimages` prop with a requested thumb size — the
 *  server picks the nearest pre-generated thumbnail >= our request,
 *  which is critical because Wikimedia rejects arbitrary thumbnail
 *  sizes with a 400 (only specific cached sizes are served). The
 *  REST page-summary endpoint returns a fixed 330px thumb that's too
 *  small for our photo pane, so we use this richer endpoint instead.
 *  `origin=*` opts the request into anonymous CORS. */
async function fetchLandmarkImage(page: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: page,
    prop: "pageimages",
    format: "json",
    pithumbsize: "800",
    origin: "*",
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: Record<string, { thumbnail?: { source?: string } }>;
      };
    };
    const pages = json.query?.pages ?? {};
    for (const k of Object.keys(pages)) {
      const src = pages[k]?.thumbnail?.source;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = "intro" | "loading" | "guessing" | "result" | "done";
type RoundResult = {
  landmark: Landmark;
  guess: { lat: number; lng: number } | null;
  distanceKm: number;
  score: number;
};

export default function GeoGuessr() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  /** Active markers + line drawn on the map. We keep references so
   *  they can be cleared between rounds. */
  const guessMarkerRef = useRef<L.Marker | null>(null);
  const actualMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<Landmark[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [guessLatLng, setGuessLatLng] = useState<L.LatLng | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [best, setBest] = useState(0);

  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const isOver = phase === "done";

  const submitStatus = useSubmitScoreOnGameOver(
    "geoguessr-clone",
    totalScore,
    isOver,
  );

  // Best score persistence — same pattern as the other games.
  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:geoguessr-best") || 0));
  }, []);
  useEffect(() => {
    if (!isOver) return;
    if (totalScore <= best) return;
    setBest(totalScore);
    try {
      localStorage.setItem("nexplay:geoguessr-best", String(totalScore));
    } catch {
      // private mode — best is nice-to-have
    }
  }, [isOver, totalScore, best]);

  // -------------------------------------------------------------------------
  // Leaflet map init / teardown. Done once on mount; we mutate the map
  // imperatively each round rather than reinit'ing it.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const div = mapDivRef.current;
    if (!div) return;

    const map = L.map(div, {
      center: [20, 0],
      zoom: 2,
      worldCopyJump: true,
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      // We satisfy the OSM attribution requirement with a custom HUD
      // pill below the map; the default Leaflet control would clash
      // with our theme.
    }).addTo(map);
    mapRef.current = map;

    // Map clicks during guessing: place / move the player's marker.
    const onMapClick = (e: L.LeafletMouseEvent) => {
      // Use a ref-based gate so we don't have to recreate the listener
      // every time `phase` changes.
      const ph = phaseRef.current;
      if (ph !== "guessing") return;
      placeGuessMarker(map, e.latlng);
      setGuessLatLng(e.latlng);
      Sfx.click();
    };
    map.on("click", onMapClick);

    // Leaflet draws based on container size at init time. If the
    // host div resizes (e.g. fullscreen toggle), we have to nudge it.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(div);

    return () => {
      ro.disconnect();
      map.off("click", onMapClick);
      map.remove();
      mapRef.current = null;
      guessMarkerRef.current = null;
      actualMarkerRef.current = null;
      lineRef.current = null;
    };
  }, []);

  // Mirror `phase` into a ref so the static map click listener can
  // gate without us having to re-subscribe each render.
  const phaseRef = useRef<Phase>("intro");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // -------------------------------------------------------------------------
  // Round flow
  // -------------------------------------------------------------------------

  const start = useCallback(async () => {
    const fresh = pickRoundLandmarks();
    setPicks(fresh);
    setRound(0);
    setResults([]);
    setGuessLatLng(null);
    setPhase("loading");
    clearMapMarkers();
    resetMapView();
    const url = await fetchLandmarkImage(fresh[0].page);
    setImageUrl(url);
    setImageError(!url);
    setPhase("guessing");
  }, []);

  const submitGuess = useCallback(async () => {
    if (!guessLatLng) return;
    const landmark = picks[round];
    if (!landmark) return;
    const dist = haversineKm(
      { lat: guessLatLng.lat, lng: guessLatLng.lng },
      { lat: landmark.lat, lng: landmark.lng },
    );
    const score = scoreForDistance(dist);
    const result: RoundResult = {
      landmark,
      guess: { lat: guessLatLng.lat, lng: guessLatLng.lng },
      distanceKm: dist,
      score,
    };
    setResults((rs) => [...rs, result]);
    Sfx.thud();
    if (score >= 4500) Sfx.win();
    else if (score >= 1500) Sfx.match();

    // Render the actual marker + connecting line, then fit the map
    // to show both points.
    const map = mapRef.current;
    if (map) {
      addActualMarker(map, landmark);
      addGuessActualLine(map, guessLatLng, landmark);
      const bounds = L.latLngBounds([
        guessLatLng,
        L.latLng(landmark.lat, landmark.lng),
      ]).pad(0.4);
      map.fitBounds(bounds, { animate: true, maxZoom: 6 });
    }
    setPhase("result");
  }, [guessLatLng, picks, round]);

  const nextRound = useCallback(async () => {
    const nextIdx = round + 1;
    if (nextIdx >= TOTAL_ROUNDS) {
      setPhase("done");
      return;
    }
    setRound(nextIdx);
    setGuessLatLng(null);
    setImageUrl(null);
    setImageError(false);
    clearMapMarkers();
    resetMapView();
    setPhase("loading");
    const url = await fetchLandmarkImage(picks[nextIdx].page);
    setImageUrl(url);
    setImageError(!url);
    setPhase("guessing");
  }, [round, picks]);

  // -------------------------------------------------------------------------
  // Map mutation helpers — kept outside React state since they're pure
  // imperative side-effects on the Leaflet objects.
  // -------------------------------------------------------------------------

  function placeGuessMarker(map: L.Map, latlng: L.LatLng) {
    const icon = L.divIcon({
      className: "",
      html: `<div class="geo-pin geo-pin-guess">📍</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    if (guessMarkerRef.current) {
      guessMarkerRef.current.setLatLng(latlng);
    } else {
      guessMarkerRef.current = L.marker(latlng, { icon }).addTo(map);
    }
  }

  function addActualMarker(map: L.Map, landmark: Landmark) {
    const icon = L.divIcon({
      className: "",
      html: `<div class="geo-pin geo-pin-actual">🎯</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    if (actualMarkerRef.current) {
      actualMarkerRef.current.setLatLng([landmark.lat, landmark.lng]);
    } else {
      actualMarkerRef.current = L.marker(
        [landmark.lat, landmark.lng],
        { icon },
      ).addTo(map);
    }
  }

  function addGuessActualLine(
    map: L.Map,
    guess: L.LatLng,
    landmark: Landmark,
  ) {
    if (lineRef.current) {
      lineRef.current.setLatLngs([guess, [landmark.lat, landmark.lng]]);
    } else {
      lineRef.current = L.polyline(
        [guess, [landmark.lat, landmark.lng]],
        {
          color: "#fb7185",
          weight: 3,
          dashArray: "6, 8",
          opacity: 0.85,
        },
      ).addTo(map);
    }
  }

  function clearMapMarkers() {
    const map = mapRef.current;
    if (!map) return;
    if (guessMarkerRef.current) {
      map.removeLayer(guessMarkerRef.current);
      guessMarkerRef.current = null;
    }
    if (actualMarkerRef.current) {
      map.removeLayer(actualMarkerRef.current);
      actualMarkerRef.current = null;
    }
    if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }
  }

  function resetMapView() {
    mapRef.current?.setView([20, 0], 2);
  }

  // -------------------------------------------------------------------------
  // Derived view data
  // -------------------------------------------------------------------------

  const currentLandmark = picks[round];
  const lastResult = results[results.length - 1];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1530] to-[#0b0d12] select-none"
    >
      {/* Top HUD */}
      <div className="shrink-0 flex items-center justify-center gap-2 p-2 text-white text-xs sm:text-sm flex-wrap border-b border-white/10 bg-black/30">
        <span className="px-3 py-1 rounded-md bg-white/10">
          <span className="opacity-60 mr-1.5">ROUND</span>
          <b>{Math.min(round + 1, TOTAL_ROUNDS)}</b>
          <span className="opacity-60"> / {TOTAL_ROUNDS}</span>
        </span>
        <span className="px-3 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
          <span className="opacity-60 mr-1.5">SCORE</span>
          <b className="tabular-nums">{totalScore.toLocaleString()}</b>
        </span>
        {best > 0 && (
          <span className="px-3 py-1 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-200">
            <span className="opacity-60 mr-1.5">BEST</span>
            <b className="tabular-nums">{best.toLocaleString()}</b>
          </span>
        )}
        <SoundToggle />
      </div>

      {/* Main two-pane area: photo on the left, map on the right.
          Stacks vertically on narrow viewports. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
        {/* Photo pane */}
        <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center">
          {phase === "loading" && (
            <div className="text-white/70 text-sm flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
              <span>Loading photo…</span>
            </div>
          )}
          {phase !== "loading" && imageUrl && !imageError && (
            <img
              src={imageUrl}
              alt="Landmark"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          {phase !== "loading" && (!imageUrl || imageError) && (
            <div className="text-center px-6">
              <div className="text-5xl mb-2">🌍</div>
              <div className="text-white/85 font-bold mb-1">
                Photo unavailable
              </div>
              <div className="text-white/60 text-xs">
                Use your geographic instincts and click the map.
              </div>
            </div>
          )}

          {/* Tier indicator overlay (top-left) */}
          {currentLandmark && (phase === "guessing" || phase === "result") && (
            <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white font-bold">
              {currentLandmark.tier === 1 && (
                <span className="text-emerald-300">EASY</span>
              )}
              {currentLandmark.tier === 2 && (
                <span className="text-amber-300">MEDIUM</span>
              )}
              {currentLandmark.tier === 3 && (
                <span className="text-rose-300">HARD</span>
              )}
            </div>
          )}

          {/* Reveal name on result phase */}
          {phase === "result" && lastResult && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent text-white">
              <div className="text-xs uppercase tracking-wider opacity-70 font-bold">
                {lastResult.landmark.country}
              </div>
              <div className="text-xl sm:text-2xl font-black">
                {lastResult.landmark.name}
              </div>
            </div>
          )}
        </div>

        {/* Map pane */}
        <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10">
          <div ref={mapDivRef} className="absolute inset-0" />

          {/* Subtle attribution pill — required by OSM tile usage */}
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] bg-black/55 text-white/65 pointer-events-none">
            © OpenStreetMap
          </div>

          {/* Round-result floating panel */}
          {phase === "result" && lastResult && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/75 backdrop-blur-sm border border-white/15 text-white text-center shadow-lg">
              <div className="text-3xl font-black tabular-nums">
                {lastResult.score.toLocaleString()}
              </div>
              <div className="text-[10px] uppercase tracking-wider opacity-70 font-bold">
                {lastResult.distanceKm < 1
                  ? "right on top!"
                  : `${Math.round(lastResult.distanceKm).toLocaleString()} km off`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 flex items-center justify-center gap-2 p-2 border-t border-white/10 bg-black/30">
        {phase === "guessing" && (
          <>
            <span className="text-white/60 text-xs hidden sm:inline">
              Click the map to drop a pin, then submit your guess.
            </span>
            <button
              onClick={submitGuess}
              disabled={!guessLatLng}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-black font-black text-sm transition-colors"
            >
              {guessLatLng ? "▶ Submit guess" : "Drop a pin first"}
            </button>
          </>
        )}
        {phase === "result" && (
          <button
            onClick={nextRound}
            className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition-colors"
          >
            {round + 1 >= TOTAL_ROUNDS ? "See results →" : "Next round →"}
          </button>
        )}
        {phase === "loading" && (
          <span className="text-white/60 text-xs">Preparing the round…</span>
        )}
      </div>

      {/* Intro overlay */}
      {phase === "intro" && (
        <GameOverlay
          icon="🌍"
          title="GeoGuessr"
          subtitle={
            <>
              5 rounds. Each round shows a photo of a famous landmark.{" "}
              <b>Click the map</b> to guess where it is. Score is based on how
              close you are — closer = more points (max{" "}
              <b>{MAX_ROUND_SCORE.toLocaleString()}</b> per round).
            </>
          }
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}

      {/* Round summary */}
      {isOver && (
        <GameOverlay
          icon={totalScore >= 20000 ? "🏆" : totalScore >= 12000 ? "🎯" : "🌐"}
          title={
            totalScore >= 20000
              ? "Globetrotter!"
              : totalScore >= 12000
                ? "Solid run"
                : "Round over"
          }
          subtitle={
            <>
              Total <b>{totalScore.toLocaleString()}</b> /{" "}
              {(MAX_ROUND_SCORE * TOTAL_ROUNDS).toLocaleString()}
              {totalScore >= best && totalScore > 0 ? <> · 🏆 new best!</> : null}
            </>
          }
          primary={{ label: "Play again", onClick: start }}
        >
          {/* Per-round breakdown */}
          <div className="w-full max-w-sm space-y-1 text-white/85 text-xs my-2">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-white/5"
              >
                <span className="truncate">
                  <b>{i + 1}.</b> {r.landmark.name}
                </span>
                <span className="opacity-70 text-[10px] tabular-nums">
                  {Math.round(r.distanceKm).toLocaleString()} km
                </span>
                <span className="text-emerald-300 font-bold tabular-nums w-14 text-right">
                  {r.score.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <ScoreStatus
            gameSlug="geoguessr-clone"
            status={submitStatus}
          />
        </GameOverlay>
      )}

      {/* Pin styling — Leaflet's default markers depend on bundled
          image URLs that break under Webpack/Turbopack. We use
          divIcons with inline emoji + custom CSS instead. */}
      <style>{`
        .geo-pin {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
          transform-origin: 50% 100%;
        }
        .geo-pin-guess {
          color: #38bdf8;
        }
        .geo-pin-actual {
          color: #fb7185;
          animation: geo-bounce 0.5s ease-out;
        }
        @keyframes geo-bounce {
          0% { transform: translateY(-30px) scale(0.6); opacity: 0; }
          70% { transform: translateY(4px) scale(1.05); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        /* Leaflet zoom controls — restyle to match the dark theme */
        .leaflet-bar {
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          background: transparent !important;
        }
        .leaflet-bar a {
          background: rgba(0, 0, 0, 0.65) !important;
          color: white !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        .leaflet-bar a:hover {
          background: rgba(0, 0, 0, 0.85) !important;
        }
      `}</style>
    </div>
  );
}

