using System.Text.Json.Serialization;

namespace PosBridgeMacOS;

public sealed class BridgeConfig
{
    [JsonPropertyName("serverBaseUrl")]
    public string ServerBaseUrl { get; set; } = "";

    [JsonPropertyName("agentKey")]
    public string AgentKey { get; set; } = "";

    [JsonPropertyName("terminalHost")]
    public string TerminalHost { get; set; } = "";

    [JsonPropertyName("terminalPort")]
    public int TerminalPort { get; set; } = 22000;

    [JsonPropertyName("zvtPassword")]
    public string ZvtPassword { get; set; } = "000000";

    public string? Validate()
    {
        if (string.IsNullOrWhiteSpace(ServerBaseUrl))
        {
            return "serverBaseUrl is required";
        }

        if (!Uri.TryCreate(ServerBaseUrl, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
        {
            return "serverBaseUrl must be a valid http/https URL";
        }

        if (string.IsNullOrWhiteSpace(AgentKey))
        {
            return "agentKey is required";
        }

        if (string.IsNullOrWhiteSpace(TerminalHost))
        {
            return "terminalHost is required";
        }

        if (TerminalPort <= 0 || TerminalPort > 65535)
        {
            return "terminalPort must be between 1 and 65535";
        }

        if (string.IsNullOrWhiteSpace(ZvtPassword))
        {
            return "zvtPassword is required";
        }

        return null;
    }
}
