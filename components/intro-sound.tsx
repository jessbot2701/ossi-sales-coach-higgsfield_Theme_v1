"use client";

import { useEffect, useRef, useState } from "react";

const INTRO_SOUND_KEY = "ossi-intro-sound-played-v1";

type PlaybackState = "hidden" | "blocked" | "playing";

export function IntroSound() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const attemptedRef = useRef(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("hidden");

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    try {
      if (window.sessionStorage.getItem(INTRO_SOUND_KEY)) return;
    } catch {
      // Playback still works when session storage is unavailable.
    }

    const frame = window.requestAnimationFrame(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = 0.58;
      void audio.play()
        .then(() => {
          rememberPlayback();
          setPlaybackState("playing");
        })
        .catch(() => setPlaybackState("blocked"));
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function rememberPlayback() {
    try {
      window.sessionStorage.setItem(INTRO_SOUND_KEY, "true");
    } catch {
      // The sound may replay in a later navigation when storage is unavailable.
    }
  }

  async function startPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 0.58;
    try {
      await audio.play();
      rememberPlayback();
      setPlaybackState("playing");
    } catch {
      setPlaybackState("blocked");
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    rememberPlayback();
    setPlaybackState("hidden");
  }

  return (
    <>
      <audio
        ref={audioRef}
        src="/assets/ossi-intro.mp3"
        preload="none"
        onEnded={() => setPlaybackState("hidden")}
      />
      {playbackState === "blocked" && (
        <button className="intro-sound-control" type="button" onClick={startPlayback}>
          <span aria-hidden="true">▶</span>
          Intro-Ton starten
        </button>
      )}
      {playbackState === "playing" && (
        <button className="intro-sound-control is-playing" type="button" onClick={stopPlayback}>
          <span className="intro-sound-level" aria-hidden="true"><i /><i /><i /></span>
          Intro stoppen
        </button>
      )}
    </>
  );
}
