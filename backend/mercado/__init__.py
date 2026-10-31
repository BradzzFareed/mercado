"""Mercado - localized price forecasting for Philippine food staples."""
import os
# Tiny tabular fits are faster single-threaded; also avoids thread oversubscription.
os.environ.setdefault("OMP_NUM_THREADS", "1")
__version__ = "1.0.0"
