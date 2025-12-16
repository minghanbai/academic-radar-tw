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
            let isAdministrative = false; 

            // 0. 行政人員檢查 (最高優先權排除)
            if (t.includes('行政') || t.includes('職員') || t.includes('專員') || t.includes('組員') || t.includes('書記')) {
                if (!t.includes('助理')) {
                    isAdministrative = true;
                } else {
                    types.add('assistant');
                    isResearchOrPostdoc = true;
                }
            }

            if (!isAdministrative) {
                // 1. 博士後
                // [修正] 移除互斥鎖，讓博士後和助理可以共存
                if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) {
                    types.add('postdoc');
                    isResearchOrPostdoc = true;
                }
                
                // 2. 研究助理
                // [修正] 移除 !isResearchOrPostdoc 判斷，允許同時標記
                // 注意：這裡移除了 else if 結構，改為獨立的 if
                
                const isResearchAssistant = 
                    t.includes('研究助理') || 
                    t.includes('assistant') || 
                    t.includes('兼任助理') ||
                    (t.includes('專任助理') && !t.includes('教授'));

                // [新增] 擴充研究人員的判定
                const isResearcher = 
                    t.includes('級研究人員') ||
                    t.includes('專任研究人員') ||
                    t.includes('專案研究人員') ||
                    t.includes('編制內研究人員') ||
                    t.includes('編制外研究人員') ||
                    t.includes('researcher');

                // [關鍵] 如果已經是博士後，且標題是因為 "博士後研究人員" 才命中 isResearcher，則不應加 assistant 標籤
                // 我們需要確保這個 "研究人員" 不是 "博士後" 的一部分
                // 但因為這很難完全切割 (除非用 regex)，我們採取策略：
                // 如果已經是 postdoc，且標題沒有明確的 "助理" 字眼，則不加 assistant
                
                let shouldAddAssistant = false;

                if (isResearchAssistant) {
                    shouldAddAssistant = true;
                } else if (isResearcher) {
                    // 如果命中了 "研究人員"，但已經是博士後，則不加 assistant
                    // 除非標題明確有 "研究助理" (上面 isResearchAssistant 已處理)
                    if (!types.has('postdoc')) {
                        shouldAddAssistant = true;
                    }
                }

                if (shouldAddAssistant) {
                     if (!t.includes('行政') || t.includes('行政助理')) {
                        types.add('assistant');
                        isResearchOrPostdoc = true;
                     }
                }

                // 若非研究職/行政職，進行教職/專案判斷
                // 這確保了 "專案研究人員" 只會有 assistant (和 project 視情況) 標籤，不會有 faculty 標籤
                // 但如果同時有 "博士後" 和 "研究助理"，isResearchOrPostdoc 也會是 true，這沒問題，我們不希望它是 Faculty
                if (!isResearchOrPostdoc) {
                    const hasFacultyKeyword = (t.includes('教授') || t.includes('faculty') || t.includes('teacher') || t.includes('講師') || t.includes('師資') || t.includes('教師') || t.includes('專業技術人員') || t.includes('教學人員'));
                    const isProjectKeyword = (t.includes('專案') || t.includes('約聘') || t.includes('編制外') || t.includes('project') || t.includes('contract') || t.includes('(案)') || t.includes('（案）'));

                    // 3. 專案教職 (Project Faculty)
                    // 必須同時有 "專案關鍵字" AND "教職關鍵字"
                    if (isProjectKeyword && hasFacultyKeyword) {
                        types.add('project');
                    }

                    // 4. 兼任
                    if (t.includes('兼任') || t.includes('part-time') || t.includes('adjunct')) {
                        types.add('adjunct');
                    }

                    // 5. 專任教職邏輯
                    const isExplicitFullTime = t.includes('專任') && !t.includes('專任助理') && !isProjectKeyword;
                    
                    const isImplicitFaculty = hasFacultyKeyword && !types.has('adjunct') && !types.has('project') && !types.has('postdoc') && !types.has('assistant');

                    const isHybrid = types.has('project') && t.includes('專任') && !t.includes('專任助理');

                    if (isExplicitFullTime || isImplicitFaculty || isHybrid) {
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

        let borderClass = 'bg-slate-400';
        if (job.types.includes('adjunct')) borderClass = 'bg-cyan-500';
        if (job.types.includes('project')) borderClass = 'bg-orange-500';
        if (job.types.includes('assistant')) borderClass = 'bg-emerald-500'; 
        if (job.types.includes('postdoc')) borderClass = 'bg-purple-500';
        if (job.types.includes('faculty')) borderClass = 'bg-blue-500'; 

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
            <div class="absolute left-0 top-0 bottom-0 w-1 ${borderClass}"></div>
            
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pl-2">
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-y-2 gap-x-3 mb-2">
                        <span class="text-[10px] px-2 py-0.5 rounded border font-medium ${sourceBadgeClass}">
                            ${job.source}
                        </span>
                        
                        <div class="flex items-center">
                            ${typeBadgesHtml}
                        </div>

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