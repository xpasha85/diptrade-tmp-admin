import { getHealth, getCars } from './api.js';
import { renderTable } from './render.js';
import { initForm, openDrawer, updateAutocomplete } from './form.js';
import { notify } from './notify.js'; // Импортируем тосты
import { deleteCar as apiDeleteCar } from './api.js'; // Импортируем API

let carsCache = []; // Храним загруженные авто

async function init() {
    console.log("DipTrade Admin started...");

    // 1. Проверяем API
    const statusBadge = document.getElementById('server-status');
    const isOnline = await getHealth();
    if (isOnline) {
        statusBadge.textContent = "API: Online";
        statusBadge.classList.add('online');
    } else {
        statusBadge.textContent = "API: Offline";
        statusBadge.classList.add('offline');
        alert("Нет связи с сервером!");
        return;
    }

    // 2. Инициализация Формы
    initForm(loadData); // Передаем функцию обновления таблицы

    // 3. Загружаем данные
    await loadData();

    // 4. Кнопки
    document.getElementById('refresh-btn')?.addEventListener('click', loadData);
    
    // Добавь кнопку "Добавить авто" в HTML, если её нет, или создай программно в toolbar
    setupAddButton();
}

async function loadData() {
    const tableBody = document.getElementById('cars-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" aria-busy="true">Обновление...</td></tr>';

    carsCache = await getCars();
    console.log(`Загружено ${carsCache.length} авто`);
    
    renderTable(carsCache);
    updateAutocomplete(carsCache); // Обновляем подсказки
}

function setupAddButton() {
    // Ищем кнопку или создаем в тулбаре (рядом с заголовком)
    let addBtn = document.getElementById('add-car-btn');
    if (!addBtn) {
        const hgroup = document.querySelector('hgroup');
        addBtn = document.createElement('button');
        addBtn.id = 'add-car-btn';
        addBtn.textContent = '+ Добавить';
        addBtn.onclick = () => openDrawer(null); // Открыть пустую форму
        hgroup.appendChild(addBtn);
    }
}

// Глобальная функция для кнопки "Редактировать" из таблицы
window.editCar = (id) => {
    const car = carsCache.find(c => c.id == id);
    if (car) openDrawer(car);
};

// Глобальная функция удаления
window.deleteCar = async (id) => {
    if (!confirm(`Вы точно хотите удалить автомобиль #${id}? Это действие нельзя отменить.`)) return;

    try {
        await apiDeleteCar(id);
        notify.success(`Автомобиль #${id} удален`);
        await loadData(); // Перерисовываем таблицу
    } catch (e) {
        console.error(e);
        notify.error("Ошибка удаления: " + e.message);
    }
};

init();