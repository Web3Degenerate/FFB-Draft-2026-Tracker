import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");
const URLS = {
  ids: "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv",
  sleeper: "https://api.sleeper.app/v1/players/nfl",
  trending: "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=200",
  stats: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_2025.csv",
  snaps: "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv",
  injuries: "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv",
  games: "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
  ffc: "https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026&position=all",
  fantasyPros: "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php",
};
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 CodexFFB/1.0";
const reports = [];
const unmatched = {};

async function readJson(file) {
  try { return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWrite(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  const target = path.join(DATA_DIR, file);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

async function fetchText(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, ...headers } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const numberValue = (value) => value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? undefined : Number(value);
const stringValue = (value) => value === null || value === undefined || String(value).trim() === "" ? undefined : String(value).trim();
const normalizeName = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/g, " ").replace(/\s+/g, " ").trim();
const normalizePosition = (value) => value === "DEF" || value === "D/ST" ? "DST" : value === "PK" ? "K" : value;
const normalizeTeam = (value) => ({ LA: "LAR", JAC: "JAX", WSH: "WAS" }[value] ?? value);
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

function extractFantasyProsEcr(html) {
  const marker = html.search(/var\s+ecrData\s*=\s*/);
  if (marker < 0) throw new Error("FantasyPros ecrData payload was not found");
  const source = html.slice(marker).replace(/^var\s+ecrData\s*=\s*/, "");
  const start = source.indexOf("{");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }
  throw new Error("FantasyPros ecrData payload was incomplete");
}

async function runSource(source, file, operation) {
  const previous = await readJson(file);
  try {
    const result = await operation();
    const fetchedAt = new Date().toISOString();
    await atomicWrite(file, { version: 1, source, fetchedAt, ...result.cache });
    reports.push({ source, status: "ok", fetchedAt, rowsIn: result.rowsIn, rowsMatched: result.rowsMatched, rowsUnmatched: result.rowsUnmatched });
    if (result.unmatched?.length) unmatched[source] = result.unmatched;
    return { version: 1, source, fetchedAt, ...result.cache };
  } catch (error) {
    reports.push({ source, status: previous ? "stale" : "failed", fetchedAt: previous?.fetchedAt, error: error instanceof Error ? error.message : String(error) });
    return previous;
  }
}

const playerCache = JSON.parse(await readFile(PLAYERS_PATH, "utf8"));
const players = playerCache.players;
const knownEspnIds = new Set(players.map((player) => String(player.id)));
const skillPlayers = players.filter((player) => ["QB", "RB", "WR", "TE"].includes(player.position)).sort((a, b) => a.overallRank - b.overallRank);

const idCache = await runSource("ID crosswalk", "player-ids.json", async () => {
  const rows = parseCsv(await fetchText(URLS.ids));
  const byEspn = new Map();
  rows.forEach((row) => {
    const espnId = stringValue(row.espn_id)?.replace(/\.0$/, "");
    if (!espnId || !knownEspnIds.has(espnId)) return;
    const prior = byEspn.get(espnId);
    if (prior && (numberValue(prior.db_season) ?? 0) > (numberValue(row.db_season) ?? 0)) return;
    byEspn.set(espnId, row);
  });
  const output = {};
  byEspn.forEach((row, espnId) => {
    output[espnId] = {
      espnId: Number(espnId), sleeperId: stringValue(row.sleeper_id), gsisId: stringValue(row.gsis_id),
      pfrId: stringValue(row.pfr_id), fantasyProsId: stringValue(row.fantasypros_id)?.replace(/\.0$/, ""),
      name: stringValue(row.name), position: normalizePosition(row.position), team: normalizeTeam(row.team), dbSeason: numberValue(row.db_season),
    };
  });
  const top = skillPlayers.slice(0, 200);
  const fullyCovered = top.filter((player) => {
    const ids = output[player.id];
    return ids?.sleeperId && ids?.gsisId && ids?.fantasyProsId;
  });
  const coverage = fullyCovered.length / Math.max(1, top.length);
  if (coverage < 0.95) throw new Error(`Top-200 ESPN ID coverage ${(coverage * 100).toFixed(1)}% is below the 95% gate`);
  return { cache: { coverageTop200: coverage, players: output }, rowsIn: rows.length, rowsMatched: Object.keys(output).length, rowsUnmatched: players.length - Object.keys(output).length };
});

const ids = idCache?.players ?? {};
const reverse = (field) => new Map(Object.values(ids).flatMap((record) => record[field] ? [[String(record[field]), String(record.espnId)]] : []));
const sleeperToEspn = reverse("sleeperId");
const gsisToEspn = reverse("gsisId");
const pfrToEspn = reverse("pfrId");
const fpToEspn = reverse("fantasyProsId");

await Promise.all([
  runSource("Sleeper", "sleeper-players.json", async () => {
    const [raw, trending] = await Promise.all([fetchText(URLS.sleeper), fetchText(URLS.trending)]);
    const all = JSON.parse(raw);
    const trendingCounts = new Map(JSON.parse(trending).map((item) => [String(item.player_id), numberValue(item.count) ?? 0]));
    const output = {};
    Object.entries(all).forEach(([sleeperId, player]) => {
      const espnId = sleeperToEspn.get(sleeperId);
      if (!espnId) return;
      output[espnId] = {
        injuryStatus: stringValue(player.injury_status), injuryBodyPart: stringValue(player.injury_body_part),
        injuryNotes: stringValue(player.injury_notes), practiceParticipation: stringValue(player.practice_participation),
        status: stringValue(player.status), depthChartPosition: stringValue(player.depth_chart_position),
        depthChartOrder: numberValue(player.depth_chart_order), age: numberValue(player.age), yearsExp: numberValue(player.years_exp),
        searchRank: numberValue(player.search_rank), team: normalizeTeam(stringValue(player.team)), number: numberValue(player.number),
        trendingAddCount: trendingCounts.get(sleeperId) ?? 0,
      };
    });
    return { cache: { players: output }, rowsIn: Object.keys(all).length, rowsMatched: Object.keys(output).length, rowsUnmatched: players.length - Object.keys(output).length };
  }),
  runSource("nflverse usage", "nflverse-usage.json", async () => {
    const [statsRows, snapRows] = await Promise.all([fetchText(URLS.stats).then(parseCsv), fetchText(URLS.snaps).then(parseCsv)]);
    const output = {};
    const fields = {
      games: "games", targets: "targets", receptions: "receptions", receivingYards: "receiving_yards", receivingTds: "receiving_tds",
      receivingAirYards: "receiving_air_yards", receivingYardsAfterCatch: "receiving_yards_after_catch", receivingFirstDowns: "receiving_first_downs",
      targetShare: "target_share", airYardsShare: "air_yards_share", wopr: "wopr", racr: "racr", receivingEpa: "receiving_epa",
      carries: "carries", rushingYards: "rushing_yards", rushingTds: "rushing_tds", rushingFirstDowns: "rushing_first_downs", rushingEpa: "rushing_epa",
      attempts: "attempts", completions: "completions", passingYards: "passing_yards", passingTds: "passing_tds",
      passingInterceptions: "passing_interceptions", passingEpa: "passing_epa", passingCpoe: "passing_cpoe", pacr: "pacr",
    };
    statsRows.forEach((row) => {
      const espnId = gsisToEspn.get(row.player_id);
      if (!espnId) return;
      output[espnId] = Object.fromEntries(Object.entries(fields).flatMap(([target, source]) => numberValue(row[source]) === undefined ? [] : [[target, numberValue(row[source])]]));
    });
    const snapGroups = new Map();
    snapRows.filter((row) => row.game_type === "REG").forEach((row) => {
      const espnId = pfrToEspn.get(row.pfr_player_id);
      if (!espnId) return;
      const pct = numberValue(row.offense_pct);
      const snaps = numberValue(row.offense_snaps);
      if (pct === undefined || snaps === undefined) return;
      if (!snapGroups.has(espnId)) snapGroups.set(espnId, []);
      snapGroups.get(espnId).push({ week: numberValue(row.week) ?? 0, pct, snaps });
    });
    snapGroups.forEach((games, espnId) => {
      const sorted = games.sort((a, b) => a.week - b.week);
      output[espnId] ??= {};
      output[espnId].snapsTotal = sorted.reduce((sum, game) => sum + game.snaps, 0);
      output[espnId].snapPctMean = mean(sorted.map((game) => game.pct));
      output[espnId].snapPctLast4 = mean(sorted.slice(-4).map((game) => game.pct));
    });
    return { cache: { season: 2025, players: output }, rowsIn: statsRows.length + snapRows.length, rowsMatched: Object.keys(output).length, rowsUnmatched: players.length - Object.keys(output).length };
  }),
  runSource("nflverse injuries", "nflverse-injuries.json", async () => {
    const rows = parseCsv(await fetchText(URLS.injuries)).filter((row) => row.season_type === "REG");
    const grouped = new Map();
    rows.forEach((row) => {
      const espnId = gsisToEspn.get(row.gsis_id);
      if (!espnId) return;
      if (!grouped.has(espnId)) grouped.set(espnId, []);
      grouped.get(espnId).push(row);
    });
    const output = {};
    grouped.forEach((reportsForPlayer, espnId) => {
      const latest = reportsForPlayer.sort((a, b) => Number(b.week) - Number(a.week))[0];
      output[espnId] = {
        primaryInjury: stringValue(latest.report_primary_injury) ?? stringValue(latest.practice_primary_injury),
        reportStatus: stringValue(latest.report_status), practiceStatus: stringValue(latest.practice_status),
        week: numberValue(latest.week), weeksOnReport2025: new Set(reportsForPlayer.map((row) => row.week)).size,
      };
    });
    return { cache: { season: 2025, players: output }, rowsIn: rows.length, rowsMatched: Object.keys(output).length, rowsUnmatched: players.length - Object.keys(output).length };
  }),
  runSource("nflverse Vegas", "vegas-schedule.json", async () => {
    const allRows = parseCsv(await fetchText(URLS.games));
    const rows = allRows.filter((row) => Number(row.season) === 2026 && row.game_type === "REG");
    const games = rows.map((row) => ({
      gameId: row.game_id, week: Number(row.week), homeTeam: normalizeTeam(row.home_team), awayTeam: normalizeTeam(row.away_team),
      totalLine: numberValue(row.total_line), spreadLine: numberValue(row.spread_line),
    }));
    if (games.length !== 272) throw new Error(`Expected 272 2026 regular-season games, found ${games.length}`);
    const teams = [...new Set(games.flatMap((game) => [game.homeTeam, game.awayTeam]))].sort();
    if (teams.length !== 32) throw new Error(`Expected 32 NFL teams, found ${teams.length}`);
    const environments = {};
    teams.forEach((team) => {
      const teamGames = games.filter((game) => game.homeTeam === team || game.awayTeam === team);
      const playedWeeks = new Set(teamGames.map((game) => game.week));
      const byes = Array.from({ length: 18 }, (_, index) => index + 1).filter((week) => !playedWeeks.has(week));
      if (byes.length !== 1) throw new Error(`${team} has ${byes.length} derived bye weeks`);
      const lines = teamGames.flatMap((game) => {
        if (game.totalLine === undefined || game.spreadLine === undefined) return [];
        const home = game.totalLine / 2 + game.spreadLine / 2;
        const away = game.totalLine / 2 - game.spreadLine / 2;
        return [{ week: game.week, own: game.homeTeam === team ? home : away, opponent: game.homeTeam === team ? away : home }];
      });
      environments[team] = {
        nflTeam: team, byeWeek: byes[0], impliedTotalMean: mean(lines.map((line) => line.own)),
        impliedTotalPlayoffs: mean(lines.filter((line) => line.week >= 15 && line.week <= 17).map((line) => line.own)),
        gamesWithLines: lines.length, opponentDifficultyMean: mean(lines.map((line) => line.opponent)),
      };
    });
    const signRows = allRows.filter((row) => Number(row.season) === 2025 && row.game_type === "REG" && numberValue(row.spread_line) !== undefined && numberValue(row.home_score) !== undefined && numberValue(row.away_score) !== undefined);
    const xs = signRows.map((row) => Number(row.spread_line));
    const ys = signRows.map((row) => Number(row.home_score) - Number(row.away_score));
    const meanX = mean(xs); const meanY = mean(ys);
    const numerator = xs.reduce((sum, x, index) => sum + ((x - meanX) * (ys[index] - meanY)), 0);
    const correlation = numerator / Math.sqrt(xs.reduce((sum, x) => sum + ((x - meanX) ** 2), 0) * ys.reduce((sum, y) => sum + ((y - meanY) ** 2), 0));
    if (!(correlation > 0)) throw new Error(`Spread sign correlation ${correlation.toFixed(3)} is not positive`);
    return { cache: { season: 2026, spreadSignCorrelation2025: correlation, games, teams: environments }, rowsIn: allRows.length, rowsMatched: games.length, rowsUnmatched: 0 };
  }),
  runSource("FFC ADP", "ffc-adp.json", async () => {
    const response = JSON.parse(await fetchText(URLS.ffc));
    if (response.status !== "Success" || !Array.isArray(response.players)) throw new Error("FFC returned an unexpected payload");
    const candidates = players.map((player) => ({ ...player, normalized: normalizeName(player.name) }));
    const output = {};
    const missed = [];
    response.players.forEach((row) => {
      const normalized = normalizeName(row.name);
      const position = normalizePosition(row.position);
      const matches = candidates.filter((player) => player.normalized === normalized && player.position === position);
      if (matches.length !== 1) { missed.push(`${row.name} (${position})`); return; }
      const player = matches[0];
      output[player.id] = {
        adp: numberValue(row.adp), adpFormatted: stringValue(row.adp_formatted), timesDrafted: numberValue(row.times_drafted),
        high: numberValue(row.high), low: numberValue(row.low), stdev: numberValue(row.stdev), bye: numberValue(row.bye),
        position, team: normalizeTeam(row.team),
      };
    });
    return { cache: { meta: response.meta, players: output }, rowsIn: response.players.length, rowsMatched: Object.keys(output).length, rowsUnmatched: missed.length, unmatched: missed };
  }),
  runSource("FantasyPros ECR", "fantasypros-ecr.json", async () => {
    const ecr = extractFantasyProsEcr(await fetchText(URLS.fantasyPros, { Accept: "text/html" }));
    const rows = Array.isArray(ecr.players) ? ecr.players : [];
    if (!rows.length) throw new Error("FantasyPros ecrData contained no players");
    const output = {};
    rows.forEach((row) => {
      const fantasyProsId = String(row.player_id ?? row.id ?? "").replace(/\.0$/, "");
      const espnId = fpToEspn.get(fantasyProsId);
      if (!espnId) return;
      output[espnId] = {
        rankEcr: numberValue(row.rank_ecr), rankMin: numberValue(row.rank_min), rankMax: numberValue(row.rank_max),
        rankAve: numberValue(row.rank_ave), rankStd: numberValue(row.rank_std), posRank: stringValue(row.pos_rank),
        tier: numberValue(row.tier), ownedAvg: numberValue(row.player_owned_avg), byeWeek: numberValue(row.player_bye_week),
      };
    });
    return { cache: { lastUpdated: ecr.last_updated, totalExperts: ecr.total_experts, players: output }, rowsIn: rows.length, rowsMatched: Object.keys(output).length, rowsUnmatched: rows.length - Object.keys(output).length };
  }),
]);

const meta = { version: 1, updatedAt: new Date().toISOString(), sources: reports, unmatched };
await atomicWrite("player-data-meta.json", meta);
console.table(reports.map(({ source, status, rowsIn = 0, rowsMatched = 0, rowsUnmatched = 0, error = "" }) => ({ source, status, rowsIn, rowsMatched, rowsUnmatched, error })));
if (reports.some((report) => report.status === "failed")) process.exitCode = 1;
