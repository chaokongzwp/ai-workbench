import { AndroidWorkbenchShell } from "../platforms/android/AndroidWorkbenchShell.jsx";
import { IpadWorkbenchShell } from "../platforms/ipad/IpadWorkbenchShell.jsx";
import { IphoneWorkbenchShell } from "../platforms/iphone/IphoneWorkbenchShell.jsx";
import { MacWorkbenchShell } from "../platforms/mac/MacWorkbenchShell.jsx";
import { useWorkbenchController } from "./useWorkbenchController.jsx";

export function App() {
  const { nativeMobile, platform, nativeDeviceClass, shellProps } = useWorkbenchController();

  if (nativeMobile) {
    if (platform === "android") return <AndroidWorkbenchShell {...shellProps} />;
    if (nativeDeviceClass === "tablet") return <IpadWorkbenchShell {...shellProps} />;
    return <IphoneWorkbenchShell {...shellProps} />;
  }

  return <MacWorkbenchShell {...shellProps} />;
}
