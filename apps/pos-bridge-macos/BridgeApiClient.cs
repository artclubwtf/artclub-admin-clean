using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace PosBridgeMacOS;

public sealed class BridgeApiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public BridgeApiClient(BridgeConfig config)
    {
        var baseUrl = config.ServerBaseUrl.TrimEnd('/');
        _http = new HttpClient
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(40),
        };
        _http.DefaultRequestHeaders.Accept.Clear();
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.Add("x-pos-agent-key", config.AgentKey);
    }

    public async Task<bool> HeartbeatAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/pos-agent/v1/heartbeat");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            throw new InvalidOperationException("Agent key unauthorized. Run setup again with a valid key.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await SafeReadStringAsync(response, cancellationToken);
            throw new InvalidOperationException($"Heartbeat failed ({(int)response.StatusCode}): {errorBody}");
        }

        return true;
    }

    public async Task<AgentCommand?> GetNextCommandAsync(int waitSeconds, CancellationToken cancellationToken)
    {
        var wait = Math.Clamp(waitSeconds, 0, 25);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/pos-agent/v1/commands/next?wait={wait}");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NoContent)
        {
            return null;
        }

        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            throw new InvalidOperationException("Agent key unauthorized. Run setup again with a valid key.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await SafeReadStringAsync(response, cancellationToken);
            throw new InvalidOperationException($"Command pull failed ({(int)response.StatusCode}): {errorBody}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<NextCommandResponse>(stream, _jsonOptions, cancellationToken);
        if (payload?.Ok != true || payload.Command is null || string.IsNullOrWhiteSpace(payload.Command.Id))
        {
            return null;
        }

        return new AgentCommand(payload.Command.Id, payload.Command.Type ?? "", payload.Command.Payload);
    }

    public async Task ReportCommandAsync(string commandId, bool ok, object? result, string? error, CancellationToken cancellationToken)
    {
        var payload = new
        {
            commandId,
            ok,
            result,
            error,
        };

        var json = JsonSerializer.Serialize(payload, _jsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/pos-agent/v1/commands/report")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await SafeReadStringAsync(response, cancellationToken);
            throw new InvalidOperationException($"Command report failed ({(int)response.StatusCode}): {errorBody}");
        }
    }

    private static async Task<string> SafeReadStringAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return string.IsNullOrWhiteSpace(body) ? "<empty>" : body;
        }
        catch
        {
            return "<unreadable>";
        }
    }

    public void Dispose()
    {
        _http.Dispose();
    }

    private sealed class NextCommandResponse
    {
        public bool Ok { get; set; }
        public NextCommandPayload? Command { get; set; }
    }

    private sealed class NextCommandPayload
    {
        public string? Id { get; set; }
        public string? Type { get; set; }
        public JsonElement Payload { get; set; }
    }
}

public sealed record AgentCommand(string Id, string Type, JsonElement Payload);
