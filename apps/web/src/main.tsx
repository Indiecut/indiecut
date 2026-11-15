import { mountEditor } from "@indiecut/editor";
import { setPlatform } from "@indiecut/platform";
import { createWebPlatform } from "./platform/createWebPlatform";

setPlatform(createWebPlatform());

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}
mountEditor(root);
