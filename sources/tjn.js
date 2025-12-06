const axios = require('axios');
const cheerio = require('cheerio');
const { httpsAgent, determineType, generateId, isRecentJob } = require('../utils');

// 為了不讓對方伺服器覺得我們是攻擊，翻頁時休息一下
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {Set} existingIdSet - 主程式傳來的「已知 ID 集合」
 */
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

            $('tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                // 確保欄位足夠 (TJN 結構通常有 6 欄)
                if (tds.length >= 5) {
                    const schoolRaw = $(tds[0]).text().trim();
                    const title = $(tds[1]).text().trim();
                    const location = $(tds[2]).text().trim();
                    
                    // 刊登日期 (Index 3)
                    const dateRaw = $(tds[3]).text().trim();
                    const date = dateRaw.replace(/\//g, '-');

                    // [新增] 截止日期 (Index 4)
                    const deadlineRaw = $(tds[4]).text().trim();
                    const deadline = deadlineRaw ? deadlineRaw.replace(/\//g, '-') : '-';

                    // 連結 (Index 5)
                    const relativeLink = $(tds[5]).find('a').attr('href');
                    const link = relativeLink ? baseUrl + relativeLink : targetUrl;

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

                    if (title && isRecentJob(date)) {
                        const jobData = {
                            id,
                            title,
                            school,
                            dept,
                            date,     // 刊登日
                            deadline, // [新增] 截止日
                            type: determineType(title),
                            source: 'MOE',
                            link,
                            tags: [location]
                        };

                        pageJobs.push(jobData);

                        if (!existingIdSet.has(id)) {
                            newInThisPage++;
                        }
                    }
                }
            });

            if (pageJobs.length > 0) {
                allNewJobs = [...allNewJobs, ...pageJobs];
            }

            console.log(`      第 ${page} 頁解析完畢：共 ${pageJobs.length} 筆，其中 ${newInThisPage} 筆為新資料`);

            if (pageJobs.length === 0) {
                console.log('      [停止] 這一頁沒有任何資料，停止翻頁。');
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

    console.log(`✅ 教育部 (TJN) 掃描結束: 共收集 ${allNewJobs.length} 筆資料`);
    return allNewJobs;
}

module.exports = fetchTJN;