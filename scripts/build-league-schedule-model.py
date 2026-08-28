#!/usr/bin/env python3
"""Build UTH Wink QB and D/ST opponent adjustments from 2024-25 nflverse play-by-play."""

from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

SEASONS = {2024: 0.35, 2025: 0.65}
QB_BASELINE_WEIGHT = 0.75
QB_SACK_RATE_WEIGHT = 0.25
DST_BASELINE_WEIGHT = 0.40
DST_CUSTOM_WEIGHT = 0.60


def normalize_team(value: str) -> str:
    return {"LA": "LAR", "JAC": "JAX", "WSH": "WAS"}.get(value, value)


def points_allowed_ladder(points: float) -> float:
    if points == 0:
        return 15
    if points <= 6:
        return 11
    if points <= 13:
        return 6
    if points <= 17:
        return 2
    if points <= 21:
        return 0
    if points <= 27:
        return -1
    if points <= 34:
        return -2
    if points <= 45:
        return -3
    return -4


def ordinal_ranks(values: dict[str, float], higher_is_favorable: bool) -> dict[str, int]:
    ordered = sorted(values, key=lambda team: ((-values[team]) if higher_is_favorable else values[team], team))
    return {team: index + 1 for index, team in enumerate(ordered)}


def rank_score(rank: int) -> float:
    return 100 - ((rank - 1) / 31) * 100


def season_metrics(path: Path) -> dict[str, dict[str, float]]:
    columns = [
        "game_id", "home_team", "away_team", "season_type", "posteam", "defteam",
        "qb_dropback", "sack", "interception", "fumble_forced", "fumble_lost",
        "tackled_for_loss", "safety", "return_touchdown", "home_score", "away_score",
    ]
    frame = pd.read_parquet(path, columns=columns)
    frame = frame[(frame["season_type"] == "REG") & frame["posteam"].notna()].copy()
    frame["posteam"] = frame["posteam"].map(normalize_team)
    frame["defteam"] = frame["defteam"].map(normalize_team)
    for column in ["qb_dropback", "sack", "interception", "fumble_forced", "fumble_lost", "tackled_for_loss", "safety", "return_touchdown"]:
        frame[column] = frame[column].fillna(0)

    defensive = frame.groupby("defteam", observed=True).agg(dropbacks=("qb_dropback", "sum"), sacks=("sack", "sum"))
    sack_rates = (defensive["sacks"] / defensive["dropbacks"]).to_dict()

    frame["stuff"] = ((frame["tackled_for_loss"] == 1) & (frame["sack"] != 1)).astype(int)
    frame["turnover_td"] = (((frame["interception"] == 1) | (frame["fumble_lost"] == 1)) & (frame["return_touchdown"] == 1)).astype(int)
    offense = frame.groupby("posteam", observed=True).agg(
        games=("game_id", "nunique"),
        sacks_allowed=("sack", "sum"),
        interceptions=("interception", "sum"),
        forced_fumbles=("fumble_forced", "sum"),
        fumbles_lost=("fumble_lost", "sum"),
        stuffs_allowed=("stuff", "sum"),
        safeties_allowed=("safety", "sum"),
        turnover_tds_allowed=("turnover_td", "sum"),
    )

    games = frame.groupby("game_id", observed=True).agg(
        home_team=("home_team", "first"), away_team=("away_team", "first"),
        home_score=("home_score", "max"), away_score=("away_score", "max"),
    )
    ladder_totals: dict[str, float] = {}
    for row in games.itertuples(index=False):
        home = normalize_team(row.home_team)
        away = normalize_team(row.away_team)
        ladder_totals[home] = ladder_totals.get(home, 0) + points_allowed_ladder(row.home_score)
        ladder_totals[away] = ladder_totals.get(away, 0) + points_allowed_ladder(row.away_score)

    result: dict[str, dict[str, float]] = {}
    for team, row in offense.iterrows():
        games_played = float(row["games"])
        custom_total = (
            row["sacks_allowed"]
            + 2 * row["interceptions"]
            + 0.5 * row["forced_fumbles"]
            + 1.5 * row["fumbles_lost"]
            + row["stuffs_allowed"]
            + 4 * row["safeties_allowed"]
            + 6 * row["turnover_tds_allowed"]
            + ladder_totals[team]
        )
        result[team] = {
            "sackRate": float(sack_rates[team]),
            "customDstPointsAllowedPerGame": float(custom_total / games_played),
            "sacksAllowedPerGame": float(row["sacks_allowed"] / games_played),
            "giveawaysPerGame": float((row["interceptions"] + row["fumbles_lost"]) / games_played),
            "forcedFumblesPerGame": float(row["forced_fumbles"] / games_played),
            "stuffsAllowedPerGame": float(row["stuffs_allowed"] / games_played),
            "turnoverTdsAllowedPerGame": float(row["turnover_tds_allowed"] / games_played),
        }
    return result


def weighted_metrics(pbp_dir: Path) -> dict[str, dict[str, float]]:
    seasons = {season: season_metrics(pbp_dir / f"play_by_play_{season}.parquet") for season in SEASONS}
    teams = set.intersection(*(set(metrics) for metrics in seasons.values()))
    if len(teams) != 32:
        raise RuntimeError(f"Play-by-play produced {len(teams)} common teams instead of 32")
    keys = next(iter(seasons.values()))[next(iter(teams))].keys()
    return {
        team: {
            key: sum(SEASONS[season] * seasons[season][team][key] for season in SEASONS)
            for key in keys
        }
        for team in teams
    }


def build_model(schedule_path: Path, pbp_dir: Path) -> dict:
    schedule = json.loads(schedule_path.read_text())
    history = weighted_metrics(pbp_dir)
    schedule_teams = {team["abbreviation"] for team in schedule["teams"]}
    if set(history) != schedule_teams:
        raise RuntimeError(f"Historical teams do not match schedule teams: {sorted(set(history) ^ schedule_teams)}")

    qb_pressure_ranks = ordinal_ranks({team: metrics["sackRate"] for team, metrics in history.items()}, higher_is_favorable=False)
    qb_scores = {
        team: QB_BASELINE_WEIGHT * rank_score(schedule["ratings"]["QB"][team]["rank"])
        + QB_SACK_RATE_WEIGHT * rank_score(qb_pressure_ranks[team])
        for team in schedule_teams
    }
    qb_ranks = ordinal_ranks(qb_scores, higher_is_favorable=True)

    dst_custom_ranks = ordinal_ranks({team: metrics["customDstPointsAllowedPerGame"] for team, metrics in history.items()}, higher_is_favorable=True)
    dst_scores = {
        team: DST_BASELINE_WEIGHT * rank_score(schedule["ratings"]["DST"][team]["rank"])
        + DST_CUSTOM_WEIGHT * rank_score(dst_custom_ranks[team])
        for team in schedule_teams
    }
    dst_ranks = ordinal_ranks(dst_scores, higher_is_favorable=True)

    return {
        "season": schedule["season"],
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "sources": {
            "playByPlay2024": "nflverse play_by_play_2024.parquet",
            "playByPlay2025": "nflverse play_by_play_2025.parquet",
            "leagueScoring": "UTH Wink custom ESPN scoring (scoring.md)",
        },
        "methodology": {
            "QB": "UTH adjusted: 75% current FantasyPros opponent rank and 25% two-year defensive sack-rate rank, reflecting the league's -0.5 points per sack taken.",
            "DST": "UTH adjusted: 40% current FantasyPros opponent rank and 60% two-year custom D/ST opportunity rank using sacks, interceptions, forced fumbles, recoveries, stuffs, safeties, turnover touchdowns, and the league's points-allowed ladder.",
        },
        "positions": {
            "QB": {
                team: {
                    "rank": qb_ranks[team], "score": round(qb_scores[team], 3),
                    "baselineRank": schedule["ratings"]["QB"][team]["rank"],
                    "sackRateRank": qb_pressure_ranks[team], "sackRate": round(history[team]["sackRate"], 5),
                }
                for team in sorted(schedule_teams)
            },
            "DST": {
                team: {
                    "rank": dst_ranks[team], "score": round(dst_scores[team], 3),
                    "baselineRank": schedule["ratings"]["DST"][team]["rank"],
                    "customRank": dst_custom_ranks[team],
                    **{key: round(value, 3) for key, value in history[team].items() if key != "sackRate"},
                }
                for team in sorted(schedule_teams)
            },
        },
    }


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--pbp-dir", type=Path, default=project.parent / "FFB-2026-Model" / "data" / "raw" / "nflverse")
    parser.add_argument("--schedule", type=Path, default=project / "lib" / "nfl-schedule-data-2026.json")
    parser.add_argument("--output", type=Path, default=project / "lib" / "nfl-schedule-league-model-2026.json")
    args = parser.parse_args()
    model = build_model(args.schedule, args.pbp_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(f".tmp-{os.getpid()}.json")
    temporary.write_text(json.dumps(model, indent=2) + "\n")
    temporary.replace(args.output)
    print(f"Saved UTH QB and D/ST opponent models to {args.output}")


if __name__ == "__main__":
    main()
