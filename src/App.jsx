import { useState, useRef, useCallback } from 'react'
import SearchBar from './components/SearchBar'
import Graph from './components/Graph'
import NodeCard from './components/NodeCard'
import { getFullProfile } from './api'
import { profileToElements } from './graphUtils'

export default function App() {
  const [elements, setElements] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const loadedIds = useRef(new Set())

  const handleSelectResult = useCallback(async (result) => {
    if (result.type !== 'Entity') return
    setError(null)
    setLoading(true)
    setSelectedNode(null)
    loadedIds.current = new Set()
    try {
      const profile = await getFullProfile(result.node.id)
      const { newElements } = profileToElements(profile, loadedIds.current)
      setElements(newElements)
    } catch (e) {
      setError('Failed to load entity. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleExpand = useCallback(async (entityId) => {
    setError(null)
    setLoading(true)
    setSelectedNode(null)
    try {
      const profile = await getFullProfile(entityId)
      const { newElements } = profileToElements(profile, loadedIds.current)
      if (newElements.length > 0) {
        setElements(prev => [...prev, ...newElements])
      }
    } catch (e) {
      setError('Failed to expand node.')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="app">
      <SearchBar onSelect={handleSelectResult} />
      {loading && <div className="loading-bar" />}
      {error && <div className="error-toast">{error}</div>}
      <Graph elements={elements} onNodeClick={setSelectedNode} />
      {selectedNode && (
        <NodeCard
          node={selectedNode}
          onExpand={handleExpand}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}
