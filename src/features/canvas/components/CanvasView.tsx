"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { 
  ReactFlow, Background, Controls, Panel, 
  useNodesState, useEdgesState, type Node, type Edge 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ElkLayoutStrategy } from '../strategies/LayoutStrategy';
import { organizeService } from '@/services/organize';
import { MarkdownPane } from '@/features/nodeMarkdown/components/MarkdownPane';
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup as PrimitiveGroup 
} from "@/components/ui/resizable";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Share2, Wand2, ChevronLeft } from 'lucide-react';

// unknown を使用した型安全なアサーション
const ResizablePanelGroup = PrimitiveGroup as unknown as React.FC<any>;

interface CanvasViewProps {
  canvasId: string;
  onBack: () => void;
}

export const CanvasView: React.FC<CanvasViewProps> = ({ canvasId, onBack }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedContent, setSelectedContent] = useState<string>("ノードを選択してください");
  
  const layoutStrategy = new ElkLayoutStrategy();

  useEffect(() => {
    const unsubscribe = organizeService.subscribeTree(canvasId, async (data) => {
      const layoutedNodes = await layoutStrategy.execute(data.nodes, data.edges);
      setNodes(layoutedNodes);
      setEdges(data.edges);
      
      if (layoutedNodes.length > 0) {
        const firstContent = (layoutedNodes[0].data as any)?.contentMarkdown;
        if (firstContent) setSelectedContent(firstContent);
      }
    });
    return () => unsubscribe();
  }, [canvasId, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const content = (node.data as any)?.contentMarkdown;
    if (typeof content === 'string') {
      setSelectedContent(content);
    }
  }, []);

  const handleRelayout = async () => {
    const layoutedNodes = await layoutStrategy.execute(nodes, edges);
    setNodes(layoutedNodes);
    toast.success("レイアウトを整列しました");
  };

  return (
    <div className="w-full h-full overflow-hidden bg-white">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="w-full h-full relative"> 
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
            >
              <Background />
              <Controls />
              <Panel position="top-left">
                <Button onClick={onBack} variant="secondary" size="sm" className="shadow-md bg-white">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
              </Panel>
              <Panel position="top-right" className="flex flex-col gap-2 bg-white/90 p-3 rounded-lg border shadow-sm">
                <div className="text-[10px] text-slate-400 font-mono text-right">ID: {canvasId}</div>
                <div className="flex gap-2">
                  <Button onClick={handleRelayout} size="sm" variant="outline" className="h-8">
                    <Wand2 className="w-3 h-3 mr-2" /> 整列
                  </Button>
                  <Button onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("URLをコピーしました");
                  }} size="sm" variant="default" className="h-8">
                    <Share2 className="w-3 h-3 mr-2" /> 共有
                  </Button>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={20} className="bg-slate-50 border-l">
          <div className="w-full h-full flex flex-col">
            <div className="p-3 border-b bg-white text-xs font-bold text-slate-500">DETAILS</div>
            <div className="flex-1 overflow-hidden">
              <MarkdownPane content={selectedContent} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};