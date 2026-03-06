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

  // 抓取群聊页面的成员列表
  async function scrapeGroupMembers() {
    const SCROLL_DELAY = 800;
    const MAX_SCROLL_ATTEMPTS = 50;

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
      // 1. 提取群聊名称
      let groupName = '';
      const urlMatch = window.location.pathname.match(/\/i\/chat\/(g\d+)/);
      const groupId = urlMatch ? urlMatch[1] : null;

      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const style = window.getComputedStyle(span);
        const fontSize = parseInt(style.fontSize);
        if (fontSize >= 20 && span.textContent.trim().length > 0 && span.textContent.trim().length < 100) {
          const text = span.textContent.trim();
          if (!['Chat', 'Messages', 'Settings', 'chat info', 'x'].includes(text.toLowerCase())) {
            groupName = text;
            break;
          }
        }
      }

      // 2. 点击 "View All"
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

      await delay(3000);

      // 3. 抓取成员列表
      const members = new Map();

      function collectVisibleMembers() {
        // 方法1: 查找 @handle 文本
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.children.length === 0) {
            const text = el.textContent.trim();
            if (text.startsWith('@') && text.length > 1 && text.length < 50 && !text.includes(' ')) {
              const handle = text.substring(1);
              if (!members.has(handle.toLowerCase())) {
                let displayName = handle;
                const container = el.closest('div[class]');
                if (container) {
                  const spans = container.querySelectorAll('span');
                  for (const span of spans) {
                    const spanText = span.textContent.trim();
                    if (spanText && !spanText.startsWith('@') && spanText.length > 0 && spanText.length < 80) {
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

      collectVisibleMembers();

      // 4. 滚动收集更多成员
      let scrollContainer = null;
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const style = window.getComputedStyle(div);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight + 50) {
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
          collectVisibleMembers();

          if (members.size === prevCount) {
            noChangeCount++;
            if (noChangeCount >= 3) break;
          } else {
            noChangeCount = 0;
            prevCount = members.size;
          }
        }
      }

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
