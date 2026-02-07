import { API_BASE, uploadPhotos, deletePhoto, reorderPhotos } from './api.js';
import { notify } from './notify.js';

let currentCarId = null;
let originalServerPhotos = [];
let photoState = []; 

const DEFAULT_INTERNAL_COSTS = {
    'KR': 100000,
    'CN': 15000,
    'RU': 0
};

export function initForm(refreshCallback) {
    const dialog = document.getElementById('car-drawer');
    const form = document.getElementById('car-form');
    const closeBtn = document.getElementById('drawer-close');
    const cancelBtn = document.getElementById('drawer-cancel');

    initYearSelect();
    setupPhotoManager();
    setupAutoCapitalize(form);
    setupDynamicLogic(form);



    const close = () => {
        dialog.removeAttribute('open');
        currentCarId = null;
        cleanupPreviews();
    };
    
    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    form.onsubmit = async (e) => {
        e.preventDefault();
        await handleSave(form, refreshCallback);
    };

    // --- КНОПКА ПАРСИНГА (Вставка внутрь initForm) ---
    const parseBtn = document.getElementById('parse-btn');
    if (parseBtn) {
        parseBtn.onclick = async () => {
            await handleParseClipboard(form);
        };
    }

    
}

export function openDrawer(car = null) {
    const dialog = document.getElementById('car-drawer');
    const form = document.getElementById('car-form');
    const title = document.getElementById('drawer-title');
    
    form.reset();
    cleanupPreviews();
    
    // --- FIX: Принудительно скрываем блок подробностей ДТП ---
    // form.reset() снимает галочку, но div остается открытым с прошлого раза
    const accidentInputs = document.getElementById('accident-inputs');
    if (accidentInputs) accidentInputs.style.display = 'none';
    // ---------------------------------------------------------

    if (car) {
        // РЕДАКТИРОВАНИЕ
        currentCarId = car.id;
        originalServerPhotos = [...(car.photos || [])];
        photoState = originalServerPhotos.map(name => ({ type: 'server', name: name }));

        title.textContent = `Редактирование: ${car.brand} ${car.model}`;
        fillForm(form, car);
        
        togglePhotoManager(true);
        renderPhotoState(car.assets_folder);
    } else {
        // СОЗДАНИЕ
        currentCarId = null;
        originalServerPhotos = [];
        photoState = [];
        
        title.textContent = "Новый автомобиль";
        
        form.id.value = ""; 
        form.added_at.valueAsDate = new Date();
        form.country_code.value = "KR"; 
        form.year.value = new Date().getFullYear();
        form.vladivostok_services_rub.value = 100000;
        form.internal_costs_local.value = DEFAULT_INTERNAL_COSTS['KR']; // 100k по умолчанию

        togglePhotoManager(true); 
        renderPhotoState(null);
    }

    // Триггерим события
    form.country_code.dispatchEvent(new Event('change'));
    form.brand.dispatchEvent(new Event('input')); 

    dialog.setAttribute('open', true);
}


// --- ЛОГИКА ПАРСИНГА (AI PARSER) ---

async function handleParseClipboard(form) {
    try {
        // 1. Читаем буфер обмена
        const text = await navigator.clipboard.readText();
        if (!text) {
            notify.error("Буфер обмена пуст");
            return;
        }

        // 2. Парсим
        const result = parseCustomsText(text);

        if (result.success) {
            // 3. Заполняем поля (если нашли значения)
            if (result.registration) form.customs_clearance_rub.value = result.registration;
            if (result.duty) form.duty_rub.value = result.duty;
            if (result.recycling) form.recycling_fee_rub.value = result.recycling;

            notify.success(`Распознано:\nПошлина: ${result.duty}\nУтиль: ${result.recycling}\nОформление: ${result.registration}`);
        } else {
            notify.error("Не удалось найти данные таможни в тексте");
        }

    } catch (e) {
        console.error(e);
        // Если браузер блокирует чтение буфера (нет HTTPS), просим ввести вручную
        const manualText = prompt("Вставьте текст с таможенного калькулятора:");
        if (manualText) {
            const result = parseCustomsText(manualText);
            if (result.success) {
                if (result.registration) form.customs_clearance_rub.value = result.registration;
                if (result.duty) form.duty_rub.value = result.duty;
                if (result.recycling) form.recycling_fee_rub.value = result.recycling;
                notify.success("Данные распознаны!");
            }
        }
    }
}

function parseCustomsText(text) {
    // Убираем лишние переносы, чтобы искать проще
    const cleanText = text.replace(/\s+/g, ' ');

    // Хелпер для вытаскивания числа из строки
    const extractPrice = (regex) => {
        const match = cleanText.match(regex);
        if (match && match[1]) {
            // Убираем пробелы (4 924 -> 4924), меняем запятую на точку
            const raw = match[1].replace(/\s/g, '').replace(',', '.');
            return parseFloat(raw);
        }
        return 0;
    };

    // 1. Ищем Оформление ("Таможенное оформление ... 4924 ...")
    // Регулярка ищет фразу и первое число после нее
    const registration = extractPrice(/Таможенное оформление.*?([\d\s]+[.,]?\d{0,2})\s*руб/i);

    // 2. Ищем Полное Итого ("Итого с утилизационным сбором ... 4047331.89 ...")
    const grandTotal = extractPrice(/Итого с утилизационным сбором.*?([\d\s]+[.,]?\d{0,2})\s*руб/i);

    // 3. Ищем Таможенное Итого ("Итого ... 545731.89 ...")
    // Важно: ищем "Итого", после которого НЕТ слов "с утилизационным"
    // Но в твоем тексте проще: просто ищем "Итого X руб", это обычно первое вхождение перед гранд-итогом
    const customsTotal = extractPrice(/Итого\s+([\d\s]+[.,]?\d{0,2})\s*руб/i);

    let duty = 0;
    let recycling = 0;

    // Считаем Утиль = (Всего - Таможня)
    if (grandTotal > 0 && customsTotal > 0) {
        recycling = (grandTotal - customsTotal).toFixed(0); // Округляем до целых
    }

    // Считаем Пошлину = (Таможня - Оформление)
    if (customsTotal > 0 && registration > 0) {
        duty = (customsTotal - registration).toFixed(0);
    }

    // Проверка: нашли хоть что-то?
    const success = (duty > 0 || recycling > 0 || registration > 0);

    return {
        success,
        registration,
        duty,
        recycling
    };
}

// --- ДИНАМИКА ---

function setupDynamicLogic(form) {
    const countrySelect = form.country_code;
    const auctionBlock = document.getElementById('korea-auction-block');
    const accidentsBlock = document.getElementById('accidents-block');
    const accidentCheck = document.getElementById('has-accident-check');
    const accidentInputs = document.getElementById('accident-inputs');
    const brandInput = form.brand;
    const modelInput = form.model;
    const titleInput = form.web_title;

    countrySelect.onchange = () => {
        const val = countrySelect.value;
        const isKorea = val === 'KR';
        
        if (auctionBlock) auctionBlock.style.display = isKorea ? 'block' : 'none';
        if (accidentsBlock) accidentsBlock.style.display = isKorea ? 'block' : 'none';

        if (!currentCarId) {
            form.internal_costs_local.value = DEFAULT_INTERNAL_COSTS[val] || 0;
        }
    };

    if (accidentCheck) {
        accidentCheck.onchange = () => {
            accidentInputs.style.display = accidentCheck.checked ? 'block' : 'none';
        };
    }

    const updateTitle = () => {
        if (brandInput.value && modelInput.value) {
             if (!titleInput.value || titleInput.value.includes(brandInput.value)) {
                 titleInput.value = `${brandInput.value} ${modelInput.value}`;
             }
        }
    };
    brandInput.addEventListener('input', updateTitle);
    modelInput.addEventListener('input', updateTitle);
}

function initYearSelect() {
    const select = document.getElementById('year-select');
    if (!select) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 20;
    const endYear = currentYear + 1;

    select.innerHTML = '';
    for (let y = endYear; y >= startYear; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        select.appendChild(opt);
    }
}

// --- СБОРКА JSON (PAYLOAD) ---

function buildPayload(formData) {
    const getNum = (name) => {
        const val = formData.get(name);
        return (val && val.trim() !== '') ? Number(val) : undefined;
    };

    const payload = {
        added_at: formData.get('added_at'),
        web_title: formData.get('web_title'),
        brand: formData.get('brand'),
        model: formData.get('model'),
        year: getNum('year'),
        month: getNum('month'),
        price: getNum('price'),
        
        // Отправляем country_code
        country_code: formData.get('country_code'), 
        // Если сервер все еще требует поле 'country', дублируем:
        country: formData.get('country_code'),
        
        in_stock: formData.get('in_stock') === 'on',
        is_sold: formData.get('is_sold') === 'on',
        is_visible: formData.get('is_visible') === 'on',
        featured: formData.get('featured') === 'on',
        is_auction: formData.get('is_auction') === 'on',
        auction_benefit: getNum('auction_benefit'),
    };

    payload.specs = {
        volume: getNum('volume'),
        hp: getNum('hp'),
        fuel: formData.get('fuel'),
        transmission: formData.get('transmission'),
        mileage: getNum('mileage'),
        is_4wd: formData.get('is_4wd') === 'on'
    };

    payload.costs = {
        buyout: {
            car_price_local: getNum('car_price_local'),
            internal_costs_local: getNum('internal_costs_local')
        },
        russia: {
            duty_rub: getNum('duty_rub'),
            recycling_fee_rub: getNum('recycling_fee_rub'),
            customs_clearance_rub: getNum('customs_clearance_rub'),
            vladivostok_services_rub: getNum('vladivostok_services_rub')
        }
    };

    // --- ЛОГИКА ДТП (ИСПРАВЛЕНО) ---
    const hasAccident = document.getElementById('has-accident-check').checked;
    const isKorea = payload.country_code === 'KR';

    if (hasAccident) {
        // Галочка стоит -> отправляем данные
        payload.accidents = {
            count: getNum('accidents_count') || 1,
            damages_cost_won: getNum('damages_won'),
            damages_in_rub: getNum('damages_rub')
        };
    } else {
        // Галочка не стоит
        if (isKorea) {
            // Для Кореи явно пишем: ДТП нет (count: 0)
            payload.accidents = {
                count: 0,
                damages_cost_won: 0,
                damages_in_rub: 0
            };
        } else {
            // Для остальных стран null
            payload.accidents = null;
        }
    }

    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    return payload;
}

// --- ЗАПОЛНЕНИЕ ФОРМЫ (FILL) ---

function fillForm(form, car) {
    window.currentAssetsFolder = car.assets_folder;
    
    form.id.value = car.id;
    form.added_at.value = car.added_at || new Date().toISOString().split('T')[0];
    form.web_title.value = car.web_title || '';
    form.brand.value = car.brand || '';
    form.model.value = car.model || '';
    form.year.value = car.year || new Date().getFullYear();
    form.month.value = car.month || '';
    
    if (typeof car.price === 'object') {
        form.price.value = car.price.total_rub || '';
    } else {
        form.price.value = car.price || '';
    }
    
    form.country_code.value = car.country_code || car.country || 'KR';

    form.in_stock.checked = !!car.in_stock;
    form.is_sold.checked = !!car.is_sold;
    form.is_visible.checked = car.is_visible !== false;
    form.featured.checked = !!car.featured;
    form.is_auction.checked = !!car.is_auction;
    form.auction_benefit.value = car.auction_benefit || '';

    if (car.specs) {
        form.volume.value = car.specs.volume || '';
        form.hp.value = car.specs.hp || '';
        form.fuel.value = car.specs.fuel || 'Бензин';
        form.transmission.value = car.specs.transmission || 'Автомат';
        form.mileage.value = car.specs.mileage || '';
        form.is_4wd.checked = !!car.specs.is_4wd;
    } else {
        form.volume.value = ''; form.hp.value = ''; form.mileage.value = ''; form.is_4wd.checked = false;
    }

    form.car_price_local.value = car.costs?.buyout?.car_price_local || '';
    form.internal_costs_local.value = car.costs?.buyout?.internal_costs_local || '';
    
    form.duty_rub.value = car.costs?.russia?.duty_rub || '';
    form.recycling_fee_rub.value = car.costs?.russia?.recycling_fee_rub || '';
    form.customs_clearance_rub.value = car.costs?.russia?.customs_clearance_rub || '';
    form.vladivostok_services_rub.value = car.costs?.russia?.vladivostok_services_rub || '';

    // --- ЛОГИКА ДТП (ЧТЕНИЕ) ---
    // Галочку ставим только если accidents существует И кол-во > 0.
    // Если count: 0 (чистая история), галочка не стоит.
    const hasAccident = car.accidents && car.accidents.count > 0;
    
    const accidentCheck = document.getElementById('has-accident-check');
    if (accidentCheck) {
        accidentCheck.checked = hasAccident;
        document.getElementById('accident-inputs').style.display = hasAccident ? 'block' : 'none';
        
        if (hasAccident) {
            form.accidents_count.value = car.accidents.count || 1;
            form.damages_won.value = car.accidents.damages_cost_won || '';
            form.damages_rub.value = car.accidents.damages_in_rub || '';
        }
    }
    
    form.country_code.dispatchEvent(new Event('change'));
}


// --- СОХРАНЕНИЕ ---

async function handleSave(form, refreshCallback) {
    const formData = new FormData(form);
    const id = currentCarId; 
    const isNew = !id;
    const payload = buildPayload(formData);
    
    const btn = document.querySelector('button[form="car-form"]');
    const safeBtn = btn || { textContent: '', disabled: false };
    const originalBtnText = safeBtn.textContent;
    safeBtn.disabled = true;
    safeBtn.textContent = "Сохранение...";

    try {
        const url = isNew ? `${API_BASE}/cars` : `${API_BASE}/cars/${id}`;
        const method = isNew ? 'POST' : 'PATCH';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Ошибка валидации на сервере');
        }

        const serverData = await res.json();
        const savedCar = serverData.car || serverData;
        const targetId = savedCar.id;

        // ФОТО СИНХРОНИЗАЦИЯ
        if (!isNew) {
            const currentServerNames = photoState
                .filter(p => p.type === 'server')
                .map(p => p.name);
            
            const toDelete = originalServerPhotos.filter(name => !currentServerNames.includes(name));
            
            if (toDelete.length > 0) {
                await Promise.all(toDelete.map(name => deletePhoto(targetId, name)));
            }
        }

        const localItems = photoState.filter(p => p.type === 'local');
        let updatedCarData = savedCar;

        if (localItems.length > 0) {
            const files = localItems.map(p => p.file);
            const uploadRes = await uploadPhotos(targetId, files);
            updatedCarData = uploadRes.car || uploadRes;
        }

        const allServerPhotos = updatedCarData.photos || [];
        const newServerNames = allServerPhotos.slice(-localItems.length);
        
        let newNameIndex = 0;
        const finalOrder = photoState.map(item => {
            if (item.type === 'server') {
                return item.name;
            } else if (item.type === 'local') {
                return newServerNames[newNameIndex++] || item.name;
            }
        }).filter(name => name);

        if (JSON.stringify(finalOrder) !== JSON.stringify(allServerPhotos)) {
            await reorderPhotos(targetId, finalOrder);
        }

        notify.success(isNew ? `Автомобиль создан (ID: ${targetId})` : 'Изменения сохранены');
        
        if (refreshCallback) refreshCallback();
        
        document.getElementById('car-drawer').removeAttribute('open');
        cleanupPreviews();

    } catch (e) {
        console.error("SAVE FAILED:", e);
        notify.error('Ошибка сохранения: ' + e.message);
    } finally {
        safeBtn.disabled = false;
        safeBtn.textContent = originalBtnText;
    }
}


// --- МЕНЕДЖЕР ФОТО ---

function setupPhotoManager() {
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('photos-input');
    const grid = document.getElementById('photos-grid');

    if (!dropzone || !grid) return;

    dropzone.onclick = () => fileInput.click();

    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    
    dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        addFiles(e.dataTransfer.files);
    };
    
    fileInput.onchange = (e) => {
        addFiles(e.target.files);
        fileInput.value = ''; 
    };

    if (typeof Sortable !== 'undefined') {
        new Sortable(grid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                const movedItem = photoState.splice(oldIndex, 1)[0];
                photoState.splice(newIndex, 0, movedItem);
                updateMainBadges();
            }
        });
    }
}

function addFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        photoState.push({
            type: 'local',
            file: file,
            preview: URL.createObjectURL(file)
        });
    });

    renderPhotoState(getFolderHint());
}

function deletePhotoItem(index) {
    photoState.splice(index, 1);
    renderPhotoState(getFolderHint());
}

function renderPhotoState(folder) {
    const grid = document.getElementById('photos-grid');
    if (!grid) return;
    grid.innerHTML = '';

    photoState.forEach((item, index) => {
        const isMain = index === 0;
        const card = document.createElement('div');
        
        card.className = `photo-card ${isMain ? 'is-main' : ''} ${item.type === 'local' ? 'is-local' : ''}`;
        
        let src = '';
        if (item.type === 'server') {
            src = folder ? `${API_BASE}/assets/cars/${folder}/${item.name}` : '';
        } else {
            src = item.preview;
        }

        card.innerHTML = `
            <img src="${src}" loading="lazy">
            <button type="button" class="photo-delete-btn" title="Удалить">×</button>
        `;

        card.querySelector('.photo-delete-btn').onclick = (e) => {
            e.stopPropagation();
            const currentIdx = Array.from(grid.children).indexOf(card);
            deletePhotoItem(currentIdx);
        };

        grid.appendChild(card);
    });
}

function updateMainBadges() {
    const grid = document.getElementById('photos-grid');
    Array.from(grid.children).forEach((card, i) => {
        if (i === 0) card.classList.add('is-main');
        else card.classList.remove('is-main');
    });
}

function cleanupPreviews() {
    if (photoState) {
        photoState.forEach(p => {
            if (p.type === 'local' && p.preview) {
                URL.revokeObjectURL(p.preview);
            }
        });
    }
    photoState = [];
}

function getFolderHint() {
    return window.currentAssetsFolder || ""; 
}

// --- HELPER ---

export function updateAutocomplete(cars) {
    const brands = new Set();
    cars.forEach(c => { if(c.brand) brands.add(c.brand); });
    const sortedBrands = Array.from(brands).sort();
    fillDatalist('brand-list', sortedBrands);
    
    const brandInput = document.querySelector('input[name="brand"]');
    if (!brandInput) return;
    
    brandInput.oninput = () => {
        const val = brandInput.value.trim();
        if (!val) { fillDatalist('model-list', []); return; }
        const models = new Set();
        cars.filter(c => c.brand.toLowerCase() === val.toLowerCase())
            .forEach(c => { if(c.model) models.add(c.model); });
        const sortedModels = Array.from(models).sort();
        fillDatalist('model-list', sortedModels);
    };
}

function fillDatalist(id, items) {
    const list = document.getElementById(id);
    if(list) {
        list.innerHTML = '';
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            list.appendChild(option);
        });
    }
}

function setupAutoCapitalize(form) {
    const inputs = form.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            if (input.value) {
                input.value = input.value.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
            }
        });
    });
}

function togglePhotoManager(enable) {
    const manager = document.getElementById('photo-manager');
    const hint = document.getElementById('photo-hint');
    if (!manager) return;
    if (enable) {
        manager.style.display = 'block';
        hint.style.display = 'none';
    } else {
        manager.style.display = 'none';
        hint.style.display = 'block';
    }
}