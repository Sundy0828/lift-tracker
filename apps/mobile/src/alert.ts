import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';
import chimeSound from '../assets/chime.wav';
import { REST_VIBRATION } from './platform';

/**
 * The in-app end-of-rest alert: a vibration and an optional chime.
 *
 * This is the case the notification does not cover. With the app open the OS
 * banner is switched off (see ./platform), and the phone is far more often
 * face-up on a bench than in a pocket, so the session screen raises its own
 * alert and repeats it until the rest is dealt with.
 *
 * Everything degrades to nothing: a refused vibration or an audio session the
 * OS will not start costs the alert, never the countdown.
 */

export function buzz(): void {
  try {
    Vibration.vibrate(REST_VIBRATION);
  } catch {
    // No vibration motor, or the OS refused it.
  }
}

let player: AudioPlayer | null = null;

/**
 * Two short tones (assets/chime.wav, made by scripts/make-chime.mjs).
 *
 * Mixed with whatever is playing rather than pausing it: the gym playlist
 * matters more than half a second of chime. The ring/silent switch mutes it,
 * as the user would expect; the vibration still gets through.
 */
export function chime(): void {
  try {
    if (player === null) {
      void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
      player = createAudioPlayer(chimeSound);
    }
    void player.seekTo(0);
    player.play();
  } catch {
    // An audio session the OS will not start costs the tone only.
  }
}
