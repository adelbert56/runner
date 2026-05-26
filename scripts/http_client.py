"""HTTP helpers with retries for Runner Plaza scrapers.

Goal: make network flakiness non-fatal by providing a consistent retry/backoff
policy and sensible defaults (timeout + headers applied by caller session).
"""

from __future__ import annotations

import logging
import time
from typing import Iterable

import requests

logger = logging.getLogger(__name__)


def request_text(
    session: requests.Session,
    url: str,
    *,
    timeout: int | float,
    retries: int,
    backoff_seconds: float,
    retry_statuses: Iterable[int] = (429, 500, 502, 503, 504),
) -> str:
    """GET a URL and return decoded text, retrying transient failures."""
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code in set(retry_statuses):
                raise requests.HTTPError(
                    f"HTTP {response.status_code} for {url}",
                    response=response,
                )
            response.raise_for_status()
            response.encoding = response.apparent_encoding or response.encoding or "utf-8"
            return response.text
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as error:
            last_error = error
            if attempt >= retries:
                break
            sleep_for = backoff_seconds * (2 ** (attempt - 1))
            logger.warning("GET failed (%s/%s) %s: %s; retrying in %.1fs", attempt, retries, url, error, sleep_for)
            time.sleep(sleep_for)
    assert last_error is not None
    raise last_error

