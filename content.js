/**
 * 喝茶神器 Content Script
 * 在 X.com 时间线上为群聊成员显示对应群聊图标
 * 支持多群聊：同一用户可能属于多个群聊，显示多个图标
 */

(function () {
  'use strict';

  // handle → [{ groupId, groupIcon, groupName }]
  let handleMap = {};

  // 从 chrome.storage 加载群聊数据
  function loadGroups() {
    return new Promise((resolve) => {
      chrome.storage.local.get('groups', (result) => {
        buildHandleMap(result.groups || []);
        resolve();
      });
    });
  }

  // 构建 handle → 群聊信息 映射
  function buildHandleMap(groups) {
    handleMap = {};
    groups.forEach((group) => {
      if (!group.members) return;
      group.members.forEach((m) => {
        const key = m.handle.toLowerCase();
        if (!handleMap[key]) {
          handleMap[key] = [];
        }
        handleMap[key].push({
          groupId: group.id,
          groupIcon: group.icon || '🍵',
          groupName: group.name || '未命名',
        });
      });
    });
  }

  // 处理单条推文，注入图标
  function processTweet(tweetEl) {
    const userNameDiv = tweetEl.querySelector('[data-testid="User-Name"]');
    if (!userNameDiv) return;

    // 如果已经处理过，跳过
    if (tweetEl.querySelector('.teatimex-action-icon')) return;

    // 获取用户 handle
    const profileLinks = Array.from(userNameDiv.querySelectorAll('a[href^="/"]'));
    const handle = extractHandle(profileLinks);
    if (!handle) return;

    const handleLower = handle.toLowerCase();
    const groupInfos = handleMap[handleLower];
    if (!groupInfos || groupInfos.length === 0) return;

    // 在 Like 按钮旁注入所有群聊图标
    injectGroupIcons(tweetEl, groupInfos, handle);

    // 高亮推文背景
    tweetEl.classList.add('teatimex-highlight');
    const bgColor = 'rgba(34, 197, 94, 0.08)';
    const innerDiv = tweetEl.querySelector(':scope > div');
    if (innerDiv) {
      innerDiv.style.setProperty('background-color', bgColor, 'important');
      const styleObserver = new MutationObserver(() => {
        innerDiv.style.setProperty('background-color', bgColor, 'important');
      });
      styleObserver.observe(innerDiv, { attributes: true, attributeFilter: ['style'] });
    }
  }

  // 在 Like 按钮旁注入多个群聊图标
  function injectGroupIcons(tweetEl, groupInfos, handle) {
    const likeBtn = tweetEl.querySelector('[data-testid="like"]') ||
      tweetEl.querySelector('[data-testid="unlike"]');
    if (!likeBtn) return;

    const likePillar = likeBtn.closest('[role="group"] > div');
    if (!likePillar) return;

    // 创建包含所有群聊图标的容器
    const container = document.createElement('div');
    container.className = 'teatimex-action-icon';

    const tooltipLines = groupInfos.map(g => `${g.groupIcon} ${g.groupName}`);
    container.title = tooltipLines.join('\n');

    groupInfos.forEach((info) => {
      const iconSpan = document.createElement('span');
      iconSpan.textContent = info.groupIcon;
      iconSpan.className = 'teatimex-group-badge';
      container.appendChild(iconSpan);
    });

    likePillar.parentElement.insertBefore(container, likePillar.nextSibling);
  }

  // 从链接中提取 handle
  function extractHandle(links) {
    const skipPatterns = ['/i/', '/home', '/search', '/explore', '/notifications',
      '/messages', '/settings', '/compose', '/status/', '/hashtag/'];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '/') continue;
      if (skipPatterns.some((p) => href.includes(p))) continue;
      const match = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  // 扫描所有可见推文
  function scanTimeline() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    tweets.forEach((tweet) => processTweet(tweet));
  }

  // 使用 MutationObserver 监听 DOM 变化
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        requestAnimationFrame(scanTimeline);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return observer;
  }

  // 监听 storage 变化，实时更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.groups) {
      buildHandleMap(changes.groups.newValue || []);
      document.querySelectorAll('.teatimex-icon, .teatimex-action-icon').forEach((el) => el.remove());
      document.querySelectorAll('.teatimex-highlight').forEach((el) => el.classList.remove('teatimex-highlight'));
      scanTimeline();
    }
  });

  // 监听 background 发来的同步请求
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SYNC_GROUP_PAGE') {
      scrapeGroupMembers().then(result => sendResponse(result));
      return true; // 异步响应
    }
  });

  // 抓取群聊页面的成员列表（通过拦截 API 响应获取 handle）
  async function scrapeGroupMembers() {
    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
      // 1. 提取群聊名称 - 从页面顶部 header 获取
      let groupName = '';
      const urlMatch = window.location.pathname.match(/\/i\/chat\/(g\d+)/);
      const groupId = urlMatch ? urlMatch[1] : null;

      // 从 DOM 查找群聊名称（大字号 span）
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const style = window.getComputedStyle(span);
        const fontSize = parseInt(style.fontSize);
        if (fontSize >= 17 && span.textContent.trim().length > 0 && span.textContent.trim().length < 100) {
          const text = span.textContent.trim();
          if (!['chat', 'messages', 'settings', 'chat info', 'x', 'all members',
            'search participants', 'add', 'video', 'unmute', 'mute', 'more',
            'disappearing messages', 'block screenshots', 'group invite link',
            'view all', 'off', 'on', 'admin'].includes(text.toLowerCase())
            && !/^\d+ members$/i.test(text)
            && !/^\d+$/.test(text)) {
            groupName = text;
            break;
          }
        }
      }

      // 2. 注入 fetch 拦截器到页面上下文中
      const capturedMembers = [];

      // 使用 script 标签注入到页面上下文来拦截 fetch
      const interceptorId = 'teatimex_sync_' + Date.now();
      window[interceptorId] = capturedMembers;

      const script = document.createElement('script');
      script.textContent = `
        (function() {
          const capturedData = [];
          const origFetch = window.fetch;
          window.fetch = async function(...args) {
            const response = await origFetch.apply(this, args);
            try {
              const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
              if (url.includes('/i/api/') || url.includes('graphql')) {
                const clone = response.clone();
                clone.json().then(data => {
                  // 递归搜索 screen_name 字段
                  function findUsers(obj, depth) {
                    if (!obj || depth > 10) return;
                    if (typeof obj !== 'object') return;
                    if (obj.screen_name && typeof obj.screen_name === 'string') {
                      capturedData.push({
                        handle: obj.screen_name,
                        displayName: obj.name || obj.screen_name
                      });
                    }
                    if (Array.isArray(obj)) {
                      obj.forEach(item => findUsers(item, depth + 1));
                    } else {
                      Object.values(obj).forEach(val => findUsers(val, depth + 1));
                    }
                  }
                  findUsers(data, 0);
                  // 存到 window 供 content script 读取
                  window['${interceptorId}'] = capturedData;
                }).catch(() => {});
              }
            } catch(e) {}
            return response;
          };

          // 同样拦截 XMLHttpRequest
          const origXhrOpen = XMLHttpRequest.prototype.open;
          const origXhrSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url) {
            this._teatimexUrl = url;
            return origXhrOpen.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function() {
            this.addEventListener('load', function() {
              try {
                const url = this._teatimexUrl || '';
                if (url.includes('/i/api/') || url.includes('graphql')) {
                  const data = JSON.parse(this.responseText);
                  function findUsers(obj, depth) {
                    if (!obj || depth > 10) return;
                    if (typeof obj !== 'object') return;
                    if (obj.screen_name && typeof obj.screen_name === 'string') {
                      capturedData.push({
                        handle: obj.screen_name,
                        displayName: obj.name || obj.screen_name
                      });
                    }
                    if (Array.isArray(obj)) {
                      obj.forEach(item => findUsers(item, depth + 1));
                    } else {
                      Object.values(obj).forEach(val => findUsers(val, depth + 1));
                    }
                  }
                  findUsers(data, 0);
                  window['${interceptorId}'] = capturedData;
                }
              } catch(e) {}
            });
            return origXhrSend.apply(this, arguments);
          };
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      // 3. 等待页面初始 API 加载
      await delay(2000);

      // 4. 点击 "View All" 触发成员列表加载
      const allClickable = document.querySelectorAll('span, a, button, div[role="button"]');
      for (const el of allClickable) {
        const text = el.textContent.trim().toLowerCase();
        if (text === 'view all' || text === '查看全部') {
          el.click();
          break;
        }
      }

      // 5. 等待成员列表 API 响应
      await delay(4000);

      // 6. 滚动成员列表加载更多
      const allDivs = document.querySelectorAll('div');
      let scrollContainer = null;
      for (const div of allDivs) {
        const style = window.getComputedStyle(div);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight + 50) {
          // 检查是否在模态框内
          const rect = div.getBoundingClientRect();
          if (rect.width > 200 && rect.width < 600 && rect.height > 200) {
            scrollContainer = div;
            break;
          }
        }
      }

      if (scrollContainer) {
        for (let i = 0; i < 30; i++) {
          scrollContainer.scrollTop += 400;
          await delay(600);
        }
      }

      // 7. 再等一会儿让所有 API 都返回
      await delay(2000);

      // 8. 从拦截的数据中读取结果
      const readScript = document.createElement('script');
      readScript.textContent = `
        document.dispatchEvent(new CustomEvent('teatimex_sync_result', {
          detail: JSON.stringify(window['${interceptorId}'] || [])
        }));
      `;

      const resultPromise = new Promise(resolve => {
        document.addEventListener('teatimex_sync_result', function handler(e) {
          document.removeEventListener('teatimex_sync_result', handler);
          try {
            resolve(JSON.parse(e.detail));
          } catch {
            resolve([]);
          }
        });
      });

      document.documentElement.appendChild(readScript);
      readScript.remove();

      const apiMembers = await resultPromise;

      // 去重
      const members = new Map();
      apiMembers.forEach(m => {
        const key = m.handle.toLowerCase();
        if (!members.has(key)) {
          members.set(key, { handle: m.handle, displayName: m.displayName || m.handle });
        }
      });

      return {
        success: true,
        groupName: groupName,
        groupId: groupId,
        members: Array.from(members.values()),
        memberCount: members.size,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 初始化
  async function init() {
    await loadGroups();
    scanTimeline();
    startObserver();
    const totalMembers = Object.keys(handleMap).length;
    console.log('[喝茶神器] 已加载，监控中...成员数:', totalMembers);
  }

  // 等待页面就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
