// @ts-nocheck
import React, { useEffect, useRef } from "react";

export default function AutoLoopVideoBackground({
  src = "/background.mp4",
  overlay = "rgba(3, 12, 24, 0.72)",
}: any) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.defaultMuted = true;

    const play = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    play();

    const onVisibility = () => {
      if (!document.hidden) play();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: -2,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: overlay,
          zIndex: -1,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
