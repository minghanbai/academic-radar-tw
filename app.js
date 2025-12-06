// ==========================================
// 核心邏輯區 (Vanilla JS)
// ==========================================

let allJobs = []; // 儲存所有職缺
let currentFilter = 'all';
let currentSearch = '';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    fetchJobs();
    setupEventListeners();
    const year = new Date().getFullYear();
    document.getElementById('copyright').textContent = `© ${year} TW Academic Radar. Powered by GitHub Actions.`;
});

// 1. 抓取資料
async function fetchJobs() {
    try {
        // 加上時間戳記避免瀏覽器快取舊資料
        const res = await fetch(`./jobs.json?t=${Date.now()}`);
        if (!res.ok) throw new Error('Network error');
        allJobs = await res.json();
        
        // 隱藏 Loading，顯示列表
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('job-list').classList.remove('hidden');
        
        renderJobs();
    } catch (err) {
        console.error('資料讀取失敗:', err);
        document.getElementById('loading').innerHTML = '<p class="text-red-500">無法讀取資料，請稍後再試。</p>';
    }
}

// 2. 渲染列表 (最核心的函式)
function renderJobs() {
    const container = document.getElementById('job-list');
    const noData = document.getElementById('no-data');
    
    // 過濾資料
    const filtered = allJobs.filter(job => {
        const matchType = currentFilter === 'all' || job.type === currentFilter;
        const searchLower = currentSearch.toLowerCase();
        const matchSearch = !currentSearch || 
            (job.title && job.title.toLowerCase().includes(searchLower)) ||
            (job.school && job.school.toLowerCase().includes(searchLower)) ||
            (job.dept && job.dept.toLowerCase().includes(searchLower));
        return matchType && matchSearch;
    });

    // 處理無資料狀態
    if (filtered.length === 0) {
        container.innerHTML = '';
        noData.classList.remove('hidden');
        return;
    }
    
    noData.classList.add('hidden');

    // 產生 HTML 字串
    const html = filtered.map(job => {
        // 判斷來源標籤顏色
        let sourceBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
        if (job.source === 'NSTC') sourceBadgeClass = 'bg-orange-100 text-orange-700 border-orange-200';
        if (job.source === 'MOE') sourceBadgeClass = 'bg-green-100 text-green-700 border-green-200';

        // 判斷側邊顏色條
        let borderClass = 'bg-emerald-500';
        if (job.type === 'faculty') borderClass = 'bg-blue-500';
        if (job.type === 'postdoc') borderClass = 'bg-purple-500';

        // 判斷急迫性
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

        // 標籤 HTML
        const tagsHtml = (job.tags || []).map(tag => 
            `<span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">#${tag}</span>`
        ).join('');

        return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${borderClass}"></div>
            
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pl-2">
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-3 mb-2">
                        <span class="text-[10px] px-2 py-0.5 rounded border font-medium ${sourceBadgeClass}">
                            ${job.source}
                        </span>
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
    // 搜尋框輸入
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            renderJobs();
        });
    }

    // 篩選按鈕
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有 active
            filterBtns.forEach(b => {
                b.classList.remove('active');
                b.classList.add('bg-white', 'text-slate-600'); // 恢復白底
                b.classList.remove('bg-blue-600', 'text-white');
            });
            
            // 設定當前按鈕 active
            btn.classList.add('active');
            
            // 更新狀態
            currentFilter = btn.dataset.type;
            renderJobs();
        });
    });

    // 清除搜尋按鈕
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            currentSearch = '';
            currentFilter = 'all';
            document.getElementById('search-input').value = '';
            
            // 重置按鈕樣式
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-type="all"]').classList.add('active');
            
            renderJobs();
        });
    }
}