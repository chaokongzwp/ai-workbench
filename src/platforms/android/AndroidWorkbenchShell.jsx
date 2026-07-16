import { NativeWorkbenchShell } from "../native/NativeWorkbenchShell.jsx";

export function AndroidWorkbenchShell(props) {
  return <NativeWorkbenchShell {...props} nativeFormFactor="android" />;
}
