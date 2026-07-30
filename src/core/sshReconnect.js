export const maxSshReconnectAttempts = 3;

const authenticationErrorPattern =
  /All configured authentication methods failed|Authentication failed|Permission denied|No supported authentication methods|Invalid credentials|用户名或密码|登录密码/i;

const reconnectableErrorPattern =
  /Timed out while waiting for handshake|Keepalive timeout|Connection lost before handshake|Handshake failed|Connection lost|Connection closed|NIOSSHError\.tcpShutdown|tcpShutdown|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EPIPE|Socket closed|No response from server|Client network socket disconnected|Connection refused|getaddrinfo|Network is unreachable|Host is unreachable|channel closed|unexpected EOF/i;

function errorText(error) {
  return String(error?.message || error || "");
}

export function isSshAuthenticationError(error) {
  return authenticationErrorPattern.test(errorText(error));
}

export function isRetryableSshConnectionError(error) {
  if (isSshAuthenticationError(error)) return false;
  if (error?.code === "AIWB_CLIENT_COMMAND_TIMEOUT") return false;
  return reconnectableErrorPattern.test(errorText(error));
}

export function sshReconnectDelayMs(attempt) {
  const delays = [500, 1_000, 1_800];
  const index = Math.max(0, Math.min(delays.length - 1, Number(attempt || 1) - 1));
  return delays[index];
}

export function createSshConnectionFailure(error, reconnectAttempts = maxSshReconnectAttempts) {
  const failure = new Error("连接异常");
  failure.name = "SshConnectionError";
  failure.code = "AIWB_SSH_CONNECTION_FAILED";
  failure.cause = error;
  failure.reconnectAttempts = reconnectAttempts;
  return failure;
}

export async function runWithSshReconnect(
  operation,
  {
    maxReconnectAttempts = maxSshReconnectAttempts,
    shouldRetry = isRetryableSshConnectionError,
    onRetry,
    onRecovered,
    onFailed,
    wait = (duration) => new Promise((resolve) => globalThis.setTimeout(resolve, duration)),
  } = {},
) {
  let reconnectAttempt = 0;

  while (true) {
    try {
      const result = await operation({
        reconnectAttempt,
        maxReconnectAttempts,
      });
      if (reconnectAttempt > 0) {
        await onRecovered?.({
          reconnectAttempt,
          maxReconnectAttempts,
        });
      }
      return result;
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      if (reconnectAttempt >= maxReconnectAttempts) {
        const failure = createSshConnectionFailure(error, reconnectAttempt);
        await onFailed?.({
          error,
          failure,
          reconnectAttempt,
          maxReconnectAttempts,
        });
        throw failure;
      }

      reconnectAttempt += 1;
      await onRetry?.({
        error,
        reconnectAttempt,
        maxReconnectAttempts,
      });
      await wait(sshReconnectDelayMs(reconnectAttempt));
    }
  }
}
