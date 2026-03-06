/**
 * 喝茶神器 - 群聊同步脚本
 * 此脚本被注入到 X.com 群聊信息页面，用于抓取群聊名称和成员列表
 * 由 background.js 通过 chrome.scripting.executeScript 注入
 */

(async function syncGroupMembers() {
    'use strict';

    const SCROLL_DELAY = 800;
    const MAX_SCROLL_ATTEMPTS = 50;

    // 等待元素出现
    function waitForSelector(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('等待 ' + selector + ' 超时'));
            }, timeout);
        });
    }

    // 等待指定毫秒
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
        // 等待页面加载
        await delay(2000);

        // 1. 提取群聊名称 - 群聊 info 页面通常有一个大标题
        let groupName = '';

        // 尝试多种方式获取群聊名称
        // 方式1: 从页面 URL 提取群聊 ID，然后查找对应的标题
        const urlMatch = window.location.pathname.match(/\/i\/chat\/(g\d+)/);
        const groupId = urlMatch ? urlMatch[1] : null;

        // 方式2: 查找群聊名称元素 - 通常是大字体的群聊名
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
            const style = window.getComputedStyle(span);
            const fontSize = parseInt(style.fontSize);
            // 群聊名称通常是较大字体 (>= 20px)，且文本不为空
            if (fontSize >= 20 && span.textContent.trim().length > 0 && span.textContent.trim().length < 100) {
                const text = span.textContent.trim();
                // 排除一些常见的非群聊名称文本
                if (!['Chat', 'Messages', 'Settings', 'chat info'].includes(text.toLowerCase()) && text !== 'X') {
                    groupName = text;
                    break;
                }
            }
        }

        // 2. 查找并点击 "View All" / "查看全部" 按钮
        let viewAllClicked = false;
        const allClickable = document.querySelectorAll('span, a, button, div[role="button"]');
        for (const el of allClickable) {
            const text = el.textContent.trim().toLowerCase();
            if (text === 'view all' || text === '查看全部' || text === 'view all members') {
                el.click();
                viewAllClicked = true;
                break;
            }
        }

        if (!viewAllClicked) {
            // 备用方案：查找 "Members" 旁边的可点击元素
            for (const el of allClickable) {
                const text = el.textContent.trim();
                if (text.includes('Members') || text.includes('成员')) {
                    const parent = el.closest('div');
                    if (parent) {
                        const viewAll = parent.querySelector('span[role="button"], a, button');
                        if (viewAll && viewAll !== el) {
                            viewAll.click();
                            viewAllClicked = true;
                            break;
                        }
                    }
                }
            }
        }

        await delay(2000);

        // 3. 抓取成员列表
        // 查找包含 @handle 的元素来收集成员
        const members = new Map(); // handle -> displayName

        async function collectVisibleMembers() {
            // 方法1: 查找 @handle 文本
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.children.length === 0) {
                    const text = el.textContent.trim();
                    if (text.startsWith('@') && text.length > 1 && text.length < 50 && !text.includes(' ')) {
                        const handle = text.substring(1);
                        if (!members.has(handle.toLowerCase())) {
                            // 查找对应的显示名称 - 通常在同一个父容器中
                            let displayName = handle;
                            const container = el.closest('div[class]');
                            if (container) {
                                // 显示名称通常在 @handle 之前的一个 span 中
                                const spans = container.querySelectorAll('span');
                                for (const span of spans) {
                                    const spanText = span.textContent.trim();
                                    if (spanText && !spanText.startsWith('@') && spanText.length > 0 && spanText.length < 80) {
                                        // 检查这是否是一个 "纯文本" 叶子节点
                                        if (span.children.length === 0 || (span.children.length === 1 && span.querySelector('img'))) {
                                            displayName = spanText;
                                            break;
                                        }
                                    }
                                }
                            }
                            members.set(handle.toLowerCase(), { handle, displayName });
                        }
                    }
                }
            }

            // 方法2: 查找个人资料链接
            const profileLinks = document.querySelectorAll('a[href^="/"]');
            for (const link of profileLinks) {
                const href = link.getAttribute('href');
                if (!href) continue;
                const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
                if (match && match[1]) {
                    const handle = match[1];
                    const skipList = ['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i', 'tos', 'privacy'];
                    if (skipList.includes(handle.toLowerCase())) continue;
                    if (!members.has(handle.toLowerCase())) {
                        const displayName = link.textContent.trim() || handle;
                        members.set(handle.toLowerCase(), { handle, displayName: displayName.length < 80 ? displayName : handle });
                    }
                }
            }
        }

        // 初始收集
        await collectVisibleMembers();

        // 4. 滚动收集更多成员
        // 找到成员列表的滚动容器
        let scrollContainer = null;
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight + 50) {
                // 检查这个容器里是否有 @handle 文本
                const handles = div.querySelectorAll('*');
                let hasHandle = false;
                for (const h of handles) {
                    if (h.children.length === 0 && h.textContent.trim().startsWith('@')) {
                        hasHandle = true;
                        break;
                    }
                }
                if (hasHandle) {
                    scrollContainer = div;
                    break;
                }
            }
        }

        if (scrollContainer) {
            let prevCount = members.size;
            let noChangeCount = 0;

            for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
                scrollContainer.scrollTop += 300;
                await delay(SCROLL_DELAY);
                await collectVisibleMembers();

                if (members.size === prevCount) {
                    noChangeCount++;
                    if (noChangeCount >= 3) break; // 连续3次没有新成员，停止
                } else {
                    noChangeCount = 0;
                    prevCount = members.size;
                }
            }
        }

        // 5. 返回结果
        const result = {
            success: true,
            groupName: groupName,
            groupId: groupId,
            members: Array.from(members.values()),
            memberCount: members.size,
        };

        return result;

    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
})();
