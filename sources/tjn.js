const axios = require('axios');
const cheerio = require('cheerio');
const { httpsAgent, determineType, generateId, isRecentJob } = require('../utils');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchTJN(existingIdSet = new Set()) {
    console.log('🔍 開始掃描教育部大專教師人才網 (TJN)...');
    
    let allNewJobs = [];
    let page = 1;
    let keepGoing = true;
    const MAX_PAGES = 10; 
    const baseUrl = 'https://tjn.moe.edu.tw';

    while (keepGoing && page <= MAX_PAGES) {
        const targetUrl = `https://tjn.moe.edu.tw/EduJin/Opening/Index?page=${page}`;
        console.log(`   ➳ 正在讀取第 ${page} 頁...`);

        try {
            const { data } = await axios.get(targetUrl, {
                // 使用一般的 User-Agent 以獲取最標準的 HTML
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' 
                },
                httpsAgent
            });
            
            const $ = cheerio.load(data);
            let pageJobs = []; 
            let newInThisPage = 0; 

            // 強制鎖定 id="SearchTable" 的 tbody 下的 tr，排除手機版隱藏表格
            $('#SearchTable tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                // 確保欄位足夠 (根據 HTML 結構，應該有 6 欄)
                if (tds.length >= 6) {
                    const schoolRaw = $(tds[0]).text().trim(); // Index 0: 徵才單位
                    const title = $(tds[1]).text().trim();      // Index 1: 公告主旨
                    const location = $(tds[2]).text().trim();   // Index 2: 工作地點
                    
                    // 日期處理：轉換 2025/12/06 -> 2025-12-06
                    const dateRaw = $(tds[3]).text().trim();    // Index 3: 公告日期
                    const date = dateRaw.replace(/\//g, '-');

                    // 截止日期處理 (關鍵!)
                    const deadlineRaw = $(tds[4]).text().trim(); // Index 4: 截止日期
                    // 如果沒有日期，給予 '-'，確保欄位存在
                    const deadline = deadlineRaw ? deadlineRaw.replace(/\//g, '-') : '-';

                    // --- 連結處理 (混合模式) ---
                    // 優先尋找 href，如果 href 是 javascript:; 則尋找 hidden span
                    let link = targetUrl; 
                    const linkContainer = $(tds[5]);
                    const aTag = linkContainer.find('a');
                    const href = aTag.attr('href');
                    const numSpan = linkContainer.find('span[name="num"]');

                    if (href && href !== 'javascript:;' && href.includes('Detail')) {
                        // 情況 A: 正常的 href 連結
                        link = href.startsWith('http') ? href : baseUrl + href;
                    } else if (numSpan.length > 0) {
                        // 情況 B: 隱藏的 span ID
                        const jobNum = numSpan.text().trim();
                        link = `${baseUrl}/EduJin/Opening/Detail?num=${jobNum}`;
                    }

                    // 拆分學校系所
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

                    const id = generateId(schoolRaw, title, date);

                    // 條件：必須有標題 且 是近期職缺
                    if (title && isRecentJob(date)) {
                        const jobData = {
                            id,
                            title,
                            school,
                            dept,
                            date,
                            deadline, // 這裡強制寫入 deadline 欄位
                            type: determineType(title),
                            source: 'MOE',
                            link,
                            tags: [location]
                        };

                        pageJobs.push(jobData);
                        if (!existingIdSet.has(id)) newInThisPage++;
                    }
                }
            });

            if (pageJobs.length > 0) allNewJobs = [...allNewJobs, ...pageJobs];
            
            console.log(`      第 ${page} 頁解析完畢：共 ${pageJobs.length} 筆 (新: ${newInThisPage})`);
            
            // 翻頁判斷
            if (pageJobs.length === 0) {
                keepGoing = false;
            } else if (newInThisPage === 0 && existingIdSet.size > 0) {
                console.log('      [停止] 這一頁全部都是舊資料，停止翻頁。');
                keepGoing = false;
            } else {
                page++;
                await sleep(1000);
            }

        } catch (error) {
            console.error(`❌ 第 ${page} 頁讀取失敗:`, error.message);
            keepGoing = false;
        }
    }
    console.log(`✅ TJN 掃描結束: 共 ${allNewJobs.length} 筆資料`);
    return allNewJobs;
}

module.exports = fetchTJN;