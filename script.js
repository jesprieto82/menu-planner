// Supabase Configuration
const SUPABASE_URL = 'https://przktwequebpukoeczwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByemt0d2VxdWVicHVrb2VjendhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzgzMTUsImV4cCI6MjA5MjYxNDMxNX0.yxmVSYdKv6sKrd9S0uS9pA5Tu03cZ0QPJvTHZwlHp94';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Management
let state = {
    dishes: [],
    weeklyMenu: {},
    inventory: {},
    templates: [],
    settings: JSON.parse(localStorage.getItem('gp_settings')) || { clientId: '', apiKey: '' }
};

let editingDishId = null;
let currentTemplateId = null;

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
    renderShoppingList(); // Update shopping list if dish changed
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
                    <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="editDish(${dish.id})">Editar</button>
                    <button class="btn" style="padding: 4px 8px; font-size: 0.8rem; background: var(--glass-bg);" onclick="deleteDish(${dish.id})">Eliminar</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openDishModal(isEdit = false) {
    editingDishId = isEdit ? editingDishId : null;
    document.getElementById('modalTitle').innerText = isEdit ? 'Editar Plato' : 'Nuevo Plato';
    document.getElementById('dishModal').style.display = 'flex';
    
    if (!isEdit) {
        document.getElementById('dishName').value = '';
        document.getElementById('ingredientInputs').innerHTML = '';
        addIngredientRow();
    }
}

function closeDishModal() {
    document.getElementById('dishModal').style.display = 'none';
    editingDishId = null;
}

function addIngredientRow(name = '', qty = '', unit = '') {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.style.display = 'flex';
    row.style.gap = '5px';
    row.style.marginBottom = '5px';
    row.innerHTML = `
        <input type="text" placeholder="Ingrediente" class="ing-name" value="${name}" required>
        <input type="text" placeholder="Cant." style="width: 80px;" class="ing-qty" value="${qty}">
        <input type="text" placeholder="Ud." style="width: 60px;" class="ing-unit" value="${unit}">
        <button type="button" class="btn-danger-icon" onclick="removeIngredientRow(this)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg>
        </button>
    `;
    document.getElementById('ingredientInputs').appendChild(row);
}

function removeIngredientRow(btn) {
    const row = btn.closest('.ingredient-row');
    const allRows = document.querySelectorAll('.ingredient-row');
    if (allRows.length > 1) {
        row.remove();
    } else {
        // Clear instead of remove if it's the last one
        row.querySelectorAll('input').forEach(i => i.value = '');
    }
}

async function editDish(id) {
    const dish = state.dishes.find(d => d.id === id);
    if (!dish) return;

    editingDishId = id;
    openDishModal(true);
    
    document.getElementById('dishName').value = dish.name;
    const container = document.getElementById('ingredientInputs');
    container.innerHTML = '';
    
    if (dish.ingredients.length > 0) {
        dish.ingredients.forEach(ing => addIngredientRow(ing.name, ing.qty, ing.unit));
    } else {
        addIngredientRow();
    }
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

    const dishData = { name, ingredients };

    showSync('Guardando...');
    let error;

    if (editingDishId) {
        const { error: err } = await _supabase.from('gp_dishes').update(dishData).eq('id', editingDishId);
        error = err;
    } else {
        const { error: err } = await _supabase.from('gp_dishes').insert([dishData]);
        error = err;
    }
    
    if (error) {
        alert('Error al guardar: ' + error.message);
    } else {
        closeDishModal();
        e.target.reset();
        showSync('Guardado correctamente');
        
        // Instant local update (the Realtime listener will also trigger, but this ensures immediate feel)
        const { data } = await _supabase.from('gp_dishes').select('*').order('name');
        state.dishes = data || [];
        renderDishes();
        renderWeek();
        renderShoppingList();
    }
};

async function deleteDish(id) {
    if (confirm('¿Seguro que quieres eliminar este plato? Se quitará de todos los menús donde esté asignado.')) {
        showSync('Eliminando...');
        const { error } = await _supabase.from('gp_dishes').delete().eq('id', id);
        if (error) {
            alert('Error: ' + error.message);
        } else {
            showSync('Eliminado');
            const { data } = await _supabase.from('gp_dishes').select('*').order('name');
            state.dishes = data || [];
            renderDishes();
            renderWeek();
            renderShoppingList();
        }
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
        if (state.templates.length > 0) {
            // Instead of empty, revert to the first template as the new default baseline
            const defaultTemplate = state.templates[0];
            state.weeklyMenu = defaultTemplate.data;
            currentTemplateId = defaultTemplate.id;
            await saveState('weekly_menu', state.weeklyMenu);
            await saveState('active_template_id', currentTemplateId);
            showSync('Reestablecido al plan por defecto');
        } else {
            state.weeklyMenu = {};
            currentTemplateId = null;
            await saveState('weekly_menu', state.weeklyMenu);
            await saveState('active_template_id', null);
        }
        updateTemplateUI();
        renderWeek();
    }
}

function isMenuEmpty(menu) {
    if (!menu || Object.keys(menu).length === 0) return true;
    for (const key in menu) {
        const val = menu[key];
        if (typeof val === 'object' && val !== null) {
            if (val.first !== null || val.second !== null) return false;
        } else if (val !== null) {
            return false;
        }
    }
    return true;
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
        const activeTemplate = globalState.find(s => s.key === 'active_template_id');
        
        if (menu) state.weeklyMenu = menu.value;
        if (inventory) state.inventory = inventory.value;
        if (activeTemplate) currentTemplateId = activeTemplate.value;
    }

    // Fetch templates
    const { data: templates } = await _supabase.from('gp_templates').select('*').order('name');
    state.templates = templates || [];

    // Force load a template if none is active and templates exist
    if (!currentTemplateId && state.templates.length > 0) {
        const defaultTemplate = state.templates[0];
        state.weeklyMenu = defaultTemplate.data;
        currentTemplateId = defaultTemplate.id;
        await saveState('weekly_menu', state.weeklyMenu);
        await saveState('active_template_id', currentTemplateId);
    }

    renderWeek();
    renderDishes();
    renderShoppingList();
    renderTemplates();
    showSync('Conectado');
}

function renderTemplates() {
    const select = document.getElementById('templateSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Cargar plan guardado...</option>';
    state.templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = t.name;
        if (currentTemplateId == t.id) opt.selected = true;
        select.appendChild(opt);
    });
    updateTemplateUI();
}

function updateTemplateUI() {
    const subLabel = document.getElementById('activePlanSub');
    const actions = document.getElementById('templateActions');
    const select = document.getElementById('templateSelect');
    if (!subLabel || !actions || !select) return;

    if (currentTemplateId) {
        const template = state.templates.find(t => t.id == currentTemplateId);
        if (template) {
            subLabel.innerText = `Plan: ${template.name}`;
            subLabel.style.display = 'block';
            actions.style.display = 'flex';
            select.value = currentTemplateId;
        }
    } else {
        subLabel.style.display = 'none';
        actions.style.display = 'none';
        select.value = "";
    }
}

async function saveAsTemplate() {
    const name = prompt('Nombre para este plan semanal (ej: Dieta Mediterránea, Semana 1):');
    if (!name) return;

    showSync('Guardando plantilla...');
    const { data, error } = await _supabase.from('gp_templates').insert([{
        name: name,
        data: state.weeklyMenu
    }]).select();

    if (error) {
        alert('Error: ' + error.message);
    } else {
        if (data && data[0]) {
            currentTemplateId = data[0].id;
            await saveState('active_template_id', currentTemplateId);
        }
        showSync('Plantilla guardada');
    }
}

async function updateTemplate() {
    if (!currentTemplateId) return;
    const template = state.templates.find(t => t.id == currentTemplateId);
    
    if (confirm(`¿Quieres actualizar la plantilla "${template.name}" con los cambios actuales?`)) {
        showSync('Actualizando...');
        const { error } = await _supabase
            .from('gp_templates')
            .update({ data: state.weeklyMenu })
            .eq('id', currentTemplateId);
            
        if (error) alert('Error: ' + error.message);
        else showSync('Plantilla actualizada');
    }
}

async function deleteTemplate() {
    if (!currentTemplateId) return;
    const template = state.templates.find(t => t.id == currentTemplateId);

    if (confirm(`¿Estás seguro de que quieres eliminar la plantilla "${template.name}"?`)) {
        showSync('Eliminando...');
        const { error } = await _supabase.from('gp_templates').delete().eq('id', currentTemplateId);
        
        if (error) {
            alert('Error: ' + error.message);
        } else {
            currentTemplateId = null;
            showSync('Eliminado');
        }
    }
}

async function loadTemplate(id) {
    const template = state.templates.find(t => t.id == id);
    if (!template) return;

    if (confirm(`¿Quieres cargar el plan "${template.name}"? Esto sobrescribirá el plan actual.`)) {
        state.weeklyMenu = template.data;
        currentTemplateId = id;
        await saveState('weekly_menu', state.weeklyMenu);
        await saveState('active_template_id', currentTemplateId);
        renderWeek();
        renderShoppingList();
        updateTemplateUI();
        showSync('Plan cargado');
    } else {
        // Reset select if cancelled
        renderTemplates();
    }
}

async function resetInventory() {
    if (confirm('¿Quieres marcar TODOS los ingredientes del plan actual como "necesarios"? (Se limpiará tu despensa actual)')) {
        state.inventory = {};
        await saveState('inventory', state.inventory);
        renderShoppingList();
        showSync('Lista restablecida');
    }
}

async function shareMenu() {
    showSync('Generando imagen...', 0);
    
    // Create container for rendering
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    printContainer.style.width = '600px';
    printContainer.style.padding = '50px';
    printContainer.style.background = '#ffffff';
    printContainer.style.color = '#000000';
    printContainer.style.fontFamily = "'Inter', -apple-system, sans-serif";

    // Build Content
    let hasAnyFood = false;
    let html = `
        <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="margin: 0; font-size: 32px; letter-spacing: -1px;">Mi Menú Semanal</h1>
            <p style="color: #666; margin-top: 5px; font-size: 14px;">Generado por Gourmet Planner</p>
        </div>
    `;

    days.forEach(day => {
        let dayHasFood = false;
        let dayHtml = `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
                <h2 style="font-size: 18px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 15px;">${day}</h2>
        `;
        
        mealTypes.forEach(meal => {
            const key = `${day}-${meal}`;
            const mealData = state.weeklyMenu[key];
            if (mealData) {
                const firstId = typeof mealData === 'object' ? mealData.first : mealData;
                const secondId = typeof mealData === 'object' ? mealData.second : null;
                const firstDish = state.dishes.find(d => d.id === firstId);
                const secondDish = state.dishes.find(d => d.id === secondId);

                if (firstDish || secondDish) {
                    dayHasFood = true;
                    hasAnyFood = true;
                    dayHtml += `
                        <div style="margin-bottom: 15px; display: flex; align-items: flex-start;">
                            <div style="min-width: 100px; color: #888; font-size: 13px; font-weight: 600; text-transform: uppercase; padding-top: 4px;">${meal}</div>
                            <div style="flex: 1;">
                                ${firstDish ? `<div style="font-weight: 800; font-size: 20px; line-height: 1.2; margin-bottom: 4px;">${firstDish.name}</div>` : ''}
                                ${secondDish ? `<div style="font-weight: 800; font-size: 20px; line-height: 1.2;">${secondDish.name}</div>` : ''}
                            </div>
                        </div>
                    `;
                }
            }
        });

        dayHtml += `</div>`;
        if (dayHasFood) html += dayHtml;
    });

    if (!hasAnyFood) {
        alert('Agrega al menos un plato al menú antes de compartir.');
        showSync('Cancelado');
        return;
    }

    // Notes Section
    html += `
        <div style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 15px; color: #444;">NOTAS</div>
            <div style="border-bottom: 1px solid #eee; height: 35px;"></div>
            <div style="border-bottom: 1px solid #eee; height: 35px;"></div>
            <div style="border-bottom: 1px solid #eee; height: 35px;"></div>
        </div>
    `;

    printContainer.innerHTML = html;
    document.body.appendChild(printContainer);

    try {
        const canvas = await html2canvas(printContainer, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });
        
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `Menu-Semanal-${new Date().toISOString().split('T')[0]}.png`;
        link.href = image;
        link.click();
        showSync('¡Imagen lista!');
    } catch (err) {
        console.error('Error sharing menu:', err);
        alert('Hubo un problema al generar la imagen. Inténtalo de nuevo.');
    } finally {
        document.body.removeChild(printContainer);
    }
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

    _supabase
        .channel('public:gp_templates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_templates' }, async () => {
            const { data } = await _supabase.from('gp_templates').select('*').order('name');
            state.templates = data || [];
            renderTemplates();
            showSync('Plantillas actualizadas');
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
