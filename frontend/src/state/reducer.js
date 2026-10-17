// The single reducer for incident data. Live SSE and replay both feed it the
// same two messages: `incident` (replace the snapshot) and `event` (append to
// the timeline, deduplicated by id).

export const initialState = { incident: null, events: [], eventIds: new Set() }

export function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialState

    case 'incident': {
      const incident = action.incident ?? null
      if (!incident) return initialState
      if (state.incident && state.incident.id !== incident.id) {
        return { incident, events: [], eventIds: new Set() }
      }
      return { ...state, incident }
    }

    case 'event': {
      const event = action.event
      if (!event?.id || state.eventIds.has(event.id)) return state
      if (state.incident && event.incidentId && event.incidentId !== state.incident.id) return state
      const eventIds = new Set(state.eventIds)
      eventIds.add(event.id)
      return { ...state, events: [...state.events, event], eventIds }
    }

    case 'load':
      return action.state ?? initialState

    case 'batch':
      return action.actions.reduce(reducer, state)

    default:
      return state
  }
}

/** A recording line ({kind, at, data}) as a reducer action. */
export function frameToAction(frame) {
  return frame.kind === 'incident' ? { type: 'incident', incident: frame.data } : { type: 'event', event: frame.data }
}
