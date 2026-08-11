import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

/**
 * Make the Android back gesture navigate instead of quitting.
 *
 * Capacitor's native bridge does not touch the back button at all — there is no
 * `onBackPressed`, no `OnBackInvokedCallback` and no `KEYCODE_BACK` anywhere in
 * it. Without a listener on the web side the gesture falls through to Android's
 * default, which finishes the activity: one back press from anywhere in the app
 * closes it. Every navigation the app pushes — tabs, selected nodes, map
 * countries — becomes unreachable backwards.
 *
 * `canGoBack` reflects the webview's own history, which is exactly what the app
 * already drives through `history.pushState` and reads back through its popstate
 * handler. So going back here replays the same path the browser Back button takes,
 * rather than inventing a second navigation model that could disagree with it.
 *
 * Exiting when there is nowhere left to go is deliberate and is the Android
 * convention: back from the first screen leaves the app.
 *
 * No-op off-device, so the hook is safe to call unconditionally from App.
 */
export function useAndroidBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let remove: (() => void) | undefined
    let cancelled = false

    // addListener is async; if the component unmounts first, remove immediately
    // rather than leaking a listener that outlives it.
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else CapacitorApp.exitApp()
    }).then(handle => {
      if (cancelled) handle.remove()
      else remove = () => handle.remove()
    })

    return () => {
      cancelled = true
      remove?.()
    }
  }, [])
}

export default useAndroidBackButton
