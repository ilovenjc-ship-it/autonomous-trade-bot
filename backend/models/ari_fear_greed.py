"""
ari_fear_greed.py — Day 16 (Path B)
====================================

Daily snapshot of Ari's Fear & Greed Index. One row per UTC date — the index
is recomputed on demand (5-min cache), but persistence is daily-grain so we
have a tractable history series for the chart on Dashboard / Analytics.

Why daily-grain (not per-fetch)?
  • The index changes slowly. Per-fetch (every 5 min × 288/day = 290 rows/day)
    would balloon storage with no signal gain.
  • Daily-close-style values are what charting expects.
  • Forensics: per-row component columns let us answer "what input drove
    that big move on May 23?" without re-running the synthesis.

Doctrinal note (D-45):
  This is Ari's number, computed from inputs we own. Per the inscription,
  we own this output — including its mistakes. The component columns make
  every produced value auditable; AP-1 (no fabricated numbers) is enforced
  by the service-layer rule that any None component is reported as None,
  not silently substituted with a neutral.
"""

from sqlalchemy import Column, Integer, Float, String, Date, DateTime
from sqlalchemy.sql import func

from db.database import Base


class AriFearGreed(Base):
    __tablename__ = "ari_fear_greed_daily"

    id           = Column(Integer, primary_key=True, autoincrement=True)

    # UTC date this row represents — uniqueness enforced via application-level
    # idempotent insert (check-then-insert in the service). One row per day.
    date         = Column(Date, nullable=False, unique=True, index=True)

    # The composite ±100 value and its label.
    value        = Column(Float, nullable=True)        # nullable: when ALL inputs missing
    label        = Column(String(32), nullable=True)   # "Extreme Fear" .. "Extreme Greed"

    # Per-component snapshots (each ±100 or NULL). Forensic columns —
    # not used by the UI directly, but make every produced `value` auditable.
    momentum     = Column(Float, nullable=True)
    rsi          = Column(Float, nullable=True)
    macd         = Column(Float, nullable=True)
    breadth      = Column(Float, nullable=True)
    consensus    = Column(Float, nullable=True)

    # Number of components present (1..5) at the moment of computation.
    # Useful for filtering out low-confidence days when charting.
    components_present = Column(Integer, nullable=True)

    # TAO USD price at the moment of computation — handy for correlating
    # F&G moves with price moves on the same chart.
    tao_price_usd = Column(Float, nullable=True)

    recorded_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)