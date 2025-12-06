const fs = require('fs');
const path = require('path');

// 引入不同的來源模組
const fetchTJN = require('./sources/tjn');
const fetchNSTC = require('./sources/nstc');

// 設定檔案路徑
const JOBS_FILE = path.join(__dirname, 'jobs.json');

(async () => {
  console.log('🚀 TW Academic Radar 每日爬蟲啟動 (分頁偵測版)...');
  console.log(`📅 執行時間: ${new Date().toLocaleString()}`);

  try {
    // 1. 先讀取歷史資料庫 (關鍵步驟：先讀檔，才能知道哪些是舊的)
    let existingJobs = [];
    const existingIdSet = new Set();
    
    if (fs.existsSync(JOBS_FILE)) {
        try {
            existingJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            // 建立 ID 集合，讓爬蟲可以快速查表
            existingJobs.forEach(job => existingIdSet.add(job.id));
            console.log(`📚 目前資料庫已有 ${existingJobs.length} 筆資料`);
        } catch (e) {
            console.error('⚠️ 讀取舊資料失敗，將建立新資料庫');
        }
    }

    // 2. 執行抓取任務 (將 existingIdSet 傳入 fetchTJN)
    // 這樣 tjn.js 就能知道什麼時候該停下來
    const [tjnJobs, nstcJobs] = await Promise.all([
        fetchTJN(existingIdSet), 
        fetchNSTC()
    ]);

    const newFetchedJobs = [...tjnJobs, ...nstcJobs];
    console.log(`📊 本次共抓取到 ${newFetchedJobs.length} 筆資料`);

    // 3. 資料合併 (更新策略)
    const jobMap = new Map();
    // 先放舊的
    existingJobs.forEach(job => jobMap.set(job.id, job));
    
    let newCount = 0;
    newFetchedJobs.forEach(job => {
        // 雖然爬蟲那邊已經過濾過一次，但這裡再做一次確保合併正確
        if (!jobMap.has(job.id)) {
            newCount++;
        }
        jobMap.set(job.id, job); // 更新資料 (例如連結可能變了，或是日期更新)
    });

    console.log(`✨ 資料庫新增/更新了 ${newCount} 筆職缺！`);

    // 4. 排序並存檔 (日期新 -> 舊，保留最新的 600 筆)
    const sortedJobs = Array.from(jobMap.values())
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 600);

    fs.writeFileSync(JOBS_FILE, JSON.stringify(sortedJobs, null, 2));
    console.log(`💾 資料庫更新完成，目前總筆數: ${sortedJobs.length}`);

  } catch (err) {
    console.error('💥 爬蟲主程序發生錯誤:', err);
    process.exit(1);
  }
})();