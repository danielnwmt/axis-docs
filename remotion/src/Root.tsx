import { Composition } from "remotion";
import { NetworkBackground } from "./NetworkBackground";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={NetworkBackground}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
  />
);
