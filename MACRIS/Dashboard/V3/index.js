// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ghbfgsclxqgrhwxzetgb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoYmZnc2NseHFncmh3eHpldGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NTQ2NTQsImV4cCI6MjA2NzEzMDY1NH0.lhL69enrAa4LpCs8c_1RaoiTVpcfMh7OA8qc6mvB_wI';

// Initialize Supabase client
const { createClient } = supabase;
const dbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Map internal icon names to Font Awesome classes
const ICONS = {
  // Original
  reports: 'fa-solid fa-chart-pie',
  tools: 'fa-solid fa-toolbox',
  app: 'fa-solid fa-cube',
  finance: 'fa-solid fa-sack-dollar',
  hr: 'fa-solid fa-users',
  inventory: 'fa-solid fa-boxes-stacked',
  tasks: 'fa-solid fa-list-check',
  support: 'fa-solid fa-headset',

  // Expanded List
  addressBook: 'fa-solid fa-address-book',
  analytics: 'fa-solid fa-chart-line',
  archive: 'fa-solid fa-box-archive',
  atom: 'fa-solid fa-atom',
  badge: 'fa-solid fa-id-badge',
  bandaid: 'fa-solid fa-bandage',
  bank: 'fa-solid fa-building-columns',
  barcode: 'fa-solid fa-barcode',
  basketball: 'fa-solid fa-basketball',
  bell: 'fa-solid fa-bell',
  bitcoin: 'fa-brands fa-bitcoin',
  blog: 'fa-solid fa-blog',
  book: 'fa-solid fa-book',
  bookmark: 'fa-solid fa-bookmark',
  brain: 'fa-solid fa-brain',
  briefcase: 'fa-solid fa-briefcase',
  broadcast: 'fa-solid fa-tower-broadcast',
  brush: 'fa-solid fa-paintbrush',
  bug: 'fa-solid fa-bug',
  building: 'fa-solid fa-building',
  bullhorn: 'fa-solid fa-bullhorn',
  bullseye: 'fa-solid fa-bullseye',
  calculator: 'fa-solid fa-calculator',
  calendar: 'fa-solid fa-calendar-days',
  camera: 'fa-solid fa-camera-retro',
  car: 'fa-solid fa-car',
  cart: 'fa-solid fa-cart-shopping',
  certificate: 'fa-solid fa-certificate',
  chartBar: 'fa-solid fa-chart-bar',
  check: 'fa-solid fa-check',
  chess: 'fa-solid fa-chess',
  cloud: 'fa-solid fa-cloud',
  cloudDownload: 'fa-solid fa-cloud-arrow-down',
  cloudUpload: 'fa-solid fa-cloud-arrow-up',
  code: 'fa-solid fa-code',
  codeBranch: 'fa-solid fa-code-branch',
  coffee: 'fa-solid fa-mug-saucer',
  cog: 'fa-solid fa-gear',
  cogs: 'fa-solid fa-gears',
  coins: 'fa-solid fa-coins',
  comment: 'fa-solid fa-comment',
  comments: 'fa-solid fa-comments',
  compass: 'fa-solid fa-compass',
  compress: 'fa-solid fa-compress',
  computer: 'fa-solid fa-laptop',
  copy: 'fa-solid fa-copy',
  creditCard: 'fa-solid fa-credit-card',
  crop: 'fa-solid fa-crop-simple',
  crosshairs: 'fa-solid fa-crosshairs',
  crown: 'fa-solid fa-crown',
  database: 'fa-solid fa-database',
  desktop: 'fa-solid fa-desktop',
  diagram: 'fa-solid fa-diagram-project',
  dna: 'fa-solid fa-dna',
  dollar: 'fa-solid fa-dollar-sign',
  dolly: 'fa-solid fa-dolly',
  download: 'fa-solid fa-download',
  draftingCompass: 'fa-solid fa-drafting-compass',
  dragon: 'fa-solid fa-dragon',
  drawPolygon: 'fa-solid fa-draw-polygon',
  droplet: 'fa-solid fa-droplet',
  dumpster: 'fa-solid fa-dumpster',
  earth: 'fa-solid fa-earth-americas',
  edit: 'fa-solid fa-pen-to-square',
  eject: 'fa-solid fa-eject',
  envelope: 'fa-solid fa-envelope',
  ethernet: 'fa-solid fa-ethernet',
  euro: 'fa-solid fa-euro-sign',
  exchange: 'fa-solid fa-right-left',
  exclamation: 'fa-solid fa-exclamation',
  expand: 'fa-solid fa-expand',
  eye: 'fa-solid fa-eye',
  eyeDropper: 'fa-solid fa-eye-dropper',
  fax: 'fa-solid fa-fax',
  feather: 'fa-solid fa-feather',
  figma: 'fa-brands fa-figma',
  file: 'fa-solid fa-file',
  fileAudio: 'fa-solid fa-file-audio',
  fileCode: 'fa-solid fa-file-code',
  fileCsv: 'fa-solid fa-file-csv',
  fileImage: 'fa-solid fa-file-image',
  fileInvoice: 'fa-solid fa-file-invoice',
  filePdf: 'fa-solid fa-file-pdf',
  fileVideo: 'fa-solid fa-file-video',
  fileWord: 'fa-solid fa-file-word',
  fileZip: 'fa-solid fa-file-zipper',
  film: 'fa-solid fa-film',
  filter: 'fa-solid fa-filter',
  fingerprint: 'fa-solid fa-fingerprint',
  fire: 'fa-solid fa-fire',
  fireExtinguisher: 'fa-solid fa-fire-extinguisher',
  flag: 'fa-solid fa-flag',
  flask: 'fa-solid fa-flask',
  folder: 'fa-solid fa-folder',
  folderOpen: 'fa-solid fa-folder-open',
  football: 'fa-solid fa-football',
  gamepad: 'fa-solid fa-gamepad',
  gavel: 'fa-solid fa-gavel',
  gem: 'fa-solid fa-gem',
  gift: 'fa-solid fa-gift',
  git: 'fa-brands fa-git-alt',
  github: 'fa-brands fa-github',
  glasses: 'fa-solid fa-glasses',
  globe: 'fa-solid fa-globe',
  graduationCap: 'fa-solid fa-graduation-cap',
  grid: 'fa-solid fa-table-cells',
  hardDrive: 'fa-solid fa-hard-drive',
  hashtag: 'fa-solid fa-hashtag',
  hdd: 'fa-regular fa-hard-drive',
  heading: 'fa-solid fa-heading',
  headphones: 'fa-solid fa-headphones',
  heart: 'fa-solid fa-heart',
  helicopter: 'fa-solid fa-helicopter',
  history: 'fa-solid fa-clock-rotate-left',
  home: 'fa-solid fa-house',
  hospital: 'fa-solid fa-hospital',
  hourglass: 'fa-solid fa-hourglass-half',
  idCard: 'fa-solid fa-id-card',
  image: 'fa-solid fa-image',
  inbox: 'fa-solid fa-inbox',
  industry: 'fa-solid fa-industry',
  info: 'fa-solid fa-circle-info',
  key: 'fa-solid fa-key',
  keyboard: 'fa-solid fa-keyboard',
  landmark: 'fa-solid fa-landmark',
  language: 'fa-solid fa-language',
  laptopCode: 'fa-solid fa-laptop-code',
  layerGroup: 'fa-solid fa-layer-group',
  leaf: 'fa-solid fa-leaf',
  lemon: 'fa-solid fa-lemon',
  lifeRing: 'fa-solid fa-life-ring',
  lightbulb: 'fa-solid fa-lightbulb',
  link: 'fa-solid fa-link',
  lira: 'fa-solid fa-lira-sign',
  list: 'fa-solid fa-list',
  location: 'fa-solid fa-location-dot',
  lock: 'fa-solid fa-lock',
  magic: 'fa-solid fa-wand-magic-sparkles',
  magnet: 'fa-solid fa-magnet',
  map: 'fa-solid fa-map-location-dot',
  medal: 'fa-solid fa-medal',
  medkit: 'fa-solid fa-briefcase-medical',
  memory: 'fa-solid fa-memory',
  microchip: 'fa-solid fa-microchip',
  microphone: 'fa-solid fa-microphone',
  mobile: 'fa-solid fa-mobile-screen-button',
  moneyBill: 'fa-solid fa-money-bill-wave',
  moon: 'fa-solid fa-moon',
  motorcycle: 'fa-solid fa-motorcycle',
  mouse: 'fa-solid fa-computer-mouse',
  music: 'fa-solid fa-music',
  newspaper: 'fa-solid fa-newspaper',
  paintRoller: 'fa-solid fa-paint-roller',
  palette: 'fa-solid fa-palette',
  paperclip: 'fa-solid fa-paperclip',
  paperPlane: 'fa-solid fa-paper-plane',
  paste: 'fa-solid fa-paste',
  pause: 'fa-solid fa-pause',
  paw: 'fa-solid fa-paw',
  pen: 'fa-solid fa-pen',
  pencil: 'fa-solid fa-pencil',
  percent: 'fa-solid fa-percent',
  phone: 'fa-solid fa-phone',
  photoFilm: 'fa-solid fa-photo-film',
  pin: 'fa-solid fa-thumbtack',
  plane: 'fa-solid fa-plane',
  play: 'fa-solid fa-play',
  plug: 'fa-solid fa-plug',
  plus: 'fa-solid fa-plus',
  pound: 'fa-solid fa-sterling-sign',
  powerOff: 'fa-solid fa-power-off',
  print: 'fa-solid fa-print',
  projectDiagram: 'fa-solid fa-sitemap',
  puzzle: 'fa-solid fa-puzzle-piece',
  qrcode: 'fa-solid fa-qrcode',
  question: 'fa-solid fa-circle-question',
  quote: 'fa-solid fa-quote-left',
  receipt: 'fa-solid fa-receipt',
  recycle: 'fa-solid fa-recycle',
  refresh: 'fa-solid fa-arrows-rotate',
  reorder: 'fa-solid fa-bars',
  reply: 'fa-solid fa-reply',
  road: 'fa-solid fa-road',
  robot: 'fa-solid fa-robot',
  rocket: 'fa-solid fa-rocket',
  route: 'fa-solid fa-route',
  rss: 'fa-solid fa-square-rss',
  ruler: 'fa-solid fa-ruler',
  save: 'fa-solid fa-floppy-disk',
  school: 'fa-solid fa-school',
  screwdriver: 'fa-solid fa-screwdriver',
  search: 'fa-solid fa-magnifying-glass',
  server: 'fa-solid fa-server',
  share: 'fa-solid fa-share-nodes',
  shield: 'fa-solid fa-shield-halved',
  ship: 'fa-solid fa-ship',
  shoe: 'fa-solid fa-shoe-prints',
  shuffle: 'fa-solid fa-shuffle',
  signal: 'fa-solid fa-signal',
  skull: 'fa-solid fa-skull',
  slack: 'fa-brands fa-slack',
  sliders: 'fa-solid fa-sliders',
  snowflake: 'fa-solid fa-snowflake',
  solarPanel: 'fa-solid fa-solar-panel',
  sort: 'fa-solid fa-sort',
  spa: 'fa-solid fa-spa',
  spinner: 'fa-solid fa-spinner',
  star: 'fa-solid fa-star',
  store: 'fa-solid fa-store',
  stream: 'fa-solid fa-bars-staggered',
  streetView: 'fa-solid fa-street-view',
  suitcase: 'fa-solid fa-suitcase',
  sun: 'fa-solid fa-sun',
  sync: 'fa-solid fa-rotate',
  table: 'fa-solid fa-table',
  tablet: 'fa-solid fa-tablet-screen-button',
  tag: 'fa-solid fa-tag',
  tags: 'fa-solid fa-tags',
  target: 'fa-solid fa-crosshairs',
  taxi: 'fa-solid fa-taxi',
  terminal: 'fa-solid fa-terminal',
  timeline: 'fa-solid fa-timeline',
  tint: 'fa-solid fa-droplet',
  toggleOff: 'fa-solid fa-toggle-off',
  toggleOn: 'fa-solid fa-toggle-on',
  train: 'fa-solid fa-train',
  trash: 'fa-solid fa-trash-can',
  tree: 'fa-solid fa-tree',
  trophy: 'fa-solid fa-trophy',
  truck: 'fa-solid fa-truck',
  tv: 'fa-solid fa-tv',
  umbrella: 'fa-solid fa-umbrella',
  university: 'fa-solid fa-building-columns',
  unlock: 'fa-solid fa-unlock',
  upload: 'fa-solid fa-upload',
  user: 'fa-solid fa-user',
  userCircle: 'fa-solid fa-circle-user',
  userFriends: 'fa-solid fa-user-group',
  userPlus: 'fa-solid fa-user-plus',
  utensils: 'fa-solid fa-utensils',
  vector: 'fa-solid fa-vector-square',
  video: 'fa-solid fa-video',
  volumeUp: 'fa-solid fa-volume-high',
  wallet: 'fa-solid fa-wallet',
  warehouse: 'fa-solid fa-warehouse',
  water: 'fa-solid fa-water',
  wifi: 'fa-solid fa-wifi',
  wrench: 'fa-solid fa-wrench',
  yen: 'fa-solid fa-yen-sign',
};

// --- DOM ELEMENTS ---
const dashboardGrid = document.getElementById('dashboard-grid');
const modalOverlay = document.getElementById('modal-overlay');
const modalForm = document.getElementById('modal-form');
const modalTitle = document.getElementById('modal-title');
const cancelBtn = document.getElementById('btn-cancel');
const iconPicker = document.getElementById('icon-picker');
const addAppFab = document.getElementById('add-app-fab');
// Form inputs
const idInput = document.getElementById('app-id-input');
const nameInput = document.getElementById('appName');
const urlInput = document.getElementById('appUrl');
const iconInput = document.getElementById('app-icon-input');


// --- STATE ---
let apps = [];
let editingApp = null;

// --- FUNCTIONS ---

/**
 * Fetches apps from Supabase and renders the dashboard.
 */
async function fetchAppsAndRender() {
  const { data, error } = await dbClient
    .from('apps')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching apps:', error.message);
    alert('No se pudieron cargar las aplicaciones. Revisa la consola para más detalles.');
    return;
  }

  apps = data;
  renderDashboard();
}

/**
 * Renders all app cards to the dashboard.
 */
function renderDashboard() {
  dashboardGrid.innerHTML = ''; // Clear existing content

  // Render app cards
  apps.forEach(app => {
    const cardContainer = document.createElement('div');
    cardContainer.className = 'app-card-container';

    const cardLink = document.createElement('a');
    cardLink.href = app.url;
    cardLink.target = '_blank';
    cardLink.rel = 'noopener noreferrer';
    cardLink.className = 'app-card';
    cardLink.setAttribute('aria-label', `Abrir ${app.name}`);

    const iconClass = ICONS[app.icon] || ICONS.app;
    cardLink.innerHTML = `
      <div class="app-card-icon"><i class="${iconClass}"></i></div>
      <span class="app-card-name">${app.name}</span>
    `;

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'app-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.setAttribute('aria-label', `Editar ${app.name}`);
    editBtn.innerHTML = `<i class="fa-solid fa-pencil"></i>`;
    editBtn.onclick = (e) => {
      e.preventDefault(); // Prevent link navigation
      openModal(app);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn';
    deleteBtn.setAttribute('aria-label', `Eliminar ${app.name}`);
    deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
    deleteBtn.onclick = (e) => {
      e.preventDefault(); // Prevent link navigation
      deleteApp(app.id, app.name);
    };

    actionsContainer.append(editBtn, deleteBtn);
    cardContainer.append(cardLink, actionsContainer);
    dashboardGrid.appendChild(cardContainer);
  });
}

/**
 * Populates the icon picker in the modal.
 */
function populateIconPicker() {
  iconPicker.innerHTML = '';
  const sortedIcons = Object.entries(ICONS).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [key, iconClass] of sortedIcons) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'icon-option';
    option.dataset.iconKey = key;
    option.setAttribute('aria-label', `Seleccionar ícono ${key}`);
    option.innerHTML = `<i class="${iconClass}"></i>`;
    option.onclick = () => selectIcon(key, option);
    iconPicker.appendChild(option);
  }
}

/**
 * Handles the selection of an icon in the picker.
 * @param {string} iconKey - The key of the selected icon (e.g., 'reports').
 * @param {HTMLElement} selectedElement - The button element that was clicked.
 */
function selectIcon(iconKey, selectedElement) {
  iconInput.value = iconKey;
  // Update visual selection
  document.querySelectorAll('.icon-option.selected').forEach(el => el.classList.remove('selected'));
  selectedElement.classList.add('selected');
}

/**
 * Opens the modal, optionally pre-filling it with data for editing.
 * @param {object|null} app - The app object to edit, or null to add a new app.
 */
function openModal(app = null) {
  modalForm.reset();
  editingApp = app;

  if (app) {
    modalTitle.textContent = 'Editar Aplicación';
    idInput.value = app.id;
    nameInput.value = app.name;
    urlInput.value = app.url;
    iconInput.value = app.icon;
  } else {
    modalTitle.textContent = 'Añadir Nueva Aplicación';
    idInput.value = '';
    // Select 'app' as default icon
    iconInput.value = 'app';
  }

  // Visually select the correct icon
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.iconKey === iconInput.value);
  });

  // Scroll selected icon into view
  const selectedIconEl = iconPicker.querySelector('.icon-option.selected');
  if (selectedIconEl) {
    selectedIconEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  modalOverlay.classList.add('visible');
}

/**
 * Closes the modal.
 */
function closeModal() {
  modalOverlay.classList.remove('visible');
  editingApp = null;
}

/**
 * Deletes an app after confirmation.
 * @param {string} appId - The ID of the app to delete.
 * @param {string} appName - The name of the app for the confirmation message.
 */
async function deleteApp(appId, appName) {
  if (confirm(`¿Estás seguro de que quieres eliminar la aplicación "${appName}"?`)) {
    const { error } = await dbClient
      .from('apps')
      .delete()
      .eq('id', appId);

    if (error) {
      console.error('Error deleting app:', error.message);
      alert('No se pudo eliminar la aplicación.');
      return;
    }

    await fetchAppsAndRender(); // Refresh the dashboard
  }
}

/**
 * Handles the form submission for adding or editing an app.
 * @param {Event} e - The form submission event.
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  const formData = {
    name: nameInput.value.trim(),
    url: urlInput.value.trim(),
    icon: iconInput.value,
  };

  let error;

  if (editingApp) {
    // Edit existing app
    const { error: updateError } = await dbClient
      .from('apps')
      .update(formData)
      .eq('id', editingApp.id);
    error = updateError;
  } else {
    // Add new app
    const { error: insertError } = await dbClient
      .from('apps')
      .insert([formData]);
    error = insertError;
  }

  if (error) {
    console.error('Error saving app:', error.message);
    alert('No se pudo guardar la aplicación.');
    return;
  }

  await fetchAppsAndRender(); // Refresh the dashboard
  closeModal();
}

// --- INITIALIZATION ---
function init() {
  // Event Listeners
  addAppFab.addEventListener('click', () => openModal());
  modalForm.addEventListener('submit', handleFormSubmit);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  cancelBtn.addEventListener('click', closeModal);

  // Initial Load
  populateIconPicker();
  fetchAppsAndRender();
}

// Run the app
init();
