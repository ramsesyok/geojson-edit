import { useEffect, useRef, useState } from 'react';
import { MapController } from './map/MapController';
import type { Tool } from './map/MapController';
import { Toolbar } from './Toolbar';
import { vscode } from './vscodeApi';
import type { HostToWebview } from './vscodeApi';

export function App({ pmtilesUri }: { pmtilesUri: string }): JSX.Element {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [tool, setTool] = useState<Tool>('modify');
  const [editingCount, setEditingCount] = useState(0);

  // Create the map + controller once.
  useEffect(() => {
    const target = mapDivRef.current;
    if (!target) {
      return;
    }
    const controller = new MapController(target, pmtilesUri, setEditingCount);
    controllerRef.current = controller;

    const onMessage = (ev: MessageEvent): void => {
      const msg = ev.data as HostToWebview;
      if (msg.type === 'init' || msg.type === 'update') {
        controller.loadFromHost(msg.text);
      }
    };
    window.addEventListener('message', onMessage);

    // Tell the host we are ready to receive the initial document.
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', onMessage);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [pmtilesUri]);

  // Drive the active tool from React state.
  useEffect(() => {
    controllerRef.current?.setTool(tool);
  }, [tool]);

  return (
    <>
      <Toolbar tool={tool} onToolChange={setTool} />
      {tool === 'modify' && editingCount > 0 && (
        <div className="status-badge">✏️ 編集中 — 空白部分をクリックで解除</div>
      )}
      <div ref={mapDivRef} className="map" />
    </>
  );
}
