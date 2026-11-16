"""Offline tests for mercado.wfp: fake openers, no network, well under 5 s."""
import hashlib
import json
import os
import sys
import urllib.error

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mercado import wfp  # noqa: E402
from mercado.wfp import RemoteToken, WfpError, download_verified, fetch_remote_token, token_changed  # noqa: E402


class FakeResponse:
    """Stand-in for the context-manager response urllib.request.urlopen returns."""

    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def opener_returning(payload: bytes):
    def opener(request, timeout):
        return FakeResponse(payload)
    return opener


def opener_raising(err):
    def opener(request, timeout):
        raise err
    return opener


def package_json(resources):
    return json.dumps({
        "success": True,
        "result": {
            "dataset_date": "[2000-01-15T00:00:00 TO 2026-10-15T23:59:59]",
            "resources": resources,
        },
    }).encode()


FOOD = {
    "id": wfp.RESOURCE_ID,
    "name": "Philippines - Food Prices",
    "format": "CSV",
    "last_modified": "2026-11-15T09:04:34.681205",
    "hash": "2440ab74363fb321d317430b09b72453",
    "size": 34079271,
    "url": "https://example.org/wfp_food_prices_phl.csv",
}
MARKETS = {
    "id": "a87d0698-ee0b-40c8-96c3-d1ec4616d7bf",
    "name": "Philippines - Markets",
    "format": "CSV",
    "url": "https://example.org/wfp_markets_phl.csv",
}
DECOY = {   # a similarly named CSV that must lose to the ID match
    "id": "00000000-0000-0000-0000-000000000000",
    "name": "Philippines - Food Prices (QC)",
    "format": "CSV",
    "url": "https://example.org/decoy.csv",
}


def test_resource_selected_by_id_when_reordered():
    seen = []

    def opener(request, timeout):
        seen.append(request)
        return FakeResponse(package_json([MARKETS, DECOY, FOOD]))

    token = fetch_remote_token(opener=opener)
    assert token.last_modified == FOOD["last_modified"]
    assert token.hash == FOOD["hash"]
    assert token.url == FOOD["url"]
    assert token.dataset_date == "[2000-01-15T00:00:00 TO 2026-10-15T23:59:59]"
    assert len(seen) == 1
    assert "Mercado" in seen[0].headers["User-agent"]


def test_missing_resource_raises_wfp_error():
    with pytest.raises(WfpError, match="not found"):
        fetch_remote_token(opener=opener_returning(package_json([MARKETS, DECOY])))


def test_fetch_network_failure_raises_wfp_error():
    with pytest.raises(WfpError):
        fetch_remote_token(opener=opener_raising(urllib.error.URLError("dns outage")))


def test_token_changed_variants():
    base = RemoteToken(last_modified="2026-11-15T09:04:34", hash="aa", url="u", dataset_date="")
    assert token_changed(base, None) is True
    assert token_changed(base, base) is False
    assert token_changed(base, RemoteToken("2026-11-16T00:00:00", "aa", "u", "")) is True
    assert token_changed(base, RemoteToken("2026-11-15T09:04:34", "bb", "u", "")) is True


def test_download_hash_mismatch_raises_without_retry():
    payload = b"date,price\n2026-10-15,48\n"
    seen = []

    def opener(request, timeout):
        seen.append(request)
        return FakeResponse(payload)

    remote = RemoteToken(last_modified="t", hash="0" * 32, url="https://example.org/x.csv",
                         dataset_date="")
    with pytest.raises(WfpError, match="does not match"):
        download_verified(remote, opener=opener)
    assert len(seen) == 1   # a hash mismatch is not retried


def test_download_retries_once_on_network_error():
    payload = b"date,price\n2026-10-15,48\n"
    remote = RemoteToken(last_modified="t", hash=hashlib.md5(payload).hexdigest(),
                         url="https://example.org/x.csv", dataset_date="")
    calls = []

    def flaky(request, timeout):
        calls.append(request.full_url)
        if len(calls) == 1:
            raise urllib.error.URLError("connection reset")
        return FakeResponse(payload)

    assert download_verified(remote, opener=flaky) == payload
    assert len(calls) == 2


def test_download_exhausted_retries_raise_wfp_error():
    remote = RemoteToken(last_modified="t", hash="aa", url="https://example.org/x.csv",
                         dataset_date="")
    err = urllib.error.URLError("connection refused")
    with pytest.raises(WfpError, match="2 attempt"):
        download_verified(remote, opener=opener_raising(err))
