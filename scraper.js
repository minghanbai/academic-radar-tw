const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// ==========================================
// 設定區
// ==========================================
const JOBS_FILE = path.join(__dirname, 'jobs.json');

// 忽略 SSL 憑證錯誤 (政府網站有時候憑證會有問題，加上這個比較保險)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 職缺分類邏輯
function determineType(title) {
  const t = title.toLowerCase();
  if (t.includes('教授') || t.includes('專任') || t.includes('faculty') || t.includes('teacher') || t.includes('講師')) return 'faculty';
  if (t.includes('博士後') || t.includes('postdoc') || t.includes('post-doc')) return 'postdoc';
  if (t.includes('研究助理') || t.includes('行政') || t.includes('assistant') || t.includes('工讀') || t.includes('專員')) return 'assistant';
  return 'other'; // 預設
}

// 產生唯一 ID (指紋) - 結合學校、職稱、日期來確保唯一性
function generateId(school, title, date) {
  // 移除標點符號與空白，避免微小差異造成重複
  const cleanTitle = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); 
  const raw = `${school}|${cleanTitle}|${date}`;
  return Buffer.from(raw).toString('base64');
}

// 判斷是否為近期職缺 (例如抓取最近 3 天內的)
function isRecentJob(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const jobDate = new Date(dateString);
    
    // 計算日差 (毫秒差異 / 一天的毫秒數)
    const diffTime = Math.abs(today - jobDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    // 設定寬容值，例如只抓最近 7 天內的，避免把幾年前的舊資料都抓進來 (若該頁面有舊資料)
    return diffDays <= 7; 
}

// ==========================================
// 來源 1: 教育部大專教師人才網 (TJN) - 真實爬取
// ==========================================
async function fetchTJN() {
    console.log('🔍 正在連線至教育部大專教師人才網 (TJN)...');
    const jobs = [];
    const targetUrl = 'https://tjn.moe.edu.tw/EduJin/Opening/Index';
    const baseUrl = 'https://tjn.moe.edu.tw';

    try {
        const { data } = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            httpsAgent // 使用忽略 SSL 的 Agent
        });
        
        const $ = cheerio.load(data);

        // 根據你提供的 HTML 結構，資料在 tr.listColor 裡面
        // 為了保險，選取所有 tbody 下的 tr
        $('tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            
            // 確保這個 tr 有足夠的 td 欄位 (你的結構有 6 個 td)
            if (tds.length >= 5) {
                // 第 1 欄: 學校系所 (index 0)
                const schoolRaw = $(tds[0]).text().trim();
                
                // 第 2 欄: 職缺標題 (index 1)
                const title = $(tds[1]).text().trim();
                
                // 第 3 欄: 地點 (index 2) - 這裡我們暫時不存地點，或你可以加到 tags
                const location = $(tds[2]).text().trim();

                // 第 4 欄: 公告日期 (index 3) - format: 2025/12/06
                const dateRaw = $(tds[3]).text().trim(); // 抓取發布日
                // 轉換 / 為 - 以符合 ISO 格式 (YYYY-MM-DD)
                const date = dateRaw.replace(/\//g, '-');

                // 第 6 欄: 連結 (index 5) 裡面的 a href
                const relativeLink = $(tds[5]).find('a').attr('href');
                const link = relativeLink ? baseUrl + relativeLink : targetUrl;

                // 簡單拆分學校與系所 (通常開頭是學校)
                // 這只是一個簡單的邏輯，可能不完美，但夠用
                let school = schoolRaw;
                let dept = "詳見標題";
                if (schoolRaw.includes('大學')) {
                    const parts = schoolRaw.split('大學');
                    school = parts[0] + '大學';
                    dept = parts[1] || dept;
                } else if (schoolRaw.includes('學院')) {
                    const parts = schoolRaw.split('學院');
                    school = parts[0] + '學院';
                    dept = parts[1] || dept;
                }

                // 過濾邏輯：只抓最近的職缺
                // 如果你想全部抓再由後續 deduplicate 處理，可以註解掉這行 if
                if (isRecentJob(date) && title) {
                    jobs.push({
                        id: generateId(schoolRaw, title, date), // 產生唯一 ID
                        title: title,
                        school: school,
                        dept: dept,
                        date: date,
                        type: determineType(title),
                        source: 'MOE', // 標記來源
                        link: link,
                        tags: [location] // 把地點當作 tag
                    });
                }
            }
        });

        console.log(`✅ 教育部 (TJN) 抓取完成: 發現 ${jobs.length} 筆資料`);

    } catch (error) {
        console.error('❌ 教育部 (TJN) 抓取失敗:', error.message);
        // 若失敗，可以考慮不要 throw，而是回傳空陣列，讓其他來源繼續跑
    }

    return jobs;
}

// ==========================================
// 來源 2: 國科會 (NSTC) - 暫時保留為模擬資料
// (等你之後有國科會的 HTML 結構，我們可以再把這裡改成真實抓取)
// ==========================================
async function fetchNSTC() {
  // console.log('🔍 正在掃描國科會 (NSTC)... (目前為模擬)');
  const jobs = [];
  // 暫時回傳空陣列，以免混淆，專注測試教育部的爬蟲
  return jobs;
}

// ==========================================
// 主程式執行區
// ==========================================
(async () => {
  console.log('🚀 TW Academic Radar 每日爬蟲啟動...');
  console.log(`📅 執行時間: ${new Date().toLocaleString()}`);

  try {
    // 1. 並行執行抓取
    const [tjnJobs, nstcJobs] = await Promise.all([
        fetchTJN(),
        fetchNSTC()
    ]);

    const newFetchedJobs = [...tjnJobs, ...nstcJobs];
    console.log(`📊 本次共抓取到 ${newFetchedJobs.length} 筆原始資料`);

    // 2. 讀取歷史資料庫
    let existingJobs = [];
    if (fs.existsSync(JOBS_FILE)) {
        try {
            existingJobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
        } catch (e) {
            console.error('⚠️ 讀取舊資料失敗 (可能是格式錯誤)，將建立新資料庫');
        }
    }

    // 3. 資料合併與去重 (Deduplication)
    // 我們使用 Map，以 ID 為鍵值。
    // 策略：保留舊資料，但如果有 ID 相同的新資料，更新它。
    const jobMap = new Map();

    // 先載入舊資料
    existingJobs.forEach(job => jobMap.set(job.id, job));

    // 再載入新資料 (這會自動更新既有的，並加入全新的)
    let newCount = 0;
    newFetchedJobs.forEach(job => {
        if (!jobMap.has(job.id)) {
            newCount++;
        }
        jobMap.set(job.id, job);
    });

    console.log(`✨ 新增了 ${newCount} 筆全新職缺！`);

    // 4. 轉換回陣列並排序 (日期新 -> 舊)
    // 為了避免 JSON 檔案無限膨脹，我們可以只保留最近 60 天或是最新的 500 筆資料
    const sortedJobs = Array.from(jobMap.values())
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 500); // 限制只保留最新的 500 筆

    // 5. 寫入檔案
    fs.writeFileSync(JOBS_FILE, JSON.stringify(sortedJobs, null, 2));
    console.log(`💾 資料庫更新完成，目前總筆數: ${sortedJobs.length}`);

  } catch (err) {
    console.error('💥 爬蟲主程序發生錯誤:', err);
    process.exit(1);
  }
})();