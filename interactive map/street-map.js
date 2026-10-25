'use strict';

(() => {
  const el = id => document.getElementById(id);
  const probe = document.createElement('canvas');
  if (!window.maplibregl || !window.turf || !(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    el('map-error').textContent = 'Route map unavailable. Check your internet connection and WebGL support, then reload. The 200-meter corridor requires the map and geometry libraries. Route details and fare planning remain available.';
    el('stop-list').textContent = 'Stop previews unavailable until the map library loads.';
    for (const id of ['fit-street', 'follow-bus', 'bus-pov', 'my-location', 'street-3d', 'street-2d']) el(id).disabled = true;
    return;
  }
  // Town-center areas only: neither exact boarding points nor verified operator stops.
  const places = {
    cubao: [14.625, 121.048], gracepark: [14.657, 120.988], pitx: [14.509, 120.991],
    divisoria: [14.605, 120.972], baliwag: [14.955, 120.900], hagonoy: [14.835, 120.733],
    cabanatuan: [15.486, 120.974], sanjose: [15.790, 120.990],
    guiguinto: [14.834, 120.883], plaridel: [14.887, 120.857], pulilan: [14.901, 120.849],
    malolos: [14.843, 120.811], sanmiguel: [15.145, 120.978],
    gapan: [15.307, 120.946], santarosa: [15.424, 120.938], talavera: [15.584, 120.920],
    munoz: [15.714, 120.904]
  };
  const names = { guiguinto: 'Guiguinto', plaridel: 'Plaridel', pulilan: 'Pulilan', malolos: 'Malolos', sanmiguel: 'San Miguel', gapan: 'Gapan', santarosa: 'Santa Rosa', talavera: 'Talavera', munoz: 'Science City of Muñoz' };
  const corridors = {
    'c-b': ['cubao', 'guiguinto', 'plaridel', 'pulilan', 'baliwag'],
    'c-c': ['cubao', 'guiguinto', 'baliwag', 'sanmiguel', 'gapan', 'santarosa', 'cabanatuan'],
    'c-s': ['cubao', 'guiguinto', 'baliwag', 'sanmiguel', 'gapan', 'santarosa', 'cabanatuan', 'talavera', 'munoz', 'sanjose'],
    'c-h': ['cubao', 'guiguinto', 'malolos', 'hagonoy'],
    'g-b': ['gracepark', 'guiguinto', 'plaridel', 'pulilan', 'baliwag'],
    'g-c': ['gracepark', 'guiguinto', 'baliwag', 'sanmiguel', 'gapan', 'santarosa', 'cabanatuan'],
    'g-s': ['gracepark', 'guiguinto', 'baliwag', 'sanmiguel', 'gapan', 'santarosa', 'cabanatuan', 'talavera', 'munoz', 'sanjose'],
    'p-s': ['pitx', 'gracepark', 'guiguinto', 'baliwag', 'sanmiguel', 'gapan', 'santarosa', 'cabanatuan', 'talavera', 'munoz', 'sanjose'],
    'b-c': ['baliwag', 'pulilan', 'plaridel', 'guiguinto', 'cubao'],
    'b-g': ['baliwag', 'pulilan', 'plaridel', 'guiguinto', 'gracepark'],
    'b-d': ['baliwag', 'pulilan', 'plaridel', 'guiguinto', 'divisoria']
  };
  const map = new maplibregl.Map({
    container: 'street-map', center: [120.95, 15.05], zoom: 9, pitch: 55, bearing: -15, maxPitch: 70,
    style: 'https://tiles.openfreemap.org/styles/positron'
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.on('error', event => {
    console.error('3D map error:', event.error);
    el('map-error').textContent = 'Some 3D map assets could not load. Check your connection and WebGL support, then reload.';
  });
  const emptyGeometry = () => ({ type: 'FeatureCollection', features: [] });
  const world = turf.polygon([[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]);
  const solidBus = createBusLayer();
  let mapFailure = null;
  const ready = new Promise(resolve => {
    let settled = false;
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      mapFailure = error;
      console.error('Map initialization failed:', error);
      el('map-error').textContent = `Map unavailable: ${error.message} Reload to retry.`;
      el('street-map').classList.remove('map-ready');
      for (const id of ['fit-street', 'follow-bus', 'bus-pov', 'my-location', 'street-3d', 'street-2d']) el(id).disabled = true;
      stopLocation('Location stopped because the map could not initialize.');
      resolve(false);
    }
    const timer = setTimeout(() => fail(new Error('Map loading exceeded 20 seconds.')), 20000);
    map.on('style.load', () => {
      if (settled) return;
      try {
    map.addSource('corridor-mask', { type: 'geojson', data: world });
    map.addLayer({ id: 'corridor-mask', type: 'fill', source: 'corridor-mask', paint: { 'fill-color': '#e9eee6', 'fill-opacity': 1, 'fill-antialias': false } });
    map.addSource('road', { type: 'geojson', data: emptyGeometry() });
    map.addLayer({ id: 'road-outline', type: 'line', source: 'road', paint: { 'line-color': '#fff', 'line-width': 9 } });
    map.addLayer({ id: 'road-route', type: 'line', source: 'road', paint: { 'line-color': '#176b50', 'line-width': 4 } });
    map.addLayer(solidBus);
    map.addSource('user-accuracy', { type: 'geojson', data: emptyGeometry() });
    map.addLayer({ id: 'user-accuracy-fill', type: 'fill', source: 'user-accuracy', paint: { 'fill-color': '#287ce5', 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'user-accuracy-outline', type: 'line', source: 'user-accuracy', paint: { 'line-color': '#287ce5', 'line-width': 1 } });
    el('street-map').classList.add('map-ready');
        settled = true;
        clearTimeout(timer);
        resolve(true);
      } catch (error) {
        fail(error);
      }
    });
  });
  const lngLat = point => [point[1], point[0]];
  const formatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  let route = null;
  let stops = [];
  let markers = [];
  let fractions = [];
  let bus = null;
  let bounds = null;
  let follow = false;
  let pov = false;
  let busPosition = null;
  let busBearing = 0;
  let progress = 0;
  let lastFollow = 0;
  let rows = [];
  let controller = null;
  let requestId = 0;
  let roadPoints = [];
  let roadLengths = [];
  let roadDistance = 0;
  const routeCache = new Map();
  const title = id => terminals[id]?.name || names[id];

  function fit() {
    if (bounds) map.fitBounds(bounds, { padding: { top: 70, left: 45, bottom: 60, right: 55 }, maxZoom: 12, duration: 0, pitch: map.getPitch(), bearing: map.getBearing() });
  }
  function arrival(fraction) {
    const input = el('departure-time');
    if (!input.value || !input.validity.valid) return 'Set departure time';
    const start = new Date(`${input.value}+08:00`).getTime();
    if (!Number.isFinite(start)) return 'Set departure time';
    const [min, max] = route.time.split('–').map(Number);
    const time = hours => formatter.format(new Date(start + hours * fraction * 3600000));
    return fraction === 0 ? time(0) : `${time(min)} – ${time(max)}`;
  }
  function renderStops() {
    if (!route || !roadPoints.length) {
      el('stop-list').textContent = route ? 'Road route not ready. Stop distances will appear after routing succeeds.' : 'Choose a route to explore candidate stops.';
      rows = [];
      el('follow-bus').disabled = true;
      el('fit-street').disabled = true;
      return;
    }
    el('stop-list').innerHTML = stops.map((id, index) => {
      const endpoint = index === 0 || index === stops.length - 1;
      return `<li class="stop-row ${endpoint ? 'terminal' : ''}" data-fraction="${fractions[index]}"><button data-stop="${index}" aria-label="Show ${title(id)} area on map"><span><strong>${index + 1}. ${title(id)}</strong><small>${endpoint ? 'Terminal area · approximate pin' : 'Candidate stop area · not verified'}${index === 0 ? ' · Depart' : index === stops.length - 1 ? ' · Arrive' : ''}</small></span><span class="stop-timing">~${Math.round(roadDistance * fractions[index] / 1000)} road km from origin<small>${arrival(fractions[index])}</small></span></button></li>`;
    }).join('');
    rows = [...el('stop-list').children];
    updateBus();
  }
  async function draw(next) {
    const currentRequest = ++requestId;
    if (controller) controller.abort();
    controller = new AbortController();
    const changed = route?.id !== next?.id;
    route = next;
    document.dispatchEvent(new CustomEvent('roaddistance', { detail: { routeId: route?.id, distance: null } }));
    for (const marker of markers) marker.remove();
    if (bus) bus.remove();
    solidBus.setPosition(null, 0);
    if (map.getSource('road')) map.getSource('road').setData(emptyGeometry());
    if (map.getSource('corridor-mask')) map.getSource('corridor-mask').setData(world);
    bus = null;
    markers = [];
    bounds = null;
    roadPoints = [];
    roadLengths = [];
    busPosition = null;
    el('bus-pov').disabled = true;
    rows = [];
    el('routing-error').textContent = '';
    el('follow-bus').disabled = true;
    el('fit-street').disabled = true;
    stops = route ? corridors[route.id] : [];
    if (!route) {
      setPov(false);
      el('street-title').textContent = 'Choose a route to explore';
      el('road-summary').textContent = 'No route selected';
      renderStops();
      return;
    }
    if (mapFailure) {
      el('road-summary').textContent = 'Map unavailable';
      renderStops();
      return;
    }
    if (changed) progress = 0;
    el('street-title').textContent = `${title(route.from)} → ${title(route.to)}`;
    el('road-summary').textContent = 'Finding a driving route on mapped roads…';
    el('stop-list').textContent = 'Loading road route and stop distances…';
    el('routing-error').textContent = '';
    el('follow-bus').disabled = true;
    el('fit-street').disabled = true;
    let data;
    const currentController = controller;
    const timeout = setTimeout(() => currentController.abort(), 20000);
    try {
      data = routeCache.get(route.id);
      if (!data) {
        const waypoints = stops.map(id => `${places[id][1]},${places[id][0]}`).join(';');
        const response = await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=false`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}`);
        data = await response.json();
        const result = data.routes?.[0];
        if (data.code !== 'Ok' || !result || !Number.isFinite(result.distance) || result.distance <= 0 || !Array.isArray(result.geometry?.coordinates) || result.geometry.coordinates.length < 2 || !result.geometry.coordinates.every(point => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)) || result.legs?.length !== stops.length - 1 || !result.legs.every(leg => Number.isFinite(leg.distance) && leg.distance >= 0) || data.waypoints?.length !== stops.length || !data.waypoints.every(point => Array.isArray(point.location) && point.location.length === 2 && point.location.every(Number.isFinite))) {
          throw new Error('Routing service returned an invalid or missing road route');
        }
        routeCache.set(route.id, data);
      }
    } catch (error) {
      if (currentRequest !== requestId) return;
      console.error('Road routing failed:', error);
      el('routing-error').textContent = `Road routing failed: ${error.name === 'AbortError' ? 'request timed out' : error.message}. No straight-line substitute or bus position is shown. Select the route again to retry.`;
      el('road-summary').textContent = 'Road route unavailable';
      renderStops();
      return;
    } finally {
      clearTimeout(timeout);
    }
    if (currentRequest !== requestId) return;
    const mapReady = await ready;
    if (currentRequest !== requestId) return;
    if (!mapReady) {
      el('road-summary').textContent = 'Map unavailable';
      renderStops();
      return;
    }
    const result = data.routes[0];
    let mask;
    try {
      const corridor = turf.buffer(turf.feature(result.geometry), 200, { units: 'meters', steps: 16 });
      if (!corridor) throw new Error('Could not create the 200-meter route corridor');
      mask = turf.difference(turf.featureCollection([world, corridor]));
      if (!mask) throw new Error('Could not create the outside-route mask');
    } catch (error) {
      console.error('Route corridor masking failed:', error);
      el('routing-error').textContent = `Route corridor could not be displayed: ${error.message}. Map imagery stays hidden. Select the route again to retry.`;
      renderStops();
      return;
    }
    map.getSource('corridor-mask').setData(mask);
    roadDistance = result.distance;
    roadPoints = result.geometry.coordinates.map(point => new maplibregl.LngLat(point[0], point[1]));
    roadLengths = [0];
    for (let i = 1; i < roadPoints.length; i++) roadLengths.push(roadLengths[i - 1] + roadPoints[i - 1].distanceTo(roadPoints[i]));
    const distances = [0];
    for (const leg of result.legs) distances.push(distances[distances.length - 1] + leg.distance);
    fractions = distances.map(distance => distance / distances[distances.length - 1]);
    el('road-summary').textContent = `${(roadDistance / 1000).toFixed(1)} km by mapped roads · Driving route, not operator-verified`;
    el('follow-bus').disabled = false;
    el('bus-pov').disabled = false;
    el('fit-street').disabled = false;
    map.getSource('road').setData({ type: 'Feature', properties: {}, geometry: result.geometry });
    bounds = roadPoints.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(roadPoints[0], roadPoints[0]));
    markers = stops.map((id, index) => {
      const endpoint = index === 0 || index === stops.length - 1;
      const snapped = data.waypoints[index].location;
      const pin = document.createElement('button');
      pin.className = endpoint ? 'terminal-pin' : 'candidate-pin';
      pin.textContent = endpoint ? 'T' : String(index + 1);
      pin.setAttribute('aria-label', `${title(id)} · ${endpoint ? 'approximate terminal area' : 'unverified candidate stop'}`);
      const popup = new maplibregl.Popup({ offset: 16 }).setHTML(`<strong>${title(id)}</strong><br>${endpoint ? 'Approximate terminal area' : 'Unverified candidate stop area'}<br><small>Pin snapped to a mapped road, not a confirmed boarding point. Confirm service with the operator.</small><br>~${Math.round(roadDistance * fractions[index] / 1000)} road km from origin`);
      const marker = new maplibregl.Marker({ element: pin }).setLngLat(snapped).setPopup(popup).addTo(map);
      return marker;
    });
    const busElement = document.createElement('div');
    busElement.className = 'street-bus-icon';
    busElement.title = 'Solid 3D bus · simulated position';
    busElement.setAttribute('aria-label', 'Simulated bus, not a GPS position');
    bus = new maplibregl.Marker({ element: busElement, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat(roadPoints[0]).addTo(map);
    bus.setPopup(new maplibregl.Popup().setText('Simulated bus on a driving route, not a real GPS position or verified operator itinerary.'));
    renderStops();
    document.dispatchEvent(new CustomEvent('roaddistance', { detail: { routeId: route.id, distance: roadDistance } }));
    if (changed && !pov) fit();
  }
  function updateBus() {
    if (!route || !bus) return;
    const target = roadLengths[roadLengths.length - 1] * progress;
    let low = 1, high = roadLengths.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (roadLengths[middle] < target) low = middle + 1;
      else high = middle;
    }
    const span = roadLengths[low] - roadLengths[low - 1];
    const local = span > 0 ? (target - roadLengths[low - 1]) / span : 0;
    const a = roadPoints[low - 1], b = roadPoints[low];
    const position = [a.lat + (b.lat - a.lat) * local, a.lng + (b.lng - a.lng) * local];
    bus.setLngLat(lngLat(position));
    const angle = Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI;
    busPosition = lngLat(position);
    busBearing = (angle + 360) % 360;
    bus.setRotation(angle - 90);
    solidBus.setPosition(lngLat(position), 90 - angle);
    for (const row of rows) row.classList.toggle('passed', progress >= Number(row.dataset.fraction));
    if ((follow || pov) && performance.now() - lastFollow > 100) {
      if (pov) map.jumpTo({ center: busPosition, bearing: busBearing, pitch: 70, zoom: 17 });
      else map.jumpTo({ center: busPosition });
      lastFollow = performance.now();
    }
  }
  document.addEventListener('routechange', event => draw(event.detail));
  document.addEventListener('tripprogress', event => {
    // The simulation resets before routechange is dispatched to this renderer.
    if (route?.id !== event.detail.route?.id) return;
    progress = event.detail.progress;
    updateBus();
  });
  el('departure-time').addEventListener('input', renderStops);
  el('stop-list').addEventListener('click', event => {
    const button = event.target.closest('[data-stop]');
    if (!button) return;
    const marker = markers[Number(button.dataset.stop)];
    follow = false;
    setPov(false);
    el('follow-bus').setAttribute('aria-pressed', 'false');
    map.easeTo({ center: marker.getLngLat(), zoom: 13 });
    marker.togglePopup();
  });
  el('fit-street').addEventListener('click', () => {
    follow = false;
    setPov(false);
    el('follow-bus').setAttribute('aria-pressed', 'false');
    fit();
  });
  el('follow-bus').addEventListener('click', () => {
    setPov(false);
    follow = !follow;
    el('follow-bus').setAttribute('aria-pressed', String(follow));
    if (follow && bus) map.easeTo({ center: bus.getLngLat(), zoom: 12 });
  });
  map.on('dragstart', () => {
    follow = false;
    setPov(false);
    el('follow-bus').setAttribute('aria-pressed', 'false');
  });
  for (const mode of ['3d', '2d']) {
    el(`street-${mode}`).addEventListener('click', () => {
      setPov(false);
      map.easeTo({ pitch: mode === '3d' ? 55 : 0, bearing: mode === '3d' ? -15 : 0, duration: 600 });
    });
  }
  function setPov(enabled) {
    pov = enabled;
    el('bus-pov').setAttribute('aria-pressed', String(enabled));
    el('pov-status').hidden = !enabled;
  }
  el('bus-pov').addEventListener('click', () => {
    setPov(!pov);
    follow = false;
    el('follow-bus').setAttribute('aria-pressed', 'false');
    if (pov && busPosition) map.easeTo({ center: busPosition, bearing: busBearing, pitch: 70, zoom: 17, duration: 800 });
    else fit();
  });
  map.on('pitch', () => {
    el('street-3d').setAttribute('aria-pressed', String(map.getPitch() > 5));
    el('street-2d').setAttribute('aria-pressed', String(map.getPitch() <= 5));
  });
  let locationWatch = null;
  let locationSession = 0;
  let userMarker = null;
  let centerOnFirstFix = false;
  function stopLocation(message) {
    locationSession++;
    if (locationWatch !== null) navigator.geolocation.clearWatch(locationWatch);
    locationWatch = null;
    if (userMarker) userMarker.remove();
    userMarker = null;
    const accuracy = map.getSource('user-accuracy');
    if (accuracy) accuracy.setData(emptyGeometry());
    el('my-location').textContent = 'My location';
    el('my-location').setAttribute('aria-pressed', 'false');
    el('location-status').textContent = message;
  }
  el('my-location').addEventListener('click', () => {
    if (locationWatch !== null) {
      stopLocation('Location tracking stopped. Your position has been removed.');
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      el('location-status').textContent = 'Location is unavailable here. Open this page over HTTPS or localhost in a browser that supports geolocation.';
      return;
    }
    const session = ++locationSession;
    centerOnFirstFix = true;
    el('location-status').textContent = 'Waiting for location permission and a position fix…';
    el('my-location').textContent = 'Stop GPS';
    el('my-location').setAttribute('aria-pressed', 'true');
    locationWatch = navigator.geolocation.watchPosition(async position => {
      const mapReady = await ready;
      if (session !== locationSession) return;
      if (!mapReady) {
        stopLocation('Location stopped because the map is unavailable. Reload to retry.');
        return;
      }
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
        stopLocation('Your device returned an invalid position. Select My location to retry.');
        return;
      }
      const coordinates = [longitude, latitude];
      if (!userMarker) {
        const dot = document.createElement('div');
        dot.className = 'user-location-dot';
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', 'Your current device location');
        userMarker = new maplibregl.Marker({ element: dot }).setLngLat(coordinates).addTo(map);
      } else userMarker.setLngLat(coordinates);
      map.getSource('user-accuracy').setData(turf.circle(coordinates, Math.max(accuracy, 1) / 1000, { units: 'kilometers', steps: 64 }));
      const time = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(position.timestamp));
      el('location-status').textContent = `Location active · Accuracy ±${Math.round(accuracy)} m · Last fix ${time}. Blue dot = you, not the bus.`;
      if (centerOnFirstFix) {
        centerOnFirstFix = false;
        follow = false;
        setPov(false);
        el('follow-bus').setAttribute('aria-pressed', 'false');
        map.easeTo({ center: coordinates, zoom: 16, duration: 800 });
      }
    }, error => {
      if (session !== locationSession) return;
      const reason = error.code === 1
        ? 'Location permission denied. Allow location in your browser site settings, then select My location again.'
        : error.code === 2
          ? 'Your device could not determine its location. Check location services and try again.'
          : 'Location request timed out. Check device location services and try again.';
      stopLocation(reason);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  });
  window.addEventListener('pagehide', () => stopLocation('Location stopped because the page was closed or left.'));
  new ResizeObserver(() => { map.resize(); }).observe(el('street-map'));
  draw(selected);
})();
