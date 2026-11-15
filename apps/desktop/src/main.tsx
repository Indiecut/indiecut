import { mountEditor } from "@indiecut/editor";
import { installDesktopPlatform } from "./platform";

installDesktopPlatform();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}
mountEditor(root);
