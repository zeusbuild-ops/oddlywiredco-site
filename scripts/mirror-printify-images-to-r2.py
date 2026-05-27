#!/usr/bin/env python3
"""Mirror Printify product mockup images into Cloudflare R2 bucket `oddlywired-media`
under /products/<slug>/<index>.jpg, so the public site can serve them from
media.oddlywiredco.com instead of leaking images-api.printify.com URLs.

Reads clone-*.json files from the sibling OddlyWiredCo project's
build/phase-2-mirror/ directory. For each product:
  - Pulls all image URLs from `clone.images[].src`
  - Downloads each from Printify's CDN
  - Uploads to R2 at /products/<slug>/<index>.jpg (where index is 0-based)
  - Writes a mapping file alongside (printify-url -> media-url) for the
    rebuild-products-json script to consume.

Reads R2 credentials from ~/Documents/secrets/cloudflare-r2.json
(same shape as upload-pins-to-r2.py).

Usage:
    python3 scripts/mirror-printify-images-to-r2.py
    OWC_BUILD_DIR=/custom/path python3 scripts/mirror-printify-images-to-r2.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
except ImportError:
    print("boto3 not installed. Run: pip install boto3", file=sys.stderr)
    sys.exit(1)


SITE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUILD_DIR = "/Users/zeus/Documents/Claude/Projects/OddlyWiredCo/.claude/worktrees/beautiful-meitner-fc86ff/build"
BUILD_DIR = Path(os.environ.get("OWC_BUILD_DIR", DEFAULT_BUILD_DIR))
SECRETS_PATH = Path.home() / "Documents/secrets/cloudflare-r2.json"
OUT_PATH = SITE_ROOT / "src/data/image-mirror.json"

# Browser UA — Printify CDN occasionally 403s default urllib user-agents.
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_secrets() -> dict:
    if not SECRETS_PATH.exists():
        sys.exit(f"ERROR: secrets not found at {SECRETS_PATH}")
    return json.loads(SECRETS_PATH.read_text())


def r2_client(secrets: dict):
    return boto3.client(
        "s3",
        endpoint_url=f"https://{secrets['account_id']}.r2.cloudflarestorage.com",
        aws_access_key_id=secrets["access_key_id"],
        aws_secret_access_key=secrets["secret_access_key"],
        config=Config(signature_version="s3v4"),
    )


def load_mapping() -> dict:
    """Load slug -> printify_etsy_id mapping from phase-3-stripe so we can
    associate each clone-*.json with its product slug."""
    mapping_file = BUILD_DIR / "phase-3-stripe/stripe-products-mapping.json"
    if not mapping_file.exists():
        sys.exit(f"ERROR: mapping not found at {mapping_file}")
    return {p["printify_etsy_product_id"]: p["slug"] for p in json.loads(mapping_file.read_text())}


def fetch_image(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def main() -> None:
    secrets = load_secrets()
    client = r2_client(secrets)
    bucket = secrets["bucket"]
    public_base = secrets["public_base"].rstrip("/")

    slug_by_etsy_id = load_mapping()
    clone_dir = BUILD_DIR / "phase-2-mirror"
    clone_files = sorted(clone_dir.glob("clone-*.json"))
    if not clone_files:
        sys.exit(f"ERROR: no clone-*.json files found in {clone_dir}")

    print(f"mirroring {len(clone_files)} products → R2 bucket '{bucket}'")
    url_map: dict[str, str] = {}
    total_uploaded = 0
    total_skipped = 0
    total_failed = 0

    for clone_file in clone_files:
        clone = json.loads(clone_file.read_text())
        etsy_id = clone_file.stem.removeprefix("clone-")
        slug = slug_by_etsy_id.get(etsy_id)
        if not slug:
            print(f"  SKIP {clone_file.name} — no matching slug in mapping", file=sys.stderr)
            continue

        images = [i.get("src") for i in clone.get("images", []) if i.get("src")]
        if not images:
            print(f"  WARN {slug} — no images")
            continue

        print(f"  {slug} ({len(images)} images)")
        for idx, src in enumerate(images):
            key = f"products/{slug}/{idx}.jpg"
            media_url = f"{public_base}/{key}"
            url_map[src] = media_url

            if object_exists(client, bucket, key):
                total_skipped += 1
                continue

            try:
                body = fetch_image(src)
                client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=body,
                    ContentType="image/jpeg",
                    CacheControl="public, max-age=31536000, immutable",
                )
                total_uploaded += 1
                print(f"    [{idx}] uploaded ({len(body)} bytes)")
                # Be polite to Printify's CDN
                time.sleep(0.05)
            except Exception as e:
                total_failed += 1
                print(f"    [{idx}] FAILED: {e}", file=sys.stderr)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(url_map, indent=2, sort_keys=True))
    print()
    print(f"summary:")
    print(f"  uploaded: {total_uploaded}")
    print(f"  skipped (already in R2): {total_skipped}")
    print(f"  failed: {total_failed}")
    print(f"  url map ({len(url_map)} entries) → {OUT_PATH}")


if __name__ == "__main__":
    main()
