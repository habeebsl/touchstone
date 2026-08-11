import { useState } from "react";
import UndertoneApp from "./UndertoneApp";
import LipBlendSpike from "./spikes/LipBlendSpike";
import CameraCaptureSpike from "./spikes/CameraCaptureSpike";
import EndToEndSpike from "./spikes/EndToEndSpike";
import EngineLab from "./spikes/EngineLab";

const SPIKES = {
  "lip-blend": LipBlendSpike,
  "camera-capture": CameraCaptureSpike,
  "end-to-end": EndToEndSpike,
  "engine-lab": EngineLab,
} as const;

type SpikeKey = keyof typeof SPIKES;

/**
 * The real app is the default. The prebuild-validation spikes stay reachable behind ?spike=
 * so they can still be run in isolation, but they never render in the normal flow — mounting
 * two things that both grab the webcam or the Camera Kit singleton would conflict.
 */
function App() {
  const [spike] = useState(() => new URLSearchParams(window.location.search).get("spike"));

  if (spike && spike in SPIKES) {
    const Spike = SPIKES[spike as SpikeKey];
    return <Spike />;
  }

  return <UndertoneApp />;
}

export default App;
