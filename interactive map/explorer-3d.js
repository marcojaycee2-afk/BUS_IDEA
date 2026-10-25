'use strict';

(() => {
  const el = id => document.getElementById(id);
  const money = amount => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount);
  const clock = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  let route = selected;
  let progress = 0;
  let playing = false;
  let frame = null;
  let lastFrame = null;
  let roadDistance = null;
  let durationRange = [];
  let timelineItems = [];
  const tripFields = ['departure-time', 'passenger-type', 'passengers'];

  // datetime-local has no timezone. Treat the entered wall-clock time as Manila time.
  const manilaNow = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16);
  el('departure-time').value = manilaNow;

  function departure() {
    const input = el('departure-time');
    if (!input.validity.valid || !input.value) return null;
    const date = new Date(`${input.value}+08:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timeAt(hours) {
    const start = departure();
    return start ? clock.format(new Date(start.getTime() + hours * 3600000)) : 'Set a departure time';
  }

  function minutesOfDay(label) {
    const [, hour, minute, period] = label.match(/^(\d+):(\d+) (AM|PM)$/);
    return (Number(hour) % 12 + (period === 'PM' ? 12 : 0)) * 60 + Number(minute);
  }

  function updatePlan() {
    const start = departure();
    el('departure-error').textContent = start ? '' : 'Enter a valid departure date and time in Philippine time.';
    if (!route) {
      el('arrival-window').textContent = 'Choose a route first';
      el('schedule-advice').textContent = '';
      el('trip-timeline').replaceChildren();
      for (const id of ['base-fare', 'discount-amount', 'group-total']) el(id).textContent = '—';
      return;
    }
    const [min, max] = durationRange;
    el('arrival-window').textContent = start ? `${timeAt(min)} – ${timeAt(max)}` : 'Departure time needed';
    if (start) {
      const wallClock = el('departure-time').value.slice(11);
      const [hour, minute] = wallClock.split(':').map(Number);
      const total = hour * 60 + minute;
      if (route.departures) {
        const later = route.departures.find(item => minutesOfDay(item) >= total);
        el('schedule-advice').textContent = later
          ? `Poster-listed departure at or after your time: ${later}. The arrival estimate uses your entered time, not this departure. Availability and operation on your date are unverified.`
          : 'No later departure is listed for this route that day. Confirm the next operating trip with the operator; the arrival estimate still uses your entered time.';
      } else {
        const inWindow = total >= minutesOfDay(route.first) && total <= minutesOfDay(route.last);
        el('schedule-advice').textContent = `${inWindow ? 'Your time is within' : 'Your time is outside'} the poster's ${route.first}–${route.last} service window. Exact departures and frequency are unknown. This is not a confirmed trip.`;
      }
    } else {
      el('schedule-advice').textContent = 'Set a valid time to compare with the supplied poster schedule.';
    }
    updateFare();
    const milestones = [
      { fraction: 0, name: `${terminals[route.from].name} · Depart`, note: 'Confirm the exact boarding location with the operator.' },
      { fraction: 0.5, name: 'Halfway through your journey', note: 'Simulated milestone only · Not a boarding stop.' },
      { fraction: 1, name: `${terminals[route.to].name} · Arrive`, note: 'Estimated destination arrival · Traffic and stops may add time.' }
    ];
    el('trip-timeline').innerHTML = milestones.map(item => `<li data-fraction="${item.fraction}"><div class="timeline-head"><strong>${item.name}</strong><time>${item.fraction === 0 ? timeAt(0) : `${timeAt(min * item.fraction)} – ${timeAt(max * item.fraction)}`}</time></div><p>~${Math.round(route.distance * item.fraction)} km from origin · ${item.note}</p></li>`).join('');
    timelineItems = [...el('trip-timeline').children];
    updateProgress();
  }

  function updateFare() {
    if (!route) return;
    const travelers = el('passengers');
    const count = Number(travelers.value);
    const valid = travelers.validity.valid && Number.isInteger(count) && count >= 1 && count <= 20;
    el('fare-error').textContent = valid ? '' : 'Enter a whole number of travelers from 1 to 20.';
    const multiplier = Number(el('passenger-type').value);
    const discountedCents = Math.round(route.fare * 100 * multiplier);
    el('base-fare').textContent = money(route.fare);
    el('discount-amount').textContent = `−${money(route.fare - discountedCents / 100)}`;
    el('group-total').textContent = valid ? money(discountedCents * count / 100) : '—';
  }

  function setPlaying(next) {
    playing = next && Boolean(route);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrame = null;
    el('play-trip').textContent = playing ? 'Pause journey' : progress >= 1 ? 'Replay journey' : 'Play journey';
    if (playing) frame = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    if (!playing) return;
    const previewMilliseconds = (durationRange[0] + durationRange[1]) / 2 * 30000;
    if (lastFrame !== null) progress = Math.min(1, progress + (timestamp - lastFrame) / previewMilliseconds);
    lastFrame = timestamp;
    updateProgress();
    if (progress >= 1) setPlaying(false);
    else frame = requestAnimationFrame(tick);
  }

  function formatDuration(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}m`;
  }

  function updateProgress() {
    if (!route) return;
    el('play-trip').textContent = playing ? 'Pause journey' : progress >= 1 ? 'Replay journey' : 'Play journey';
    el('trip-progress').value = (progress * 100).toFixed(1);
    el('progress-percent').textContent = `${Math.round(progress * 100)}%`;
    const distance = roadDistance === null ? route.distance : roadDistance / 1000;
    const units = roadDistance === null ? 'sample km' : 'road km';
    el('distance-progress').textContent = `${(distance * progress).toFixed(1)} ${units} traveled · ${(distance * (1 - progress)).toFixed(1)} km left`;
    const remaining = (durationRange[0] + durationRange[1]) / 2 * 60 * (1 - progress);
    el('remaining-time').textContent = `~${formatDuration(remaining)} left (midpoint estimate)`;
    el('simulation-status').textContent = progress >= 1 ? `Arrived at ${terminals[route.to].name} · Demo complete` : progress === 0 ? `Ready at ${terminals[route.from].name}` : `${playing ? 'On the way to' : 'Paused en route to'} ${terminals[route.to].name}`;
    for (const item of timelineItems) item.classList.toggle('passed', progress >= Number(item.dataset.fraction));
    document.dispatchEvent(new CustomEvent('tripprogress', { detail: { route, progress } }));
  }

  function setRoute(next) {
    const changed = route?.id !== next?.id;
    route = next;
    if (changed) {
      setPlaying(false);
      progress = 0;
    }
    roadDistance = null;
    durationRange = route ? route.time.split('–').map(Number) : [];
    if (route) el('playback-speed').textContent = `Playback: 1 second = 2 simulated minutes. This ${route.time}-hour journey previews in ~${Math.round((durationRange[0] + durationRange[1]) / 2 * 30)} seconds. Not live tracking.`;
    for (const id of ['play-trip', 'restart-trip', 'trip-progress', ...tripFields]) el(id).disabled = !route;
    if (!route) {
      setPlaying(false);
      timelineItems = [];
      el('simulation-status').textContent = 'Choose a route to preview a journey';
      el('distance-progress').textContent = 'No route selected';
      el('remaining-time').textContent = '—';
      el('progress-percent').textContent = '—';
    }
    updatePlan();
    updateProgress();
  }

  document.addEventListener('roaddistance', event => {
    if (event.detail.routeId !== route?.id) return;
    roadDistance = event.detail.distance;
    updateProgress();
  });
  document.addEventListener('routechange', event => setRoute(event.detail));
  el('departure-time').addEventListener('input', updatePlan);
  el('passenger-type').addEventListener('change', updateFare);
  el('passengers').addEventListener('input', updateFare);
  el('play-trip').addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    setPlaying(!playing);
    updateProgress();
  });
  el('restart-trip').addEventListener('click', () => {
    setPlaying(false);
    progress = 0;
    updateProgress();
  });
  el('trip-progress').addEventListener('input', () => {
    setPlaying(false);
    progress = Number(el('trip-progress').value) / 100;
    updateProgress();
  });
  // Do not jump the bus forward when returning from a background tab.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setPlaying(false);
      updateProgress();
    }
  });
  setRoute(selected);
})();
