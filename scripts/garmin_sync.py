#!/usr/bin/env python3
"""Download recent hikes from Garmin Connect for scripts/import-garmin.mjs.

Uses Garmin's official Connect Personal API (https://developer.garmin.com/gc-developer-program/personal/).
Create a key at https://connect.garmin.com/app/settings/personalApiToken and store it as the
GARMIN_API_KEY secret / environment variable. Only the Python standard library is needed.

Usage:
  GARMIN_API_KEY=GCDC_... python scripts/garmin_sync.py --out garmin-export [--days 45]
  node scripts/import-garmin.mjs garmin-export     # then merge into src/data/hikes.json

Writes <out>/activities.json (Garmin activity summaries) and <out>/activity_<id>.gpx per hike
(built from the activity's GPS + elevation samples).

Exit codes: 0 ok, or no GARMIN_API_KEY configured (nothing to do)
            1 unexpected error
            2 Garmin rejected the key (wrong, deleted or expired)
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

API = "https://personal.connectapi.garmin.com"
TOKEN_URL = f"{API}/personalapitoken-service/personal-api/personal-api-key/token"
DEFAULT_TYPES = "hiking,mountaineering"
KEY_REJECTED = 2
PAGE = 100
HINT = (
    "Check the GARMIN_API_KEY repo secret. Personal API keys expire (30 days to 1 year) and can be deleted; "
    "create a new one at https://connect.garmin.com/app/settings/personalApiToken and update the secret."
)


def gh_error(msg):
    """On GitHub Actions this shows as a red annotation at the top of the run page."""
    print(f"::error title=Garmin sync::{msg}" if os.environ.get("GITHUB_ACTIONS") else f"error: {msg}", file=sys.stderr)


def request(url, headers, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "yiyis-universe-garmin-sync", **headers})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            gh_error(f"Garmin rejected the request ({e.code} {e.reason}). {HINT}")
            sys.exit(KEY_REJECTED)
        raise


def access_token(api_key):
    body = request(TOKEN_URL, {"Authorization": f"ApiKey {api_key}"}, method="POST").decode().strip()
    if body.startswith("{"):
        body = json.loads(body).get("access_token", "")
    if not body:
        gh_error(f"Garmin returned no access token. {HINT}")
        sys.exit(KEY_REJECTED)
    return body


class Client:
    def __init__(self, token):
        self.headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    def get(self, path, **params):
        url = f"{API}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
        return json.loads(request(url, self.headers) or b"null")

    def activities(self, start, end):
        out = []
        while True:
            page = self.get(
                "/activitylist-service/activities/search/activities",
                start=len(out), limit=PAGE, startDate=start.isoformat(), endDate=end.isoformat(),
            ) or []
            out += page
            if len(page) < PAGE:
                return out

    def gpx(self, activity):
        aid = activity["activityId"]
        d = self.get(f"/activity-service/activity/{aid}/details", maxChartSize=2000, maxPolylineSize=0)
        idx = {m["key"]: m["metricsIndex"] for m in d.get("metricDescriptors") or []}
        lat, lon, ele, ts = (idx.get(k) for k in ("directLatitude", "directLongitude", "directElevation", "directTimestamp"))
        if lat is None or lon is None:
            return None
        pts = []
        for row in d.get("activityDetailMetrics") or []:
            m = row.get("metrics") or []
            y, x = m[lat], m[lon]
            if y is None or x is None:
                continue
            p = f'<trkpt lat="{y:.7f}" lon="{x:.7f}">'
            if ele is not None and m[ele] is not None:
                p += f"<ele>{m[ele]:.1f}</ele>"
            if ts is not None and m[ts] is not None:
                t = dt.datetime.fromtimestamp(m[ts] / 1000, dt.timezone.utc)
                p += f"<time>{t.strftime('%Y-%m-%dT%H:%M:%SZ')}</time>"
            pts.append(p + "</trkpt>")
        if len(pts) < 2:
            return None
        name = escape(activity.get("activityName") or str(aid))
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<gpx version="1.1" creator="Garmin Connect Personal API" xmlns="http://www.topografix.com/GPX/1/1">\n'
            f"<trk><name>{name}</name><type>{escape(activity['activityType']['typeKey'])}</type><trkseg>\n"
            + "\n".join(pts)
            + "\n</trkseg></trk>\n</gpx>\n"
        )


def sync(out: pathlib.Path, days: int, types: set):
    api_key = os.environ.get("GARMIN_API_KEY", "").strip()
    if not api_key:
        print("No GARMIN_API_KEY configured; nothing to do.")
        return 0

    client = Client(access_token(api_key))
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    activities = client.activities(start, end)
    hikes = [a for a in activities if ((a.get("activityType") or {}).get("typeKey") or "").lower() in types]
    print(f"{len(activities)} activities in the last {days} days, {len(hikes)} of them hikes/walks.")

    out.mkdir(parents=True, exist_ok=True)
    (out / "activities.json").write_text(json.dumps(hikes, indent=2, default=str))
    for a in hikes:
        aid = a.get("activityId")
        # No dates: Actions logs of a public repo are public.
        label = f"{a.get('activityName')}  ({aid})"
        try:
            gpx = client.gpx(a)
        except urllib.error.URLError as e:
            gpx, label = None, f"{label}: {e}"
        if gpx:
            (out / f"activity_{aid}.gpx").write_text(gpx)
            print(f"  ✓ {label}")
        else:  # indoor/manual activities have no GPS track; stats still come from activities.json
            print(f"  · {label}: no GPS track")
    print(f"Wrote {out}/activities.json")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path("garmin-export"), help="folder for activities.json + GPX files")
    p.add_argument("--days", type=int, default=45, help="how many days back to look (default: 45)")
    p.add_argument("--types", default=DEFAULT_TYPES, help=f"comma-separated Garmin activity types (default: {DEFAULT_TYPES})")
    args = p.parse_args()
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
