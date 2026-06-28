import { FiChevronRight } from 'react-icons/fi'
import type { NodeData } from '../types'

interface BreadcrumbProps {
  history: NodeData[]
  onNavigate: (node: NodeData, index: number) => void
}

export default function Breadcrumb({ history, onNavigate }: BreadcrumbProps) {
  if (history.length <= 1) return null
  return (
    <div className="breadcrumb">
      {history.map((node, i) => (
        <span key={`${node.id}-${i}`} className="breadcrumb__item">
          {i > 0 && <FiChevronRight className="breadcrumb__sep" />}
          {i < history.length - 1 ? (
            <button className="breadcrumb__btn" onClick={() => onNavigate(node, i)}>
              {node.label}
            </button>
          ) : (
            <span className="breadcrumb__current">{node.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}
