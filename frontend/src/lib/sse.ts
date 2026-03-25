export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (type: string, data: string) => void | 'stop',
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const raw of events) {
      if (!raw.trim()) continue
      const lines = raw.split('\n')
      let eventType = ''
      let eventData = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7)
        else if (line.startsWith('data: ')) eventData = line.slice(6)
      }
      if (onEvent(eventType, eventData) === 'stop') return
    }
  }
}
