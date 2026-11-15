import { useCallback, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useEditorShortcuts } from "../shortcuts/useEditorShortcuts";
import { Header } from "./Header";
import { MediaPanel } from "./MediaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { InspectorPanel } from "./InspectorPanel";
import { RecordDialog } from "./RecordDialog";
import { TimelinePanel } from "./TimelinePanel";
import "./AppShell.css";

export function AppShell() {
  const timelineHostRef = useRef<HTMLDivElement>(null);

  const getTimelineWidth = useCallback(() => {
    return timelineHostRef.current?.clientWidth ?? 800;
  }, []);

  useEditorShortcuts(getTimelineWidth);

  return (
    <div className="app-shell">
      <Header />
      <RecordDialog />
      <div className="app-shell__body">
        <PanelGroup direction="vertical" autoSaveId="indiecut-v-shell-v2">
          <Panel defaultSize={62} minSize={35}>
            <PanelGroup direction="horizontal" autoSaveId="indiecut-h-shell-v2">
              <Panel defaultSize={26} minSize={20}>
                <div className="app-shell__panel">
                  <MediaPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="app-shell__handle app-shell__handle--vertical" />
              <Panel defaultSize={50} minSize={30}>
                <div className="app-shell__panel">
                  <PreviewPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="app-shell__handle app-shell__handle--vertical" />
              <Panel defaultSize={28} minSize={18}>
                <div className="app-shell__panel">
                  <InspectorPanel />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="app-shell__handle app-shell__handle--horizontal" />
          <Panel defaultSize={38} minSize={22}>
            <div className="app-shell__panel" ref={timelineHostRef}>
              <TimelinePanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
