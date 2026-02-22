# POS Bridge macOS (ZVT)

Standalone .NET 8 console client for Artclub POS bridge mode.

It runs on a MacBook, pulls commands from admin API, talks to the Verifone terminal over ZVT TCP (`22000`), and reports results back.

## 60-second setup (event WLAN)
1. Build or copy the `pos-bridge` binary to the MacBook.
2. Run `pos-bridge setup`.
3. Enter:
   - `serverBaseUrl` (for example `https://admin.artclub.wtf`)
   - `agentKey` (from `/api/pos-agent/v1/register`)
   - `terminalHost` (terminal IP on current WLAN)
   - `terminalPort` (`22000`)
   - `zvtPassword` (default `000000`)
4. Start with `pos-bridge run`.

When WLAN changes, run `pos-bridge setup` again and only update `terminalHost`.

## Commands
- `pos-bridge setup`
  - Interactive wizard.
  - Writes config to `~/.artclub-pos-bridge/config.json`.
- `pos-bridge status`
  - Sends heartbeat to server.
  - Tests terminal TCP connectivity.
  - Prints readiness banner.
- `pos-bridge run`
  - Runtime loop with:
    - heartbeat every 10s
    - long-poll `GET /api/pos-agent/v1/commands/next?wait=25`
    - ZVT payment/abort execution
    - report to `POST /api/pos-agent/v1/commands/report`
  - Backoff on errors: `1s -> 2s -> 4s -> 8s -> 10s`.

## Build (single-file macOS arm64)
```bash
cd apps/pos-bridge-macos
dotnet restore
dotnet publish -c Release -r osx-arm64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:PublishTrimmed=false \
  -o ./dist
```

Binary output:
- `apps/pos-bridge-macos/dist/pos-bridge`

Run:
```bash
./dist/pos-bridge setup
./dist/pos-bridge run
```

## Verifone support checklist
Tell Verifone support/device setup:
- Terminal protocol: `ZVT`
- Connection mode: `TCP server mode`
- Port: `22000`
- Password: configured ZVT password (typically `000000`)
- Terminal and MacBook must be on the same WLAN/subnet.

## Runtime banner meanings
- `READY — Server OK — Terminal OK`
- `SERVER OK — TERMINAL OFFLINE (switch to External Terminal in POS)`

If terminal is unreachable, continue sales via POS external mode and use `Mark as Paid` in admin POS.
