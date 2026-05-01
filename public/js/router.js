const routes = {};
let currentCleanup = null;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}

export function startRouter() {
  const handleRoute = async () => {
    const hash = window.location.hash.slice(1) || '/login';
    const [path, ...rest] = hash.split('/').filter(Boolean);
    const fullPath = `/${path}`;
    const params = rest;

    if (currentCleanup && typeof currentCleanup === 'function') {
      currentCleanup();
      currentCleanup = null;
    }

    const handler = routes[fullPath];
    if (handler) {
      const result = handler(params);
      if (result && typeof result.then === 'function') {
        currentCleanup = await result;
      } else {
        currentCleanup = result || null;
      }
    } else {
      navigate('/login');
    }
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
