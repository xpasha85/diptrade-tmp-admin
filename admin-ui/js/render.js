import { API_BASE } from './api.js';

export function renderTable(cars) {
    // 1. Обновляем заголовки таблицы
    const thead = document.querySelector('table thead tr');
    if (thead) {
        thead.innerHTML = `
            <th style="width: 80px;">ID / Дата</th>
            <th style="width: 80px;">Фото</th>
            <th>Автомобиль</th>
            <th>Характеристики</th>
            <th>Цена</th>
            <th>Статус</th>
            <th style="text-align: right;">Действия</th>
        `;
    }

    const tbody = document.getElementById('cars-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (cars.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">Нет автомобилей</td></tr>';
        return;
    }

    // Сортировка: Сначала новые
    const sortedCars = [...cars].sort((a, b) => new Date(b.added_at) - new Date(a.added_at));

    sortedCars.forEach(car => {
        const tr = document.createElement('tr');
        
        // Полупрозрачность для скрытых
        if (!car.is_visible) tr.classList.add('row-hidden');

        // --- 1. ID и ДАТА (Формат 07.02 или --) ---
        let dateStr = '--';
        try {
            if (car.added_at) {
                const dateObj = new Date(car.added_at);
                // Проверка на корректность даты
                if (!isNaN(dateObj.getTime())) {
                    dateStr = dateObj.toLocaleDateString('ru-RU', { 
                        day: '2-digit', 
                        month: '2-digit' 
                    });
                }
            }
        } catch (e) {
            console.warn("Ошибка даты:", e);
        }

        const idHtml = `
            <div class="id-block">
                <strong>#${car.id}</strong>
                <small class="text-muted">${dateStr}</small>
            </div>
        `;

        // --- 2. ФОТО ---
        const photoUrl = (car.photos && car.photos.length > 0)
            ? `${API_BASE}/assets/cars/${car.assets_folder}/${car.photos[0]}`
            : null;
        const thumbHtml = photoUrl 
            ? `<img src="${photoUrl}" class="table-thumb" loading="lazy" alt="img">`
            : `<div class="no-photo">Нет фото</div>`;

        // --- 3. АВТОМОБИЛЬ (Год/Месяц + Страна) ---
        const yearStr = car.month 
            ? `${car.year}/${String(car.month).padStart(2, '0')}` 
            : `${car.year}`;
        
        const flags = { 'KR': '🇰🇷', 'CN': '🇨🇳', 'RU': '🇷🇺' };
        const countryFlag = flags[car.country_code] || car.country_code || 'KR';

        let icons = '';
        if (car.featured) icons += '<span title="На главной">⭐</span> ';
        if (!car.is_visible) icons += '<span title="Скрыто">👁️‍🗨️</span> ';

        const carInfoHtml = `
            <div class="car-title">
                ${icons} <strong>${car.brand} ${car.model}</strong>
            </div>
            <div class="car-meta text-muted">
                ${countryFlag} ${yearStr}
            </div>
        `;

        // --- 4. ХАРАКТЕРИСТИКИ ---
        const specs = car.specs || {};

        // СТРОКА 1: Мощность • Топливо
        // Если л.с. нет — ставим --
        const hpStr = specs.hp ? `${specs.hp} л.с.` : '--';
        const fuelStr = specs.fuel || '--';
        const line1 = `${hpStr} • ${fuelStr}`;

        // СТРОКА 2: Объем (Литры) • 4WD • Пробег
        
        // 1. Превращаем объем в литры (2198 -> 2.2 л.)
        let volStr = '--';
        if (specs.volume) {
            // Делим на 1000 и округляем до 1 знака
            volStr = (parseInt(specs.volume) / 1000).toFixed(1) + ' л.';
        }

                // 3. Собираем массив частей, чтобы красиво соединить точками
        let line2Parts = [volStr];
        
                
        line2Parts.push(`${(specs.mileage || 0).toLocaleString()} км`);

        // Соединяем через буллит " • "
        const line2 = line2Parts.join(' • ');

        const specsHtml = `
            <small class="specs-text">
                ${line1} <br>
                ${line2}
            </small>
        `;

        // --- 5. ЦЕНА ---
        let priceVal = (typeof car.price === 'object' && car.price !== null) 
            ? car.price.total_rub 
            : car.price;
        const formattedPrice = (priceVal || 0).toLocaleString('ru-RU') + ' ₽';

        // --- 6. БЕЙДЖИ ---
        const badgesHtml = `<div class="badges-stack">${getBadgesHtml(car)}</div>`;

        // СБОРКА
        tr.innerHTML = `
            <td>${idHtml}</td>
            <td class="thumb-cell">${thumbHtml}</td>
            <td>${carInfoHtml}</td>
            <td>${specsHtml}</td>
            <td><strong>${formattedPrice}</strong></td>
            <td>${badgesHtml}</td>
            <td class="actions-cell">
                <button class="action-btn btn-edit" onclick="editCar(${car.id})" title="Редактировать">✎</button>
                <button class="action-btn btn-delete" onclick="deleteCar(${car.id})" title="Удалить">×</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function getBadgesHtml(car) {
    let html = '';
    if (car.is_sold) {
        html += `<span class="badge sold">Продано</span>`;
    } else if (car.in_stock) {
        html += `<span class="badge stock">В наличии</span>`;
    } else {
        html += `<span class="badge order">Под заказ</span>`;
    }

    if (car.is_auction) {
        html += `<span class="badge auction">Аукцион</span>`;
    }
    return html;
}