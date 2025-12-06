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
    const MAX_PAGES = 10; // 安全閥：最多翻 10 頁 (避免無限迴圈)
    const baseUrl = 'https://tjn.moe.edu.tw';

    while (keepGoing && page <= MAX_PAGES) {
        // 動態網址：加入 page 參數
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
            let pageJobs = []; // 這一頁抓到的有效職缺
            let newInThisPage = 0; // 這一頁有多少是「全新」的

            // 解析表格
            $('tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                if (tds.length >= 5) {
                    const schoolRaw = $(tds[0]).text().trim();
                    const title = $(tds[1]).text().trim();
                    const location = $(tds[2]).text().trim();
                    const dateRaw = $(tds[3]).text().trim();
                    const date = dateRaw.replace(/\//g, '-');
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

                    // 產生 ID
                    const id = generateId(schoolRaw, title, date);

                    // 關鍵判斷：
                    // 1. 必須是有效的職缺 (有標題)
                    // 2. 必須是近期職缺 (isRecentJob 避免抓到置頂的萬年舊文)
                    if (title && isRecentJob(date)) {
                        const jobData = {
                            id,
                            title,
                            school,
                            dept,
                            date,
                            type: determineType(title),
                            source: 'MOE',
                            link,
                            tags: [location]
                        };

                        pageJobs.push(jobData);

                        // 檢查這筆資料是否已存在於資料庫
                        if (!existingIdSet.has(id)) {
                            newInThisPage++;
                        }
                    }
                }
            });

            // 如果這頁有抓到資料，就合併到總結果
            if (pageJobs.length > 0) {
                allNewJobs = [...allNewJobs, ...pageJobs];
            }

            console.log(`      第 ${page} 頁解析完畢：共 ${pageJobs.length} 筆，其中 ${newInThisPage} 筆為新資料`);

            // 判斷是否繼續翻頁
            // 條件：如果這一頁「沒有任何一筆新資料」(newInThisPage === 0)，代表我們已經追上進度了，不需要再往前翻
            // 注意：如果是第一次執行(existingIdSet 為空)，newInThisPage 會等於 pageJobs.length，所以會一直翻直到 MAX_PAGES
            if (pageJobs.length === 0) {
                console.log('      [停止] 這一頁沒有任何資料，停止翻頁。');
                keepGoing = false;
            } else if (newInThisPage === 0 && existingIdSet.size > 0) {
                console.log('      [停止] 這一頁全部都是舊資料，停止翻頁。');
                keepGoing = false;
            } else {
                // 還有新資料，繼續翻下一頁
                page++;
                // 休息 1 秒
                await sleep(1000);
            }

        } catch (error) {
            console.error(`❌ 第 ${page} 頁讀取失敗:`, error.message);
            keepGoing = false; // 出錯就停，避免一直報錯
        }
    }

    console.log(`✅ 教育部 (TJN) 掃描結束: 共收集 ${allNewJobs.length} 筆資料`);
    return allNewJobs;
}

module.exports = fetchTJN;