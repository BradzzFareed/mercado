"""WFP HDX ingestion primitives: cheap change detection + verified download.

Building blocks only - nothing here runs the pipeline. pipeline.fetch_wfp() keeps
its own heuristic fetch until it is rewired onto this module.

Intended use:
    remote = fetch_remote_token()                # one 14 KB package_show request
    if token_changed(remote, stored):
        payload = download_verified(remote)      # full CSV bytes, MD5-checked
"""
import hashlib
import http.client
import json
import urllib.error
import urllib.request
from dataclasses import dataclass

DATASET_ID = "ea251823-8694-47b4-82d0-7d27f00e8aba"
RESOURCE_ID = "9a842d72-0d7d-4922-ad0e-eb8106c1ab0e"   # food prices; not the markets resource
PACKAGE_SHOW_URL = f"https://data.humdata.org/api/3/action/package_show?id={DATASET_ID}"
USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/120.0 Safari/537.36 Mercado/1.0")

_TOKEN_TIMEOUT = 60       # seconds; package_show is a small JSON body
_DOWNLOAD_TIMEOUT = 300   # seconds; the CSV is ~34 MB over a 302 to S3


class WfpError(Exception):
    """Any failure talking to HDX or verifying a download."""


@dataclass(frozen=True)
class RemoteToken:
    """Cheap change token from package_show. hash is the resource's declared MD5."""
    last_modified: str
    hash: str
    url: str
    dataset_date: str


def fetch_remote_token(timeout: int = _TOKEN_TIMEOUT,
                       opener=urllib.request.urlopen) -> RemoteToken:
    """package_show -> RemoteToken for the food-prices resource, selected by ID.

    Raises WfpError when the request, the JSON payload or the resource lookup fails.
    """
    request = urllib.request.Request(PACKAGE_SHOW_URL, headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=timeout) as resp:
            payload = resp.read()
        meta = json.loads(payload)
    except (OSError, http.client.HTTPException, ValueError) as e:
        # URLError/HTTPError/socket.timeout are OSError subclasses; JSONDecodeError is ValueError.
        raise WfpError(f"could not read {PACKAGE_SHOW_URL}: {type(e).__name__}: {e}") from e
    if not isinstance(meta, dict) or meta.get("success") is not True:
        raise WfpError(f"HDX package_show did not succeed: {str(meta)[:120]}")
    result = meta.get("result") or {}
    resources = result.get("resources") or []
    res = next((r for r in resources if r.get("id") == RESOURCE_ID), None)
    if res is None:
        ids = [r.get("id") for r in resources]
        raise WfpError(f"resource {RESOURCE_ID} not found in dataset {DATASET_ID} (ids: {ids})")
    url = res.get("url") or res.get("download_url")
    if not url:
        raise WfpError("the food-prices resource has no download url")
    return RemoteToken(
        last_modified=str(res.get("last_modified") or ""),
        hash=str(res.get("hash") or ""),
        url=str(url),
        dataset_date=str(result.get("dataset_date") or ""),
    )


def token_changed(remote: RemoteToken, stored: RemoteToken | None) -> bool:
    """True when there is no stored token, or when last_modified or hash moved."""
    if stored is None:
        return True
    return remote.last_modified != stored.last_modified or remote.hash != stored.hash


def download_verified(remote: RemoteToken, timeout: int = _DOWNLOAD_TIMEOUT, attempts: int = 2,
                      opener=urllib.request.urlopen) -> bytes:
    """Download the CSV and verify its MD5 against remote.hash.

    Returns the complete bytes or raises WfpError - never partial data. Only network
    errors retry (up to `attempts`); a hash mismatch fails immediately.
    """
    request = urllib.request.Request(remote.url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for _ in range(max(attempts, 1)):
        try:
            with opener(request, timeout=timeout) as resp:
                payload = resp.read()
        except (OSError, http.client.HTTPException) as e:
            last_error = e
            continue
        digest = hashlib.md5(payload).hexdigest()
        if digest.lower() != (remote.hash or "").lower():
            raise WfpError(f"download MD5 {digest} does not match the HDX hash {remote.hash!r}")
        return payload
    raise WfpError(f"download failed after {max(attempts, 1)} attempt(s): {last_error}") from last_error
