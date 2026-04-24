// Supabase Configuration
const SUPABASE_URL = 'https://przktwequebpukoeczwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByemt0d2VxdWVicHVrb2VjendhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzgzMTUsImV4cCI6MjA5MjYxNDMxNX0.yxmVSYdKv6sKrd9S0uS9pA5Tu03cZ0QPJvTHZwlHp94';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Management
let state = {
    dishes: [],
    weeklyMenu: {},
    inventory: {},
    settings: JSON.parse(localStorage.getItem('gp_settings')) || { clientId: '', apiKey: '' }
};

// UI Feedback
function showSync(text, duration = 2000) {
    const indicator = document.getElementById('syncIndicator');
    const textEl = document.getElementById('syncText');
    if (!indicator) return;
    
    textEl.innerText = text;
    indicator.style.display = 'flex';
    
    if (duration > 0) {
        setTimeout(() => {
            indicator.style.display = 'none';
        }, duration);
    }
}

// Google API Constants
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const mealTypes = ["Almuerzo", "Cena"];

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    event.currentTarget.classList.add('active');

    if (sectionId === 'weekly-menu') renderWeek();
    if (sectionId === 'dishes') renderDishes();
    if (sectionId === 'shopping-list') renderShoppingList();
}

// Render Weekly Grid
function renderWeek() {
    const grid = document.getElementById('weekGrid');
    grid.innerHTML = '';

    days.forEach(day => {
        const dayCard = document.createElement('div');
        dayCard.className = 'day-card';
        dayCard.innerHTML = `<div class="day-header">${day}</div>`;

        mealTypes.forEach(meal => {
            const key = `${day}-${meal}`;
            const mealData = state.weeklyMenu[key] || { first: null, second: null };
            
            // Ensure compatibility with old single-dish structure
            const firstId = typeof mealData === 'object' ? mealData.first : mealData;
            const secondId = typeof mealData === 'object' ? mealData.second : null;

            const firstDish = state.dishes.find(d => d.id === firstId);
            const secondDish = state.dishes.find(d => d.id === secondId);

            const slot = document.createElement('div');
            slot.className = 'meal-slot';
            slot.innerHTML = `
                <div class="meal-label">${meal}</div>
                <div class="meal-slot-course" onclick="openSelectModal('${key}', 'first')">
                    <span class="course-badge">1º</span>
                    <span class="meal-name">${firstDish ? firstDish.name : 'Vaciado'}</span>
                </div>
                <div class="meal-slot-course" onclick="openSelectModal('${key}', 'second')">
                    <span class="course-badge">2º</span>
                    <span class="meal-name">${secondDish ? secondDish.name : 'Vaciado'}</span>
                </div>
            `;
            dayCard.appendChild(slot);
        });

        grid.appendChild(dayCard);
    });
}

// Dish Selection Modal
let currentSlotKey = null;
let currentCourseType = null;

function openSelectModal(key, courseType) {
    currentSlotKey = key;
    currentCourseType = courseType;
    document.getElementById('selectModalTitle').innerText = `Seleccionar ${courseType === 'first' ? '1º Plato' : '2º Plato'}`;
    document.getElementById('modalDishSearch').value = '';
    renderSelectModalList();
    document.getElementById('selectDishModal').style.display = 'flex';
}

function renderSelectModalList() {
    const searchTerm = document.getElementById('modalDishSearch').value.toLowerCase();
    const list = document.getElementById('dishSelectorList');
    list.innerHTML = '';

    const filtered = state.dishes.filter(dish => dish.name.toLowerCase().includes(searchTerm));

    filtered.forEach(dish => {
        const div = document.createElement('div');
        div.className = 'ingredient-item';
        div.style.cursor = 'pointer';
        div.innerHTML = `<span>${dish.name}</span>`;
        div.onclick = () => selectDish(dish.id);
        list.appendChild(div);
    });

    const noneDiv = document.createElement('div');
    noneDiv.className = 'ingredient-item';
    noneDiv.innerHTML = `<span style="color: var(--danger)">Quitar plato</span>`;
    noneDiv.onclick = () => selectDish(null);
    list.appendChild(noneDiv);
}

async function selectDish(dishId) {
    if (!state.weeklyMenu[currentSlotKey] || typeof state.weeklyMenu[currentSlotKey] !== 'object') {
        state.weeklyMenu[currentSlotKey] = { first: null, second: null };
    }
    
    state.weeklyMenu[currentSlotKey][currentCourseType] = dishId;
    
    await saveState('weekly_menu', state.weeklyMenu);
    renderWeek();
    closeSelectModal();
}


function closeSelectModal() {
    document.getElementById('selectDishModal').style.display = 'none';
}

// Dish Management
function renderDishes() {
    const grid = document.getElementById('dishGrid');
    grid.innerHTML = '';
    const searchTerm = document.getElementById('dishSearch') ? document.getElementById('dishSearch').value.toLowerCase() : '';

    state.dishes.filter(d => d.name.toLowerCase().includes(searchTerm)).forEach(dish => {
        const card = document.createElement('div');
        card.className = 'dish-card';
        card.innerHTML = `
            <div class="dish-info">
                <h3>${dish.name}</h3>
                <p class="dish-ingredients-count">${dish.ingredients.length} ingredientes</p>
                <div style="margin-top: 1rem; display: flex; gap: 10px;">
                    <button class="btn" style="padding: 4px 8px; font-size: 0.8rem; background: var(--glass-bg);" onclick="deleteDish(${dish.id})">Eliminar</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openDishModal() {
    document.getElementById('dishModal').style.display = 'flex';
    document.getElementById('ingredientInputs').innerHTML = `
        <div class="ingredient-row" style="display: flex; gap: 5px; margin-bottom: 5px;">
            <input type="text" placeholder="Ingrediente" class="ing-name" required>
            <input type="text" placeholder="Cant." style="width: 80px;" class="ing-qty">
            <input type="text" placeholder="Ud." style="width: 60px;" class="ing-unit">
        </div>
    `;
}

function closeDishModal() {
    document.getElementById('dishModal').style.display = 'none';
}

function addIngredientRow() {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.style.display = 'flex';
    row.style.gap = '5px';
    row.style.marginBottom = '5px';
    row.innerHTML = `
        <input type="text" placeholder="Ingrediente" class="ing-name" required>
        <input type="text" placeholder="Cant." style="width: 80px;" class="ing-qty">
        <input type="text" placeholder="Ud." style="width: 60px;" class="ing-unit">
    `;
    document.getElementById('ingredientInputs').appendChild(row);
}

document.getElementById('dishForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('dishName').value;
    const rows = document.querySelectorAll('.ingredient-row');
    const ingredients = [];

    rows.forEach(row => {
        const iName = row.querySelector('.ing-name').value;
        const iQty = row.querySelector('.ing-qty').value;
        const iUnit = row.querySelector('.ing-unit').value;
        if (iName) ingredients.push({ name: iName, qty: iQty, unit: iUnit });
    });

    const newDish = {
        name,
        ingredients
    };

    showSync('Guardando plato...');
    const { error } = await _supabase.from('gp_dishes').insert([newDish]);
    
    if (error) {
        alert('Error al guardar el plato: ' + error.message);
    } else {
        closeDishModal();
        e.target.reset();
        showSync('Plato guardado');
    }
};

async function deleteDish(id) {
    if (confirm('¿Seguro que quieres eliminar este plato? Se quitará de todos los menús donde esté asignado.')) {
        showSync('Eliminando...');
        const { error } = await _supabase.from('gp_dishes').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        showSync('Eliminado');
    }
}

// Shopping List & Inventory
function renderShoppingList() {
    const itemsContainer = document.getElementById('shoppingItems');
    itemsContainer.innerHTML = '';
    const searchTerm = document.getElementById('shoppingSearch') ? document.getElementById('shoppingSearch').value.toLowerCase() : '';

    // Aggregate ingredients from all dishes in the weekly menu
    const needed = {};

    Object.values(state.weeklyMenu).forEach(mealData => {
        const ids = typeof mealData === 'object' ? [mealData.first, mealData.second] : [mealData];
        ids.forEach(dishId => {
            const dish = state.dishes.find(d => d.id === dishId);
            if (!dish) return;

            dish.ingredients.forEach(ing => {
                const key = ing.name.toLowerCase();
                if (!needed[key]) {
                    needed[key] = { name: ing.name, qty: 0, unit: ing.unit, originalNames: new Set() };
                }
                const qtyNum = parseFloat(ing.qty);
                if (!isNaN(qtyNum)) needed[key].qty += qtyNum;
                else needed[key].qtyNote = ing.qty; 
                needed[key].originalNames.add(ing.name);
            });
        });
    });

    const filteredKeys = Object.keys(needed).filter(k => k.includes(searchTerm)).sort();

    if (filteredKeys.length === 0) {
        itemsContainer.innerHTML = '<p style="text-align: center; color: var(--text-dim);">No se encontraron ingredientes.</p>';
        return;
    }

    filteredKeys.forEach(key => {
        const item = needed[key];
        const isStocked = state.inventory[key] || false;

        const div = document.createElement('div');
        div.className = `ingredient-item ${isStocked ? 'stocked' : ''}`;
        
        const displayQty = item.qty > 0 ? `${item.qty} ${item.unit}` : (item.qtyNote || '');

        div.innerHTML = `
            <div>
                <span style="font-weight: 600;">${item.name}</span>
                <span style="font-size: 0.8rem; color: var(--text-dim); margin-left: 10px;">${displayQty}</span>
            </div>
            <div class="item-actions">
                <button class="btn" style="background: ${isStocked ? 'var(--accent-primary)' : 'var(--glass-bg)'}; padding: 5px 10px; font-size: 0.7rem;" 
                    onclick="toggleInventory('${key}')">
                    ${isStocked ? 'En Casa' : '¿Lo tengo?'}
                </button>
            </div>
        `;
        itemsContainer.appendChild(div);
    });
}

async function toggleInventory(key) {
    state.inventory[key] = !state.inventory[key];
    await saveState('inventory', state.inventory);
    renderShoppingList();
}

function generateShoppingList() {
    renderShoppingList();
}

async function resetWeek() {
    if (confirm('¿Estás seguro de que quieres limpiar el menú de toda la semana?')) {
        state.weeklyMenu = {};
        await saveState('weekly_menu', state.weeklyMenu);
        renderWeek();
    }
}

// Data Persistence
async function loadInitialData() {
    showSync('Cargando datos...', 0);
    
    // Fetch dishes
    const { data: dishes } = await _supabase.from('gp_dishes').select('*').order('name');
    state.dishes = dishes || [];

    // Fetch state (menu and inventory)
    const { data: globalState } = await _supabase.from('gp_state').select('*');
    if (globalState) {
        const menu = globalState.find(s => s.key === 'weekly_menu');
        const inventory = globalState.find(s => s.key === 'inventory');
        if (menu) state.weeklyMenu = menu.value;
        if (inventory) state.inventory = inventory.value;
    }

    renderWeek();
    renderDishes();
    renderShoppingList();
    showSync('Conectado');
}

async function saveState(key, value) {
    showSync('Guardando...');
    if (key === 'dishes') {
        // Dishes are handled by specific insert/delete functions to avoid full table rewrite
        return;
    }
    
    const { error } = await _supabase
        .from('gp_state')
        .upsert({ key: key, value: value });

    if (error) console.error('Error saving state:', error);
    showSync('Sincronizado');
}

// Realtime Subscriptions
function setupRealtime() {
    _supabase
        .channel('public:gp_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_state' }, payload => {
            const { key, value } = payload.new;
            if (key === 'weekly_menu') state.weeklyMenu = value;
            if (key === 'inventory') state.inventory = value;
            renderWeek();
            renderShoppingList();
            showSync('Actualización remota');
        })
        .subscribe();

    _supabase
        .channel('public:gp_dishes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_dishes' }, async () => {
            const { data } = await _supabase.from('gp_dishes').select('*').order('name');
            state.dishes = data || [];
            renderDishes();
            renderWeek();
            renderShoppingList();
            showSync('Platos actualizados');
        })
        .subscribe();
}

// Settings Modal
function openSettingsModal() {
    document.getElementById('clientId').value = state.settings.clientId;
    document.getElementById('apiKey').value = state.settings.apiKey;
    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

document.getElementById('settingsForm').onsubmit = (e) => {
    e.preventDefault();
    state.settings.clientId = document.getElementById('clientId').value;
    state.settings.apiKey = document.getElementById('apiKey').value;
    localStorage.setItem('gp_settings', JSON.stringify(state.settings));
    closeSettingsModal();
    alert('Configuración guardada localmente.');
    location.reload(); 
};

// Google API Integration
function gapiLoaded() {
    gapi.load('client', intializeGapiClient);
}

async function intializeGapiClient() {
    if (!state.settings.apiKey) return;
    await gapi.client.init({
        apiKey: state.settings.apiKey,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
}

function gisLoaded() {
    if (!state.settings.clientId) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.settings.clientId,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
}

async function handleSyncClick() {
    if (!state.settings.clientId || !state.settings.apiKey) {
        alert('Por favor, configura tu Client ID y API Key en el menú de Configuración primero.');
        openSettingsModal();
        return;
    }

    const syncBtn = document.getElementById('syncBtn');
    const originalText = syncBtn.innerHTML;
    syncBtn.disabled = true;
    syncBtn.innerHTML = 'Sincronizando...';

    try {
        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                throw resp;
            }
            await syncData();
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
            alert('¡Sincronización completada con éxito!');
        };

        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    } catch (err) {
        console.error(err);
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalText;
        alert('Error en la sincronización. Revisa la consola para más detalles.');
    }
}

async function syncData() {
    // 1. Prepare data
    const ingredients = [];
    ingredients.push(['Ingrediente', 'Cantidad', 'Estado']);

    const needed = {};
    Object.values(state.weeklyMenu).forEach(mealData => {
        const ids = typeof mealData === 'object' ? [mealData.first, mealData.second] : [mealData];
        ids.forEach(dishId => {
            const dish = state.dishes.find(d => d.id === dishId);
            if (!dish) return;
            dish.ingredients.forEach(ing => {
                const key = ing.name.toLowerCase();
                if (!needed[key]) needed[key] = { name: ing.name, qty: 0, unit: ing.unit };
                const qtyNum = parseFloat(ing.qty);
                if (!isNaN(qtyNum)) needed[key].qty += qtyNum;
            });
        });
    });

    Object.keys(needed).sort().forEach(key => {
        const item = needed[key];
        const isStocked = state.inventory[key] || false;
        ingredients.push([item.name, `${item.qty} ${item.unit}`, isStocked ? 'En Casa' : 'COMPRAR']);
    });

    // 2. Create or find Spreadsheet (Simplified: Create a new one each time or provide a fixed ID)
    // For this demo, we'll create a new spreadsheet and log the URL
    const response = await gapi.client.sheets.spreadsheets.create({
        resource: {
            properties: { title: `Gourmet Planner - ${new Date().toLocaleDateString()}` }
        }
    });
    
    const spreadsheetId = response.result.spreadsheetId;
    
    // 3. Write data
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        resource: { values: ingredients }
    });

    window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank');
}

// Initial Render
window.onload = async () => {
    await loadInitialData();
    setupRealtime();
    
    setTimeout(() => {
        if (typeof gapi !== 'undefined') gapiLoaded();
        if (typeof google !== 'undefined') gisLoaded();
    }, 1000);
};
