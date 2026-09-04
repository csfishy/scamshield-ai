import "server-only";
import { AppError } from "./errors";
export function abortError(signal: AbortSignal): AppError {
  return signal.reason instanceof AppError
    ? signal.reason
    : new AppError("provider_unavailable", "cancelled");
}
export function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}
export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    // Always observe work, including when cancellation happened before registration.
    work.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export function deadline(parent: AbortSignal, ms: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(abortError(parent));
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new AppError("provider_unavailable", "timeout")),
    ms,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
}
