export function createTimer(now = () => performance.now()) {
  let accumulated = 0
  let since = null

  return {
    start() {
      accumulated = 0
      since = now()
    },
    pause() {
      if (since === null) return
      accumulated += now() - since
      since = null
    },
    resume() {
      if (since !== null) return
      since = now()
    },
    running() {
      return since !== null
    },
    elapsed() {
      return accumulated + (since === null ? 0 : now() - since)
    },
  }
}
