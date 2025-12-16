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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' 
                },
                httpsAgent
            });
            
            const $ = cheerio.load(data);
            let pageJobs = []; 
            let newInThisPage = 0; 

            $('#SearchTable tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                if (tds.length >= 6) {
                    const orgUnit = $(tds[0]).text().trim(); // 徵才單位 (可能包含學校+系所)
                    const title = $(tds[1]).text().trim();      
                    const location = $(tds[2]).text().trim();   
                    
                    const dateRaw = $(tds[3]).text().trim();    
                    const date = dateRaw.replace(/\//g, '-');

                    const deadlineRaw = $(tds[4]).text().trim(); 
                    const deadline = deadlineRaw ? deadlineRaw.replace(/\//g, '-') : '-';

                    let link = targetUrl; 
                    const linkContainer = $(tds[5]);
                    const aTag = linkContainer.find('a');
                    const href = aTag.attr('href');
                    const numSpan = linkContainer.find('span[name="num"]');

                    if (href && href !== 'javascript:;' && href.includes('Detail')) {
                        link = href.startsWith('http') ? href : baseUrl + href;
                    } else if (numSpan.length > 0) {
                        const jobNum = numSpan.text().trim();
                        link = `${baseUrl}/EduJin/Opening/Detail?num=${jobNum}`;
                    }

                    // --- 學校/系所切割邏輯優化 ---
                    let school = orgUnit;
                    let dept = "詳見標題";

                    // 尋找學校名稱的結尾索引
                    // 優先權: 大學 > 學院 > 專科學校 > 學校
                    const suffixes = ['大學', '學院', '專科學校', '高中', '高職', '學校'];
                    let splitIndex = -1;
                    let matchedSuffixLength = 0;

                    for (const suffix of suffixes) {
                        const idx = orgUnit.indexOf(suffix);
                        if (idx !== -1) {
                            // 找到後綴的位置，真正的切割點應該是 後綴位置 + 後綴長度
                            splitIndex = idx + suffix.length;
                            matchedSuffixLength = suffix.length;
                            break; // 找到第一個匹配的就停止 (通常是最長或最主要的)
                        }
                    }

                    if (splitIndex !== -1) {
                        school = orgUnit.substring(0, splitIndex);
                        const remaining = orgUnit.substring(splitIndex).trim();
                        if (remaining.length > 0) {
                            dept = remaining;
                        } else {
                            // 如果徵才單位只有學校名，沒有系所，嘗試從標題找
                            // 例如: 國立中興大學 ... 標題: 機械工程學系徵聘...
                            // 這裡簡單處理，若標題有 "系" 或 "所"，可以嘗試抓一下，但為了保守起見，設為詳見標題
                            // 或者不處理，前端顯示會比較乾淨
                            dept = ""; 
                        }
                    }

                    const id = generateId(school, title, date);

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
            
            console.log(`      第 ${page} 頁解析完畢：共 ${pageJobs.length} 筆 (新: ${newInThisPage})`);
            
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