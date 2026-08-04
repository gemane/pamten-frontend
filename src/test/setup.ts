// Vitest global setup for component (render) tests.
// - jest-dom adds DOM matchers (toBeInTheDocument, toHaveTextContent, …)
// - React Testing Library's cleanup() unmounts between tests so trees don't leak.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '../i18n'   // initialise real translations so render tests assert on actual UI text

afterEach(() => {
  cleanup()
})

// jsdom has no matchMedia; several hooks (useMobile, useTheme) rely on it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList
}
