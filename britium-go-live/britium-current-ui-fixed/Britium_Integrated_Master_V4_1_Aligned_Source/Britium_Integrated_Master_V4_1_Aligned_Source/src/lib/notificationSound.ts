const SOUND_STORAGE_KEY =
  "britium-notification-sound-enabled";

let audio: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio() {
  if (!audio) {
    audio = new Audio(
      "/sounds/notification.mp3",
    );

    audio.preload = "auto";
    audio.volume = 0.8;
  }

  return audio;
}

export function isNotificationSoundEnabled() {
  return (
    localStorage.getItem(SOUND_STORAGE_KEY) !==
    "false"
  );
}

export function setNotificationSoundEnabled(
  enabled: boolean,
) {
  localStorage.setItem(
    SOUND_STORAGE_KEY,
    String(enabled),
  );
}

export async function unlockNotificationSound() {
  if (!isNotificationSoundEnabled()) {
    return;
  }

  const sound = getAudio();

  try {
    sound.muted = true;
    await sound.play();
    sound.pause();
    sound.currentTime = 0;
    sound.muted = false;
    unlocked = true;
  } catch {
    sound.muted = false;
    unlocked = false;
  }
}

export async function playNotificationSound() {
  if (!isNotificationSoundEnabled()) {
    return;
  }

  if (!unlocked) {
    await unlockNotificationSound();
  }

  if (!unlocked) {
    return;
  }

  const sound = getAudio();

  try {
    sound.currentTime = 0;
    await sound.play();
  } catch (error) {
    unlocked = false;
    console.warn(
      "Notification sound was blocked:",
      error,
    );
  }
}