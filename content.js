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
      // 清除所有已注入的图标和高亮并重新扫描
      document.querySelectorAll('.teatimex-icon, .teatimex-action-icon').forEach((el) => el.remove());
      document.querySelectorAll('.teatimex-highlight').forEach((el) => el.classList.remove('teatimex-highlight'));
      scanTimeline();
    }
  });

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
