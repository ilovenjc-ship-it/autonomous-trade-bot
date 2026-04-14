from fastapi import APIRouter, Query
from services.price_service import price_service

router = APIRouter(prefix="/api/price", tags=["price"])


@router.get("/current")
async def get_current_price():
    return {
        "symbol": "TAO",
        **price_service.price_data,
        "indicators": price_service.compute_indicators(),
    }


@router.get("/history")
async def get_price_history(days: int = Query(7, ge=1, le=90)):
    data = await price_service.fetch_ohlcv(days=days)
    return {"symbol": "TAO", "days": days, "data": data}


@router.get("/indicators")
async def get_indicators():
    return price_service.compute_indicators()