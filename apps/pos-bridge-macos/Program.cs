using System.Globalization;
using System.Text.Json;

namespace PosBridgeMacOS;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var command = args.Length == 0 ? "help" : args[0].Trim().ToLowerInvariant();
        return command switch
        {
            "setup" => await RunSetupAsync(),
            "status" => await RunStatusAsync(),
            "run" => await RunLoopAsync(),
            "help" or "--help" or "-h" => PrintUsage(),
            _ => PrintUsage($"Unknown command: {command}"),
        };
    }

    private static int PrintUsage(string? error = null)
    {
        if (!string.IsNullOrWhiteSpace(error))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine(error);
            Console.ResetColor();
            Console.WriteLine();
        }

        Console.WriteLine("pos-bridge - Artclub POS Bridge (macOS)");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  pos-bridge setup   Interactive config wizard");
        Console.WriteLine("  pos-bridge status  Show server + terminal status");
        Console.WriteLine("  pos-bridge run     Start bridge runtime loop");
        Console.WriteLine();
        Console.WriteLine($"Config path: {ConfigStore.ConfigPath}");
        return string.IsNullOrWhiteSpace(error) ? 0 : 1;
    }

    private static async Task<int> RunSetupAsync()
    {
        var existing = ConfigStore.TryLoad(out _);

        Console.WriteLine("POS Bridge setup");
        Console.WriteLine($"Config file: {ConfigStore.ConfigPath}");
        Console.WriteLine();

        var config = new BridgeConfig
        {
            ServerBaseUrl = Prompt("Server base URL", existing?.ServerBaseUrl, "https://admin.artclub.wtf"),
            AgentKey = Prompt("Agent key", existing?.AgentKey, ""),
            TerminalHost = Prompt("Terminal host/IP", existing?.TerminalHost, ""),
            TerminalPort = PromptInt("Terminal port", existing?.TerminalPort ?? 22000, 22000),
            ZvtPassword = Prompt("ZVT password", existing?.ZvtPassword, "000000"),
        };

        var validationError = config.Validate();
        if (validationError is not null)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"Invalid config: {validationError}");
            Console.ResetColor();
            return 1;
        }

        ConfigStore.Save(config);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("Saved.");
        Console.ResetColor();

        await RunStatusInternalAsync(config, CancellationToken.None);
        return 0;
    }

    private static async Task<int> RunStatusAsync()
    {
        var config = LoadRequiredConfig();
        if (config is null)
        {
            return 1;
        }

        await RunStatusInternalAsync(config, CancellationToken.None);
        return 0;
    }

    private static async Task RunStatusInternalAsync(BridgeConfig config, CancellationToken cancellationToken)
    {
        using var api = new BridgeApiClient(config);
        var zvt = new ZvtTerminalService();

        bool serverOk;
        bool terminalOk;
        string? serverError = null;

        try
        {
            await api.HeartbeatAsync(cancellationToken);
            serverOk = true;
        }
        catch (Exception ex)
        {
            serverOk = false;
            serverError = ex.Message;
        }

        terminalOk = await zvt.TestConnectivityAsync(config.TerminalHost, config.TerminalPort, 3000, cancellationToken);

        Console.WriteLine($"Server: {config.ServerBaseUrl}");
        Console.WriteLine($"Agent key: {Mask(config.AgentKey)}");
        Console.WriteLine($"Terminal: {config.TerminalHost}:{config.TerminalPort}");
        Console.WriteLine($"Last seen (local): {DateTimeOffset.UtcNow:O}");

        if (!string.IsNullOrWhiteSpace(serverError))
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"Server check error: {serverError}");
            Console.ResetColor();
        }

        PrintBanner(serverOk, terminalOk);
    }

    private static async Task<int> RunLoopAsync()
    {
        var config = LoadRequiredConfig();
        if (config is null)
        {
            return 1;
        }

        using var api = new BridgeApiClient(config);
        var zvt = new ZvtTerminalService();
        using var cts = new CancellationTokenSource();
        var token = cts.Token;
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cts.Cancel();
        };

        Console.WriteLine("Starting pos-bridge runtime. Press Ctrl+C to stop.");
        Console.WriteLine($"Server: {config.ServerBaseUrl}");
        Console.WriteLine($"Terminal: {config.TerminalHost}:{config.TerminalPort}");
        Console.WriteLine();

        var serverOk = false;
        var terminalOk = false;
        string? lastBanner = null;
        var nextHeartbeatAt = DateTimeOffset.MinValue;
        var backoffSeconds = 1;

        while (!token.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                if (now >= nextHeartbeatAt)
                {
                    try
                    {
                        await api.HeartbeatAsync(token);
                        serverOk = true;
                    }
                    catch (Exception hbEx)
                    {
                        serverOk = false;
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine($"[{DateTimeOffset.UtcNow:HH:mm:ss}] heartbeat failed: {hbEx.Message}");
                        Console.ResetColor();
                    }

                    terminalOk = await zvt.TestConnectivityAsync(config.TerminalHost, config.TerminalPort, 2500, token);
                    nextHeartbeatAt = now.AddSeconds(10);
                    lastBanner = PrintBanner(serverOk, terminalOk, lastBanner);
                }

                var command = await api.GetNextCommandAsync(25, token);
                if (command is null)
                {
                    backoffSeconds = 1;
                    continue;
                }

                Console.WriteLine($"[{DateTimeOffset.UtcNow:HH:mm:ss}] command {command.Id} ({command.Type})");
                var reported = await HandleCommandAsync(api, zvt, config, command, token);
                if (!reported.Ok && reported.Error == "terminal_unreachable")
                {
                    terminalOk = false;
                }
                else if (reported.Ok)
                {
                    terminalOk = true;
                }

                lastBanner = PrintBanner(serverOk, terminalOk, lastBanner);
                backoffSeconds = 1;
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                serverOk = false;
                lastBanner = PrintBanner(serverOk, terminalOk, lastBanner);
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"[{DateTimeOffset.UtcNow:HH:mm:ss}] loop error: {ex.Message}");
                Console.WriteLine($"Retrying in {backoffSeconds}s...");
                Console.ResetColor();
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                backoffSeconds = Math.Min(backoffSeconds * 2, 10);
            }
        }

        Console.WriteLine("Stopped.");
        return 0;
    }

    private static async Task<CommandReportResult> HandleCommandAsync(
        BridgeApiClient api,
        ZvtTerminalService zvt,
        BridgeConfig config,
        AgentCommand command,
        CancellationToken cancellationToken)
    {
        if (string.Equals(command.Type, "ping", StringComparison.OrdinalIgnoreCase))
        {
            var payload = new Dictionary<string, object?>
            {
                ["status"] = "ok",
                ["timestamp"] = DateTimeOffset.UtcNow.ToString("O"),
            };
            await api.ReportCommandAsync(command.Id, true, payload, null, cancellationToken);
            return new CommandReportResult(true, null);
        }

        if (string.Equals(command.Type, "zvt_abort", StringComparison.OrdinalIgnoreCase))
        {
            var host = JsonValueOrDefault(command.Payload, "terminalHost", config.TerminalHost);
            var port = JsonIntOrDefault(command.Payload, "terminalPort", config.TerminalPort);
            var password = JsonValueOrDefault(command.Payload, "zvtPassword", config.ZvtPassword);

            var abortResult = await zvt.AbortAsync(host, port, password, cancellationToken);
            if (!abortResult.Ok)
            {
                await api.ReportCommandAsync(command.Id, false, null, abortResult.Error ?? "abort_failed", cancellationToken);
                return new CommandReportResult(false, abortResult.Error ?? "abort_failed");
            }

            await api.ReportCommandAsync(command.Id, true, new { status = "cancelled" }, null, cancellationToken);
            return new CommandReportResult(true, null);
        }

        if (!string.Equals(command.Type, "zvt_payment", StringComparison.OrdinalIgnoreCase))
        {
            await api.ReportCommandAsync(command.Id, false, null, $"unsupported_command:{command.Type}", cancellationToken);
            return new CommandReportResult(false, $"unsupported_command:{command.Type}");
        }

        var amountCents = JsonIntOrDefault(command.Payload, "amountCents", 0);
        if (amountCents <= 0)
        {
            await api.ReportCommandAsync(command.Id, false, null, "invalid_amount", cancellationToken);
            return new CommandReportResult(false, "invalid_amount");
        }

        var terminalHost = JsonValueOrDefault(command.Payload, "terminalHost", config.TerminalHost);
        var terminalPort = JsonIntOrDefault(command.Payload, "terminalPort", config.TerminalPort);
        var zvtPassword = JsonValueOrDefault(command.Payload, "zvtPassword", config.ZvtPassword);

        var paymentResult = await zvt.ExecutePaymentAsync(terminalHost, terminalPort, zvtPassword, amountCents, cancellationToken);
        if (!paymentResult.Ok)
        {
            await api.ReportCommandAsync(command.Id, false, null, paymentResult.Error ?? "payment_failed", cancellationToken);
            return new CommandReportResult(false, paymentResult.Error ?? "payment_failed");
        }

        var resultPayload = new Dictionary<string, object?>
        {
            ["status"] = paymentResult.Status,
            ["amountCents"] = amountCents,
            ["terminalHost"] = terminalHost,
            ["terminalPort"] = terminalPort,
        };

        foreach (var kvp in paymentResult.TerminalRefs)
        {
            resultPayload[kvp.Key] = kvp.Value;
        }

        if (!string.IsNullOrWhiteSpace(paymentResult.Note))
        {
            resultPayload["note"] = paymentResult.Note;
        }

        await api.ReportCommandAsync(command.Id, true, resultPayload, null, cancellationToken);
        return new CommandReportResult(true, null);
    }

    private static string PrintBanner(bool serverOk, bool terminalOk, string? previousBanner = null)
    {
        var banner = serverOk && terminalOk
            ? "READY — Server OK — Terminal OK"
            : serverOk
                ? "SERVER OK — TERMINAL OFFLINE (switch to External Terminal in POS)"
                : terminalOk
                    ? "SERVER OFFLINE — TERMINAL OK"
                    : "SERVER OFFLINE — TERMINAL OFFLINE (switch to External Terminal in POS)";

        if (banner == previousBanner)
        {
            return banner;
        }

        Console.ForegroundColor = serverOk && terminalOk ? ConsoleColor.Green : ConsoleColor.Yellow;
        Console.WriteLine();
        Console.WriteLine($"[{DateTimeOffset.UtcNow:HH:mm:ss}] {banner}");
        Console.WriteLine();
        Console.ResetColor();
        return banner;
    }

    private static BridgeConfig? LoadRequiredConfig()
    {
        var config = ConfigStore.TryLoad(out var error);
        if (config is not null)
        {
            return config;
        }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(error ?? "Config not found.");
        Console.WriteLine("Run: pos-bridge setup");
        Console.ResetColor();
        return null;
    }

    private static string Prompt(string label, string? current, string fallback)
    {
        var defaultValue = !string.IsNullOrWhiteSpace(current) ? current : fallback;
        Console.Write($"{label} [{defaultValue}]: ");
        var input = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(input))
        {
            return defaultValue;
        }
        return input.Trim();
    }

    private static int PromptInt(string label, int current, int fallback)
    {
        var defaultValue = current > 0 ? current : fallback;
        Console.Write($"{label} [{defaultValue}]: ");
        var input = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(input))
        {
            return defaultValue;
        }
        if (int.TryParse(input.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed > 0)
        {
            return parsed;
        }
        return defaultValue;
    }

    private static string Mask(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "<empty>";
        }

        var trimmed = value.Trim();
        if (trimmed.Length <= 8)
        {
            return new string('*', trimmed.Length);
        }

        return $"{trimmed[..4]}...{trimmed[^4..]}";
    }

    private static string JsonValueOrDefault(JsonElement payload, string name, string fallback)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return fallback;
        }

        if (!payload.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return fallback;
        }

        var value = property.GetString();
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static int JsonIntOrDefault(JsonElement payload, string name, int fallback)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return fallback;
        }

        if (!payload.TryGetProperty(name, out var property))
        {
            return fallback;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var number))
        {
            return number;
        }

        if (property.ValueKind == JsonValueKind.String && int.TryParse(property.GetString(), out var parsed))
        {
            return parsed;
        }

        return fallback;
    }

    private sealed record CommandReportResult(bool Ok, string? Error);
}
