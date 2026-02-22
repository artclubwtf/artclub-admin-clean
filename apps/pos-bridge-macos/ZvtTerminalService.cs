using System.Net.Sockets;
using System.Reflection;

namespace PosBridgeMacOS;

public sealed class ZvtTerminalService
{
    public async Task<bool> TestConnectivityAsync(string host, int port, int timeoutMs, CancellationToken cancellationToken)
    {
        using var tcpClient = new TcpClient();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(Math.Max(500, timeoutMs));
        try
        {
            await tcpClient.ConnectAsync(host, port, timeoutCts.Token);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task<PaymentExecutionResult> ExecutePaymentAsync(string host, int port, string password, int amountCents, CancellationToken cancellationToken)
    {
        if (!await TestConnectivityAsync(host, port, 3000, cancellationToken))
        {
            return PaymentExecutionResult.Failure("terminal_unreachable");
        }

        try
        {
            var context = await OpenZvtContextAsync(host, port, password, cancellationToken);
            if (!context.Connected || context.Client is null)
            {
                return PaymentExecutionResult.Failure("terminal_unreachable");
            }

            var paymentResult = await InvokePaymentAsync(context.Client, amountCents, cancellationToken);
            var mappedStatus = MapPaymentStatus(paymentResult.StatusHint);
            return PaymentExecutionResult.Success(mappedStatus, paymentResult.TerminalRefs, paymentResult.Note);
        }
        catch (Exception ex)
        {
            var message = ex.Message.ToLowerInvariant();
            if (message.Contains("cancel") || message.Contains("abort"))
            {
                return PaymentExecutionResult.Success("cancelled", new Dictionary<string, object?>(), ex.Message);
            }

            if (message.Contains("declin") || message.Contains("reject") || message.Contains("fail"))
            {
                return PaymentExecutionResult.Success("failed", new Dictionary<string, object?>(), ex.Message);
            }

            return PaymentExecutionResult.Failure(ex.Message);
        }
    }

    public async Task<AbortExecutionResult> AbortAsync(string host, int port, string password, CancellationToken cancellationToken)
    {
        if (!await TestConnectivityAsync(host, port, 3000, cancellationToken))
        {
            return AbortExecutionResult.Failure("terminal_unreachable");
        }

        try
        {
            var context = await OpenZvtContextAsync(host, port, password, cancellationToken);
            if (!context.Connected || context.Client is null)
            {
                return AbortExecutionResult.Failure("terminal_unreachable");
            }

            var abortMethod = FindMethod(context.Client.GetType(), "AbortAsync", 0)
                ?? FindMethod(context.Client.GetType(), "ReversalAsync", 0);
            if (abortMethod is null)
            {
                return AbortExecutionResult.Failure("abort_not_supported_by_library");
            }

            var task = abortMethod.Invoke(context.Client, []);
            await AwaitTask(task, cancellationToken);
            return AbortExecutionResult.Success();
        }
        catch (Exception ex)
        {
            return AbortExecutionResult.Failure(ex.Message);
        }
    }

    private static async Task<ZvtContext> OpenZvtContextAsync(string host, int port, string password, CancellationToken cancellationToken)
    {
        var assembly = Assembly.Load("Portalum.Zvt");
        var communicationType = assembly.GetType("Portalum.Zvt.Network.TcpNetworkDeviceCommunication")
            ?? assembly.GetType("Portalum.Zvt.TcpNetworkDeviceCommunication");
        var clientType = assembly.GetType("Portalum.Zvt.ZvtClient");
        var configType = assembly.GetType("Portalum.Zvt.ZvtClientConfig");

        if (communicationType is null || clientType is null)
        {
            throw new InvalidOperationException("Portalum.Zvt library type resolution failed.");
        }

        var communication = CreateTcpCommunication(communicationType, host, port);
        var connectMethod = FindMethod(communicationType, "ConnectAsync", 0);
        if (connectMethod is null)
        {
            throw new InvalidOperationException("ConnectAsync method not found in Portalum.Zvt communication type.");
        }

        var connected = await AwaitTaskBool(connectMethod.Invoke(communication, []), cancellationToken);
        if (!connected)
        {
            return new ZvtContext(communication, null, false);
        }

        var config = CreateClientConfig(configType, password);
        var client = CreateZvtClient(clientType, communication, config, configType);
        return new ZvtContext(communication, client, true);
    }

    private static object CreateTcpCommunication(Type communicationType, string host, int port)
    {
        var constructors = communicationType.GetConstructors();
        foreach (var ctor in constructors)
        {
            var parameters = ctor.GetParameters();
            if (parameters.Length >= 2 &&
                parameters[0].ParameterType == typeof(string) &&
                parameters[1].ParameterType == typeof(int))
            {
                return ctor.Invoke([host, port]);
            }

            if (parameters.Length == 1 && parameters[0].ParameterType == typeof(string))
            {
                return ctor.Invoke([host]);
            }
        }

        throw new InvalidOperationException("No supported TcpNetworkDeviceCommunication constructor found.");
    }

    private static object? CreateClientConfig(Type? configType, string password)
    {
        if (configType is null)
        {
            return null;
        }

        var instance = Activator.CreateInstance(configType);
        if (instance is null)
        {
            return null;
        }

        if (int.TryParse(password, out var numericPassword))
        {
            var passwordProperty = configType.GetProperty("Password", BindingFlags.Instance | BindingFlags.Public);
            if (passwordProperty is not null && passwordProperty.CanWrite)
            {
                if (passwordProperty.PropertyType == typeof(int))
                {
                    passwordProperty.SetValue(instance, numericPassword);
                }
                else if (passwordProperty.PropertyType == typeof(string))
                {
                    passwordProperty.SetValue(instance, password);
                }
            }
        }

        return instance;
    }

    private static object CreateZvtClient(Type clientType, object communication, object? config, Type? configType)
    {
        var constructors = clientType.GetConstructors();
        foreach (var ctor in constructors)
        {
            var parameters = ctor.GetParameters();
            if (parameters.Length == 0)
            {
                continue;
            }

            if (!parameters[0].ParameterType.IsInstanceOfType(communication))
            {
                continue;
            }

            var args = new object?[parameters.Length];
            args[0] = communication;
            var configAssigned = false;

            for (var i = 1; i < parameters.Length; i++)
            {
                var p = parameters[i];
                if (!configAssigned && config is not null && configType is not null && p.ParameterType.IsAssignableFrom(configType))
                {
                    args[i] = config;
                    configAssigned = true;
                    continue;
                }

                if (p.HasDefaultValue)
                {
                    args[i] = p.DefaultValue;
                    continue;
                }

                args[i] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null;
            }

            var instance = ctor.Invoke(args);
            if (instance is not null)
            {
                return instance;
            }
        }

        throw new InvalidOperationException("No supported ZvtClient constructor found.");
    }

    private static async Task<PaymentInvokeResult> InvokePaymentAsync(object zvtClient, int amountCents, CancellationToken cancellationToken)
    {
        var method = FindPaymentMethod(zvtClient.GetType());
        if (method is null)
        {
            throw new InvalidOperationException("PaymentAsync method not found on ZvtClient.");
        }

        var parameterType = method.GetParameters()[0].ParameterType;
        object amountArgument = parameterType == typeof(decimal)
            ? amountCents / 100m
            : parameterType == typeof(double)
                ? amountCents / 100.0
                : parameterType == typeof(float)
                    ? amountCents / 100f
                    : amountCents;

        var task = method.Invoke(zvtClient, [amountArgument]);
        var result = await AwaitTaskResult(task, cancellationToken);
        var refs = ExtractTerminalRefs(result);
        var statusHint = ExtractStatusHint(result);
        var note = ExtractMessageHint(result);
        return new PaymentInvokeResult(statusHint, refs, note);
    }

    private static MethodInfo? FindPaymentMethod(Type clientType)
    {
        return clientType
            .GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == "PaymentAsync" && m.GetParameters().Length == 1);
    }

    private static MethodInfo? FindMethod(Type type, string name, int parameterCount)
    {
        return type.GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == name && m.GetParameters().Length == parameterCount);
    }

    private static async Task AwaitTask(object? maybeTask, CancellationToken cancellationToken)
    {
        if (maybeTask is not Task task)
        {
            return;
        }

        await task.WaitAsync(cancellationToken);
    }

    private static async Task<bool> AwaitTaskBool(object? maybeTask, CancellationToken cancellationToken)
    {
        if (maybeTask is not Task task)
        {
            return false;
        }

        await task.WaitAsync(cancellationToken);
        var resultProperty = task.GetType().GetProperty("Result", BindingFlags.Instance | BindingFlags.Public);
        var resultValue = resultProperty?.GetValue(task);
        return resultValue is bool b && b;
    }

    private static async Task<object?> AwaitTaskResult(object? maybeTask, CancellationToken cancellationToken)
    {
        if (maybeTask is not Task task)
        {
            return null;
        }

        await task.WaitAsync(cancellationToken);
        var resultProperty = task.GetType().GetProperty("Result", BindingFlags.Instance | BindingFlags.Public);
        return resultProperty?.GetValue(task);
    }

    private static Dictionary<string, object?> ExtractTerminalRefs(object? result)
    {
        var refs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (result is null)
        {
            return refs;
        }

        var type = result.GetType();
        AddIfPresent(type, result, refs, "ReceiptNumber", "terminalSlipNo");
        AddIfPresent(type, result, refs, "TerminalReceiptNumber", "terminalSlipNo");
        AddIfPresent(type, result, refs, "Rrn", "rrn");
        AddIfPresent(type, result, refs, "TraceNumber", "traceNo");
        AddIfPresent(type, result, refs, "PaymentReference", "paymentReference");
        AddIfPresent(type, result, refs, "TransactionNumber", "transactionNumber");
        AddIfPresent(type, result, refs, "Aid", "aid");
        AddIfPresent(type, result, refs, "CardType", "cardType");
        AddIfPresent(type, result, refs, "CardName", "cardName");
        return refs;
    }

    private static void AddIfPresent(Type type, object instance, Dictionary<string, object?> refs, string propertyName, string outputName)
    {
        var property = type.GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public);
        if (property is null)
        {
            return;
        }

        var value = property.GetValue(instance);
        if (value is null)
        {
            return;
        }

        if (value is string s && string.IsNullOrWhiteSpace(s))
        {
            return;
        }

        refs[outputName] = value;
    }

    private static string? ExtractStatusHint(object? result)
    {
        if (result is null)
        {
            return null;
        }

        var type = result.GetType();
        foreach (var key in new[] { "Status", "ResultStatus", "PaymentStatus", "State" })
        {
            var property = type.GetProperty(key, BindingFlags.Instance | BindingFlags.Public);
            var value = property?.GetValue(result);
            if (value is null)
            {
                continue;
            }

            var raw = value.ToString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                return raw;
            }
        }

        return null;
    }

    private static string? ExtractMessageHint(object? result)
    {
        if (result is null)
        {
            return null;
        }

        var type = result.GetType();
        foreach (var key in new[] { "ErrorMessage", "Message", "Text" })
        {
            var property = type.GetProperty(key, BindingFlags.Instance | BindingFlags.Public);
            var value = property?.GetValue(result);
            if (value is null)
            {
                continue;
            }

            var raw = value.ToString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                return raw;
            }
        }

        return null;
    }

    private static string MapPaymentStatus(string? rawStatus)
    {
        if (string.IsNullOrWhiteSpace(rawStatus))
        {
            return "paid";
        }

        var normalized = rawStatus.Trim().ToLowerInvariant();
        if (normalized.Contains("cancel") || normalized.Contains("abort") || normalized.Contains("void"))
        {
            return "cancelled";
        }

        if (normalized.Contains("fail") || normalized.Contains("declin") || normalized.Contains("reject") || normalized.Contains("error"))
        {
            return "failed";
        }

        if (normalized.Contains("refund"))
        {
            return "refunded";
        }

        if (normalized.Contains("pending"))
        {
            return "payment_pending";
        }

        return "paid";
    }

    private sealed record ZvtContext(object Communication, object? Client, bool Connected);
    private sealed record PaymentInvokeResult(string? StatusHint, Dictionary<string, object?> TerminalRefs, string? Note);
}

public sealed record PaymentExecutionResult(bool Ok, string Status, string? Error, Dictionary<string, object?> TerminalRefs, string? Note)
{
    public static PaymentExecutionResult Success(string status, Dictionary<string, object?> terminalRefs, string? note)
        => new(true, status, null, terminalRefs, note);

    public static PaymentExecutionResult Failure(string error)
        => new(false, "failed", error, new Dictionary<string, object?>(), null);
}

public sealed record AbortExecutionResult(bool Ok, string? Error)
{
    public static AbortExecutionResult Success() => new(true, null);
    public static AbortExecutionResult Failure(string error) => new(false, error);
}
