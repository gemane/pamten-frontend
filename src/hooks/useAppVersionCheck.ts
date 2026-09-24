import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { API_BASE } from '../services/api'
import { NO_UPDATE, RECHECK_MS, shouldCheck, toUpdateState, type UpdateState } from '../utils/appVersionCheck'

/**
 * Asks the backend whether this installed app may keep running — at start and
 * whenever it returns to the foreground (at most hourly), because a phone app is
 * rarely restarted and can sit in the background for weeks.
 *
 * Calls the UNVERSIONED `/app-version`, not `/v1/app-version`: the day `/v1` is
 * retired, the apps that most need telling to upgrade are the ones still built
 * for it. A plain axios call, not the app's API client, so no token, refresh or
 * interceptor can get in the way of a check that must work signed out.
 *
 * Every failure is swallowed into "no update": this runs on devices we cannot
 * reach, and a check that errors must never be what stops the app.
 */
export function useAppVersionCheck(): UpdateState {
  const [state, setState] = useState<UpdateState>(NO_UPDATE)
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return
    lastCheck.current = Date.now()
    try {
      const platform = Capacitor.getPlatform()
      const { version } = await CapacitorApp.getInfo()
      if (!shouldCheck(platform, version)) return
      const url = `${API_BASE.replace(/\/+$/, '')}/app-version`
      const { data } = await axios.get(url, { params: { platform, version }, timeout: 10_000 })
      setState(toUpdateState(data))
    } catch {
      // fail open — keep whatever we knew
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    void check()
    let remove: (() => void) | undefined
    let cancelled = false
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && Date.now() - lastCheck.current >= RECHECK_MS) void check()
    }).then(handle => {
      if (cancelled) handle.remove()
      else remove = () => handle.remove()
    })
    return () => {
      cancelled = true
      remove?.()
    }
  }, [check])

  return state
}

export default useAppVersionCheck
