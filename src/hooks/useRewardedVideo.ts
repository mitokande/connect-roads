// A button that offers a rewarded video: what it should say while the video is
// on its way, and whether the last try found nothing to show. The reward itself
// is the caller's — this only reports that it was earned.

import { useCallback, useEffect, useRef, useState } from "react";

import { prepareRewarded, showRewarded, type Placement } from "../ads";

export function useRewardedVideo(placement: Placement) {
  const [status, setStatus] = useState<"idle" | "busy" | "missed">("idle");
  const busy = useRef(false);
  const alive = useRef(true);

  // An offer on screen is a video likely to be wanted: have one ready.
  useEffect(() => {
    alive.current = true;
    prepareRewarded(placement);
    return () => {
      alive.current = false;
    };
  }, [placement]);

  const watch = useCallback(
    (onReward: () => void) => {
      if (busy.current) return;
      busy.current = true;
      setStatus("busy");
      showRewarded(placement)
        .catch(() => "unavailable" as const)
        .then((outcome) => {
          busy.current = false;
          if (outcome === "rewarded") onReward();
          if (alive.current) setStatus(outcome === "unavailable" ? "missed" : "idle");
        });
    },
    [placement],
  );

  return { busy: status === "busy", missed: status === "missed", watch };
}
