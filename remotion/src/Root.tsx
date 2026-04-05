import { Composition } from "remotion";
import { ScannerBanner } from "./ScannerBanner";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={ScannerBanner}
    durationInFrames={240}
    fps={30}
    width={1920}
    height={540}
  />
);
