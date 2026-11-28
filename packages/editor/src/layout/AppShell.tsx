import { useCallback, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { ChatPanel } from "../ai/chat/ChatPanel";
import { isCloudAiAvailable } from "../ai/isCloudAiAvailable";
import {
  CHAT_DEFAULT_WIDTH_PERCENT,
  CHAT_MAX_WIDTH_PERCENT,
  CHAT_MIN_WIDTH_PERCENT,
  getChatUiPrefs,
  saveChatUiPrefs,
} from "../prefs/appPrefs";
import { useEditorShortcuts } from "../shortcuts/useEditorShortcuts";
import { useEditorStore } from "../store/editorStore";
import { Header } from "./Header";
import { MediaPanel } from "./MediaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { InspectorPanel } from "./InspectorPanel";
import { RecordDialog } from "./RecordDialog";
import { TimelinePanel } from "./TimelinePanel";
import "./AppShell.css";

export function AppShell() {
  const timelineHostRef = useRef<HTMLDivElement>(null);
  const chatOpen = useEditorStore((s) => s.chatOpen);
  const cloudAi = isCloudAiAvailable();
  const showChat = cloudAi && chatOpen;
  const chatWidth = getChatUiPrefs().widthPercent || CHAT_DEFAULT_WIDTH_PERCENT;

  const getTimelineWidth = useCallback(() => {
    return timelineHostRef.current?.clientWidth ?? 800;
  }, []);

  useEditorShortcuts(getTimelineWidth);

  const editorMain = (
    <div className="app-shell__main">
      <PanelGroup direction="vertical" autoSaveId="indiecut-v-shell-v2">
        <Panel defaultSize={62} minSize={35}>
          <PanelGroup
            direction="horizontal"
            autoSaveId="indiecut-h-shell-v3"
          >
            <Panel defaultSize={26} minSize={16}>
              <div className="app-shell__panel">
                <MediaPanel />
              </div>
            </Panel>
            <PanelResizeHandle className="app-shell__handle app-shell__handle--vertical" />
            <Panel defaultSize={50} minSize={24}>
              <div className="app-shell__panel">
                <PreviewPanel />
              </div>
            </Panel>
            <PanelResizeHandle className="app-shell__handle app-shell__handle--vertical" />
            <Panel defaultSize={24} minSize={14}>
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
  );

  return (
    <div className="app-shell">
      <Header />
      <RecordDialog />
      <div className="app-shell__body">
        {showChat ? (
          <PanelGroup direction="horizontal">
            <Panel
              id="editor-main"
              order={1}
              defaultSize={100 - chatWidth}
              minSize={45}
            >
              {editorMain}
            </Panel>
            <PanelResizeHandle className="app-shell__handle app-shell__handle--vertical" />
            <Panel
              id="editor-chat"
              order={2}
              defaultSize={chatWidth}
              minSize={CHAT_MIN_WIDTH_PERCENT}
              maxSize={CHAT_MAX_WIDTH_PERCENT}
              onResize={(size) => {
                if (size < CHAT_MIN_WIDTH_PERCENT) return;
                void saveChatUiPrefs({ widthPercent: size });
              }}
            >
              <aside className="app-shell__chat" aria-label="Chat">
                <ChatPanel />
              </aside>
            </Panel>
          </PanelGroup>
        ) : (
          editorMain
        )}
      </div>
    </div>
  );
}
