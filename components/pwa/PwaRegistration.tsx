"use client";

import { useEffect, useState } from "react";

export function PwaRegistration() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let disposed = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onMessage = (event: MessageEvent) => {
      if (hadController && event.data?.type === "SCAMSHIELD_UPDATE_READY") {
        setUpdateReady(true);
      }
    };
    const onControllerChange = () => {
      if (hadController && !disposed) setUpdateReady(true);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    void navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then(
        (registration) => {
          if (disposed) return;
          void registration.update();
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(true);
              }
            });
          });
        },
        () => {
          // The app remains usable without installation support.
        },
      );

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  if (!updateReady) return null;
  return (
    <aside className="update-toast" role="status" aria-live="polite">
      <span>新版已準備完成。請在目前操作結束後重新載入。</span>
      <button type="button" onClick={() => window.location.reload()}>
        重新載入
      </button>
    </aside>
  );
}
