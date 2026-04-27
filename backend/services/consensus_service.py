"""
OpenClaw BFT Consensus Engine
==============================
Before any LIVE strategy executes a real trade, the full 12-bot fleet votes.
A 7/12 supermajority (58.3%) of agreeing votes is required to APPROVE.

Vote lifecycle:
  1. Trigger arrives (cycle engine fires a LIVE strategy signal)
  2. All 12 bots independently evaluate and cast: BUY | SELL | HOLD | ABSTAIN
  3. Tally: if ≥7 bots agree on BUY → APPROVED_BUY
            if ≥7 bots agree on SELL → APPROVED_SELL
            otherwise → REJECTED
  4. Decision logged to activity stream
  5. Caller receives ConsensusResult (approved + direction + vote breakdown)
"""
import random
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict

from services.activity_service import push_event
from services.price_service import price_service
from services.alert_service import alert_service

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
SUPERMAJORITY   = 7          # out of 12 bots
TOTAL_BOTS      = 12
MAX_HISTORY     = 200        # rounds kept in memory

VOTE_BUY     = "BUY"
VOTE_SELL    = "SELL"
VOTE_HOLD    = "HOLD"
VOTE_ABSTAIN = "ABSTAIN"

RESULT_APPROVED_BUY  = "APPROVED_BUY"
RESULT_APPROVED_SELL = "APPROVED_SELL"
RESULT_REJECTED      = "REJECTED"
RESULT_DEADLOCK      = "DEADLOCK"

# ── Bot personalities → vote tendencies ───────────────────────────────────────
# directional_bias > 0.5 = bullish leaning, < 0.5 = bearish
# conviction = how strongly they commit (low conviction → more HOLD/ABSTAIN)
# rsi_sensitivity = how much RSI overrides base bias
BOT_PERSONALITIES: Dict[str, Dict] = {
    # ── High-conviction bullish ──────────────────────────────────────────────
    "momentum_cascade":   dict(directional_bias=0.68, conviction=0.80, rsi_sensitivity=0.6),
    "dtao_flow_momentum": dict(directional_bias=0.84, conviction=0.90, rsi_sensitivity=0.4),
    "liquidity_hunter":   dict(directional_bias=0.76, conviction=0.75, rsi_sensitivity=0.5),
    "breakout_hunter":    dict(directional_bias=0.62, conviction=0.72, rsi_sensitivity=0.7),
    "yield_maximizer":    dict(directional_bias=0.79, conviction=0.85, rsi_sensitivity=0.3),
    "balanced_risk":      dict(directional_bias=0.70, conviction=0.80, rsi_sensitivity=0.5),
    "emission_momentum":  dict(directional_bias=0.75, conviction=0.78, rsi_sensitivity=0.4),

    # ── Contrarian / mean-reversion ──────────────────────────────────────────
    # Conviction raised from 0.65 → 0.70: was generating too many abstains.
    # RSI override for contrarians is now corrected (BUY oversold, SELL overbought).
    "contrarian_flow":    dict(directional_bias=0.45, conviction=0.70, rsi_sensitivity=0.8),
    # Raised 0.60 → 0.68: high RSI-sensitivity bots must participate when
    # RSI extremes fire — abstaining defeats their purpose.
    "mean_reversion":     dict(directional_bias=0.40, conviction=0.68, rsi_sensitivity=0.9),

    # ── Previously low-conviction / noise bots — calibrated up ──────────────
    # volatility_arb: 0.55 → 0.70  (was abstaining 45% of rounds)
    "volatility_arb":     dict(directional_bias=0.50, conviction=0.70, rsi_sensitivity=0.9),
    # sentiment_surge: 0.50 → 0.68  (was abstaining/holding 50% of rounds)
    "sentiment_surge":    dict(directional_bias=0.46, conviction=0.68, rsi_sensitivity=0.6),
    # macro_correlation: 0.45 → 0.68  (was abstaining/holding 55% of rounds — worst offender)
    "macro_correlation":  dict(directional_bias=0.50, conviction=0.68, rsi_sensitivity=0.5),
}

BOT_DISPLAY_NAMES = {
    "momentum_cascade":   "Momentum Cascade",
    "dtao_flow_momentum": "dTAO Flow",
    "liquidity_hunter":   "Liquidity Hunter",
    "breakout_hunter":    "Breakout Hunter",
    "yield_maximizer":    "Yield Maximizer",
    "contrarian_flow":    "Contrarian Flow",
    "volatility_arb":     "Volatility Arb",
    "sentiment_surge":    "Sentiment Surge",
    "balanced_risk":      "Balanced Risk",
    "mean_reversion":     "Mean Reversion",
    "emission_momentum":  "Emission Momentum",
    "macro_correlation":  "Macro Correlation",
}


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class BotVote:
    bot_name:     str
    display_name: str
    vote:         str          # BUY | SELL | HOLD | ABSTAIN
    confidence:   float        # 0.0 – 1.0
    reasoning:    str
    mode:         str          # PAPER_ONLY | APPROVED_FOR_LIVE | LIVE

    def to_dict(self):
        return asdict(self)


@dataclass
class ConsensusRound:
    round_id:         int
    triggered_by:     str       # strategy name that triggered
    direction:        str       # BUY | SELL (what the trigger wants)
    price_at_round:   float
    timestamp:        str
    votes:            List[BotVote] = field(default_factory=list)
    result:           str = ""
    buy_count:        int = 0
    sell_count:       int = 0
    hold_count:       int = 0
    abstain_count:    int = 0
    supermajority:    int = SUPERMAJORITY
    approved:         bool = False
    duration_ms:      int = 0

    def to_dict(self):
        d = {
            "round_id":       self.round_id,
            "triggered_by":   self.triggered_by,
            "direction":      self.direction,
            "price_at_round": self.price_at_round,
            "timestamp":      self.timestamp,
            "result":         self.result,
            "buy_count":      self.buy_count,
            "sell_count":     self.sell_count,
            "hold_count":     self.hold_count,
            "abstain_count":  self.abstain_count,
            "supermajority":  self.supermajority,
            "approved":       self.approved,
            "duration_ms":    self.duration_ms,
            "votes":          [v.to_dict() for v in self.votes],
        }
        return d


@dataclass
class ConsensusResult:
    approved:   bool
    direction:  str        # BUY | SELL
    result:     str        # APPROVED_BUY | APPROVED_SELL | REJECTED | DEADLOCK
    round_id:   int
    buy_count:  int
    sell_count: int
    hold_count: int


# ── Vote engine ────────────────────────────────────────────────────────────────

def _compute_rsi_override(rsi: Optional[float], personality: Dict) -> Optional[str]:
    """
    RSI extreme zones push vote in a technical direction.
    Returns BUY / SELL / None.

    RSI < 30 (oversold)  → BUY  for ALL bots (fade the fear, mean-revert up)
    RSI > 70 (overbought) → SELL for ALL bots (fade the greed, mean-revert down)

    Contrarian personality is already encoded in directional_bias < 0.5.
    Previously, contrarian bots had this reversed (SELL when oversold, BUY when
    overbought) which made them momentum-followers in RSI extremes — the opposite
    of what contrarian means. Fixed: RSI extremes produce uniform signals;
    personality bias handles the directional lean in normal conditions.
    """
    if rsi is None:
        return None

    if rsi < 30:
        return VOTE_BUY    # oversold → mean-reversion buy for all bots
    if rsi > 70:
        return VOTE_SELL   # overbought → mean-reversion sell for all bots
    return None


def _cast_vote(
    bot_name:  str,
    direction: str,
    rsi:       Optional[float],
    macd_hist: Optional[float],
    mode:      str,
) -> BotVote:
    """Simulate a bot's BFT vote given current market state."""
    p = BOT_PERSONALITIES.get(bot_name, dict(directional_bias=0.5, conviction=0.5, rsi_sensitivity=0.5))
    display = BOT_DISPLAY_NAMES.get(bot_name, bot_name)

    # --- Base directional probability ---
    # Trigger direction acts as an anchor; each bot weighs it vs their own bias
    if direction == VOTE_BUY:
        base_buy_prob = (p["directional_bias"] + 0.5) / 2        # pulled toward BUY
    else:
        base_buy_prob = (p["directional_bias"] + 0.0) / 2 * 0.5  # pulled toward SELL

    # --- RSI override ---
    rsi_signal = _compute_rsi_override(rsi, p)
    rsi_weight = p["rsi_sensitivity"]
    if rsi_signal == VOTE_BUY:
        base_buy_prob += rsi_weight * 0.2
    elif rsi_signal == VOTE_SELL:
        base_buy_prob -= rsi_weight * 0.2

    # --- MACD histogram (positive = bullish momentum) ---
    if macd_hist is not None:
        macd_push = 0.10 if macd_hist > 0 else -0.10
        base_buy_prob += macd_push * (1 - p["rsi_sensitivity"] * 0.5)

    # --- LIVE bots vote with higher conviction ---
    if mode == "LIVE":
        conviction_boost = 0.05
    elif mode == "APPROVED_FOR_LIVE":
        conviction_boost = 0.02
    else:
        conviction_boost = 0.0
    base_buy_prob = max(0.0, min(1.0, base_buy_prob + conviction_boost))

    # --- Conviction gate: low-conviction bots HOLD or ABSTAIN ---
    dice = random.random()
    if dice > p["conviction"]:
        # Low-conviction → HOLD (mostly) or ABSTAIN (rarely)
        if dice > p["conviction"] + 0.15:
            vote_choice = VOTE_ABSTAIN
            confidence  = round(random.uniform(0.05, 0.25), 2)
            reason = "Insufficient signal clarity — abstaining"
        else:
            vote_choice = VOTE_HOLD
            confidence  = round(random.uniform(0.25, 0.45), 2)
            reason = "Signal ambiguous — holding position"
    else:
        # Cast directional vote
        if random.random() < base_buy_prob:
            vote_choice = VOTE_BUY
            confidence  = round(random.uniform(0.55, 0.98), 2)
            reason = _buy_reason(rsi, macd_hist, p)
        else:
            vote_choice = VOTE_SELL
            confidence  = round(random.uniform(0.55, 0.98), 2)
            reason = _sell_reason(rsi, macd_hist, p)

    return BotVote(
        bot_name     = bot_name,
        display_name = display,
        vote         = vote_choice,
        confidence   = confidence,
        reasoning    = reason,
        mode         = mode,
    )


def _buy_reason(rsi, macd_hist, p) -> str:
    parts = []
    if rsi and rsi < 45:
        parts.append(f"RSI={rsi:.1f} oversold zone")
    if macd_hist and macd_hist > 0:
        parts.append(f"MACD bullish +{macd_hist:.5f}")
    if p["directional_bias"] > 0.65:
        parts.append("strong bullish bias")
    if not parts:
        parts.append("momentum confirms upside")
    return " · ".join(parts)


def _sell_reason(rsi, macd_hist, p) -> str:
    parts = []
    if rsi and rsi > 55:
        parts.append(f"RSI={rsi:.1f} overbought zone")
    if macd_hist and macd_hist < 0:
        parts.append(f"MACD bearish {macd_hist:.5f}")
    if p["directional_bias"] < 0.50:
        parts.append("contrarian reversal signal")
    if not parts:
        parts.append("price extension — take profit")
    return " · ".join(parts)


# ── Consensus Service ─────────────────────────────────────────────────────────

class ConsensusService:
    def __init__(self):
        self._history:     List[ConsensusRound] = []
        self._round_counter: int = 0
        self._stats = {
            "total_rounds":    0,
            "approved_rounds": 0,
            "rejected_rounds": 0,
            "total_buy_votes": 0,
            "total_sell_votes": 0,
            "total_hold_votes": 0,
        }
        # Bot mode cache (refreshed from DB on each round)
        self._bot_modes: Dict[str, str] = {b: "PAPER_ONLY" for b in BOT_PERSONALITIES}
        # Runtime-adjustable supermajority threshold (default = module-level constant)
        self._supermajority: int = SUPERMAJORITY

    def set_supermajority(self, votes: int) -> None:
        """
        Dynamically update the supermajority vote threshold.
        Called by Risk Config API when the user adjusts the OpenClaw slider.
        Takes effect on the next consensus round.
        """
        clamped = max(1, min(12, int(votes)))
        self._supermajority = clamped
        logger.info(f"OpenClaw supermajority updated: {clamped}/12")

    def update_bot_modes(self, modes: Dict[str, str]) -> None:
        """Called by cycle engine to keep bot modes current."""
        self._bot_modes.update(modes)

    async def run_consensus(
        self,
        triggered_by: str,
        direction:    str,    # BUY | SELL
    ) -> ConsensusResult:
        """
        Run a full BFT consensus round.
        All 12 bots vote; 7/12 supermajority required for approval.
        """
        import time
        t0 = time.monotonic()

        self._round_counter += 1
        round_id = self._round_counter

        price = price_service.current_price or 0.0
        indicators = price_service.compute_indicators()
        rsi       = indicators.get("rsi_14")
        macd      = indicators.get("macd")
        macd_sig  = indicators.get("macd_signal")
        macd_hist = (macd - macd_sig) if (macd and macd_sig) else None

        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        round_ = ConsensusRound(
            round_id       = round_id,
            triggered_by   = triggered_by,
            direction      = direction,
            price_at_round = price,
            timestamp      = now,
        )

        # ── Collect votes ──
        for bot_name in BOT_PERSONALITIES:
            mode = self._bot_modes.get(bot_name, "PAPER_ONLY")
            vote = _cast_vote(bot_name, direction, rsi, macd_hist, mode)
            round_.votes.append(vote)

        # ── Tally ──
        for v in round_.votes:
            if v.vote == VOTE_BUY:
                round_.buy_count += 1
            elif v.vote == VOTE_SELL:
                round_.sell_count += 1
            elif v.vote == VOTE_HOLD:
                round_.hold_count += 1
            else:
                round_.abstain_count += 1

        # ── Determine result ──
        # Use runtime-adjustable threshold (default 7/12; updated by Risk Config).
        effective_supermajority = self._supermajority
        round_.supermajority = effective_supermajority
        if round_.buy_count >= effective_supermajority:
            round_.result  = RESULT_APPROVED_BUY
            round_.approved = True
        elif round_.sell_count >= effective_supermajority:
            round_.result  = RESULT_APPROVED_SELL
            round_.approved = True
        elif round_.buy_count == round_.sell_count and round_.buy_count > 0:
            round_.result  = RESULT_DEADLOCK
            round_.approved = False
        else:
            round_.result  = RESULT_REJECTED
            round_.approved = False

        round_.duration_ms = int((time.monotonic() - t0) * 1000)

        # ── Store ──
        self._history.append(round_)
        if len(self._history) > MAX_HISTORY:
            self._history.pop(0)

        # ── Update stats ──
        self._stats["total_rounds"]    += 1
        self._stats["total_buy_votes"] += round_.buy_count
        self._stats["total_sell_votes"] += round_.sell_count
        self._stats["total_hold_votes"] += round_.hold_count
        if round_.approved:
            self._stats["approved_rounds"] += 1
        else:
            self._stats["rejected_rounds"] += 1

        # ── Activity log ──
        icon = "✅" if round_.approved else "🚫"
        push_event(
            "signal",
            f"{icon} OpenClaw #{round_id} — {round_.result} "
            f"({round_.buy_count}B/{round_.sell_count}S/{round_.hold_count}H)",
            strategy = triggered_by,
            detail   = f"Direction={direction} | {effective_supermajority}/12 threshold | {round_.duration_ms}ms",
        )

        # ── Alert ──
        if round_.approved:
            alert_service.consensus_approved(
                strategy_name = triggered_by,
                direction     = direction,
                buy           = round_.buy_count,
                sell          = round_.sell_count,
                hold          = round_.hold_count,
                round_id      = round_id,
            )
        else:
            alert_service.consensus_vetoed(
                strategy_name = triggered_by,
                direction     = direction,
                result        = round_.result,
                buy           = round_.buy_count,
                sell          = round_.sell_count,
                hold          = round_.hold_count,
                round_id      = round_id,
            )

        logger.info(
            f"Consensus #{round_id}: {round_.result} "
            f"BUY={round_.buy_count} SELL={round_.sell_count} "
            f"HOLD={round_.hold_count} ABSTAIN={round_.abstain_count}"
        )

        return ConsensusResult(
            approved   = round_.approved,
            direction  = direction,
            result     = round_.result,
            round_id   = round_id,
            buy_count  = round_.buy_count,
            sell_count = round_.sell_count,
            hold_count = round_.hold_count,
        )

    # ── Query helpers ──────────────────────────────────────────────────────────

    def get_latest(self) -> Optional[dict]:
        if not self._history:
            return None
        return self._history[-1].to_dict()

    def get_history(self, limit: int = 20) -> List[dict]:
        return [r.to_dict() for r in reversed(self._history[-limit:])]

    def get_stats(self) -> dict:
        total = self._stats["total_rounds"]
        approval_rate = (
            round(self._stats["approved_rounds"] / total * 100, 1) if total else 0.0
        )
        return {
            **self._stats,
            "approval_rate_pct": approval_rate,
            "supermajority_threshold": self._supermajority,
            "total_bots": TOTAL_BOTS,
        }

    @property
    def round_count(self) -> int:
        return self._round_counter


consensus_service = ConsensusService()