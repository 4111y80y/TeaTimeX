/**
 * TeaTimeX Content Script
 * 在 X.com 时间线上为特殊用户显示🍵图标
 */

(function () {
  'use strict';

  // 存储用户名单
  let membersMap = {};

  // 从 chrome.storage 加载用户名单
  function loadMembers() {
    return new Promise((resolve) => {
      chrome.storage.local.get('members', (result) => {
        if (result.members && Array.isArray(result.members)) {
          membersMap = {};
          result.members.forEach((m) => {
            membersMap[m.handle.toLowerCase()] = m;
          });
        }
        resolve();
      });
    });
  }

  // 处理单条推文，注入图标
  function processTweet(tweetEl) {
    const userNameDiv = tweetEl.querySelector('[data-testid="User-Name"]');
    if (!userNameDiv) return;

    // 如果已经处理过，跳过
    if (tweetEl.querySelector('.teatimex-action-icon')) return;

    // 获取用户 handle - 使用第二个链接 (即 @handle 链接)
    const profileLinks = Array.from(userNameDiv.querySelectorAll('a[href^="/"]'));
    const handle = extractHandle(profileLinks);
    if (!handle) return;

    const handleLower = handle.toLowerCase();
    const member = membersMap[handleLower];
    if (!member) return;

    const icon = member.icon || '🍵';
    const tooltip = `茶馆成员: ${member.displayName || handle}`;

    // 在 Like 按钮旁注入图标
    injectLikeIcon(tweetEl, icon, tooltip);
  }

  // 在 Like 按钮旁注入图标
  function injectLikeIcon(tweetEl, icon, tooltip) {
    const likeBtn = tweetEl.querySelector('[data-testid="like"]') ||
      tweetEl.querySelector('[data-testid="unlike"]');
    if (!likeBtn) return;

    // Like 按钮的父容器（pillar div）
    const likePillar = likeBtn.closest('[role="group"] > div');
    if (!likePillar) return;

    // 创建图标容器，模仿 action bar pillar 的样式
    const iconPillar = document.createElement('div');
    iconPillar.className = 'teatimex-action-icon';
    iconPillar.title = tooltip;

    const iconInner = document.createElement('span');
    iconInner.textContent = icon;
    iconPillar.appendChild(iconInner);

    // 插入到 Like 按钮 pillar 后面
    likePillar.parentElement.insertBefore(iconPillar, likePillar.nextSibling);
  }

  // 从链接中提取 handle
  function extractHandle(links) {
    // 排除非用户链接的关键词
    const skipPatterns = ['/i/', '/home', '/search', '/explore', '/notifications',
      '/messages', '/settings', '/compose', '/status/', '/hashtag/'];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '/') continue;

      // 检查是否包含需要跳过的路径
      if (skipPatterns.some((p) => href.includes(p))) continue;

      // 提取 handle: /username -> username
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
        // 使用 requestAnimationFrame 避免频繁扫描
        requestAnimationFrame(scanTimeline);
      }
    });

    // 监听整个页面的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return observer;
  }

  // 监听 storage 变化，实时更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.members) {
      membersMap = {};
      if (changes.members.newValue && Array.isArray(changes.members.newValue)) {
        changes.members.newValue.forEach((m) => {
          membersMap[m.handle.toLowerCase()] = m;
        });
      }
      // 清除所有已注入的图标并重新扫描
      document.querySelectorAll('.teatimex-icon, .teatimex-action-icon').forEach((el) => el.remove());
      scanTimeline();
    }
  });

  // 初始化
  async function init() {
    await loadMembers();
    scanTimeline();
    startObserver();
    console.log('[TeaTimeX] 已加载，监控中...成员数:', Object.keys(membersMap).length);
  }

  // 等待页面就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
