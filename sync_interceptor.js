/**
 * 喝茶神器 - API 拦截器
 * 在 MAIN world 的 document_start 阶段运行
 * 拦截 X.com 的 fetch/XHR 请求，收集返回数据中的 screen_name（用户 handle）
 */
(function () {
    'use strict';

    // 存储捕获到的用户数据 { screen_name → { handle, displayName } }
    const capturedUsers = new Map();

    // 递归搜索对象中的 screen_name 字段
    function findUsers(obj, depth) {
        if (!obj || depth > 12) return;
        if (typeof obj !== 'object') return;

        // 找到含 screen_name 的对象（通常是 user legacy 数据）
        if (obj.screen_name && typeof obj.screen_name === 'string') {
            const handle = obj.screen_name;
            const displayName = obj.name || handle;
            capturedUsers.set(handle.toLowerCase(), { handle, displayName });
        }

        if (Array.isArray(obj)) {
            for (const item of obj) {
                findUsers(item, depth + 1);
            }
        } else {
            for (const key of Object.keys(obj)) {
                findUsers(obj[key], depth + 1);
            }
        }
    }

    // 处理 API 响应数据
    function processApiResponse(url, data) {
        try {
            if (url && (url.includes('/i/api/') || url.includes('graphql'))) {
                findUsers(data, 0);
                // 通过自定义属性暴露给 content script
                window.__teatimex_captured_users = Object.fromEntries(capturedUsers);
            }
        } catch (e) {
            // 静默忽略
        }
    }

    // 拦截 fetch
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await origFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (url.includes('/i/api/') || url.includes('graphql')) {
                const clone = response.clone();
                clone.json().then(data => processApiResponse(url, data)).catch(() => { });
            }
        } catch (e) { }
        return response;
    };

    // 拦截 XMLHttpRequest
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._teatimexUrl = url;
        return origXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            try {
                const url = this._teatimexUrl || '';
                if (url.includes('/i/api/') || url.includes('graphql')) {
                    const data = JSON.parse(this.responseText);
                    processApiResponse(url, data);
                }
            } catch (e) { }
        });
        return origXhrSend.apply(this, arguments);
    };

    console.log('[喝茶神器] API 拦截器已安装');
})();
