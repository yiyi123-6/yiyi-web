#!/usr/bin/env python3
"""Download recent hikes from Garmin Connect for scripts/import-garmin.mjs.

Uses the free, *unofficial* `garminconnect` library (pip install -r scripts/requirements-garmin.txt),
which logs in like the Garmin Connect website does. Garmin can change or block this at any time.

Auth (first one found wins):
  GARMIN_TOKENS                    token JSON printed by `python scripts/garmin_sync.py --print-token`
                                   (recommended: works with 2-step verification / MFA)
  GARMIN_EMAIL + GARMIN_PASSWORD   plain login (fails if the account has MFA enabled)

Usage:
  python scripts/garmin_sync.py --out garmin-export [--days 45]
  python scripts/garmin_sync.py --print-token      # run on your own computer, once
  node scripts/import-garmin.mjs garmin-export     # then merge into src/data/hikes.json

Writes <out>/activities.json (Garmin activity summaries) and <out>/activity_<id>.gpx per hike.

Exit codes: 0 ok, or no credentials configured (nothing to do)
            1 unexpected error
            2 Garmin login failed (bad password, MFA, captcha, rate limit, expired token)
"""

import argparse
import datetime as dt
import getpass
import json
import os
import pathlib
import sys

DEFAULT_TYPES = "hiking,walking,casual_walking,speed_walking,mountaineering"
LOGIN_FAILED = 2
HINT = (
    "Check the GARMIN_EMAIL / GARMIN_PASSWORD repo secrets. If the account uses 2-step verification (MFA), "
    "create a GARMIN_TOKENS secret with `python scripts/garmin_sync.py --print-token`; "
    "if a saved token expired, create a new one the same way."
)


def gh_error(msg):
    """On GitHub Actions this shows as a red annotation at the top of the run page."""
    print(f"::error title=Garmin sync::{msg}" if os.environ.get("GITHUB_ACTIONS") else f"error: {msg}", file=sys.stderr)


def import_garmin():
    try:
        import garminconnect
    except ImportError:
        gh_error("The garminconnect package is not installed: pip install -r scripts/requirements-garmin.txt")
        sys.exit(1)
    return garminconnect


def login():
    gc = import_garmin()
    tokens = os.environ.get("GARMIN_TOKENS", "").strip()
    email = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "")
    try:
        api = gc.Garmin(email or None, password or None, return_on_mfa=True)
        result = api.login(tokens or None)
    except gc.GarminConnectAuthenticationError as e:
        gh_error(f"Garmin rejected the login ({e}). {HINT}")
        sys.exit(LOGIN_FAILED)
    except gc.GarminConnectTooManyRequestsError as e:
        gh_error(f"Garmin is rate-limiting logins ({e}). Wait a few hours and run the workflow again.")
        sys.exit(LOGIN_FAILED)
    except gc.GarminConnectConnectionError as e:
        gh_error(f"Couldn't reach Garmin Connect ({e}). It may be down or blocking GitHub's servers; try again later.")
        sys.exit(LOGIN_FAILED)
    except Exception as e:  # captcha pages, changed SSO flow, Cloudflare blocks, malformed token JSON, ...
        gh_error(
            f"Garmin login failed ({type(e).__name__}: {e}). Garmin may be showing a captcha or has changed its "
            f"login flow, which breaks the unofficial client. {HINT}"
        )
        sys.exit(LOGIN_FAILED)
    if isinstance(result, tuple) and result and result[0] == "needs_mfa":
        gh_error(f"Garmin asked for an MFA code, which a scheduled workflow can't enter. {HINT}")
        sys.exit(LOGIN_FAILED)
    return api, gc.Garmin


def print_token():
    gc = import_garmin()
    email = os.environ.get("GARMIN_EMAIL", "").strip() or input("Garmin email: ").strip()
    password = os.environ.get("GARMIN_PASSWORD", "") or getpass.getpass("Garmin password: ")
    api = gc.Garmin(email, password, prompt_mfa=lambda: input("MFA code (from email/app): ").strip())
    try:
        api.login()
    except Exception as e:
        gh_error(f"Garmin login failed ({type(e).__name__}: {e}).")
        return LOGIN_FAILED
    print("\nPaste everything on the next line into the GARMIN_TOKENS repository secret:\n")
    print(api.client.dumps())
    return 0


def sync(out: pathlib.Path, days: int, types: set):
    has_tokens = bool(os.environ.get("GARMIN_TOKENS", "").strip())
    has_password = bool(os.environ.get("GARMIN_EMAIL", "").strip() and os.environ.get("GARMIN_PASSWORD"))
    if not has_tokens and not has_password:
        print("No Garmin credentials (GARMIN_TOKENS or GARMIN_EMAIL + GARMIN_PASSWORD); nothing to do.")
        return 0

    api, Garmin = login()
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    activities = api.get_activities_by_date(start.isoformat(), end.isoformat()) or []
    hikes = [a for a in activities if ((a.get("activityType") or {}).get("typeKey") or "").lower() in types]
    print(f"Logged in. {len(activities)} activities since {start}, {len(hikes)} of them hikes/walks.")

    out.mkdir(parents=True, exist_ok=True)
    (out / "activities.json").write_text(json.dumps(hikes, indent=2, default=str))
    for a in hikes:
        aid = a.get("activityId")
        label = f"{(a.get('startTimeLocal') or '')[:10]}  {a.get('activityName')}  ({aid})"
        try:
            gpx = api.download_activity(str(aid), dl_fmt=Garmin.ActivityDownloadFormat.GPX)
            (out / f"activity_{aid}.gpx").write_bytes(gpx)
            print(f"  ✓ {label}")
        except Exception as e:  # indoor/manual activities have no GPS track; stats still come from activities.json
            print(f"  · {label}: no GPX ({type(e).__name__}: {e})")
    print(f"Wrote {out}/activities.json")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path("garmin-export"), help="folder for activities.json + GPX files")
    p.add_argument("--days", type=int, default=45, help="how many days back to look (default: 45)")
    p.add_argument("--types", default=DEFAULT_TYPES, help=f"comma-separated Garmin activity types (default: {DEFAULT_TYPES})")
    p.add_argument("--print-token", action="store_true", help="log in interactively (MFA ok) and print a GARMIN_TOKENS value")
    args = p.parse_args()
    if args.print_token:
        return print_token()
    types = {t.strip().lower() for t in args.types.split(",") if t.strip()}
    return sync(args.out, args.days, types)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:
        gh_error(f"Garmin sync failed: {type(e).__name__}: {e}")
        sys.exit(1)
