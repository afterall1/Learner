# Binance Futures API — Endpoint Reference

## Market Data Endpoints

### GET /fapi/v1/klines
```
Params: symbol, interval, startTime?, endTime?, limit? (default 500, max 1500)
Response: [[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]]
Intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
```

### GET /fapi/v1/ticker/24hr
```
Params: symbol? (omit for all symbols)
Response: { symbol, priceChange, priceChangePercent, weightedAvgPrice, lastPrice, lastQty, openPrice, highPrice, lowPrice, volume, quoteVolume, openTime, closeTime, firstId, lastId, count }
```

### GET /fapi/v1/ticker/price
```
Params: symbol?
Response: { symbol, price, time }
```

### GET /fapi/v1/depth
```
Params: symbol, limit? (5, 10, 20, 50, 100, 500, 1000)
Response: { lastUpdateId, E (event time), T (transaction time), bids: [[price, qty]], asks: [[price, qty]] }
```

### GET /fapi/v1/fundingRate
```
Params: symbol?, startTime?, endTime?, limit? (default 100, max 1000)
Response: [{ symbol, fundingRate, fundingTime, markPrice }]
```

---

## Account Endpoints

### GET /fapi/v2/account
```
Auth: Required (HMAC SHA256)
Response: {
  totalWalletBalance, totalUnrealizedProfit, totalMarginBalance,
  availableBalance, maxWithdrawAmount,
  positions: [{ symbol, positionAmt, entryPrice, markPrice, unRealizedProfit, liquidationPrice, leverage, marginType, isolatedMargin, positionSide }],
  assets: [{ asset, walletBalance, unrealizedProfit, marginBalance, availableBalance }]
}
```

### GET /fapi/v2/positionRisk
```
Auth: Required
Params: symbol?
Response: [{ symbol, positionAmt, entryPrice, markPrice, unRealizedProfit, liquidationPrice, leverage, maxNotionalValue, marginType, isolatedMargin, isAutoAddMargin, positionSide, notional, isolatedWallet, updateTime }]
```

---

## Order Endpoints

### POST /fapi/v1/order
```
Auth: Required
Params:
  symbol: string (required)
  side: BUY | SELL (required)
  type: LIMIT | MARKET | STOP | STOP_MARKET | TAKE_PROFIT | TAKE_PROFIT_MARKET | TRAILING_STOP_MARKET (required)
  quantity: decimal (required for LIMIT/MARKET)
  price: decimal (required for LIMIT)
  stopPrice: decimal (required for STOP/STOP_MARKET/TAKE_PROFIT/TAKE_PROFIT_MARKET)
  timeInForce: GTC | IOC | FOK (required for LIMIT)
  reduceOnly: true | false
  newClientOrderId: string (optional, for idempotency)
  positionSide: BOTH | LONG | SHORT

Response: { orderId, symbol, status, clientOrderId, price, avgPrice, origQty, executedQty, cumQuote, timeInForce, type, reduceOnly, side, stopPrice, updateTime }
```

### DELETE /fapi/v1/order
```
Auth: Required
Params: symbol, orderId? | origClientOrderId?
Response: { orderId, symbol, status: "CANCELED", ... }
```

---

## WebSocket Message Schemas

### Kline Stream (`<symbol>@kline_<interval>`)
```json
{
  "e": "kline",
  "E": 1638747660000,
  "s": "BTCUSDT",
  "k": {
    "t": 1638747600000, "T": 1638747659999,
    "s": "BTCUSDT", "i": "1m",
    "o": "48000.00", "c": "48050.00",
    "h": "48100.00", "l": "47950.00",
    "v": "100.500", "n": 1234,
    "x": false, "q": "4825000.00"
  }
}
```

### User Data: ORDER_TRADE_UPDATE
```json
{
  "e": "ORDER_TRADE_UPDATE",
  "T": 1638747660000,
  "o": {
    "s": "BTCUSDT", "c": "clientOrderId",
    "S": "BUY", "o": "LIMIT",
    "f": "GTC", "q": "0.001",
    "p": "48000.00", "ap": "48000.00",
    "sp": "0", "x": "TRADE",
    "X": "FILLED", "i": 12345678,
    "l": "0.001", "z": "0.001",
    "L": "48000.00", "n": "0.01920",
    "N": "USDT", "T": 1638747660000,
    "t": 87654321, "rp": "0"
  }
}
```
