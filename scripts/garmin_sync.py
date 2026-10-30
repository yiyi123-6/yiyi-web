#!/usr/bin/env python3
"""Download recent hiking activities from Garmin Connect for scripts/import-garmin.mjs.

Uses the free, *unofficial* `garminconnect` library (pip install garminconnect==0.3.20),
which logs in like the Garmin Connect website does. Garmin can change or block this at any time.

Auth (first one found wins):
  GARMIN_TOKENS                    token JSON printed by `python scripts/garmin_sync.py --print-token`
                                   (recommended: works with 2-step verification / MFA)
  GARMIN_EMAIL + GARMIN_PASSWORD   plain login (fails if the account has MFA enabled)

Usage:
  python scripts/garmin_sync.py --out garmin-export [--days 45]
  python scripts/garmin_sync.py --print-token      # run on your own computer, once
"""

import argparse
import datetime as dt
import getpass
import json
import os
import pathlib
import sys

HIKE_TYPES = {
    "hiking",
    "walking",
    "casual_walking",
    "speed_walking",
    "trail_running",
    "mountaineering",
    "snowshoeing",
    "rucking",
}


def login():
    from garminconnect import Garmin

    tokens = os.environ.get("GARMIN_TOKENS", "").strip()
    email = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "")
    api = Garmin(email or None, password or None)
    api.login(tokens or None)
    return api


def print_token():
    from garminconnect import Garmin

    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    api = Garmin(email, password, prompt_mfa=lambda: input("MFA code (from email/app): ").strip())
    api.login()
    print("\nPaste everything on the next line into the GARMIN_TOKENS repository secret:\n")
    print(api.client.dumps())


def sync(out: pathlib.Path, days: int):
    if not os.environ.get("GARMIN_TOKENS") and not (os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD")):
        print("No Garmin credentials (GARMIN_TOKENS or GARMIN_EMAIL/GARMIN_PASSWORD); nothing to do.")
        return 0

    from garminconnect import Garmin

    try:
        api = login()
    except Exception as e:
        print(f"Garmin login failed: {e}", file=sys.stderr)
        print("If the account uses 2-step verification, create GARMIN_TOKENS with --print-token; if a saved token expired, create a new one.", file=sys.stderr)
        return 1
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    activities = api.get_activities_by_date(start.isoformat(), end.isoformat())
    hikes = [a for a in activities if (a.get("activityType") or {}).get("typeKey") in HIKE_TYPES]
    print(f"{len(activities)} activities since {start}, {len(hikes)} hikes/walks")

    out.mkdir(parents=True, exist_ok=True)
    (out / "activities.json").write_text(json.dumps(hikes, indent=2))
    for a in hikes:
        aid = a["activityId"]
        try:
            gpx = api.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.GPX)
            (out / f"activity_{aid}.gpx").write_bytes(gpx)
            print(f"  ✓ {a.get('startTimeLocal', '')[:10]}  {a.get('activityName')}  ({aid})")
        except Exception as e:  # indoor activities have no GPS track; stats still come from activities.json
            print(f"  · {a.get('activityName')} ({aid}): no GPX ({e})")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path("garmin-export"))
    p.add_argument("--days", type=int, default=45)
    p.add_argument("--print-token", action="store_true")
    args = p.parse_args()
    if args.print_token:
        print_token()
        return 0
    return sync(args.out, args.days)


if __name__ == "__main__":
    sys.exit(main())
