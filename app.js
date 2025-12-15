// ==========================================
// 核心邏輯區 (Vanilla JS)
// ==========================================

let allJobs = []; 
let currentFilter = 'all';
let currentSearch = '';
let currentLocation = ''; 

document.addEventListener('DOMContentLoaded', () => {
    fetchJobs();
    setupEventListeners();
    const year = new Date().getFullYear();
    const copyright = document.getElementById('copyright');
    if (copyright) {
        copyright.textContent = `© ${year} TW Academic Radar. Powered by GitHub Actions.`;
    }
});

// 1. 抓取與正規化資料
async function fetchJobs() {
    try {
        const res = await fetch(`./jobs.json?t=${Date.now()}`);
        if (!res.ok) throw new Error('Network error');
        let data = await res.json();
        
        // [前端補丁] 類型正規化 (多標籤邏輯)
        allJobs = data.map(job => {
            if (job.types && Array.isArray(job.types)) return job;

            const t = job.title.toLowerCase();
            const types = new Set();
            let isResearchOrPostdoc = false; 
            let isAdministrative = false; // 新增：是否為行政職

            // 0. 行政人員檢查 (最高優先權排除)
            // 如果是行政人員、職員、書記等，且不是行政"助理"，則歸類為 other，並阻止後續判斷
            if (t.includes('行政') || t.includes('職員') || t.includes('專員') || t.includes('組員') || t.includes('書記')) {
                if (!t.includes('助理')) {
                    isAdministrative = true;
                    // 這類職缺直接落入 other，不加任何標籤
                } else {
                    // 如果是 "行政助理"，則視為 assistant
                    types.add('assistant');
                    isResearchOrPostdoc = true;
                }
            }

            if (!isAdministrative) {
                // 1. 博士後 (互斥)
                if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) {
                    types.add('postdoc');
                    isResearchOrPostdoc = true;
                }
                
                // 2. 研究助理 (互斥)
                if (!isResearchOrPostdoc) {
                    if (
                        (t.includes('研究助理') || t.includes('assistant') || t.includes('研究人員') || t.includes('researcher') || t.includes('兼任助理')) ||
                        (t.includes('專任助理') && !t.includes('教授'))
                    ) {
                        types.add('assistant');
                        isResearchOrPostdoc = true;
                    }
                }

                // 若非研究職/行政職，進行教職/專案判斷
                if (!isResearchOrPostdoc) {

                    // 3. 專案/約聘
                    // [修正] 增加對 "(案)" 或 "（案）" 的識別
                    if (t.includes('專案') || t.includes('約聘') || t.includes('編制外') || t.includes('project') || t.includes('contract') || t.includes('(案)') || t.includes('（案）')) {
                        types.add('project');
                    }

                    // 4. 兼任
                    if (t.includes('兼任') || t.includes('part-time') || t.includes('adjunct')) {
                        types.add('adjunct');
                    }

                    // 5. 專任教職邏輯
                    const hasFacultyKeyword = (t.includes('教授') || t.includes('faculty') || t.includes('teacher') || t.includes('講師') || t.includes('師資') || t.includes('教師') || t.includes('專業技術人員'));
                    
                    // 專任判斷：明確排除 "編制外" 和 "約聘"
                    const isExplicitFullTime = t.includes('專任') && !t.includes('編制外') && !t.includes('約聘');
                    
                    // 隱性教職
                    const isImplicitFaculty = hasFacultyKeyword && !types.has('adjunct') && !types.has('project') && !types.has('postdoc') && !types.has('assistant');

                    if (isExplicitFullTime || isImplicitFaculty) {
                        types.add('faculty');
                    }
                }
            }

            if (types.size === 0) types.add('other');

            return { ...job, types: Array.from(types) };
        });
        
        initLocationFilter();

        const loading = document.getElementById('loading');
        const jobList = document.getElementById('job-list');
        
        if (loading) loading.classList.add('hidden');
        if (jobList) jobList.classList.remove('hidden');
        
        renderJobs();
    } catch (err) {
        console.error('資料讀取失敗:', err);
        const loading = document.getElementById('loading');
        if (loading) loading.innerHTML = '<p class="text-red-500">無法讀取資料，請稍後再試。</p>';
    }
}

// 初始化地區篩選
function initLocationFilter() {
    const locations = new Set();
    
    allJobs.forEach(job => {
        if (job.tags && Array.isArray(job.tags)) {
            job.tags.forEach(tag => {
                if (tag.length >= 3) {
                    const city = tag.substring(0, 3);
                    if (city.includes('市') || city.includes('縣')) {
                        locations.add(city);
                    }
                }
            });
        }
    });

    const select = document.getElementById('location-select');
    if (select) {
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        const sortedLocations = Array.from(locations).sort();
        sortedLocations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            select.appendChild(option);
        });
    }
}

// 2. 渲染列表
function renderJobs() {
    const container = document.getElementById('job-list');
    const noData = document.getElementById('no-data');
    
    if (!container || !noData) return;

    const filtered = allJobs.filter(job => {
        const matchType = currentFilter === 'all' || job.types.includes(currentFilter);
        
        const searchLower = currentSearch.toLowerCase();
        const tagsString = (job.tags || []).join(' ').toLowerCase();
        const matchSearch = !currentSearch || 
            (job.title && job.title.toLowerCase().includes(searchLower)) ||
            (job.school && job.school.toLowerCase().includes(searchLower)) ||
            (job.dept && job.dept.toLowerCase().includes(searchLower)) ||
            tagsString.includes(searchLower);

        const matchLocation = !currentLocation || tagsString.includes(currentLocation);

        return matchType && matchSearch && matchLocation;
    });

    if (filtered.length === 0) {
        container.innerHTML = '';
        noData.classList.remove('hidden');
        return;
    }
    
    noData.classList.add('hidden');

    const html = filtered.map(job => {
        let sourceBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
        if (job.source === 'NSTC') sourceBadgeClass = 'bg-orange-100 text-orange-700 border-orange-200';
        if (job.source === 'MOE') sourceBadgeClass = 'bg-green-100 text-green-700 border-green-200';

        const typeLabels = {
            'faculty': '專任教職',
            'project': '專案教職',
            'adjunct': '兼任教職',
            'postdoc': '博士後',
            'assistant': '研究助理',
            'other': '其他'
        };
        
        const typeBadgesHtml = job.types.map(t => {
            return `<span class="text-[10px] px-2 py-0.5 rounded border font-medium mr-1 badge-${t}">${typeLabels[t] || t}</span>`;
        }).join('');

        // 移除 borderClass 相關邏輯，取消左側色塊

        let urgentClass = 'text-slate-500';
        let urgentIconClass = 'text-slate-400';
        let deadlineText = job.deadline || '-';
        
        if (job.deadline && job.deadline !== '-') {
            const diff = new Date(job.deadline) - new Date();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            if (days >= 0 && days <= 3) {
                urgentClass = 'text-red-600 animate-pulse font-bold';
                urgentIconClass = 'text-red-600';
            }
        }

        const tagsHtml = (job.tags || []).map(tag => 
            `<span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">#${tag}</span>`
        ).join('');

        return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
            <!-- 移除左側顏色條 div -->
            
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pl-2">
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-y-2 gap-x-3 mb-2">
                        <!-- 來源 -->
                        <span class="text-[10px] px-2 py-0.5 rounded border font-medium ${sourceBadgeClass}">
                            ${job.source}
                        </span>
                        
                        <!-- 動態分類標籤區 -->
                        <div class="flex items-center">
                            ${typeBadgesHtml}
                        </div>

                        <!-- 時間資訊 -->
                        <span class="text-xs text-slate-400 flex items-center gap-1">
                            <i class="ph ph-clock"></i> 
                            <span class="hidden sm:inline">刊登:</span> ${job.date}
                        </span>
                        <span class="text-xs flex items-center gap-1 font-medium ${urgentClass}">
                            <i class="ph ph-hourglass-high ${urgentIconClass}"></i> 
                            截止: ${deadlineText}
                        </span>
                    </div>
                    
                    <h3 class="text-lg font-bold text-slate-800 mb-1 group-hover:text-blue-700 transition-colors">
                        ${job.title}
                    </h3>
                    
                    <div class="text-slate-600 text-sm flex items-center gap-2">
                        <span class="font-semibold">${job.school}</span>
                        <span class="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span>${job.dept}</span>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                        ${tagsHtml}
                    </div>
                </div>

                <div class="flex items-center">
                    <a href="${job.link}" target="_blank" class="px-4 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 w-full md:w-auto justify-center">
                        查看詳情 <i class="ph ph-arrow-square-out"></i>
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// 3. 設定監聽器
function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            renderJobs();
        });
    }

    const locationSelect = document.getElementById('location-select');
    if (locationSelect) {
        locationSelect.addEventListener('change', (e) => {
            currentLocation = e.target.value;
            renderJobs();
        });
    }

    const typeSelect = document.getElementById('type-select');
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderJobs();
        });
    }

    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            currentSearch = '';
            currentFilter = 'all';
            currentLocation = ''; 
            
            if (searchInput) searchInput.value = '';
            if (locationSelect) locationSelect.value = '';
            if (typeSelect) typeSelect.value = 'all'; 
            
            renderJobs();
        });
    }
}