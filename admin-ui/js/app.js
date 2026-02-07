import { getHealth, getCars, deleteCar as apiDeleteCar } from './api.js';
import { renderTable } from './render.js';
import { initForm, openDrawer, updateAutocomplete } from './form.js';
import { notify } from './notify.js';

// --- СОСТОЯНИЕ (STATE) ---
let carsCache = [];      // Все загруженные авто
let filteredCars = [];   // Авто после поиска и фильтров
let currentPage = 1;     // Текущая страница
let itemsPerPage = 10;   // Авто на странице

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DipTrade Admin started...");

    // 1. Проверка API
    const isOnline = await getHealth();
    updateStatusUI(isOnline);

    // 2. Настройка фильтров и пагинации
    setupFilters();

    // 3. Инициализация формы
    initForm(window.loadData);

    // 4. Загрузка данных
    await window.loadData();
});

// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ ---
window.loadData = async () => {
    const tableBody = document.getElementById('cars-table-body');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">↻ Обновление данных...</td></tr>';

    try {
        carsCache = await getCars();
        console.log(`Загружено ${carsCache.length} авто`);
        
        updateAutocomplete(carsCache);
        applyFilters(); // Это запустит рендер
        
        // Снять фокус с кнопки обновления
        const refreshBtn = document.getElementById('refresh-btn');
        if(refreshBtn) refreshBtn.blur();

    } catch (e) {
        console.error(e);
        notify.error("Ошибка загрузки данных");
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center;">Ошибка подключения</td></tr>';
    }
};

window.openDrawer = (car = null) => openDrawer(car);

window.editCar = (id) => {
    const car = carsCache.find(c => c.id == id);
    if (car) openDrawer(car);
};

window.deleteCar = async (id) => {
    if (!confirm(`Вы точно хотите удалить автомобиль #${id}?`)) return;
    try {
        await apiDeleteCar(id);
        notify.success(`Автомобиль #${id} удален`);
        await window.loadData();
    } catch (e) {
        console.error(e);
        notify.error("Ошибка удаления: " + e.message);
    }
};

// --- ФИЛЬТРАЦИЯ И ПАГИНАЦИЯ ---
function setupFilters() {
    const searchInput = document.getElementById('search-input');
    const countryFilter = document.getElementById('filter-country');
    const statusFilter = document.getElementById('filter-status');
    const resetBtn = document.getElementById('reset-filters-btn');
    
    const pageSizeSelect = document.getElementById('items-per-page');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    const onFilterChange = () => {
        currentPage = 1; 
        applyFilters();
    };

    if(searchInput) searchInput.addEventListener('input', onFilterChange);
    if(countryFilter) countryFilter.addEventListener('change', onFilterChange);
    if(statusFilter) statusFilter.addEventListener('change', onFilterChange);

    if(resetBtn) resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        countryFilter.value = 'all';
        statusFilter.value = 'all';
        onFilterChange();
    });

    if(pageSizeSelect) pageSizeSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderPage();
    });

    if(prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
        }
    });

    if(nextBtn) nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredCars.length / itemsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderPage();
        }
    });
}

function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const country = document.getElementById('filter-country').value;
    const status = document.getElementById('filter-status').value;

    filteredCars = carsCache.filter(car => {
        // Поиск
        if (search) {
            const searchStr = `${car.id} ${car.brand} ${car.model} ${car.web_title || ''} ${car.price || ''}`.toLowerCase();
            if (!searchStr.includes(search)) return false;
        }
        // Страна
        if (country !== 'all' && car.country_code !== country) return false;
        // Статус
        if (status !== 'all') {
            if (status === 'active' && (!car.is_visible || car.is_sold)) return false;
            if (status === 'stock' && !car.in_stock) return false;
            if (status === 'sold' && !car.is_sold) return false;
            if (status === 'hidden' && car.is_visible) return false;
        }
        return true;
    });

    renderPage();
    updateStats(carsCache);
}

function renderPage() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredCars.slice(start, end);
    
    renderTable(pageData);
    updatePaginationUI();
}

function updatePaginationUI() {
    const total = filteredCars.length;
    const maxPage = Math.ceil(total / itemsPerPage) || 1;
    
    const start = (currentPage - 1) * itemsPerPage + 1;
    let end = currentPage * itemsPerPage;
    if (end > total) end = total;
    
    const shownText = total === 0 ? '0' : `${start}-${end}`;
    
    document.getElementById('shown-count').textContent = shownText;
    document.getElementById('total-count').textContent = total;
    document.getElementById('current-page-label').textContent = `${currentPage} / ${maxPage}`;
    
    document.getElementById('prev-page-btn').disabled = (currentPage === 1);
    document.getElementById('next-page-btn').disabled = (currentPage >= maxPage);
}

function updateStatusUI(isOnline) {
    const dot = document.getElementById('api-dot');
    const text = document.getElementById('server-status');
    if (isOnline) {
        if(text) text.textContent = "Online";
        if(dot) dot.classList.add('online-dot');
    } else {
        if(text) text.textContent = "Offline";
        if(dot) dot.classList.remove('online-dot');
        notify.error("Нет связи с сервером!");
    }
}

function updateStats(cars) {
    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setStat('stat-total', cars.length);
    setStat('stat-active', cars.filter(c => c.is_visible && !c.is_sold).length);
    setStat('stat-sold', cars.filter(c => c.is_sold).length);
    setStat('stat-hidden', cars.filter(c => !c.is_visible).length);
}