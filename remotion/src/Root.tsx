import { Composition } from "remotion";
import { ScanToCloud } from "./ScanToCloud";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={ScanToCloud}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
  />
);
