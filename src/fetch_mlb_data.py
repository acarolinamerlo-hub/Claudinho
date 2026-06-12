#!/usr/bin/env python3
"""Fetches daily MLB data from the official Stats API and writes data/mlb_data.json."""

import json
import os
import sys
from datetime import date, datetime, timezone

import requests

BASE_URL = "https://statsapi.mlb.com/api/v1"
SEASON = date.today().year
TODAY = date.today().isoformat()

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; mlb-dashboard/1.0)",
    "Accept": "application/json",
    "Origin": "https://www.mlb.com",
    "Referer": "https://www.mlb.com/",
})


def get(path: str, **params) -> dict:
    url = f"{BASE_URL}{path}"
    resp = session.get(url, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def fetch_schedule() -> list[dict]:
    data = get("/schedule", sportId=1, date=TODAY, hydrate="linescore,team")
    games = []
    for date_entry in data.get("dates", []):
        for g in date_entry.get("games", []):
            status = g.get("status", {})
            linescore = g.get("linescore", {})
            teams = g.get("teams", {})
            away = teams.get("away", {})
            home = teams.get("home", {})
            games.append({
                "gamePk": g.get("gamePk"),
                "status": status.get("detailedState", "Scheduled"),
                "statusCode": status.get("abstractGameState", "Preview"),
                "startTime": g.get("gameDate", ""),
                "inning": linescore.get("currentInning"),
                "inningHalf": linescore.get("inningHalf"),
                "away": {
                    "name": away.get("team", {}).get("name", ""),
                    "abbreviation": away.get("team", {}).get("abbreviation", ""),
                    "score": away.get("score"),
                    "isWinner": away.get("isWinner", False),
                },
                "home": {
                    "name": home.get("team", {}).get("name", ""),
                    "abbreviation": home.get("team", {}).get("abbreviation", ""),
                    "score": home.get("score"),
                    "isWinner": home.get("isWinner", False),
                },
            })
    return games


def fetch_standings() -> list[dict]:
    data = get("/standings", leagueId="103,104", date=TODAY, hydrate="team,division,league")
    divisions = []
    for record in data.get("records", []):
        div = record.get("division", {})
        league = record.get("league", {})
        teams = []
        for tr in record.get("teamRecords", []):
            teams.append({
                "rank": tr.get("divisionRank", ""),
                "name": tr.get("team", {}).get("name", ""),
                "abbreviation": tr.get("team", {}).get("abbreviation", ""),
                "wins": tr.get("wins", 0),
                "losses": tr.get("losses", 0),
                "pct": tr.get("winningPercentage", ".000"),
                "gb": tr.get("divisionGamesBack", "-"),
                "streak": tr.get("streak", {}).get("streakCode", ""),
            })
        divisions.append({
            "id": div.get("id"),
            "name": div.get("name", ""),
            "league": league.get("name", ""),
            "leagueAbbrev": league.get("abbreviation", ""),
            "teams": teams,
        })
    divisions.sort(key=lambda d: (d.get("league", ""), d.get("name", "")))
    return divisions


def fetch_stat_leaders() -> dict:
    batting_cats = ["homeRuns", "battingAverage", "rbi", "stolenBases", "onBasePlusSlugging"]
    pitching_cats = ["earnedRunAverage", "wins", "strikeouts", "saves", "whip"]

    def leaders_for(cats: list[str]) -> dict[str, list]:
        result = {}
        data = get(
            "/stats/leaders",
            leaderCategories=",".join(cats),
            sportId=1,
            season=SEASON,
            leaderGameTypes="R",
            limit=5,
        )
        for cat_data in data.get("leagueLeaders", []):
            cat_name = cat_data.get("leaderCategory", "")
            leaders = []
            for entry in cat_data.get("leaders", []):
                person = entry.get("person", {})
                leaders.append({
                    "rank": entry.get("rank", ""),
                    "name": person.get("fullName", ""),
                    "team": entry.get("team", {}).get("abbreviation", ""),
                    "value": entry.get("value", ""),
                })
            result[cat_name] = leaders
        return result

    return {
        "batting": leaders_for(batting_cats),
        "pitching": leaders_for(pitching_cats),
    }


def main():
    print(f"Fetching MLB data for {TODAY}...")
    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "date": TODAY,
        "season": SEASON,
        "schedule": [],
        "standings": [],
        "leaders": {"batting": {}, "pitching": {}},
    }

    try:
        payload["schedule"] = fetch_schedule()
        print(f"  {len(payload['schedule'])} games fetched")
    except Exception as e:
        print(f"  WARNING: schedule fetch failed: {e}", file=sys.stderr)

    try:
        payload["standings"] = fetch_standings()
        print(f"  {len(payload['standings'])} divisions fetched")
    except Exception as e:
        print(f"  WARNING: standings fetch failed: {e}", file=sys.stderr)

    try:
        payload["leaders"] = fetch_stat_leaders()
        print("  Stat leaders fetched")
    except Exception as e:
        print(f"  WARNING: leaders fetch failed: {e}", file=sys.stderr)

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "mlb_data.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Data written to {os.path.abspath(out_path)}")


if __name__ == "__main__":
    main()
