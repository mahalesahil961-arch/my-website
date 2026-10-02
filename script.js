/* =========================================================
   THE WAITING TABLE — script.js
   A Queue-based (FIFO) restaurant waitlist manager.
   ========================================================= */

/* =========================================================
   1. QUEUE CLASS
   ---------------------------------------------------------
   FIFO = "First In, First Out". The first customer added
   to the queue (the FRONT) is always the first one removed
   — just like a real line outside a restaurant.

   Internally we store items in a plain array, but instead
   of using Array.shift() to dequeue (which is slow, because
   it re-indexes every remaining element), we keep a
   `frontIndex` pointer. Dequeuing just moves the pointer
   forward, which is an O(1) operation.
   ========================================================= */
class Queue {
  constructor() {
    this.items = [];      // underlying storage
    this.frontIndex = 0;  // index of the current "front" of the queue
  }

  /**
   * ENQUEUE — add an item to the REAR of the queue.
   * New customers always join the back of the line.
   */
  enqueue(item) {
    this.items.push(item);
  }

  /**
   * DEQUEUE — remove and return the item at the FRONT of the queue.
   * This is the customer who has been waiting the longest.
   * We avoid Array.shift() and instead just advance frontIndex,
   * then occasionally compact the array so it doesn't grow forever.
   */
  dequeue() {
    if (this.isEmpty()) return null;
    const item = this.items[this.frontIndex];
    this.frontIndex++;

    // Housekeeping: once we've dequeued more than half the array,
    // trim the "used up" slots so memory doesn't grow unbounded.
    if (this.frontIndex > 50 && this.frontIndex * 2 >= this.items.length) {
      this.items = this.items.slice(this.frontIndex);
      this.frontIndex = 0;
    }
    return item;
  }

  /**
   * PEEK — look at the front item WITHOUT removing it.
   * Used to show "Next Customer" on the dashboard.
   */
  peek() {
    if (this.isEmpty()) return null;
    return this.items[this.frontIndex];
  }

  /** ISEMPTY — true when there is no one left waiting. */
  isEmpty() {
    return this.size() === 0;
  }

  /** SIZE — how many customers are currently waiting. */
  size() {
    return this.items.length - this.frontIndex;
  }

  /**
   * toArray — returns the queue contents in FRONT-to-REAR order.
   * Used only for rendering/search; it never mutates the queue,
   * so displaying or searching the list never changes FIFO order.
   */
  toArray() {
    return this.items.slice(this.frontIndex);
  }

  /**
   * removeById — removes a specific customer from the middle of
   * the queue (used by the "Remove" button). Everyone behind them
   * keeps their relative order — only their queue POSITION number
   * shifts up by one, because "position" is just "how many people
   * are ahead of me", recalculated fresh every render.
   */
  removeById(id) {
    const current = this.toArray();
    const filtered = current.filter(c => c.id !== id);
    this.items = filtered;
    this.frontIndex = 0;
    return filtered.length !== current.length;
  }

  /** Rebuild the queue from a plain array (used when loading from storage). */
  loadFrom(array) {
    this.items = Array.isArray(array) ? array : [];
    this.frontIndex = 0;
  }
}

/* =========================================================
   2. STATE
   ========================================================= */
const waitlistQueue = new Queue();   // FIFO queue of waiting customers
let seatedCustomers = [];            // customers currently seated
let searchTerm = '';                 // current search filter (display-only)

const STORAGE_KEY_WAITING = 'waitingCustomers';
const STORAGE_KEY_SEATED = 'seatedCustomers';

/* =========================================================
   3. DOM REFERENCES
   ========================================================= */
const els = {
  form: document.getElementById('addCustomerForm'),
  name: document.getElementById('custName'),
  phone: document.getElementById('custPhone'),
  partySize: document.getElementById('partySize'),
  tableSize: document.getElementById('tableSize'),
  resTime: document.getElementById('resTime'),

  statWaiting: document.getElementById('statWaiting'),
  statSeated: document.getElementById('statSeated'),
  statNext: document.getElementById('statNext'),

  waitlistItems: document.getElementById('waitlistItems'),
  waitlistEmpty: document.getElementById('waitlistEmpty'),
  waitlistCount: document.getElementById('waitlistCount'),
  seatNextBtn: document.getElementById('seatNextBtn'),

  seatedItems: document.getElementById('seatedItems'),
  seatedEmpty: document.getElementById('seatedEmpty'),

  queueViz: document.getElementById('queueViz'),
  searchInput: document.getElementById('searchInput'),
  toast: document.getElementById('toast'),
};

/* =========================================================
   4. PERSISTENCE (localStorage)
   ========================================================= */
function saveData() {
  localStorage.setItem(STORAGE_KEY_WAITING, JSON.stringify(waitlistQueue.toArray()));
  localStorage.setItem(STORAGE_KEY_SEATED, JSON.stringify(seatedCustomers));
}

function loadData() {
  const waiting = JSON.parse(localStorage.getItem(STORAGE_KEY_WAITING) || '[]');
  const seated = JSON.parse(localStorage.getItem(STORAGE_KEY_SEATED) || '[]');
  waitlistQueue.loadFrom(waiting);
  seatedCustomers = seated;
}

/* =========================================================
   5. VALIDATION
   ========================================================= */
function validateForm() {
  let valid = true;
  const fields = [
    ['custName', 'err-custName', els.name.value.trim() !== '', 'Please enter the customer\u2019s name.'],
    ['custPhone', 'err-custPhone', els.phone.value.trim() !== '', 'Please enter a phone number.'],
    ['partySize', 'err-partySize', Number(els.partySize.value) > 0, 'Party size must be greater than 0.'],
    ['resTime', 'err-resTime', els.resTime.value.trim() !== '', 'Please choose a reservation time.'],
  ];

  fields.forEach(([inputId, errId, isValid, message]) => {
    const input = document.getElementById(inputId);
    const errEl = document.getElementById(errId);
    if (!isValid) {
      valid = false;
      input.classList.add('invalid');
      errEl.textContent = message;
    } else {
      input.classList.remove('invalid');
      errEl.textContent = '';
    }
  });

  return valid;
}

/* =========================================================
   6. NOTIFICATIONS
   ========================================================= */
let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

/* =========================================================
   7. HELPERS
   ========================================================= */
function generateId() {
  return 'c' + Date.now() + Math.floor(Math.random() * 1000);
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function nowTimeLabel() {
  const d = new Date();
  return formatTime(`${d.getHours()}:${d.getMinutes()}`);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* =========================================================
   8. RENDERING
   ========================================================= */
function render() {
  renderDashboard();
  renderWaitlist();
  renderSeated();
  renderQueueViz();
}

function renderDashboard() {
  els.statWaiting.textContent = waitlistQueue.size();
  els.statSeated.textContent = seatedCustomers.length;

  // PEEK: show the next customer without removing them from the queue.
  const next = waitlistQueue.peek();
  els.statNext.textContent = next ? next.name : '—';
}

function renderWaitlist() {
  const all = waitlistQueue.toArray(); // FRONT-to-REAR order, queue untouched
  const term = searchTerm.trim().toLowerCase();

  // Searching only filters what's DISPLAYED — it never reorders
  // or mutates the underlying queue, so FIFO order is preserved.
  const visible = term
    ? all.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term))
    : all;

  els.waitlistCount.textContent = all.length;
  els.waitlistItems.innerHTML = '';

  if (all.length === 0) {
    els.waitlistEmpty.hidden = false;
    els.waitlistEmpty.textContent = '';
    const strong = document.createElement('div');
    strong.innerHTML = 'No customers are currently waiting.<br>Add a customer to begin the queue.';
    els.waitlistEmpty.appendChild(strong);
    return;
  }
  els.waitlistEmpty.hidden = true;

  if (visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = `No matches for "${searchTerm}".`;
    els.waitlistItems.appendChild(li);
    return;
  }

  visible.forEach(customer => {
    // Queue POSITION = index (from the front) in the full FIFO order,
    // computed fresh from the real queue — not the filtered list —
    // so a search never changes anyone's true place in line.
    const position = all.findIndex(c => c.id === customer.id) + 1;

    const li = document.createElement('li');
    li.className = 'waitlist-item';
    li.innerHTML = `
      <div class="queue-pos">#${position}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(customer.name)}</div>
        <div class="item-meta">${escapeHtml(customer.phone)} &middot; ${customer.partySize} guests &middot; ${escapeHtml(customer.tableSize)} table &middot; ${formatTime(customer.resTime)}</div>
        <span class="item-status">Waiting</span>
      </div>
      <div class="item-actions">
        <button class="btn btn-accent btn-sm" data-action="seat" data-id="${customer.id}">Seat</button>
        <button class="btn btn-ghost-danger btn-sm" data-action="remove" data-id="${customer.id}">Remove</button>
      </div>
    `;
    els.waitlistItems.appendChild(li);
  });
}

function renderSeated() {
  els.seatedItems.innerHTML = '';

  if (seatedCustomers.length === 0) {
    els.seatedEmpty.hidden = false;
    return;
  }
  els.seatedEmpty.hidden = true;

  seatedCustomers.forEach(customer => {
    const card = document.createElement('div');
    card.className = 'seated-card';
    card.innerHTML = `
      <div class="item-name">${escapeHtml(customer.name)}</div>
      <div class="item-meta">${customer.partySize} guests &middot; ${escapeHtml(customer.tableSize)} table</div>
      <div class="item-meta">Seated at ${customer.seatedAt}</div>
      <span class="item-status">Seated</span>
      <button class="btn btn-outline btn-sm" data-action="release" data-id="${customer.id}">Table Available</button>
    `;
    els.seatedItems.appendChild(card);
  });
}

function renderQueueViz() {
  const all = waitlistQueue.toArray();
  els.queueViz.innerHTML = '';

  if (all.length === 0) {
    els.queueViz.innerHTML = '<p class="empty-state" style="padding:10px 0;">The queue is empty — no one waiting.</p>';
    return;
  }

  all.forEach((customer, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'viz-arrow';
      arrow.textContent = '\u2192';
      els.queueViz.appendChild(arrow);
    }
    const box = document.createElement('div');
    box.className = 'viz-box';
    if (i === 0) box.classList.add('viz-box--front');
    if (i === all.length - 1) box.classList.add('viz-box--rear');
    box.innerHTML = `
      <div class="viz-name">${escapeHtml(customer.name)}</div>
      <div class="viz-tag">#${i + 1}</div>
    `;
    els.queueViz.appendChild(box);
  });
}

/* =========================================================
   9. ACTIONS
   ========================================================= */
function addCustomer(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const customer = {
    id: generateId(),
    name: els.name.value.trim(),
    phone: els.phone.value.trim(),
    partySize: Number(els.partySize.value),
    tableSize: els.tableSize.value,
    resTime: els.resTime.value,
  };

  // ENQUEUE: new customer joins the REAR of the FIFO queue.
  waitlistQueue.enqueue(customer);

  saveData();
  render();
  els.form.reset();
  showToast('Customer added to waitlist');
}

function seatCustomerById(id) {
  // Find & remove a specific customer (staff may seat someone
  // out of turn — e.g. their table happens to free up first).
  const all = waitlistQueue.toArray();
  const customer = all.find(c => c.id === id);
  if (!customer) return;

  waitlistQueue.removeById(id);
  moveToSeated(customer);
}

function seatNextCustomer() {
  if (waitlistQueue.isEmpty()) {
    showToast('No customers are currently waiting');
    return;
  }
  // DEQUEUE: remove the customer at the FRONT of the queue —
  // the one who has been waiting longest, per FIFO.
  const customer = waitlistQueue.dequeue();
  moveToSeated(customer);
}

function moveToSeated(customer) {
  customer.status = 'Seated';
  customer.seatedAt = nowTimeLabel();
  seatedCustomers.push(customer);

  saveData();
  render();
  showToast(`${customer.name} has been seated`);
}

function removeCustomer(id) {
  const all = waitlistQueue.toArray();
  const customer = all.find(c => c.id === id);
  waitlistQueue.removeById(id);
  saveData();
  render();
  showToast(customer ? `${customer.name} removed from waitlist` : 'Customer removed from waitlist');
}

function releaseTable(id) {
  seatedCustomers = seatedCustomers.filter(c => c.id !== id);
  saveData();
  render();
  showToast('Table is now available');
}

/* =========================================================
   10. EVENT LISTENERS
   ========================================================= */
els.form.addEventListener('submit', addCustomer);
els.seatNextBtn.addEventListener('click', seatNextCustomer);

els.waitlistItems.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'seat') seatCustomerById(id);
  if (action === 'remove') removeCustomer(id);
});

els.seatedItems.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="release"]');
  if (!btn) return;
  releaseTable(btn.dataset.id);
});

els.searchInput.addEventListener('input', (e) => {
  // Search only affects rendering, never the queue's real FIFO order.
  searchTerm = e.target.value;
  renderWaitlist();
});

/* =========================================================
   11. INIT
   ========================================================= */
loadData();
render();
