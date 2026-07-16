import { NativeWorkbenchShell } from "../native/NativeWorkbenchShell.jsx";

export function IpadWorkbenchShell(props) {
  return <NativeWorkbenchShell {...props} nativeFormFactor="ipad" />;
}
