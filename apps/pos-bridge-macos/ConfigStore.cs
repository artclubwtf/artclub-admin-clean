using System.Text.Json;

namespace PosBridgeMacOS;

public static class ConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private static readonly string ConfigDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".artclub-pos-bridge");

    public static string ConfigPath => Path.Combine(ConfigDirectory, "config.json");

    public static bool Exists()
    {
        return File.Exists(ConfigPath);
    }

    public static BridgeConfig? TryLoad(out string? error)
    {
        error = null;
        if (!Exists())
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(ConfigPath);
            var config = JsonSerializer.Deserialize<BridgeConfig>(json, JsonOptions);
            if (config is null)
            {
                error = "Config file is empty or invalid.";
                return null;
            }

            var validationError = config.Validate();
            if (validationError is not null)
            {
                error = $"Invalid config: {validationError}";
                return null;
            }

            return config;
        }
        catch (Exception ex)
        {
            error = $"Failed to read config: {ex.Message}";
            return null;
        }
    }

    public static void Save(BridgeConfig config)
    {
        Directory.CreateDirectory(ConfigDirectory);
        var json = JsonSerializer.Serialize(config, JsonOptions);
        File.WriteAllText(ConfigPath, json);
    }
}
