import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Network, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { noteApi } from '../api/workspace'
import { useWorkspaceStore } from '../store/workspaceStore'
import type { GraphData } from '../types'
import Sidebar from '../components/layout/Sidebar'

export default function GraphPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const navigate = useNavigate()
  const { selectNote } = useWorkspaceStore()
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    fetchGraph()

    return () => {
      isMountedRef.current = false
      if (cyRef.current) {
        try { cyRef.current.destroy() } catch {}
        cyRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!graph) return

    if (cyRef.current) {
      try { cyRef.current.destroy() } catch {}
      cyRef.current = null
    }

    const timer = setTimeout(() => {
      if (isMountedRef.current && containerRef.current) {
        initCytoscape()
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      if (cyRef.current) {
        try { cyRef.current.destroy() } catch {}
        cyRef.current = null
      }
    }
  }, [graph])

  const fetchGraph = async () => {
    try {
      const res = await noteApi.getGraph()
      if (isMountedRef.current) {
        setGraph(res.data.data!)
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  const initCytoscape = async () => {
    if (!graph || !containerRef.current || !isMountedRef.current) return

    const cytoscape = (await import('cytoscape')).default

    if (!isMountedRef.current || !containerRef.current) return

    const elements = [
      ...graph.nodes.map(n => ({ data: { id: n.id, label: n.label } })),
      ...graph.edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target } })),
    ]

    try {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#6366f1',
              'background-opacity': 0.85,
              'border-color': '#818cf8',
              'border-width': 1.5,
              'label': 'data(label)',
              'color': '#f1f5f9',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'font-size': '10px',
              'font-family': 'DM Sans, sans-serif',
              'text-margin-y': 6,
              'width': 28,
              'height': 28,
              'overlay-opacity': 0,
            } as any,
          },
          {
            selector: 'node:hover',
            style: {
              'background-color': '#818cf8',
              'border-width': 2.5,
              'width': 36,
              'height': 36,
            } as any,
          },
          {
            selector: 'node:selected',
            style: {
              'background-color': '#4f46e5',
              'border-color': '#c7d2fe',
              'border-width': 3,
            } as any,
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'line-color': '#2d2d4e',
              'target-arrow-color': '#2d2d4e',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'opacity': 0.7,
            } as any,
          },
          {
            selector: 'edge:hover',
            style: {
              'line-color': '#6366f1',
              'target-arrow-color': '#6366f1',
              'opacity': 1,
            } as any,
          },
        ],
        layout: {
          name: 'cose',
          animate: true,
          animationDuration: 600,
          nodeRepulsion: () => 4500,
          idealEdgeLength: () => 100,
          gravity: 0.25,
          numIter: 500,
          randomize: true,
          fit: true,
          padding: 50,
          stop: () => {
            if (!isMountedRef.current && cyRef.current) {
              try { cyRef.current.destroy() } catch {}
              cyRef.current = null
            }
          },
        } as any,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        minZoom: 0.2,
        maxZoom: 3,
      })

      cyRef.current.on('tap', 'node', async (e: any) => {
        if (!isMountedRef.current) return
        const nodeId = e.target.data('id')
        await selectNote(nodeId)
        navigate('/')
      })
    } catch (err) {
      console.error('Cytoscape 초기화 오류:', err)
    }
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-border bg-surface">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="btn-ghost text-sm">
              <ArrowLeft className="w-4 h-4" /> 뒤로
            </button>
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-brand-400" />
              <h1 className="font-semibold font-display text-white text-sm">지식 그래프</h1>
            </div>
          </div>

          {graph && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 mr-2">
                노드 {graph.nodes.length}개 · 엣지 {graph.edges.length}개
              </span>
              <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} className="btn-ghost">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)} className="btn-ghost">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={() => cyRef.current?.fit()} className="btn-ghost">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                <p className="text-sm text-slate-400">그래프를 불러오는 중...</p>
              </div>
            </div>
          ) : graph && graph.nodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Network className="w-16 h-16 text-brand-400/20 mb-4" />
              <h2 className="text-lg font-semibold text-slate-400 font-display mb-2">그래프가 비어 있습니다</h2>
              <p className="text-sm text-slate-600">노트를 작성하고 연결하면 지식 우주가 펼쳐집니다</p>
            </div>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle, #2d2d4e 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                  opacity: 0.4,
                }}
              />
              <div ref={containerRef} className="absolute inset-0" />
            </>
          )}
        </div>
      </main>
    </div>
  )
}