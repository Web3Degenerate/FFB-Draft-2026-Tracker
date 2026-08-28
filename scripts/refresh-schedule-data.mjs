import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SEASON = 2026;
const ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=50";
const ESPN_SCHEDULE_URL = (teamId) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${SEASON}&seasontype=2`;
const FANTASY_PROS_URL = (position) => `https://www.fantasypros.com/nfl/matchups/${position.toLowerCase()}.php`;
const OUTPUT_PATH = path.join(process.cwd(), "lib", "nfl-schedule-data-2026.json");
const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];
const MAX_GRADE_BUCKET_CHANGE = 8;

function normalizeAbbreviation(value) {
  return ({ JAC: "JAX", WSH: "WAS" })[value] ?? value;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "FFB-2026-Codex-War-Room/1.0" } });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function matchupRatingsFromHtml(html, position) {
  const ratings = new Map();
  const pattern = /This is a ([1-5]) star matchup\.[^<\"]*?vs\. ([A-Z]{2,3}) who currently ranks #(\d+) against this position/g;
  for (const match of html.matchAll(pattern)) {
    const opponent = normalizeAbbreviation(match[2]);
    const rating = { grade: Number(match[1]), rank: Number(match[3]) };
    const prior = ratings.get(opponent);
    if (prior && (prior.grade !== rating.grade || prior.rank !== rating.rank)) {
      throw new Error(`${position} ratings disagree for ${opponent}`);
    }
    ratings.set(opponent, rating);
  }
  if (ratings.size !== 32) throw new Error(`${position} returned ${ratings.size} opponent ratings instead of 32`);
  return Object.fromEntries([...ratings.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function gradeCounts(ratings) {
  const counts = Object.fromEntries([1, 2, 3, 4, 5].map((grade) => [grade, 0]));
  Object.values(ratings).forEach((rating) => { counts[rating.grade] += 1; });
  return counts;
}

async function validateAgainstPrevious(snapshot) {
  let previous;
  try { previous = JSON.parse(await readFile(OUTPUT_PATH, "utf8")); } catch { return; }
  const priorTeams = previous.teams?.map((team) => team.abbreviation).sort().join(",");
  const nextTeams = snapshot.teams.map((team) => team.abbreviation).sort().join(",");
  if (priorTeams && priorTeams !== nextTeams) throw new Error("NFL team set changed; refusing to replace the known-good schedule snapshot");
  for (const position of POSITIONS) {
    const prior = gradeCounts(previous.ratings?.[position] ?? {});
    const next = gradeCounts(snapshot.ratings[position]);
    for (const grade of [1, 2, 3, 4, 5]) {
      if (Math.abs(prior[grade] - next[grade]) > MAX_GRADE_BUCKET_CHANGE) {
        throw new Error(`${position} grade ${grade} count moved from ${prior[grade]} to ${next[grade]}; refusing overwrite beyond tolerance ${MAX_GRADE_BUCKET_CHANGE}`);
      }
    }
  }
}

const teamsPayload = await fetchJson(ESPN_TEAMS_URL);
const rawTeams = teamsPayload.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => entry.team) ?? [];
if (rawTeams.length !== 32) throw new Error(`ESPN returned ${rawTeams.length} NFL teams instead of 32`);

const teams = await mapWithConcurrency(rawTeams, 6, async (team) => {
  const schedule = await fetchJson(ESPN_SCHEDULE_URL(team.id));
  const games = (schedule.events ?? []).flatMap((event) => {
    if (event.seasonType?.type !== 2) return [];
    const competition = event.competitions?.[0];
    const current = competition?.competitors?.find((competitor) => String(competitor.id) === String(team.id));
    const opponent = competition?.competitors?.find((competitor) => String(competitor.id) !== String(team.id));
    if (!current || !opponent?.team?.abbreviation || !event.week?.number) return [];
    return [{
      week: Number(event.week.number),
      opponent: normalizeAbbreviation(opponent.team.abbreviation),
      homeAway: current.homeAway === "away" ? "away" : "home",
      neutralSite: Boolean(competition.neutralSite),
      date: event.date,
    }];
  }).sort((a, b) => a.week - b.week);
  if (games.length !== 17) throw new Error(`${team.displayName} returned ${games.length} regular-season games instead of 17`);
  return {
    id: Number(team.id),
    abbreviation: normalizeAbbreviation(team.abbreviation),
    displayName: team.displayName,
    shortName: team.shortDisplayName,
    color: `#${team.color || "33424a"}`,
    logo: team.logos?.[0]?.href ?? "",
    games,
  };
});

const ratings = Object.fromEntries(await Promise.all(POSITIONS.map(async (position) => {
  const html = await fetchText(FANTASY_PROS_URL(position));
  return [position, matchupRatingsFromHtml(html, position)];
})));

const snapshot = {
  season: SEASON,
  generatedAt: new Date().toISOString(),
  sources: {
    schedules: "https://www.espn.com/nfl/schedule/_/year/2026",
    officialSchedule: "https://www.nfl.com/schedules/2026/by-team",
    matchupRatings: Object.fromEntries(POSITIONS.map((position) => [position, FANTASY_PROS_URL(position)])),
  },
  methodology: {
    QB: "FantasyPros preseason matchup rating of opponent defenses for quarterback scoring.",
    RB: "FantasyPros preseason matchup rating of opponent defenses for running back scoring.",
    WR: "FantasyPros preseason matchup rating of opponent defenses for wide receiver scoring.",
    TE: "FantasyPros preseason matchup rating of opponent defenses for tight end scoring.",
    K: "FantasyPros preseason matchup rating of opponent defenses and kicking environments for kicker scoring.",
    DST: "FantasyPros preseason matchup rating of opponent offenses for D/ST scoring, including offense-driven sack and turnover opportunity.",
  },
  teams: teams.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  ratings,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await validateAgainstPrevious(snapshot);
const temporaryPath = `${OUTPUT_PATH}.tmp-${process.pid}`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryPath, OUTPUT_PATH);
} finally {
  await rm(temporaryPath, { force: true });
}
console.log(`Saved ${snapshot.teams.length} teams and ${Object.keys(snapshot.ratings).length} position models to ${OUTPUT_PATH}`);
