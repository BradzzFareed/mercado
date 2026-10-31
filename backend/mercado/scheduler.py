"""Tiny background scheduler (no extra dependencies): runs the pipeline every N hours."""
import os
import threading
import time

from . import pipeline

_state = {"thread": None, "stop": threading.Event(), "next_run": None, "interval_h": None}


def start(interval_hours=None):
    interval_hours = float(interval_hours or os.environ.get("MERCADO_REFRESH_HOURS", 24))
    if _state["thread"] and _state["thread"].is_alive():
        return
    _state["interval_h"] = interval_hours
    _state["stop"].clear()

    def loop():
        while not _state["stop"].is_set():
            _state["next_run"] = time.time() + interval_hours * 3600
            if _state["stop"].wait(interval_hours * 3600):
                break
            try:
                pipeline.run("live")
            except Exception:
                pass

    t = threading.Thread(target=loop, daemon=True, name="mercado-scheduler")
    _state["thread"] = t
    t.start()


def stop():
    _state["stop"].set()


def info():
    return dict(running=bool(_state["thread"] and _state["thread"].is_alive()),
                interval_hours=_state["interval_h"], next_run_epoch=_state["next_run"])
