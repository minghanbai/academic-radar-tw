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
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                httpsAgent
            });
            
            const $ = cheerio.load(data);
            let pageJobs = []; 
            let newInThisPage = 0; 

            // 針對該網站的 Table ID 進行精確選取
            $('#SearchTable tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                // 確保欄位足夠 (根據您的 HTML，應該有 6 欄)
                if (tds.length >= 6) {
                    const schoolRaw = $(tds[0]).text().trim(); // 徵才單位
                    const title = $(tds[1]).text().trim();      // 公告主旨
                    const location = $(tds[2]).text().trim();   // 工作地點
                    
                    // 日期處理：轉換 2025/12/04 -> 2025-12-04
                    const dateRaw = $(tds[3]).text().trim();    // 職缺公告日期
                    const date = dateRaw.replace(/\//g, '-');

                    const deadlineRaw = $(tds[4]).text().trim(); // 報名截止日期
                    const deadline = deadlineRaw ? deadlineRaw.replace(/\//g, '-') : '-';

                    // --- 連結處理 (修正版) ---
                    // 網站改版後 href 為 javascript:;，需抓取 hidden span 中的 num
                    let link = targetUrl; // 預設回列表頁
                    const linkContainer = $(tds[5]);
                    
                    // 嘗試抓取 num ID
                    const numSpan = linkContainer.find('span[name="num"]');
                    if (numSpan.length > 0) {
                        const jobNum = numSpan.text().trim();
                        link = `${baseUrl}/EduJin/Opening/Detail?num=${jobNum}`;
                    } else {
                        // 舊版備用邏輯：直接抓 href
                        const aTag = linkContainer.find('a');
                        const href = aTag.attr('href');
                        if (href && href !== 'javascript:;') {
                            link = href.startsWith('http') ? href : baseUrl + href;
                        }
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
                            deadline, 
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
            
            console.log(`      第 ${page} 頁：${pageJobs.length} 筆 (新: ${newInThisPage})`);
            
            if (pageJobs.length === 0) keepGoing = false;
            else if (newInThisPage === 0 && existingIdSet.size > 0) keepGoing = false;
            else { page++; await sleep(1000); }

        } catch (error) {
            console.error(`❌ 第 ${page} 頁讀取失敗:`, error.message);
            keepGoing = false;
        }
    }
    console.log(`✅ TJN 掃描結束: 共 ${allNewJobs.length} 筆`);
    return allNewJobs;
}

module.exports = fetchTJN;