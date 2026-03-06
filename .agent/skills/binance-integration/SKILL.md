---
name: binance-integration
description: Activate when working on Binance Futures API integration, REST endpoints, WebSocket streams, market data fetching, order placement, position tracking, kline data, ticker updates, funding rates, testnet configuration, API authentication, HMAC signing, rate limiting, or any exchange connectivity in the Learner trading system.
---

# Binance Integration — Exchange API Layer

> **Expert Council**: Arthur Hayes (BitMEX/Exchange Architecture), Changpeng Zhao (Binance Design), Sam Bankman-Fried's Engineering Team (Exchange Internals), Martin Thompson (Low-Latency Systems), Ben Johnson (API Design)

## 🌐 Environment Configuration

| Variable | Default | Description | Risk Level |
|----------|---------|-------------|-----------|
| `BINANCE_API_KEY` | _(required)_ | API key from Binance Futures account | 🔴 SECRET |
| `BINANCE_API_SECRET` | _(required)_ | API secret for HMAC SHA256 signing | 🔴 SECRET |
| `BINANCE_TESTNET` | `true` | Use testnet by default | 🔴 CRITICAL |
| `NEXT_PUBLIC_WS_ENABLED` | `true` | Enable WebSocket connections | 🟢 Safe |

> **CRITICAL**: `BINANCE_TESTNET` defaults to `true` and **MUST NEVER be set to `false` in production code, .env defaults, or CI/CD**. Only the user, via manual `.env.local` edit, can enable live trading.

### Base URLs

| Environment | REST API | WebSocket |
|------------|----------|-----------|
| **Testnet** | `https://testnet.binancefuture.com` | `wss://stream.binancefuture.com/ws` |
| **Production** | `https://fapi.binance.com` | `wss://fstream.binance.com/ws` |

### URL Selection Pattern
```typescript
function getBaseUrl(isTestnet: boolean): { rest: string; ws: string } {
  if (isTestnet) {
    return {
      rest: 'https://testnet.binancefuture.com',
      ws: 'wss://stream.binancefuture.com/ws',
    };
  }
  return {
    rest: 'https://fapi.binance.com',
    ws: 'wss://fstream.binance.com/ws',
  };
}
```

---

## 📡 REST API Endpoints

### Market Data (No Auth Required)

| Method | Endpoint | Purpose | Rate Limit | Key Params |
|--------|----------|---------|------------|------------|
| GET | `/fapi/v1/klines` | Historical OHLCV candles | 5/s | `symbol`, `interval`, `limit` (max 1500) |
| GET | `/fapi/v1/ticker/24hr` | 24h price change stats | 5/s | `symbol?` (omit for all) |
| GET | `/fapi/v1/ticker/price` | Latest price | 5/s | `symbol?` |
| GET | `/fapi/v1/depth` | Order book | 10/s | `symbol`, `limit` (5/10/20/50/100) |
| GET | `/fapi/v1/fundingRate` | Funding rate history | 5/s | `symbol?`, `limit` (max 1000) |
| GET | `/fapi/v1/exchangeInfo` | Trading rules + filters | 1/s | — |

### Account & Trading (Auth Required)

| Method | Endpoint | Purpose | Rate Limit |
|--------|----------|---------|------------|
| GET | `/fapi/v2/account` | Balances + positions | 5/s |
| GET | `/fapi/v2/positionRisk` | Open position details | 5/s |
| POST | `/fapi/v1/order` | Place new order | 10/s |
| DELETE | `/fapi/v1/order` | Cancel order | 10/s |
| GET | `/fapi/v1/openOrders` | All open orders | 5/s |
| GET | `/fapi/v1/allOrders` | Order history | 5/s |
| POST | `/fapi/v1/leverage` | Set leverage for symbol | 1/s |
| POST | `/fapi/v1/marginType` | Set ISOLATED/CROSSED | 1/s |

---

## 🔐 Authentication Pattern

All authenticated requests require three components:

```typescript
import crypto from 'crypto';

interface SignedRequest {
  headers: Record<string, string>;
  params: Record<string, string | number>;
}

function createSignedRequest(
  params: Record<string, string | number>,
  apiKey: string,
  apiSecret: string,
): SignedRequest {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp };

  const queryString = Object.entries(allParams)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');

  return {
    headers: { 'X-MBX-APIKEY': apiKey },
    params: { ...allParams, signature },
  };
}
```

### Time Sync
```typescript
// Server time can drift — sync before authenticated requests
async function getServerTime(baseUrl: string): Promise<number> {
  const response = await fetch(`${baseUrl}/fapi/v1/time`);
  const data = await response.json();
  return data.serverTime;
}
```

---

## 📊 WebSocket Streams

### Market Streams (No Auth)

| Stream | Format | Data | Update Freq |
|--------|--------|------|-------------|
| Kline | `<symbol>@kline_<interval>` | Real-time OHLCV candle updates | Per trade |
| Mark Price | `<symbol>@markPrice` | Mark price + funding rate | 3s |
| Ticker | `<symbol>@ticker` | 24h rolling stats | 1s |
| Mini Ticker | `!miniTicker@arr` | All symbols price summary | 1s |
| Depth | `<symbol>@depth5` | Top 5 order book levels | 100ms |

### User Data Stream (Auth Required)

```
1. POST /fapi/v1/listenKey → { "listenKey": "abc123..." }
2. Connect: wss://stream/ws/<listenKey>
3. Keep alive: PUT /fapi/v1/listenKey every 30 min
4. Events:
   - ACCOUNT_UPDATE → balance + position changes
   - ORDER_TRADE_UPDATE → order fills + cancellations
   - MARGIN_CALL → margin warning
```

### WebSocket Connection Manager Pattern

```typescript
interface WebSocketConfig {
  url: string;
  streams: string[];
  onMessage: (data: unknown) => void;
  onError: (error: Event) => void;
  reconnectDelay: number;     // Initial: 1000ms
  maxReconnectDelay: number;  // Cap: 30000ms
  maxReconnectAttempts: number; // Max: 10
}

class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(config: WebSocketConfig): void {
    const streamString = config.streams.join('/');
    const url = `${config.url}/${streamString}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[BinanceWS] Connected');
        this.reconnectAttempts = 0; // Reset on successful connect
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          config.onMessage(data);
        } catch (error) {
          console.error('[BinanceWS] Parse error:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[BinanceWS] Error:', error);
        config.onError(error);
      };

      this.ws.onclose = () => {
        console.warn('[BinanceWS] Disconnected');
        this.scheduleReconnect(config);
      };
    } catch (error) {
      console.error('[BinanceWS] Connection failed:', error);
      this.scheduleReconnect(config);
    }
  }

  private scheduleReconnect(config: WebSocketConfig): void {
    if (this.reconnectAttempts >= config.maxReconnectAttempts) {
      console.error('[BinanceWS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      config.maxReconnectDelay,
    );

    this.reconnectAttempts++;
    console.log(`[BinanceWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(config);
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

---

## 📦 Kline Data Processing

```typescript
interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBase: number;
  takerBuyQuote: number;
}

function parseKlineArray(raw: (string | number)[]): Kline {
  return {
    openTime: Number(raw[0]),
    open: parseFloat(String(raw[1])),
    high: parseFloat(String(raw[2])),
    low: parseFloat(String(raw[3])),
    close: parseFloat(String(raw[4])),
    volume: parseFloat(String(raw[5])),
    closeTime: Number(raw[6]),
    quoteVolume: parseFloat(String(raw[7])),
    trades: Number(raw[8]),
    takerBuyBase: parseFloat(String(raw[9])),
    takerBuyQuote: parseFloat(String(raw[10])),
  };
}
```

---

## ⚠️ Error Handling

### Common Error Codes

| Code | Meaning | Action | Retry? |
|------|---------|--------|--------|
| `-1000` | Unknown error | Log + exponential backoff retry | ✅ Yes |
| `-1003` | Rate limit exceeded | Wait `Retry-After` header duration | ✅ Yes |
| `-1021` | Timestamp outside recvWindow | Re-sync server time, retry | ✅ Yes |
| `-2010` | Insufficient margin | Log, skip trade, alert user | ❌ No |
| `-2019` | Margin not sufficient | Reduce position size | ❌ No |
| `-4003` | Quantity less than minimum | Check `exchangeInfo` for `minQty` | ❌ No |
| `-4014` | Price not multiple of tick size | Round to `tickSize` from `exchangeInfo` | ❌ Fix and retry |

### Retry Strategy
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,        // 1s
  maxDelay: 8000,         // 8s
  backoffMultiplier: 2,   // Exponential: 1s, 2s, 4s

  // CRITICAL: NEVER retry these
  neverRetry: [
    'POST /fapi/v1/order',   // Risk of duplicate orders!
    'DELETE /fapi/v1/order',  // Already cancelled or filled
  ],

  // ALWAYS retry these
  alwaysRetry: [
    'GET /fapi/v1/klines',
    'GET /fapi/v1/ticker/24hr',
    'GET /fapi/v1/ticker/price',
  ],
};
```

---

## 🎯 Supported Trading Pairs

| Symbol | Description | Min Qty | Tick Size | Price Decimals |
|--------|-------------|---------|-----------|----------------|
| `BTCUSDT` | Bitcoin | 0.001 | 0.10 | 2 |
| `ETHUSDT` | Ethereum | 0.001 | 0.01 | 2 |
| `SOLUSDT` | Solana | 0.1 | 0.010 | 3 |
| `BNBUSDT` | BNB | 0.01 | 0.010 | 3 |
| `XRPUSDT` | Ripple | 0.1 | 0.0001 | 4 |
| `DOGEUSDT` | Dogecoin | 1 | 0.00001 | 5 |
| `AVAXUSDT` | Avalanche | 0.1 | 0.010 | 3 |
| `ADAUSDT` | Cardano | 1 | 0.0001 | 4 |

### Quantity/Price Precision
```typescript
function adjustQuantity(quantity: number, minQty: number, stepSize: number): number {
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return Math.max(adjusted, minQty);
}

function adjustPrice(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}
```

---

## 🔒 Security Rules

| # | Rule | Severity |
|---|------|----------|
| 1 | **NEVER** commit API keys to git | 🔴 CRITICAL |
| 2 | **NEVER** log API secrets in console | 🔴 CRITICAL |
| 3 | **ALWAYS** default to testnet | 🔴 CRITICAL |
| 4 | **ALWAYS** validate response structure before use | 🟡 IMPORTANT |
| 5 | **NEVER** retry order placement | 🟡 IMPORTANT |
| 6 | Rate limit all requests (use queue) | 🟡 IMPORTANT |
| 7 | Validate `exchangeInfo` filters before orders | 🟡 IMPORTANT |
| 8 | Handle WebSocket disconnections gracefully | 🟡 IMPORTANT |

---

## 📂 Key Files
- `src/lib/api/binance.ts` → REST client (future implementation)
- `src/lib/api/websocket.ts` → WebSocket manager (future implementation)
- `src/lib/store/index.ts` → `useMarketStore` for live ticker/kline data
- `.env.local` → API credentials (**NEVER commit to git**)
- `src/types/index.ts` → `Timeframe` enum used for kline intervals

See `references/api-endpoints.md` for detailed request/response JSON schemas.
