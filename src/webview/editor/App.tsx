import { useEffect, useRef, useState } from 'react';
import type Feature from 'ol/Feature';
import { MapController } from './map/MapController';
import type { Tool } from './map/MapController';
import { Toolbar } from './Toolbar';
import { PropertyPanel } from './PropertyPanel';
import { vscode } from './vscodeApi';
import type { FieldDef, HostToWebview } from './vscodeApi';

export function App({ pmtilesUri }: { pmtilesUri: string }): JSX.Element {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [tool, setTool] = useState<Tool>('modify');
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);

  // Create the map + controller once.
  useEffect(() => {
    const target = mapDivRef.current;
    if (!target) {
      return;
    }
    const controller = new MapController(target, pmtilesUri, setSelectedFeature);
    controllerRef.current = controller;

    const onMessage = (ev: MessageEvent): void => {
      const msg = ev.data as HostToWebview;
      if (msg.type === 'init' || msg.type === 'update') {
        controller.loadFromHost(msg.text);
      } else if (msg.type === 'fields') {
        setFields(msg.fields);
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

  const editing = tool === 'modify' && selectedFeature !== null;

  return (
    <>
      <Toolbar tool={tool} onToolChange={setTool} />
      {editing && (
        <div className="status-badge">
          ✏️ 編集中 — Shift+ドラッグで移動 / Alt+クリックで頂点削除 / 空白クリックで解除
        </div>
      )}
      <div ref={mapDivRef} className="map" />
      {editing && selectedFeature && (
        <PropertyPanel
          feature={selectedFeature}
          fields={fields}
          onOpenSettings={() => vscode.postMessage({ type: 'openFieldSettings' })}
        />
      )}
    </>
  );
}
