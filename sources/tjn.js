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

            // [修正點] 改用 .listColor 類別選取，這比 id 更穩定
            // 先抓出所有列，確認有抓到東西
            const rows = $('tr.listColor');
            // console.log(`      (除錯) 這一頁找到了 ${rows.length} 列原始資料`);

            rows.each((i, el) => {
                const tds = $(el).find('td');
                // 根據你提供的 HTML，欄位應該有 6 欄
                if (tds.length >= 6) {
                    const schoolRaw = $(tds[0]).text().trim(); // Index 0: 徵才單位
                    const title = $(tds[1]).text().trim();      // Index 1: 公告主旨
                    const location = $(tds[2]).text().trim();   // Index 2: 工作地點
                    
                    const dateRaw = $(tds[3]).text().trim();    // Index 3: 公告日期
                    const date = dateRaw.replace(/\//g, '-');

                    const deadlineRaw = $(tds[4]).text().trim(); // Index 4: 截止日期
                    const deadline = deadlineRaw ? deadlineRaw.replace(/\//g, '-') : '-';

                    // 連結處理
                    let link = targetUrl; 
                    const linkContainer = $(tds[5]);
                    
                    const numSpan = linkContainer.find('span[name="num"]');
                    if (numSpan.length > 0) {
                        const jobNum = numSpan.text().trim();
                        link = `${baseUrl}/EduJin/Opening/Detail?num=${jobNum}`;
                    } else {
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

                    if (title && isRecentJob(date)) {
                        const jobData = {
                            id,
                            title,
                            school,
                            dept,
                            date,
                            deadline, // 確保這欄位存在
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
            
            if (pageJobs.length === 0) {
                // 如果連一筆都沒抓到，可能是網頁結構變了，或是真的沒資料
                // 為了避免誤判，我們只在確定有資料但都是舊的時候才停
                keepGoing = false;
            } else if (newInThisPage === 0 && existingIdSet.size > 0) {
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
    console.log(`✅ TJN 掃描結束: 共 ${allNewJobs.length} 筆`);
    return allNewJobs;
}

module.exports = fetchTJN;