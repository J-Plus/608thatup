let state = {
  user: null,
  loading: true,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updates) {
  state = { ...state, ...updates };
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
