// ==UserScript==
// @name         Wayfarer Smooth Review
// @namespace    https://github.com/Trungx5/wayfarer-addons
// @version      1.0.0
// @description  Keeps Wayfarer's native next-review flow in the current page after a successful submission.
// @author       Trungx5
// @match        https://wayfarer.scopely.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    none
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window.self || window.__wfSmoothReview) return;
  window.__wfSmoothReview = true;
  const epochs = new WeakMap();
  let jsxRuntime = null, react = null, preparing = null, armed = null, revision = 0;
  const isReview = () => /^\/review\/?$/.test(location.pathname);
  const providerShape = value => value && typeof value.dispatch === 'function' &&
    value.state?.reviewData && value.state?.reviewResponse?.reviewResponseNew &&
    value.state?.reviewResponse?.reviewResponseEdit && value.state?.reviewCategories;

  // This compatibility adapter uses the site's already-loaded JSX runtime.
  // Only an identified Review provider's child receives a new React key.
  // React unmounts the old review (including its dialogs, timers and map), then
  // runs its own normal review loader, validation and error UI from scratch.
  // No React fiber/state is written and no rating or POST payload is changed.
  async function prepare() {
    if (jsxRuntime) return true;
    if (preparing) return preparing;
    const entry = [...document.scripts].find(script => script.type === 'module' &&
      script.src.startsWith(location.origin + '/js/react/assets/index-'));
    if (!entry) return false;
    preparing = (async () => {
      try {
        const exports = await import(entry.src);
        const runtime = Object.values(exports).find(value => value && typeof value.jsx === 'function' && typeof value.jsxs === 'function');
        const library = Object.values(exports).find(value => value && typeof value.cloneElement === 'function' && typeof value.isValidElement === 'function');
        if (!runtime || !library || !['jsx','jsxs'].every(name => Object.getOwnPropertyDescriptor(runtime,name)?.writable)) return false;
        for (const name of ['jsx','jsxs']) {
          const original = runtime[name];
          runtime[name] = function(type, props, key) {
            const value = props?.value;
            const epoch = value && typeof value.dispatch === 'function' ? epochs.get(value.dispatch) : undefined;
            if (epoch && providerShape(value) && library.isValidElement(props.children)) {
              props = {...props, children:library.cloneElement(props.children,{key:epoch})};
            }
            return original.call(this,type,props,key);
          };
        }
        react = library; jsxRuntime = runtime;
        return true;
      } catch (_) { return false; }
      finally { preparing = null; }
    })();
    return preparing;
  }

  function findReviewProvider(id) {
    const root = document.getElementById('root');
    if (!root) return null;
    const containerKey = Object.keys(root).find(key => key.startsWith('__reactContainer$'));
    const container = containerKey && root[containerKey];
    const current = container?.stateNode?.current;
    if (!current) return null;
    const stack = [current];
    for (let visited = 0; stack.length && visited < 3000; visited++) {
      const fiber = stack.pop();
      const props = fiber.memoizedProps;
      if (providerShape(props?.value) && String(props.value.state.reviewData.data?.id) === id &&
          react.isValidElement(props.children) && typeof props.children.type === 'function' &&
          Function.prototype.toString.call(props.children.type).includes('LOAD_REVIEW_DATA')) return props.value;
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return null;
  }

  const nativeGo = history.go;
  history.go = function(delta) {
    const ticket = armed;
    if (arguments.length === 1 && Number(delta) === 0 && isReview() && jsxRuntime &&
        ticket && performance.now() - ticket.time < 10000) {
      const provider = findReviewProvider(ticket.id);
      if (provider) {
        armed = null;
        epochs.set(provider.dispatch, 'wf-smooth-review-' + (++revision));
        provider.dispatch({type:'LOAD_REVIEW_DATA'});
        const scroll = document.querySelector('[data-testid="app-route-scroll"]');
        if (scroll) scroll.scrollTop = 0;
        console.info('[Wayfarer Smooth Review] Loading next review in this page.');
        return;
      }
    }
    // A manual refresh, history navigation, retry, unsupported future app build,
    // or unidentified review keeps Wayfarer's native behaviour.
    armed = null;
    return nativeGo.apply(this,arguments);
  };

  const nativeFetch = window.fetch;
  window.fetch = function(input, init) {
    let candidate = null;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url,location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (isReview() && method === 'POST' && url.origin === location.origin &&
          /^\/api\/v1\/vault\/review(?:\/skip)?$/.test(url.pathname) && typeof init?.body === 'string') {
        const body = JSON.parse(init.body);
        if (typeof body.id === 'string' && body.id) candidate = {id:body.id,skip:url.pathname.endsWith('/skip')};
        armed = null;
      }
    } catch (_) {}
    const result = nativeFetch.apply(this,arguments);
    if (!candidate) return result;
    return result.then(async response => {
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if ((!data.code || data.code === 'OK') && Object.prototype.hasOwnProperty.call(data,'result') &&
              (!candidate.skip || data.result)) armed = {id:candidate.id,time:performance.now()};
        } catch (_) {}
      }
      return response;
    });
  };

  function routeChanged() {
    armed = null;
    if (isReview()) void prepare();
  }
  window.addEventListener('popstate',routeChanged);
  window.navigation?.addEventListener('currententrychange',routeChanged);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',routeChanged,{once:true});
  else routeChanged();
})();
