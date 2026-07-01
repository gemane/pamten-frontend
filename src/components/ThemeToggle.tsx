import { FiSun, FiMoon } from 'react-icons/fi'
import type { Theme } from '../hooks/useTheme'

interface Props {
  theme: Theme
  onToggle: () => void
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <FiSun /> : <FiMoon />}
    </button>
  )
}
