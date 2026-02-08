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
        
        // Принудительно запускаем фильтрацию, чтобы отрисовать таблицу
        applyFilters(); 
        
        // Снять фокус с кнопки обновления (если есть)
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
    const car = carsCache.find(c => c.id == id); // Используем == для нестрогого сравнения (строка/число)
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

// Основная функция применения фильтров
function applyFilters() {
    const searchInput = document.getElementById('search-input');
    const countryFilter = document.getElementById('filter-country');
    const statusFilter = document.getElementById('filter-status');

    // Получаем значения (защита от null, если элементов нет на странице)
    const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const country = countryFilter ? countryFilter.value : '';
    const status = statusFilter ? statusFilter.value : 'all';

    filteredCars = carsCache.filter(car => {
        // 1. Поиск (Search)
        if (search) {
            const searchStr = `${car.id} ${car.brand} ${car.model} ${car.web_title || ''} ${car.price || ''}`.toLowerCase();
            if (!searchStr.includes(search)) return false;
        }

        // 2. Страна (Country)
        // Логика: если выбрано что-то (KR/CN/RU) И это не 'all', то проверяем совпадение
        if (country && country !== 'all') {
            if (car.country_code !== country) return false;
        }

        // 3. Статус (Status)
        if (status && status !== 'all') {
            if (status === 'active' && (!car.is_visible || car.is_sold)) return false;
            if (status === 'featured' && !car.featured) return false;
            if (status === 'auction' && !car.is_auction) return false;
            if (status === 'stock' && !car.in_stock) return false;
            if (status === 'sold' && !car.is_sold) return false;
            if (status === 'hidden' && car.is_visible) return false;
        }

        return true;
    });

    // Сбрасываем на 1 страницу при любой фильтрации (кроме пагинации)
    // Но renderPage вызывается отдельно
    renderPage();
    updateStats(carsCache);
}

function setupFilters() {
    const searchInput = document.getElementById('search-input');
    const countryFilter = document.getElementById('filter-country');
    const statusFilter = document.getElementById('filter-status');
    const resetBtn = document.getElementById('reset-filters-btn');
    
    const pageSizeSelect = document.getElementById('items-per-page');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    // Функция-обертка, чтобы сбрасывать страницу на 1 при поиске
    const onFilterInput = () => {
        currentPage = 1; 
        applyFilters();
    };

    // === ЛОГИКА ФЛАГА В ФИЛЬТРЕ ===
    const updateFilterFlag = () => {
        const val = countryFilter.value;
        // Если выбрана конкретная страна (не пустая строка и не 'all')
        if (val && val !== 'all') {
            countryFilter.style.backgroundImage = `url('assets/flags/${val}.png')`;
        } else {
            countryFilter.style.backgroundImage = 'none';
        }
    };

    // Слушатели событий
    if(searchInput) searchInput.addEventListener('input', onFilterInput);
    
    if(countryFilter) {
        countryFilter.addEventListener('change', () => {
            updateFilterFlag();
            onFilterInput();
        });
        // Инициализация флага при загрузке
        updateFilterFlag();
    }

    if(statusFilter) statusFilter.addEventListener('change', onFilterInput);

    if(resetBtn) resetBtn.addEventListener('click', () => {
        if(searchInput) searchInput.value = '';
        if(countryFilter) countryFilter.value = ''; // Сброс на "Все страны" (value="")
        if(statusFilter) statusFilter.value = 'all';
        
        updateFilterFlag(); // Убираем флаг
        onFilterInput();
    });

    // Пагинация
    if(pageSizeSelect) pageSizeSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderPage(); // Тут не надо applyFilters, данные те же
    });

    if(prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
        }
    });

    if(nextBtn) nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredCars.length / itemsPerPage) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderPage();
        }
    });
}

function renderPage() {
    const total = filteredCars.length;
    const maxPage = Math.ceil(total / itemsPerPage) || 1;
    
    // Защита от улетания страницы (если фильтр сократил список)
    if (currentPage > maxPage) currentPage = maxPage;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredCars.slice(start, end);
    
    renderTable(pageData);
    updatePaginationUI(total, maxPage);
}

function updatePaginationUI(total, maxPage) {
    const start = total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    let end = currentPage * itemsPerPage;
    if (end > total) end = total;
    
    const shownText = total === 0 ? '0' : `${start}-${end}`;
    
    const shownEl = document.getElementById('shown-count');
    const totalEl = document.getElementById('total-count');
    const pageLabel = document.getElementById('current-page-label');
    
    if(shownEl) shownEl.textContent = shownText;
    if(totalEl) totalEl.textContent = total;
    if(pageLabel) pageLabel.textContent = `${currentPage} / ${maxPage}`;
    
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    if(prevBtn) prevBtn.disabled = (currentPage === 1 || total === 0);
    if(nextBtn) nextBtn.disabled = (currentPage >= maxPage || total === 0);
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