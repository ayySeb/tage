// Pointer-based drag & drop for tasks, the same code for mouse and touch.
// Mouse drags start after a few pixels of movement; touch drags start on a long press,
// so a normal swipe still scrolls the page.
const EDGE = 64;

export function initDnd(onDrop) {
  let pending = null;
  let drag = null;
  let swallowClick = false;

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    const el = e.target.closest('.task[data-key]');
    if (!el || e.target.closest('button, input')) return;
    const p = { el, pointer: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    if (p.touch) p.timer = setTimeout(() => start(p.x, p.y), 300);
    pending = p;
  });

  document.addEventListener('pointermove', e => {
    if (drag) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      place();
      return;
    }
    if (!pending || e.pointerId !== pending.pointer) return;
    const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
    if (pending.touch && dist > 10) cancelPending();
    else if (!pending.touch && dist > 5) start(e.clientX, e.clientY);
  });

  document.addEventListener('pointerup', () => (drag ? finish(false) : cancelPending()));
  document.addEventListener('pointercancel', () => (drag ? finish(true) : cancelPending()));
  // Once a touch drag runs, keep the page from scrolling under the finger.
  document.addEventListener('touchmove', e => drag && e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => (drag || pending?.touch) && e.preventDefault());
  document.addEventListener('click', e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  function start(x, y) {
    const { el } = pending;
    cancelPending();
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${r.width}px`;
    document.body.append(ghost);
    el.classList.add('placeholder');
    document.documentElement.classList.add('dragging');
    drag = { el, ghost, x, y, dx: x - r.left, dy: y - r.top, origin: el.parentElement, next: el.nextElementSibling };
    navigator.vibrate?.(10);
    tick();
  }

  // Moves the placeholder to where the pointer is.
  function place() {
    const { el, ghost, x, y } = drag;
    ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(1.2deg)`;
    const list = document.elementFromPoint(x, y)?.closest('[data-list]');
    if (!list) return;
    const before = [...list.querySelectorAll(':scope > .task')]
      .find(t => t !== el && y < t.getBoundingClientRect().top + t.offsetHeight / 2);
    const ref = before ?? list.querySelector(':scope > .add');
    if (el.parentElement !== list || el.nextElementSibling !== ref) list.insertBefore(el, ref);
  }

  // Scrolls the page or a scrolling column while the pointer rests near its edge.
  function tick() {
    if (!drag) return;
    const { x, y } = drag;
    const speed = d => Math.ceil((EDGE - Math.max(d, 0)) / 5);
    if (y < EDGE) scrollBy(0, -speed(y));
    else if (innerHeight - y < EDGE) scrollBy(0, speed(innerHeight - y));
    const col = document.elementFromPoint(x, y)?.closest('.list');
    if (col && col.scrollHeight > col.clientHeight) {
      const r = col.getBoundingClientRect();
      if (y - r.top < EDGE / 2) col.scrollTop -= speed(2 * (y - r.top));
      else if (r.bottom - y < EDGE / 2) col.scrollTop += speed(2 * (r.bottom - y));
    }
    place();
    drag.raf = requestAnimationFrame(tick);
  }

  function finish(cancelled) {
    cancelAnimationFrame(drag.raf);
    const { el, ghost, origin, next } = drag;
    drag = null;
    ghost.remove();
    el.classList.remove('placeholder');
    document.documentElement.classList.remove('dragging');
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 50);
    if (cancelled) return origin.insertBefore(el, next);
    onDrop(el.dataset.key, el.parentElement.dataset.list, el.previousElementSibling?.dataset.key, el.nextElementSibling?.dataset.key);
  }
}
