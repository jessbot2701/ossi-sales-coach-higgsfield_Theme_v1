const OSSI_CUE_SOURCE = "/assets/ossi-login-spoken-v4.mp3";
const OSSI_CUE_TIMEOUT_MS = 12_000;

export function createOssiCue() {
  if (typeof Audio === "undefined") return null;

  const audio = new Audio(OSSI_CUE_SOURCE);
  audio.preload = "auto";
  audio.volume = 0.82;
  return audio;
}

export async function playOssiCue(preloadedCue?: HTMLAudioElement | null) {
  const audio = preloadedCue ?? createOssiCue();
  if (!audio) return false;

  try {
    audio.currentTime = 0;
    await audio.play();

    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, OSSI_CUE_TIMEOUT_MS);

      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
    });

    return true;
  } catch {
    return false;
  }
}
