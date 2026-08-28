import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EDITIONS = [
  { year: 2023, sourceUrl: "https://fantasyindex.com/members/rankings/1204/68208", projectionsUpdatedAt: "2023-08-14T05:00:00-04:00" },
  { year: 2024, sourceUrl: "https://fantasyindex.com/members/rankings/1286/68208", projectionsUpdatedAt: "2024-08-29T16:00:00-04:00" },
  { year: 2025, sourceUrl: "https://fantasyindex.com/members/rankings/1359/68208", projectionsUpdatedAt: "2025-08-28T14:00:00-04:00" },
  { year: 2026, sourceUrl: "https://fantasyindex.com/members/rankings/1427/68208", projectionsUpdatedAt: "2026-08-20T15:00:00-04:00" },
];

const SECTION_POSITIONS = new Map([
  ["QUARTERBACKS", "QB"],
  ["RUNNING BACKS", "RB"],
  ["WIDE RECEIVERS", "WR"],
  ["TIGHT ENDS", "TE"],
  ["KICKERS", "PK"],
  ["SPECIAL TEAMS", "ST"],
]);

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function playerKey(position, team, name) {
  return `${position}:${team}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function parseEdition(text, edition, retrievedAt) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const overallStart = lines.findIndex((line) => line.trim() === "ALL POSITIONS");
  if (overallStart < 0) throw new Error(`${edition.year}: ALL POSITIONS section not found`);

  const overallRanks = new Map();
  for (let index = overallStart + 2; index < lines.length && lines[index].trim(); index += 1) {
    const [rank, position, team, name, bye] = parseCsvLine(lines[index]);
    overallRanks.set(playerKey(position, team, name), {
      overallRank: Number(rank),
      bye: Number(bye),
    });
  }

  const rankings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const position = SECTION_POSITIONS.get(lines[index].trim());
    if (!position) continue;
    let rowIndex = index + 1;
    while (rowIndex < lines.length && !lines[rowIndex].trim()) rowIndex += 1;
    if (lines[rowIndex]?.trim() !== "Rank,Team,Name,Bye,Points") {
      throw new Error(`${edition.year}: malformed ${lines[index].trim()} section`);
    }
    rowIndex += 1;
    while (rowIndex < lines.length && lines[rowIndex].trim()) {
      const fields = parseCsvLine(lines[rowIndex]);
      if (fields.length !== 5 || !/^\d+$/.test(fields[0])) break;
      const [rank, team, name, bye, points] = fields;
      const overall = overallRanks.get(playerKey(position, team, name));
      rankings.push({
        overallRank: overall?.overallRank ?? null,
        positionalRank: Number(rank),
        position,
        team,
        name,
        bye: Number(bye),
        projectedPoints: Number(points),
      });
      rowIndex += 1;
    }
  }

  if (rankings.length < 300) throw new Error(`${edition.year}: only ${rankings.length} rankings parsed`);
  return { ...edition, retrievedAt, rankings };
}

function inputForYear(year) {
  const prefix = `--${year}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!argument) throw new Error(`Missing ${prefix}<csv path>`);
  return argument.slice(prefix.length);
}

const retrievedAt = new Date().toISOString();
const seasons = [];
for (const edition of EDITIONS) {
  const input = inputForYear(edition.year);
  seasons.push(parseEdition(await readFile(input, "utf8"), edition, retrievedAt));
}

const dataDirectory = path.join(process.cwd(), "data");
await mkdir(dataDirectory, { recursive: true });
await writeFile(
  path.join(dataDirectory, "fantasy-index-history.json"),
  `${JSON.stringify({ version: 1, generatedAt: retrievedAt, seasons: seasons.sort((a, b) => b.year - a.year) }, null, 2)}\n`,
  "utf8",
);

const current = seasons.find(({ year }) => year === 2026);
if (!current) throw new Error("2026 rankings are missing");
await writeFile(
  path.join(dataDirectory, "fantasy-index-rankings.json"),
  `${JSON.stringify({
    sourceUrl: current.sourceUrl,
    retrievedAt: current.retrievedAt,
    projectionsUpdatedAt: current.projectionsUpdatedAt,
    rankings: current.rankings.map(({ name, position, team, positionalRank, projectedPoints }) => ({
      name: position === "ST" ? `${name} D/ST` : name,
      position,
      team,
      positionalRank,
      projectedPoints,
    })),
  }, null, 2)}\n`,
  "utf8",
);

console.log(seasons.map(({ year, rankings }) => `${year}: ${rankings.length} rankings`).join("\n"));
